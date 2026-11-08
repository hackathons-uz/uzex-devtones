"""Пул под заявку на любой товар каталога: если открытого пула нет, биржа собирает его сама.

Демо: другие покупатели, очередь заявок и ставки продавцов создаются по правилам ниже, детерминированно.
Пул муки в Самарканде — из seed, с числами из макета; остальные товары и города — отсюда.
"""

import hashlib
import json
import sqlite3
from datetime import timedelta

from . import config as C
from . import formulas as F
from . import need

LOT_T = 60
QUEUE = (2, 1, 3, 2)  # заявки, которые ждут подтверждения задатка и вступают следом за вами
AVG_SHARE_T = 1.4  # средняя доля одного из «других» покупателей, т
DEADLINE_DAYS = 3
DELIVERY_DAYS = 5
SHORTFALL_PCT = 3  # недовес в демо-споре, % от вашей доли

# Продавцы по товарам: (название, кто это). Последний — с рейтингом ниже порога, к торгам не допускается.
SELLERS = {
    "sugar": [
        ("Xorazm Shakar", "Сахарный завод, Хорезм"),
        ("Andijon Shakar", "Сахарный завод, Андижан"),
        ("Toshkent Shakar", "Опт, Ташкент"),
        ("Navoiy Savdo", "Опт, Навои"),
        ("Arzon Shakar", "Опт, Карши"),
    ],
    "cement": [
        ("Qizilqum Sement", "Цементный завод, Навои"),
        ("Bekobod Sement", "Цементный завод, Бекабад"),
        ("Ohangaron Sement", "Цементный завод, Ахангаран"),
        ("Kuvasoy Sement", "Цементный завод, Кувасай"),
        ("Tez Qurilish", "Опт, Джизак"),
    ],
    "diesel": [
        ("Farg‘ona NQIZ", "НПЗ, Фергана"),
        ("Buxoro NQIZ", "НПЗ, Бухара"),
        ("Uzbekneftegaz Savdo", "Опт, Ташкент"),
        ("Neft Trans", "Опт, Карши"),
        ("Yoqilg‘i Plus", "Опт, Навои"),
    ],
    "wheat": [
        ("Qashqadaryo Don", "Зерно, Кашкадарья"),
        ("Sirdaryo Don", "Зерно, Сырдарья"),
        ("Jizzax G‘alla", "Зерно, Джизак"),
        ("Surxon Agro", "Зерно, Термез"),
        ("Don Savdo", "Опт, Карши"),
    ],
    "rice": [
        ("Xorazm Guruch", "Рис, Хорезм"),
        ("Qoraqalpoq Agro", "Рис, Нукус"),
        ("Toshkent Oziq", "Опт, Ташкент"),
        ("Farg‘ona Agro", "Рис, Фергана"),
        ("Arzon Guruch", "Опт, Самарканд"),
    ],
    "oil": [
        ("Toshkent Yog‘", "Маслозавод, Ташкент"),
        ("Andijon Yog‘", "Маслозавод, Андижан"),
        ("Kattaqo‘rg‘on Yog‘", "Маслозавод, Каттакурган"),
        ("Buxoro Yog‘", "Маслозавод, Бухара"),
        ("Yog‘ Savdo", "Опт, Карши"),
    ],
    "rebar": [
        ("O‘zmetkombinat", "Металлургический комбинат, Бекабад"),
        ("Metall Savdo", "Опт, Ташкент"),
        ("Temir Trade", "Опт, Самарканд"),
        ("Po‘lat Invest", "Опт, Фергана"),
        ("Arzon Metall", "Опт, Карши"),
    ],
}
SELLER_RATINGS = [(4.9, 99, 1), (4.7, 97, 0), (4.5, 95, 2), (4.2, 92, 1), (3.7, 81, 4)]


def _r10(v: float) -> int:
    return F.round_to(v, C.PRICE_ROUND_UZS)


def _bids(base: int) -> list[list[int | None]]:
    """Ставки по раундам: победитель доходит до ожидаемой цены, второй держится чуть выше,
    двое выходят, когда цена становится ниже их себестоимости, пятый к торгам не допущен."""
    start = base * 1.06
    lin = lambda a, b, n: [_r10(a - (a - b) * k / (n - 1)) for k in range(n)]
    return [
        lin(start, base, 6),
        lin(start * 1.006, base * 1.007, 6),
        [*lin(start * 1.015, base * 1.03, 4), None, None],
        [*lin(start * 1.012, base * 1.04, 2), None, None, None, None],
        lin(start * 0.98, base * 0.95, 6),
    ]


def _deal_id(pool_id: str) -> str:
    return f"P-2611-{int(hashlib.sha256(pool_id.encode()).hexdigest(), 16) % 9000 + 1000}"


def delete(conn: sqlite3.Connection, pool_id: str) -> None:
    for t, col in (("evidence", "pool_id"), ("seller", "pool_id"), ("pool_member", "pool_id"), ("pool", "id")):
        conn.execute(f"DELETE FROM {t} WHERE {col}=?", (pool_id,))


def fits(conn: sqlite3.Connection, pool_id: str, qty_t: float) -> bool:
    """Соберется ли пул ровно с этой долей: другие + очередь + вы = лот."""
    taken = conn.execute("SELECT COALESCE(SUM(qty_t), 0) FROM pool_member WHERE pool_id=? AND business_id IS NULL", (pool_id,)).fetchone()[
        0
    ]
    lot = conn.execute("SELECT lot_t FROM pool WHERE id=?", (pool_id,)).fetchone()[0]
    return abs(lot - taken - qty_t) < 1e-9


def create(conn: sqlite3.Connection, product: str, grade: str | None, city: str, qty_t: float) -> str | None:
    """Новый пул под заявку. None — объем слишком большой для пула (почти целый лот)."""
    p = need.PRODUCTS[product]
    lot = p.get("lot_t", LOT_T)
    if qty_t >= lot - 1:
        return None
    pid = f"{product}-{city}-2611"
    room = lot - qty_t - 1  # хотя бы 1 т остается «другим» покупателям
    queue: list[int] = []
    for part in QUEUE:
        if sum(queue) + part <= min(sum(QUEUE), room):
            queue.append(part)
    others_t = lot - qty_t - sum(queue)
    others = max(1, round(others_t / AVG_SHARE_T))
    g = p["grades"].get(grade or "")
    title = p["name"] + (f" {g[0]}" if g else "")
    conn.execute(
        "INSERT INTO pool VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            pid,
            product,
            grade or "",
            city,
            title,
            p["audience"],
            lot,
            p["lot"][0],
            (C.DEMO_TODAY + timedelta(days=DEADLINE_DAYS)).isoformat(),
            (C.DEMO_TODAY + timedelta(days=DELIVERY_DAYS)).isoformat(),
            f"Склад «{need.CITIES[city]['name']}-{need.CITIES[city]['hub'].split('«')[1].rstrip('»')}»",
            p["avg"],
            "октябрь",
            p["retail"],
            "collecting",
            _deal_id(pid),
            1,
        ),
    )
    word = p["who"][2]
    conn.execute(
        "INSERT INTO pool_member (pool_id, business_id, name, members, qty_t, joined_seq, status) VALUES (?,?,?,?,?,?,?)",
        (pid, None, f"{others} {word}", others, others_t, 0, "joined"),
    )
    for i, part in enumerate(queue):
        conn.execute(
            "INSERT INTO pool_member (pool_id, business_id, name, qty_t, status) VALUES (?,?,?,?,?)",
            (pid, None, f"Заявка {i + 1}", part, "queued"),
        )
    base = F.expected_price(p["avg"])["price_uzs"]
    names = SELLERS.get(product) or p.get("sellers") or [(f"Поставщик {k + 1}", "Опт") for k in range(5)]
    for k, ((short, about), (rating, on_time, disputes), bids) in enumerate(zip(names, SELLER_RATINGS, _bids(base), strict=True)):
        conn.execute(
            "INSERT INTO seller VALUES (?,?,?,?,?,?,?,?,?,?)",
            (f"{pid}-{k}", pid, f"ООО «{short}»", short, about, rating, on_time, disputes, 0, json.dumps(bids)),
        )
    waybill = round(qty_t * 1000)
    conn.execute(
        "INSERT INTO evidence VALUES (?,?,?,?,?,?)",
        (pid, waybill, waybill - round(waybill * SHORTFALL_PCT / 100), 6, 1, others + len(queue)),
    )
    return pid
