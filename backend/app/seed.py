"""Демо-данные сценария «2 т муки в Самарканд». Идемпотентно: сброс стирает и заполняет заново."""

import json
import sqlite3

BUSINESS_ID = "non-uyi"
POOL_ID = "flour-samarkand-2611"
DEAL_ID = "P-2611-0417"

# История закупок пекарни: 2 т муки в/с примерно раз в 22 дня. По ней агент сам предлагает следующую закупку.
PURCHASES = [
    {"date": d, "product": "flour", "grade": "top", "city": "samarkand", "qty_t": 2, "price_uzs": p}
    for d, p in [("2026-08-29", 4350), ("2026-09-20", 4420), ("2026-10-12", 4380), ("2026-11-03", 4370)]
]

TABLES = ["log", "evidence", "deal", "seller", "pool_member", "pool", "business"]


def seed(conn: sqlite3.Connection) -> None:
    for t in TABLES:
        conn.execute(f"DELETE FROM {t}")
    conn.execute(
        "INSERT INTO business VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            BUSINESS_ID,
            "Пекарня «Non Uyi»",
            "NU",
            "samarkand",
            14,
            3,
            4,
            1,
            json.dumps(["2026-08-14"]),
            json.dumps(PURCHASES),
        ),
    )
    conn.execute(
        "INSERT INTO pool VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            POOL_ID,
            "flour",
            "top",
            "samarkand",
            "Мука пшеничная в/с",
            "Пул пекарен и кондитерских",
            60,
            "вагон",
            "2026-11-20",
            "2026-11-22",
            "Хаб «Самарканд-Север»",
            4390,
            "октябрь",
            5200,
            "collecting",
        ),
    )
    # 36 покупателей уже в пуле на 50 т: храним одной строкой, по отдельности они в демо не нужны.
    conn.execute(
        "INSERT INTO pool_member (pool_id, business_id, name, members, qty_t, joined_seq, status) VALUES (?,?,?,?,?,?,?)",
        (POOL_ID, None, "36 покупателей", 36, 50, 0, "joined"),
    )
    # Заявки, которые ждут подтверждения задатка. Подтверждаются, когда вы вступаете.
    for name, qty in [("Кондитерская «Shirin»", 2), ("Пекарня «Tandir»", 1), ("Нонвойхона «Registon»", 3), ("Кафе «Bahor»", 2)]:
        conn.execute(
            "INSERT INTO pool_member (pool_id, business_id, name, qty_t, status) VALUES (?,?,?,?,?)",
            (POOL_ID, None, name, qty, "queued"),
        )
    sellers = [
        ("zarafshon", "ООО «Zarafshon Don»", "Zarafshon Don", 4.9, 99, 1, [4520, 4450, 4380, 4320, 4280, 4260]),
        ("toshkent", "АО «Toshkent Un»", "Toshkent Un", 4.7, 97, 0, [4550, 4480, 4400, 4340, 4300, 4290]),
        ("buxoro", "ООО «Buxoro Grain»", "Buxoro Grain", 4.5, 95, 2, [4600, 4520, 4450, 4400, None, None]),
        ("navoiy", "ЧП «Navoiy Tegirmon»", "Navoiy Tegirmon", 4.2, 92, 1, [4580, 4500, None, None, None, None]),
        ("qarshi", "ООО «Qarshi Mill»", "Qarshi Mill", 3.7, 81, 4, [4300, 4200, 4150, 4100, 4050, 4000]),
    ]
    for sid, name, short, rating, on_time, disputes, bids in sellers:
        conn.execute(
            "INSERT INTO seller VALUES (?,?,?,?,?,?,?,?,?)",
            (sid, POOL_ID, name, short, rating, on_time, disputes, 0, json.dumps(bids)),
        )
    conn.execute("INSERT INTO evidence VALUES (?,?,?,?,?,?)", (POOL_ID, 2000, 1940, 6, 1, 40))
