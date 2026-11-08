"""FastAPI: заявка, пул и задаток, торги, сделка, спор. Расчеты — в formulas.py, здесь данные и журнал."""

import json
import logging
import os
import sqlite3
from collections.abc import Iterator
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import ai, db, need, pools, seed, stt
from . import config as C
from . import formulas as F
from .env import load_env

logging.basicConfig(level=logging.INFO)

_loaded = load_env()
logging.getLogger("env").info(".env: загружено %s", ", ".join(_loaded) or "ничего (файла нет или все уже задано)")

app = FastAPI(title="Davra — биржа доверия")

# Фронтенд на Vercel ходит на бэкенд на Render с другого домена: адреса — в CORS_ORIGINS через запятую.
_origins = ["http://localhost:5173", "http://127.0.0.1:5173"] + [
    o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


@app.exception_handler(ApiError)
async def _api_error(_: Request, e: ApiError):
    return JSONResponse(status_code=e.status, content={"error": e.code, "message": e.message})


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, e: RequestValidationError):
    first = e.errors()[0] if e.errors() else {}
    field = ".".join(str(x) for x in first.get("loc", [])[1:])
    return JSONResponse(
        status_code=422,
        content={"error": "validation", "message": f"Неверные данные в поле «{field}»: {first.get('msg', '')}"},
    )


_db_ready = False


def _ensure_db() -> None:
    """Схема и seed при первом запросе. На бесплатном Render диск временный: после рестарта — снова seed."""
    global _db_ready
    if _db_ready:
        return
    with db.session() as conn:
        conn.executescript(db.SCHEMA)
        if not conn.execute("SELECT 1 FROM business LIMIT 1").fetchone():
            seed.seed(conn)
        # Товары вне каталога, которые Claude уже описал: переживают перезапуск, пока жива база.
        for r in conn.execute("SELECT key, card FROM product_ai"):
            need.register(r["key"], json.loads(r["card"]))
    _db_ready = True


def get_conn() -> Iterator[sqlite3.Connection]:
    _ensure_db()
    with db.session() as conn:
        yield conn


# ---------- Чтение данных ----------


def _business(conn) -> sqlite3.Row:
    return conn.execute("SELECT * FROM business WHERE id=?", (seed.BUSINESS_ID,)).fetchone()


def _history(b: sqlite3.Row) -> F.History:
    return F.History(
        clean_deals=b["clean_deals"],
        tax_clean_years=b["tax_clean_years"],
        business_years=b["business_years"],
        stable_turnover=bool(b["stable_turnover"]),
        late_payments=[date.fromisoformat(d) for d in json.loads(b["late_payments"])],
    )


def _pool_row(conn, pool_id: str) -> sqlite3.Row:
    p = conn.execute("SELECT * FROM pool WHERE id=?", (pool_id,)).fetchone()
    if not p:
        raise ApiError(404, "not_found", f"Пул {pool_id} не найден")
    return p


def _members(conn, pool_id: str) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM pool_member WHERE pool_id=? AND status='joined' ORDER BY joined_seq", (pool_id,)).fetchall()


def _sellers(conn, pool_id: str) -> list[dict]:
    rows = conn.execute("SELECT * FROM seller WHERE pool_id=? ORDER BY rowid", (pool_id,)).fetchall()
    return [{**dict(r), "bids": json.loads(r["bids"])} for r in rows]


def _you(conn, pool_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM pool_member WHERE pool_id=? AND business_id=?", (pool_id, seed.BUSINESS_ID)).fetchone()


def _fmt_t(v: float) -> float | int:
    return int(v) if float(v).is_integer() else v


# ---------- Служебное ----------


@app.get("/health")
def health():
    """Диагностика без секретов: виден ли ключ Claude и какой была последняя ошибка."""
    return {
        "ok": True,
        "ai_key_present": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "ai_disabled": os.environ.get("AI_DISABLED") == "1",
        "model": ai.model(),
        "last_ai_error": ai.last_error,
        "stt_key_present": stt.key_present(),
        "cors_origins": _origins,
    }


@app.post("/demo/reset")
def demo_reset(conn=Depends(get_conn)):
    seed.seed(conn)
    return {"ok": True}


@app.get("/me")
def me(conn=Depends(get_conn)):
    b = _business(conn)
    f = F.rating_factors(_history(b))
    return {
        "id": b["id"],
        "name": b["name"],
        "initials": b["initials"],
        "city": need.CITIES[b["city"]]["name"],
        "rating": F.rating(f),
        "deposit_pct": F.deposit_pct(f),
    }


# ---------- 0. Биржа предлагает сама ----------


@app.get("/offer")
def offer(conn=Depends(get_conn)):
    """Предложение до запроса: по ритму закупок товар скоро закончится, и под него уже собирается пул.

    Все считает код: прогноз по истории, поиск пула, цена. Нет истории или подходящего пула — null.
    """
    b = _business(conn)
    purchases = json.loads(b["purchases"])
    for product in dict.fromkeys(p["product"] for p in purchases):
        mine = [p for p in purchases if p["product"] == product]
        fc = F.forecast(mine)
        if not fc or fc["days_left"] > C.OFFER_HORIZON_DAYS:
            continue
        last = max(mine, key=lambda p: p["date"])
        runout = date.fromisoformat(fc["runout"])
        row = conn.execute(
            "SELECT * FROM pool WHERE product=? AND city=? AND status='collecting' AND delivery_date<=?",
            (product, last["city"], fc["runout"]),
        ).fetchone()
        if row and _you(conn, row["id"]):
            continue
        # Вы уже в пуле этого товара и сделка еще не закрыта — второй пул не предлагаем.
        active = conn.execute(
            "SELECT 1 FROM pool_member pm JOIN pool p ON p.id = pm.pool_id WHERE pm.business_id=? AND p.product=? "
            "AND pm.pool_id NOT IN (SELECT pool_id FROM deal WHERE business_id=? AND status='settled')",
            (seed.BUSINESS_ID, product, seed.BUSINESS_ID),
        ).fetchone()
        if active:
            continue
        if not row:
            # Открытого пула нет (прошлый уже закрыт) — биржа собирает новый под вашу обычную закупку.
            pid = pools.create(conn, product, last["grade"], last["city"], fc["qty_t"])
            row = _pool_row(conn, pid) if pid else None
            if not row or row["delivery_date"] > fc["runout"]:
                continue
        price = F.expected_price(row["avg_exchange_uzs"])["price_uzs"]
        prod = need.PRODUCTS[product]
        grade = prod["grades"].get(last["grade"] or "")
        qty = _fmt_t(fc["qty_t"])
        city = need.CITIES[last["city"]]
        # Текст заявки, которую агент отправит в чат: дальше обычный разбор, как будто покупатель написал сам.
        name = prod["name"].split()[-1].lower()
        draft = f"{qty} т {'муки' if product == 'flour' else name}{' в/с' if grade else ''} в {city['name']} до {F.date_ru(runout)}"
        return {
            "product": row["title"],
            "qty_t": qty,
            "forecast": {**fc, "runout_text": F.date_ru(runout), "last_text": F.date_ru(date.fromisoformat(fc["last_date"]))},
            "pool": {
                "id": row["id"],
                "members": sum(m["members"] for m in _members(conn, row["id"])),
                "price_uzs": price,
                "discount_pct": F.discount_pct(price, row["retail_uzs"]),
                "delivery_text": F.date_ru(date.fromisoformat(row["delivery_date"])),
            },
            "draft": draft,
        }
    return None


# ---------- 1. Заявка ----------


@app.post("/stt")
async def speech_to_text(request: Request):
    """Голос -> текст. Тело — сам звук (audio/webm, audio/mp4…), без multipart: так не нужен python-multipart."""
    audio = await request.body()
    try:
        text = stt.transcribe(audio, request.headers.get("content-type", ""))
    except stt.SttError as e:
        raise ApiError(e.status, e.code, e.message) from None
    return {"text": text}


class NeedIn(BaseModel):
    # Первое сообщение и ответы на уточняющие вопросы, по порядку.
    # До 30 сообщений по 2 000 знаков: защита от огромных запросов к Claude, обычному чату хватает с запасом.
    messages: list[Annotated[str, Field(max_length=2000)]] = Field(min_length=1, max_length=30)
    # На какой вопрос отвечает каждое сообщение (у первого — None): «2» в ответ на вопрос об объеме — это 2 т.
    asked: list[str | None] = Field(default_factory=list, max_length=30)


@app.post("/need")
def parse_need(body: NeedIn, conn=Depends(get_conn)):
    """Сообщения покупателя -> заявка-потребность и подходящий пул.

    Чего не хватает, решает код: товар, объем и срок. На первое недостающее поле агент задает вопрос.
    """
    msgs = [x.strip()[:500] for x in body.messages if x.strip()]
    if not msgs:
        raise ApiError(422, "empty", "Напишите, что нужно")
    asked = (body.asked + [None] * len(body.messages))[: len(body.messages)]
    pairs = [(x.strip(), a) for x, a in zip(body.messages, asked, strict=True) if x.strip()]
    by_code = need.parse_dialog([p[0] for p in pairs], [p[1] for p in pairs])
    # Для Claude ответ идет вместе с вопросом, на который он отвечает.
    lines = [f"(ответ на вопрос «{need.QUESTIONS[a]}») {x}" if a in need.QUESTIONS else x for x, a in pairs]
    by_ai = ai.parse_need(lines, F.date_ru(C.DEMO_TODAY) + f" {C.DEMO_TODAY.year}")
    source = "template"
    parsed = by_code
    if by_ai is not None:
        source = "ai"
        due = (by_ai["due_day"], by_ai["due_month"]) if by_ai["due_day"] and by_ai["due_month"] else None
        product_key = by_ai["product"]
        if product_key == "other":
            product_key = _ai_product(conn, by_ai.get("other_name"))
        parsed = {
            "product": product_key,
            "grade": by_ai["grade"],
            "qty_t": by_ai["qty_t"],
            "city": by_ai["city"],
            "due": due,
            "due_flexible": bool(by_ai["due_flexible"]),
        }
    try:
        due_date, due_source = need.resolve_due(parsed["due"], parsed["due_flexible"])
    except ValueError:
        due_date, due_source = None, "past"

    b = _business(conn)
    # Город не назван — берем из профиля бизнеса и показываем это в заявке, без вопроса.
    missing = [k for k in ("product", "qty_t") if not parsed[k] or (k == "qty_t" and parsed[k] <= 0)]
    if due_source in ("missing", "past"):
        missing.append("due")
    question = need.question(missing, due_source == "past")
    product = need.PRODUCTS.get(parsed["product"] or "")
    city = need.CITIES.get(parsed["city"] or "") or need.CITIES[b["city"]]
    city_key = parsed["city"] or b["city"]
    spec = {
        "product": product["name"]
        + (", " + product["grades"][parsed["grade"]][0] if parsed["grade"] in product["grades"] else "")
        + (", " + product["standard"] if product["standard"] else "")
        if product
        else None,
        "qty_t": _fmt_t(parsed["qty_t"]) if parsed["qty_t"] else None,
        "city": city["name"],
        "city_from_profile": not parsed["city"],
        "hub": city["hub"],
        "due": due_date.isoformat() if due_date and due_source != "past" else None,
        "due_text": F.date_ru(due_date) if due_date and due_source != "past" else None,
        "due_source": due_source,
        "budget_uzs": F.budget([p["price_uzs"] for p in json.loads(b["purchases"]) if p["product"] == parsed["product"]]),
    }
    pool = None
    late = None
    if not missing:
        row = conn.execute(
            # Собранный пул тоже подходит, если вы уже в нем: заявку можно открыть заново.
            # Пул, где ваша сделка уже закрыта, не подходит: новая заявка — новый пул и новая сделка.
            "SELECT * FROM pool WHERE product=? AND city=? AND (status='collecting' OR id IN "
            "(SELECT pool_id FROM pool_member WHERE business_id=?)) "
            "AND id NOT IN (SELECT pool_id FROM deal WHERE business_id=? AND status='settled') ORDER BY rowid DESC",
            (parsed["product"], city_key, seed.BUSINESS_ID, seed.BUSINESS_ID),
        ).fetchone()
        # Пул создан под прошлую заявку с другим объемом и вы в нем еще не состоите — собираем заново.
        if row and row["generated"] and not _you(conn, row["id"]) and not pools.fits(conn, row["id"], parsed["qty_t"]):
            pools.delete(conn, row["id"])
            row = None
        # Открытого пула нет — биржа собирает его под заявку.
        if not row and (pid := pools.create(conn, parsed["product"], parsed["grade"], city_key, parsed["qty_t"])):
            row = _pool_row(conn, pid)
        if row and date.fromisoformat(row["delivery_date"]) > due_date and not _you(conn, row["id"]):
            # Пул привезет позже, чем нужно покупателю: предлагать его нельзя.
            late = {"delivery_text": F.date_ru(date.fromisoformat(row["delivery_date"]))}
            row = None
        if row:
            members = sum(m["members"] for m in _members(conn, row["id"]))
            pool = {
                "id": row["id"],
                "members": members,
                "lot_t": row["lot_t"],
                "lot_unit": row["lot_unit"],
                "lot_unit_ins": need.PRODUCTS[row["product"]]["lot"][1],
                "who": F.plural(members, *need.PRODUCTS[row["product"]]["who"]),
                "joined": _you(conn, row["id"]) is not None,
            }
    db.log(conn, "need", {"messages": msgs, "source": source, "spec": spec, "missing": missing, "pool": pool and pool["id"]})
    return {"spec": spec, "missing": missing, "question": question, "pool": pool, "pool_late": late, "source": source}


def _ai_product(conn, name: str | None) -> str | None:
    """Товар вне каталога: карточку с ориентиром цен дает Claude, код проверяет и запоминает."""
    if not name:
        return None
    key = need.ai_key(name)
    if key in need.PRODUCTS:
        return key
    card = ai.describe_product(name)
    if not card:
        return None
    need.register(key, card)
    conn.execute("INSERT OR REPLACE INTO product_ai VALUES (?,?)", (key, db.dumps(card)))
    db.log(conn, "product_ai", {"key": key, "name": card["name"], "avg": card["avg_uzs_per_kg"], "retail": card["retail_uzs_per_kg"]})
    return key


# ---------- 2. Пул и задаток ----------


def _pool_view(conn, pool_id: str, qty_t: float) -> dict:
    p = _pool_row(conn, pool_id)
    members = _members(conn, pool_id)
    you = _you(conn, pool_id)
    if you:
        qty_t = you["qty_t"]
    filled = sum(m["qty_t"] for m in members)
    price = F.expected_price(p["avg_exchange_uzs"])
    order_uzs = int(qty_t * 1000 * price["price_uzs"])
    trust = F.trust(_history(_business(conn)), order_uzs)
    sellers = _sellers(conn, pool_id)
    deadline = date.fromisoformat(p["deadline"])
    return {
        "id": p["id"],
        "title": p["title"],
        "audience": p["audience"],
        "city": need.CITIES[p["city"]]["name"],
        "deadline": p["deadline"],
        "deadline_text": F.date_ru(deadline),
        "days_left": (deadline - C.DEMO_TODAY).days,
        "lot_t": p["lot_t"],
        "lot_unit": p["lot_unit"],
        "status": p["status"],
        "filled_t": _fmt_t(filled),
        "left_t": _fmt_t(p["lot_t"] - filled),
        "members": sum(m["members"] for m in members),
        # Кольцо: доли в порядке вступления, одна точка — одна тонна.
        "segments": [{"you": m["business_id"] == seed.BUSINESS_ID, "qty_t": _fmt_t(m["qty_t"])} for m in members],
        "qty_t": _fmt_t(qty_t),
        "price": {
            "expected_uzs": price["price_uzs"],
            "retail_uzs": p["retail_uzs"],
            "discount_pct": F.discount_pct(price["price_uzs"], p["retail_uzs"]),
            "order_uzs": order_uzs,
            "retail_order_uzs": int(qty_t * 1000 * p["retail_uzs"]),
            "avg_exchange_uzs": p["avg_exchange_uzs"],
            "avg_month": p["avg_month"],
            "volume_discount_pct": price["discount_range_pct"],
            "sellers_confirmed": sum(1 for s in sellers if s["rating"] >= C.SELLER_MIN_RATING),
            # exchange — данные биржи (каталог), ai — ориентир цены от Claude для товара вне каталога.
            "source": "ai" if need.PRODUCTS[p["product"]].get("ai_price") else "exchange",
        },
        "trust": trust,
        "you": {"joined": bool(you), "deposit_uzs": you["deposit_uzs"] if you else None},
    }


@app.get("/pools/{pool_id}")
def get_pool(pool_id: str, qty_t: float = 2, conn=Depends(get_conn)):
    if qty_t <= 0:
        raise ApiError(422, "bad_qty", "Объем должен быть больше нуля")
    return _pool_view(conn, pool_id, qty_t)


class JoinIn(BaseModel):
    qty_t: float = Field(gt=0)


@app.post("/pools/{pool_id}/join")
def join_pool(pool_id: str, body: JoinIn, conn=Depends(get_conn)):
    """Покупатель вносит задаток и вступает. Затем подтверждаются заявки из очереди, пока есть место."""
    p = _pool_row(conn, pool_id)
    if p["status"] != "collecting":
        raise ApiError(409, "pool_closed", "Сбор в этот пул уже закрыт")
    if _you(conn, pool_id):
        raise ApiError(409, "already_joined", "Вы уже в этом пуле")
    view = _pool_view(conn, pool_id, body.qty_t)
    if body.qty_t > view["left_t"]:
        raise ApiError(409, "too_much", f"В пуле осталось {view['left_t']} т, а в заявке {_fmt_t(body.qty_t)} т")
    seq = max(m["joined_seq"] for m in _members(conn, pool_id)) + 1
    b = _business(conn)
    deposit = view["trust"]["deposit_uzs"]
    conn.execute(
        "INSERT INTO pool_member (pool_id, business_id, name, qty_t, deposit_uzs, joined_seq, status) VALUES (?,?,?,?,?,?,?)",
        (pool_id, b["id"], b["name"], body.qty_t, deposit, seq, "joined"),
    )
    db.log(conn, "join", {"pool": pool_id, "qty_t": body.qty_t, "deposit_uzs": deposit, "deposit_pct": view["trust"]["deposit_pct"]})
    left = view["left_t"] - body.qty_t
    events = []
    for q in conn.execute("SELECT * FROM pool_member WHERE pool_id=? AND status='queued' ORDER BY id", (pool_id,)).fetchall():
        if q["qty_t"] > left:
            continue
        seq += 1
        left -= q["qty_t"]
        conn.execute("UPDATE pool_member SET status='joined', joined_seq=? WHERE id=?", (seq, q["id"]))
        events.append({"name": q["name"], "qty_t": _fmt_t(q["qty_t"])})
    if left == 0:
        conn.execute("UPDATE pool SET status='filled' WHERE id=?", (pool_id,))
        db.log(conn, "pool_filled", {"pool": pool_id})
    return {"pool": _pool_view(conn, pool_id, body.qty_t), "events": events}


# ---------- 3. Торги ----------


DROP_WORDS = {1: "Один вышел", 2: "Двое вышли", 3: "Трое вышли"}


def _auction_points(r: dict, p: sqlite3.Row, retail_pct: int, avg_pct: int, qty_range: tuple) -> list[str]:
    n = len(r["sellers"])
    first = f"За {p['lot_unit']} боролись {n} {F.plural(n, 'продавец', 'продавца', 'продавцов')}."
    d = r["dropped_count"]
    if d:
        first += f" {DROP_WORDS.get(d, f'{d} вышли')}, когда цена стала ниже их себестоимости."
    w = r["winner"]
    return [
        first,
        f"Победил «{w['short']}»: самая низкая цена и {w['on_time_pct']}% поставок без срывов.",
        f"Это на {retail_pct}% ниже розницы и на {avg_pct}% ниже средней биржевой цены за {p['avg_month']}.",
        f"Одна цена для всех: участник с {qty_range[0]} т платит за кг столько же, сколько с {qty_range[1]} т.",
    ]


@app.get("/pools/{pool_id}/auction")
def get_auction(pool_id: str, conn=Depends(get_conn)):
    """Торги по собранному пулу. Цену определяют ставки продавцов, объясняет ее ИИ."""
    p = _pool_row(conn, pool_id)
    if p["status"] != "filled":
        raise ApiError(409, "pool_not_filled", "Торги начнутся, когда пул соберется")
    you = _you(conn, pool_id)
    sellers = _sellers(conn, pool_id)
    r = F.auction(sellers)
    by_id = {s["id"]: s for s in sellers}
    r["winner"]["short"] = by_id[r["winner"]["id"]]["short"]
    retail_pct = F.discount_pct(r["final_price"], p["retail_uzs"])
    avg_pct = F.discount_pct(r["final_price"], p["avg_exchange_uzs"])
    qtys = [m["qty_t"] for m in _members(conn, pool_id) if m["members"] == 1]
    qty_range = (_fmt_t(min(qtys)), _fmt_t(max(qtys)))
    fallback = _auction_points(r, p, retail_pct, avg_pct, qty_range)
    payload = {
        "sellers": [{"name": by_id[s["id"]]["short"], "on_time_pct": s["on_time_pct"]} for s in r["sellers"]],
        "dropped_count": r["dropped_count"],
        "winner": by_id[r["winner"]["id"]]["short"],
        "winner_on_time_pct": r["winner"]["on_time_pct"],
        "final_price_uzs_per_kg": r["final_price"],
        "retail_uzs_per_kg": p["retail_uzs"],
        "below_retail_pct": retail_pct,
        "avg_exchange_uzs_per_kg": p["avg_exchange_uzs"],
        "avg_month": p["avg_month"],
        "below_avg_pct": avg_pct,
        "member_qty_t_min": qty_range[0],
        "member_qty_t_max": qty_range[1],
    }
    points, source = ai.explain_auction(payload, fallback)

    deal = conn.execute("SELECT id FROM deal WHERE pool_id=? AND business_id=?", (pool_id, seed.BUSINESS_ID)).fetchone()
    if you and not deal:
        conn.execute(
            "INSERT INTO deal (id, pool_id, business_id, seller_id, qty_kg, price_uzs, deposit_uzs, stage, status) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                p["deal_id"],
                pool_id,
                seed.BUSINESS_ID,
                r["winner"]["id"],
                int(you["qty_t"] * 1000),
                r["final_price"],
                you["deposit_uzs"],
                1,
                "active",
            ),
        )
        db.log(conn, "auction_closed", {"pool": pool_id, "price": r["final_price"], "winner": r["winner"]["id"]})
    for s in r["sellers"]:
        s["short"] = by_id[s["id"]]["short"]
        s["about"] = by_id[s["id"]]["about"]
    r["winner"]["about"] = by_id[r["winner"]["id"]]["about"]
    return {
        **r,
        "below_retail_pct": retail_pct,
        "below_avg_pct": avg_pct,
        "retail_uzs": p["retail_uzs"],
        "explain": {"points": points, "source": source},
        "deal_id": p["deal_id"] if you else None,
    }


# ---------- 4. Сделка ----------


def _deal_row(conn, deal_id: str) -> sqlite3.Row:
    d = conn.execute("SELECT * FROM deal WHERE id=?", (deal_id,)).fetchone()
    if not d:
        raise ApiError(404, "not_found", f"Сделка {deal_id} не найдена. Сначала дождитесь итога торгов.")
    return d


def _deal_view(conn, deal_id: str) -> dict:
    d = _deal_row(conn, deal_id)
    p = _pool_row(conn, d["pool_id"])
    s = conn.execute("SELECT * FROM seller WHERE id=?", (d["seller_id"],)).fetchone()
    total = d["qty_kg"] * d["price_uzs"]
    view = {
        "id": d["id"],
        "pool_id": d["pool_id"],
        "product": f"{p['title']}, {_fmt_t(d['qty_kg'] / 1000)} т",
        "qty_kg": d["qty_kg"],
        "price_uzs": d["price_uzs"],
        "total_uzs": total,
        "deposit_uzs": d["deposit_uzs"],
        "seller": {"name": s["name"], "rating": s["rating"]},
        "hub": p["hub"],
        "delivery_text": F.date_ru(date.fromisoformat(p["delivery_date"])),
        "lot_t": p["lot_t"],
        "recipients": sum(m["members"] for m in _members(conn, d["pool_id"])),
        "stage": d["stage"],
        "status": d["status"],
        "refund_uzs": d["refund_uzs"],
        "to_seller_uzs": total - d["refund_uzs"],
        "rating_change": None,
    }
    if d["rating_after"] is not None:
        f = F.rating_factors(_history(_business(conn)))
        view["rating_change"] = {"before": d["rating_before"], "after": d["rating_after"], "next_deposit_pct": F.deposit_pct(f)}
    return view


def _require(d: sqlite3.Row, stage: int, statuses: tuple[str, ...], what: str) -> None:
    if d["stage"] != stage or d["status"] not in statuses:
        raise ApiError(409, "wrong_stage", f"Сейчас нельзя {what}: сделка на другом шаге")


def _settle(conn, d: sqlite3.Row, refund: int) -> None:
    """Расчет: деньги продавцу, задаток покупателю, плюс одна сделка без срыва в рейтинг покупателя."""
    b = _business(conn)
    before = F.rating(F.rating_factors(_history(b)))
    conn.execute("UPDATE business SET clean_deals = clean_deals + 1 WHERE id=?", (b["id"],))
    after = F.rating(F.rating_factors(_history(_business(conn))))
    conn.execute(
        "UPDATE deal SET stage=5, status='settled', refund_uzs=?, rating_before=?, rating_after=? WHERE id=?",
        (refund, before, after, d["id"]),
    )


@app.get("/deals/{deal_id}")
def get_deal(deal_id: str, conn=Depends(get_conn)):
    return _deal_view(conn, deal_id)


@app.post("/deals/{deal_id}/pay")
def pay(deal_id: str, conn=Depends(get_conn)):
    """Оплата в эскроу (банк — заглушка). Затем вагон идет на хаб и делится, шаг 3 проходит сам."""
    d = _deal_row(conn, deal_id)
    _require(d, 1, ("active",), "оплатить")
    conn.execute("UPDATE deal SET stage=3 WHERE id=?", (deal_id,))
    db.log(conn, "escrow_paid", {"deal": deal_id, "amount_uzs": d["qty_kg"] * d["price_uzs"]})
    return _deal_view(conn, deal_id)


@app.post("/deals/{deal_id}/confirm")
def confirm(deal_id: str, conn=Depends(get_conn)):
    d = _deal_row(conn, deal_id)
    _require(d, 3, ("active",), "подтвердить получение")
    _settle(conn, d, 0)
    db.log(conn, "received", {"deal": deal_id})
    return _deal_view(conn, deal_id)


@app.post("/deals/{deal_id}/dispute")
def open_dispute(deal_id: str, conn=Depends(get_conn)):
    d = _deal_row(conn, deal_id)
    _require(d, 3, ("active",), "открыть спор")
    conn.execute("UPDATE deal SET status='dispute' WHERE id=?", (deal_id,))
    db.log(conn, "dispute_opened", {"deal": deal_id})
    return _deal_view(conn, deal_id)


# ---------- 5. Спор ----------


def _dispute(conn, d: sqlite3.Row) -> dict:
    e = conn.execute("SELECT * FROM evidence WHERE pool_id=?", (d["pool_id"],)).fetchone()
    s = conn.execute("SELECT * FROM seller WHERE id=?", (d["seller_id"],)).fetchone()
    recipients = sum(m["members"] for m in _members(conn, d["pool_id"]))
    decision = F.dispute_decision(
        waybill_kg=e["waybill_kg"],
        received_kg=e["received_kg"],
        price_uzs=d["price_uzs"],
        total_uzs=d["qty_kg"] * d["price_uzs"],
        recipients=recipients,
        confirmed_others=e["confirmed_others"],
    )
    return {
        "deal_id": d["id"],
        "status": d["status"],
        "evidence": {
            "waybill_kg": e["waybill_kg"],
            "received_kg": e["received_kg"],
            "photos": e["photos"],
            "certificate_ok": bool(e["certificate_ok"]),
        },
        "checks": {
            "recipients": recipients,
            "confirmed_others": e["confirmed_others"],
            "seller_short": s["short"],
            "seller_linked": bool(s["linked_to_buyers"]),
            "seller_disputes_12m": s["disputes_12m"],
        },
        "decision": decision,
    }


@app.get("/deals/{deal_id}/dispute")
def get_dispute(deal_id: str, conn=Depends(get_conn)):
    d = _deal_row(conn, deal_id)
    if d["status"] not in ("dispute", "arbiter") and not d["refund_uzs"]:
        raise ApiError(409, "no_dispute", "По этой сделке спор не открыт")
    return _dispute(conn, d)


@app.post("/deals/{deal_id}/dispute/accept")
def accept_decision(deal_id: str, conn=Depends(get_conn)):
    """Покупатель принимает предложенное решение. Без этого клика деньги из эскроу не двигаются."""
    d = _deal_row(conn, deal_id)
    _require(d, 3, ("dispute",), "принять решение")
    dec = _dispute(conn, d)["decision"]
    _settle(conn, d, dec["refund_uzs"])
    db.log(conn, "dispute_accepted", {"deal": deal_id, **dec})
    return {"deal": _deal_view(conn, deal_id), "dispute": _dispute(conn, _deal_row(conn, deal_id))}


@app.post("/deals/{deal_id}/dispute/escalate")
def escalate(deal_id: str, conn=Depends(get_conn)):
    d = _deal_row(conn, deal_id)
    _require(d, 3, ("dispute",), "передать арбитру")
    conn.execute("UPDATE deal SET status='arbiter' WHERE id=?", (deal_id,))
    db.log(conn, "dispute_escalated", {"deal": deal_id})
    return {"deal": _deal_view(conn, deal_id), "dispute": _dispute(conn, _deal_row(conn, deal_id))}


@app.get("/log")
def get_log(conn=Depends(get_conn)):
    rows = conn.execute("SELECT * FROM log ORDER BY id DESC LIMIT 100").fetchall()
    return [{"at": r["at"], "kind": r["kind"], "payload": json.loads(r["payload"])} for r in rows]
