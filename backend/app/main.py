"""FastAPI: роуты по разделу «API» PRD v3. Расчеты — в чистых функциях, здесь только данные и журнал."""

import json
import logging
import math
import sqlite3
from collections.abc import Iterator
from datetime import date, timedelta

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import ai, db
from . import config as C
from . import deposit as dep
from . import pool as P
from . import rating as R
from . import rules as RU
from .env import load_env
from .models import RequestIn, RuleSave, RuleText

logging.basicConfig(level=logging.INFO)

# Ключ Claude из project/backend/.env. Клиент Claude создается при первом запросе, поэтому этого достаточно.
_loaded = load_env()
logging.getLogger("env").info(".env: загружено %s", ", ".join(_loaded) or "ничего (файла нет или все уже задано)")

app = FastAPI(title="Биржа доверия — демо")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
    """Схема и seed при первом запросе. На serverless событие startup не гарантировано."""
    global _db_ready
    if _db_ready:
        return
    with db.session() as conn:
        db.init_schema(conn)
        if not conn.execute("SELECT 1 FROM participants LIMIT 1").fetchone():
            import seed

            seed.seed(conn)
    _db_ready = True


def get_conn() -> Iterator[sqlite3.Connection]:
    _ensure_db()
    with db.session() as conn:
        yield conn


# ---------------- Загрузка данных ----------------


def _deals(conn, pid: str) -> list[R.Deal]:
    import seed

    return seed.participant_deals(conn, pid)


def participant(conn, pid: str) -> dict:
    p = conn.execute("SELECT * FROM participants WHERE id=?", (pid,)).fetchone()
    if not p:
        raise ApiError(404, "participant_not_found", f"Участник «{pid}» не найден")
    snap = conn.execute("SELECT * FROM rating_snapshots WHERE participant_id=?", (pid,)).fetchone()
    comps = json.loads(snap["components"])
    n = comps["n"]
    return {
        "id": p["id"],
        "name": p["name"],
        "role": p["role"],
        "region": p["region"],
        "parent_id": p["parent_id"],
        "created_at": p["created_at"],
        "note": p["note"],
        "rating": snap["value"],
        "components": comps,
        "completed_deals": n,
        "is_newbie": R.is_newbie(n),
        "defaults_12m": comps["defaults_12m"],
    }


def lot(conn, lot_id: str) -> dict:
    row = conn.execute("SELECT * FROM lots WHERE id=?", (lot_id,)).fetchone()
    if not row:
        raise ApiError(404, "lot_not_found", f"Лот «{lot_id}» не найден")
    rule = json.loads(row["rules_json"])
    seller = participant(conn, row["seller_id"])
    return {
        "id": row["id"],
        "seller": {k: seller[k] for k in ("id", "name", "region", "rating", "completed_deals", "defaults_12m")},
        "product": row["product"],
        "grade": row["grade"],
        "title": f"{row['product']} {row['grade']}",
        "volume_t": row["volume_t"],
        "price_per_t": row["price_per_t"],
        "amount_uzs": row["volume_t"] * row["price_per_t"],
        "region": row["region"],
        "deadline": row["deadline"],
        "pool_allowed": bool(row["pool_allowed"]),
        "min_fill_pct": row["min_fill_pct"],
        "rule": rule,
        "rule_lines": RU.describe_rule(rule),
        "rules_text": row["rules_text"],
    }


def pool_lot(lt: dict) -> P.Lot:
    return P.Lot(
        lt["id"],
        lt["seller"]["id"],
        lt["product"],
        lt["grade"],
        lt["volume_t"],
        lt["price_per_t"],
        lt["region"],
        lt["deadline"],
        lt["pool_allowed"],
        lt["min_fill_pct"],
        lt["rule"],
    )


def distance_fn(conn) -> P.Distance:
    table = {(r["region_a"], r["region_b"]): r["km"] for r in conn.execute("SELECT * FROM region_distance")}

    def dist(a: str, b: str) -> int:
        if a == b:
            return C.SAME_REGION_KM
        return table[(a, b)]

    return dist


OPEN_STATUSES = ("submitted", "admitted")
LOCKED_STATUSES = ("deposit_locked", "confirmed", "escrow_paid", "delivered", "closed")


def open_requests(conn, lt: dict, exclude: set[str] = frozenset()) -> list[P.OpenRequest]:
    rows = conn.execute(
        f"SELECT * FROM requests WHERE lot_id=? AND status IN ({','.join('?' * len(OPEN_STATUSES))}) ORDER BY id",
        (lt["id"], *OPEN_STATUSES),
    ).fetchall()
    out = []
    for r in rows:
        if r["id"] in exclude:
            continue
        b = participant(conn, r["buyer_id"])
        out.append(
            P.OpenRequest(
                r["id"], b["id"], b["name"], b["rating"], b["completed_deals"], lt["product"], lt["grade"], r["qty_t"], r["region"], r["deadline"]
            )
        )
    return out


def guarantor_rating(conn, guarantor_id: str | None, buyer_id: str) -> int | None:
    if not guarantor_id:
        return None
    if guarantor_id == buyer_id:
        raise ApiError(422, "guarantor_invalid", "Нельзя поручиться за самого себя")
    g = participant(conn, guarantor_id)
    if g["rating"] < C.GUARANTOR_MIN_RATING:
        raise ApiError(
            422, "guarantor_invalid", f"Поручителем может быть участник с рейтингом от {C.GUARANTOR_MIN_RATING}, у «{g['name']}» {g['rating']}"
        )
    active = conn.execute(
        "SELECT COUNT(*) c FROM guarantees WHERE guarantor_id=? AND status='active' AND beneficiary_id<>?",
        (guarantor_id, buyer_id),
    ).fetchone()["c"]
    if active >= C.GUARANTOR_MAX_ACTIVE:
        raise ApiError(422, "guarantor_limit", f"У «{g['name']}» уже {active} активных поручительств, это лимит")
    return g["rating"]


# ---------------- Участники и лоты ----------------


@app.get("/participants")
def list_participants(conn=Depends(get_conn)):
    rows = conn.execute("SELECT id FROM participants WHERE note IS NOT 'history' ORDER BY rowid").fetchall()
    return [participant(conn, r["id"]) for r in rows]


@app.get("/participants/{pid}")
def get_participant(pid: str, conn=Depends(get_conn)):
    p = participant(conn, pid)
    nt = dep.next_tier(p["rating"])
    created = date.fromisoformat(p["created_at"])
    after = R.rating_after_next_success(_deals(conn, pid), created, p["components"]["start"])
    p["deposit_pct"] = dep.tier_pct(p["rating"])
    p["next_tier"] = {"rating": nt[0], "pct": nt[1], "points_left": nt[0] - p["rating"]} if nt else None
    p["rating_after_next_deal"] = after
    return p


@app.get("/lots")
def list_lots(buyer_id: str | None = None, qty_t: int = C.TRUCK_CAPACITY_T, conn=Depends(get_conn)):
    lots = [lot(conn, r["id"]) for r in conn.execute("SELECT id FROM lots ORDER BY id")]
    if buyer_id:
        b = participant(conn, buyer_id)
        dist = distance_fn(conn)
        for lt in lots:
            km = P.region_km(dist, lt["region"], b["region"])
            trips = math.ceil(qty_t / C.TRUCK_CAPACITY_T)
            per_t = round(trips * P.trip_cost(km) / qty_t)
            lt["delivery_estimate"] = {
                "to_region": b["region"],
                "qty_t": qty_t,
                "km": km,
                "per_t_uzs": per_t,
                "real_price_per_t": lt["price_per_t"] + per_t,
                "is_estimate": True,
            }
    return lots


@app.get("/lots/{lot_id}")
def get_lot(lot_id: str, conn=Depends(get_conn)):
    return lot(conn, lot_id)


@app.get("/fund")
def fund():
    ex = C.FUND_EXAMPLE
    return {
        **ex,
        "expected_loss_pct": ex["default_rate_pct"] / 100 * ex["max_loss_pct"],
        "sustainable": dep.fund_is_sustainable(ex["default_rate_pct"], ex["max_loss_pct"], ex["fee_pct"]),
        # Какую долю срывов выдерживает каждый тариф при убытке из примера: доля * убыток <= взнос.
        "fee_tiers": [
            {"min_rating": f, "pct": p, "max_default_rate_pct": round(p / ex["max_loss_pct"] * 100, 2)}
            for f, p in C.INSURANCE_FEE_TIERS
        ],
        "min_rating": C.INSURANCE_MIN_RATING,
        "max_amount_uzs": C.INSURANCE_MAX_AMOUNT_UZS,
    }


# ---------------- Заявка с залогом ----------------


def evaluate(conn, body: RequestIn) -> dict:
    """Допуск и залог для заявки. Только формулы."""
    b = participant(conn, body.buyer_id)
    lt = lot(conn, body.lot_id)
    g_rating = guarantor_rating(conn, body.guarantor_id, b["id"])
    amount = body.qty_t * lt["price_per_t"]
    rule = lt["rule"]
    admission = RU.admit(rule, b["rating"], b["completed_deals"], body.qty_t, lt["volume_t"], lt["pool_allowed"], g_rating)
    insurance = body.payment_mode == "insurance"
    if insurance and not dep.insurance_available(b["rating"], amount):
        raise ApiError(
            422,
            "insurance_unavailable",
            f"Страховка доступна при рейтинге от {C.INSURANCE_MIN_RATING} и сумме до {ai.money(C.INSURANCE_MAX_AMOUNT_UZS)}",
        )
    d = dep.compute(b["rating"], amount, g_rating, rule.get("min_prepay_pct") or 0, insurance)
    nt = dep.next_tier(b["rating"], None if insurance else d["pct"])
    after = R.rating_after_next_success(_deals(conn, b["id"]), date.fromisoformat(b["created_at"]), b["components"]["start"])
    d_after = dep.compute(after, amount, g_rating, rule.get("min_prepay_pct") or 0)
    fee = dep.insurance_fee_pct(b["rating"])
    existing = conn.execute(
        "SELECT id, qty_t, status FROM requests WHERE buyer_id=? AND lot_id=? AND status NOT IN ('withdrawn','rejected') ORDER BY id LIMIT 1",
        (b["id"], lt["id"]),
    ).fetchone()
    return {
        "existing_request": dict(existing) if existing else None,
        "buyer": {k: b[k] for k in ("id", "name", "region", "rating", "completed_deals", "is_newbie")},
        "lot": {k: lt[k] for k in ("id", "title", "price_per_t", "volume_t", "rule_lines", "rules_text", "pool_allowed")},
        "seller": lt["seller"],
        "qty_t": body.qty_t,
        "amount_uzs": amount,
        "guarantor_rating": g_rating,
        "payment_mode": body.payment_mode,
        "admission": admission,
        "deposit": d,
        "escrow_rest_uzs": amount - d["deposit_uzs"],
        "next_tier": {"rating": nt[0], "pct": nt[1], "points_left": nt[0] - b["rating"]} if nt else None,
        "after_next_deal": {"rating": after, "deposit_pct": d_after["pct"], "deposit_uzs": d_after["deposit_uzs"]},
        "insurance_option": {
            "available": dep.insurance_available(b["rating"], amount),
            "fee_pct": fee,
            "fee_uzs": round(amount * fee / 100) if fee else None,
        },
    }


def with_explanation(result: dict) -> dict:
    adm = result["admission"]
    if adm["admitted"]:
        kind, payload = (
            "deposit",
            {
                "rating": result["buyer"]["rating"],
                "amount_uzs": result["amount_uzs"],
                "deposit": result["deposit"],
                "next_tier": result["next_tier"],
                "after_next_deal": result["after_next_deal"],
            },
        )
    else:
        kind, payload = (
            "admission",
            {
                "rating": result["buyer"]["rating"],
                "is_newbie": result["buyer"]["is_newbie"],
                "qty_t": result["qty_t"],
                "rule": result["lot"]["rule_lines"],
                "admitted": False,
                "reasons": adm["reasons"],
                "options": adm["options"],
            },
        )
    text, source = ai.explain(kind, payload)
    result["explanation"] = {"kind": kind, "text": text, "source": source}
    return result


def _log_request_decisions(conn, entity_type: str, entity_id: str, body: RequestIn, r: dict) -> None:
    exp = r["explanation"]
    inp = body.model_dump()
    db.log_decision(
        conn, entity_type, entity_id, "admission", inp, r["admission"], exp["text"] if exp["kind"] == "admission" else None,
        exp["source"] if exp["kind"] == "admission" else "formula",
    )
    db.log_decision(
        conn, entity_type, entity_id, "deposit", inp, r["deposit"], exp["text"] if exp["kind"] == "deposit" else None,
        exp["source"] if exp["kind"] == "deposit" else "formula",
    )


@app.post("/requests/preview")
def preview(body: RequestIn, conn=Depends(get_conn)):
    # Preview — примерка, а не решение: в журнал не пишем. Решение пишется при подаче заявки.
    return with_explanation(evaluate(conn, body))


@app.post("/requests")
def submit(body: RequestIn, conn=Depends(get_conn)):
    r = evaluate(conn, body)
    if r["existing_request"]:
        ex = r["existing_request"]
        raise ApiError(409, "request_exists", f"Заявка на этот лот уже подана: {ex['qty_t']} т, номер {ex['id']}")
    r = with_explanation(r)
    n = conn.execute("SELECT COUNT(*) c FROM requests").fetchone()["c"] + 1
    rid = f"req-{n}"
    while conn.execute("SELECT 1 FROM requests WHERE id=?", (rid,)).fetchone():
        n += 1
        rid = f"req-{n}"
    status = r["admission"]["status"]
    conn.execute(
        "INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (
            rid,
            body.buyer_id,
            body.lot_id,
            body.qty_t,
            r["buyer"]["region"],
            conn.execute("SELECT deadline FROM lots WHERE id=?", (body.lot_id,)).fetchone()["deadline"],
            body.payment_mode,
            body.guarantor_id,
            r["lot"]["price_per_t"],
            status,
            db.now_iso(),
        ),
    )
    if body.guarantor_id and status == "admitted":
        conn.execute(
            "INSERT INTO guarantees VALUES (?,?,?,?)", (f"g-{rid}", body.guarantor_id, body.buyer_id, "active")
        )
    _log_request_decisions(conn, "request", rid, body, r)
    return {"id": rid, "status": status, **r}


@app.post("/requests/{rid}/confirm")
def confirm_request(rid: str, conn=Depends(get_conn)):
    row = conn.execute("SELECT * FROM requests WHERE id=?", (rid,)).fetchone()
    if not row:
        raise ApiError(404, "request_not_found", f"Заявка «{rid}» не найдена")
    if row["status"] != "admitted":
        raise ApiError(409, "request_not_admitted", f"Заявку в статусе «{row['status']}» нельзя подтвердить")
    conn.execute("UPDATE requests SET status='deposit_locked' WHERE id=?", (rid,))
    return {"id": rid, "status": "deposit_locked"}


# ---------------- Пул ----------------

ACTIVE_POOL = ("proposed", "confirming", "locked")


def pool_view(conn, pool_id: str, extra_excluded: list[dict] | None = None) -> dict:
    p = conn.execute("SELECT * FROM pools WHERE id=?", (pool_id,)).fetchone()
    if not p:
        raise ApiError(404, "pool_not_found", f"Пул «{pool_id}» не найден")
    lt = lot(conn, p["lot_id"])
    rows = conn.execute(
        "SELECT m.*, q.buyer_id, q.region, q.deadline FROM pool_members m JOIN requests q ON q.id=m.request_id "
        "WHERE m.pool_id=? ORDER BY m.request_id",
        (pool_id,),
    ).fetchall()
    members = []
    for r in rows:
        b = participant(conn, r["buyer_id"])
        members.append(
            P.OpenRequest(r["request_id"], b["id"], b["name"], b["rating"], b["completed_deals"], lt["product"], lt["grade"], r["share_t"], r["region"], r["deadline"])
        )
    dist = distance_fn(conn)
    view = P.describe(pool_lot(lt), members, dist, math.ceil(lt["volume_t"] * lt["min_fill_pct"] / 100))
    confirmed = {r["request_id"]: r["confirmed_at"] for r in rows}
    for m in view["members"]:
        m["confirmed"] = bool(confirmed[m["request_id"]])
    # Исключенные фиксируются в момент подбора: после блокировки залогов набор открытых заявок
    # меняется, и пересчет дал бы другой якорь и другие причины.
    excluded = [e for e in _proposal_excluded(conn, pool_id) if e["code"] != "not_selected"] + (extra_excluded or [])
    view.update(
        {
            "id": pool_id,
            "status": p["status"],
            "lot_title": lt["title"],
            "seller": lt["seller"],
            "seller_region": lt["region"],
            "excluded": excluded,
            "confirmed_count": sum(m["confirmed"] for m in view["members"]),
        }
    )
    text, source = ai.explain("pool", _pool_payload(view))
    view["explanation"] = {"text": text, "source": source}
    return view


def _proposal_excluded(conn, pool_id: str) -> list[dict]:
    row = conn.execute(
        "SELECT output_json FROM decisions_log WHERE entity_type='pool' AND entity_id=? AND kind='pool' "
        "AND output_json LIKE '%\"excluded\"%' ORDER BY id LIMIT 1",
        (pool_id,),
    ).fetchone()
    return json.loads(row["output_json"])["excluded"] if row else []


def _log_proposal(conn, pool_id: str, lot_id: str, prop: dict, excluded: list[dict]) -> None:
    db.log_decision(
        conn,
        "pool",
        pool_id,
        "pool",
        {"lot_id": lot_id},
        {"members": [m["request_id"] for m in prop["members"]], "total_t": prop["total_t"], "excluded": excluded},
        None,
        "formula",
    )


def _pool_payload(view: dict) -> dict:
    return {
        "members": [{k: m[k] for k in ("buyer_name", "region", "share_t", "deposit_uzs", "alone_uzs", "pool_share_uzs", "saving_uzs")} for m in view["members"]],
        "total_t": view["total_t"],
        "volume_t": view["volume_t"],
        "pool_cost_uzs": view["pool_cost_uzs"],
        "alone_cost_uzs": view["alone_cost_uzs"],
        "route_km": view["route_km"],
        "trips": view["trips"],
        "excluded": [{"buyer_name": e["buyer_name"], "message": e["message"]} for e in view["excluded"]],
    }


def _create_pools(conn, lt: dict, proposals: list[dict], confirmed: dict[str, str] | None = None) -> list[str]:
    ids = []
    for prop in proposals:
        n = conn.execute("SELECT COUNT(*) c FROM pools").fetchone()["c"] + 1
        pid = f"pool-{n}"
        keep = confirmed or {}
        any_confirmed = any(m["request_id"] in keep for m in prop["members"])
        conn.execute("INSERT INTO pools VALUES (?,?,?,?)", (pid, lt["id"], "confirming" if any_confirmed else "proposed", db.now_iso()))
        for m in prop["members"]:
            conn.execute(
                "INSERT INTO pool_members VALUES (?,?,?,?,?)",
                (pid, m["request_id"], m["share_t"], m["deposit_uzs"], keep.get(m["request_id"])),
            )
        ids.append(pid)
    return ids


@app.get("/lots/{lot_id}/pool-proposals")
def pool_proposals(lot_id: str, conn=Depends(get_conn)):
    lt = lot(conn, lot_id)
    active = conn.execute(
        f"SELECT id FROM pools WHERE lot_id=? AND status IN ({','.join('?' * len(ACTIVE_POOL))}) ORDER BY id",
        (lot_id, *ACTIVE_POOL),
    ).fetchall()
    if not active:
        res = P.propose_pools(pool_lot(lt), open_requests(conn, lt), distance_fn(conn))
        if not res["proposals"]:
            db.log_decision(conn, "lot", lot_id, "pool", {"lot_id": lot_id}, res, None, "formula")
            return {"lot_id": lot_id, "pools": [], "reason": res["reason"], "excluded": res["excluded"], "details": res}
        ids = _create_pools(conn, lt, res["proposals"])
        for pid, prop in zip(ids, res["proposals"]):
            _log_proposal(conn, pid, lot_id, prop, res["excluded"])
    else:
        ids = [r["id"] for r in active]
    pools = [pool_view(conn, pid) for pid in ids]
    for v in pools:
        db.log_decision(conn, "pool", v["id"], "pool", {"lot_id": lot_id}, {"status": v["status"]}, v["explanation"]["text"], v["explanation"]["source"])
    return {"lot_id": lot_id, "pools": pools, "reason": None}


def _member_row(conn, pool_id: str, participant_id: str):
    row = conn.execute(
        "SELECT m.*, q.buyer_id FROM pool_members m JOIN requests q ON q.id=m.request_id WHERE m.pool_id=? AND q.buyer_id=?",
        (pool_id, participant_id),
    ).fetchone()
    if not row:
        raise ApiError(404, "member_not_found", f"Участника «{participant_id}» нет в пуле «{pool_id}»")
    return row


@app.post("/pools/{pool_id}/confirm")
def pool_confirm(pool_id: str, participant_id: str, conn=Depends(get_conn)):
    p = conn.execute("SELECT * FROM pools WHERE id=?", (pool_id,)).fetchone()
    if not p:
        raise ApiError(404, "pool_not_found", f"Пул «{pool_id}» не найден")
    if p["status"] not in ("proposed", "confirming"):
        raise ApiError(409, "pool_not_open", f"Пул в статусе «{p['status']}» уже не принимает подтверждения")
    row = _member_row(conn, pool_id, participant_id)
    if not row["confirmed_at"]:
        conn.execute("UPDATE pool_members SET confirmed_at=? WHERE pool_id=? AND request_id=?", (db.now_iso(), pool_id, row["request_id"]))
    left = conn.execute("SELECT COUNT(*) c FROM pool_members WHERE pool_id=? AND confirmed_at IS NULL", (pool_id,)).fetchone()["c"]
    status = "locked" if left == 0 else "confirming"
    conn.execute("UPDATE pools SET status=? WHERE id=?", (status, pool_id))
    if status == "locked":
        conn.execute(
            "UPDATE requests SET status='deposit_locked' WHERE id IN (SELECT request_id FROM pool_members WHERE pool_id=?)", (pool_id,)
        )
        # Остальные предложения по этому лоту больше не нужны.
        conn.execute("UPDATE pools SET status='failed' WHERE lot_id=? AND id<>? AND status IN ('proposed','confirming')", (p["lot_id"], pool_id))
    db.log_decision(conn, "pool", pool_id, "pool", {"confirm": participant_id}, {"status": status, "left": left}, None, "formula")
    return pool_view(conn, pool_id)


@app.post("/pools/{pool_id}/withdraw")
def pool_withdraw(pool_id: str, participant_id: str, conn=Depends(get_conn)):
    p = conn.execute("SELECT * FROM pools WHERE id=?", (pool_id,)).fetchone()
    if not p:
        raise ApiError(404, "pool_not_found", f"Пул «{pool_id}» не найден")
    if p["status"] not in ("proposed", "confirming"):
        raise ApiError(409, "pool_not_open", f"Из пула в статусе «{p['status']}» выйти нельзя")
    row = _member_row(conn, pool_id, participant_id)
    confirmed = {
        r["request_id"]: r["confirmed_at"]
        for r in conn.execute("SELECT * FROM pool_members WHERE pool_id=? AND confirmed_at IS NOT NULL", (pool_id,))
        if r["request_id"] != row["request_id"]
    }
    conn.execute("UPDATE requests SET status='withdrawn' WHERE id=?", (row["request_id"],))
    conn.execute("UPDATE pools SET status='failed' WHERE id=?", (pool_id,))
    lt = lot(conn, p["lot_id"])
    res = P.propose_pools(pool_lot(lt), open_requests(conn, lt), distance_fn(conn))
    db.log_decision(conn, "pool", pool_id, "pool", {"withdraw": participant_id}, {"status": "failed", "replanned": bool(res["proposals"])}, None, "formula")
    if res["proposals"]:
        new_id = _create_pools(conn, lt, res["proposals"][:1], confirmed)[0]
        _log_proposal(conn, new_id, lt["id"], res["proposals"][0], res["excluded"])
        view = pool_view(conn, new_id)
        view["replaced_pool_id"] = pool_id
        return view
    view = pool_view(conn, pool_id)
    view["replan"] = {
        "reason": res["reason"],
        "max_collected_t": res.get("max_collected_t"),
        "min_fill_t": res.get("min_fill_t"),
        "message": f"Замены нет: без выбывшего можно собрать только {res.get('max_collected_t', 0)} т, а нужно от {res.get('min_fill_t')} т",
    }
    return view


# ---------------- Правила продавца и оценка риска ----------------


@app.post("/lots/{lot_id}/rules/parse")
def rules_parse(lot_id: str, body: RuleText, conn=Depends(get_conn)):
    lot(conn, lot_id)
    rule, unparsed, source = ai.parse_rule(body.text)
    out = {
        "text": body.text,
        "rule": RU.normalize_rule(rule) if rule is not None else None,
        "rule_lines": RU.describe_rule(rule) if rule is not None else [],
        "unparsed": unparsed,
        "source": source,
        "manual": rule is None,
    }
    db.log_decision(conn, "lot", lot_id, "rule_parse", {"text": body.text}, out, None, source)
    return out


@app.post("/lots/{lot_id}/rules")
def rules_save(lot_id: str, body: RuleSave, conn=Depends(get_conn)):
    lot(conn, lot_id)
    rule = RU.normalize_rule(body.rule.model_dump())
    conn.execute("UPDATE lots SET rules_json=?, rules_text=? WHERE id=?", (db.dumps(rule), body.text, lot_id))
    db.log_decision(conn, "lot", lot_id, "rule_parse", {"text": body.text, "confirmed": True}, rule, None, body.source)
    return lot(conn, lot_id)


def _seller_window_amounts(conn, seller_id: str, buyer_id: str) -> tuple[int, int]:
    since = (C.DEMO_TODAY - timedelta(days=C.RISK_SHARE_WINDOW_DAYS)).isoformat()
    seller_sold = conn.execute(
        "SELECT COALESCE(SUM(amount_uzs),0) s FROM deal_history WHERE seller_id=? AND created_at>=?", (seller_id, since)
    ).fetchone()["s"]
    buyer_bought = conn.execute(
        "SELECT COALESCE(SUM(amount_uzs),0) s FROM deal_history WHERE seller_id=? AND buyer_id=? AND created_at>=?",
        (seller_id, buyer_id, since),
    ).fetchone()["s"]
    on_sale = conn.execute("SELECT COALESCE(SUM(volume_t*price_per_t),0) s FROM lots WHERE seller_id=?", (seller_id,)).fetchone()["s"]
    return seller_sold + on_sale, buyer_bought


@app.get("/lots/{lot_id}/requests")
def seller_requests(lot_id: str, conn=Depends(get_conn)):
    lt = lot(conn, lot_id)
    edges = [(r["seller_id"], r["buyer_id"]) for r in conn.execute("SELECT seller_id, buyer_id FROM deal_history")]
    rows = conn.execute("SELECT * FROM requests WHERE lot_id=? AND status<>'withdrawn' ORDER BY id", (lot_id,)).fetchall()
    out = []
    for q in rows:
        b = participant(conn, q["buyer_id"])
        g_rating = participant(conn, q["guarantor_id"])["rating"] if q["guarantor_id"] else None
        amount = q["qty_t"] * lt["price_per_t"]
        adm = RU.admit(lt["rule"], b["rating"], b["completed_deals"], q["qty_t"], lt["volume_t"], lt["pool_allowed"], g_rating)
        if q["status"] in LOCKED_STATUSES:
            # Правило действует с момента подтверждения: на заявки с заблокированным залогом оно не влияет.
            adm = {
                **adm,
                "admitted": True,
                "status": "admitted",
                "locked": True,
                "new_rule_would_reject": not adm["admitted"],
                "reasons": [],
                "options": [],
            }
        d = dep.compute(b["rating"], amount, g_rating, lt["rule"].get("min_prepay_pct") or 0)
        seller_volume, bought = _seller_window_amounts(conn, lt["seller"]["id"], b["id"])
        share = (bought + amount) / seller_volume * 100 if seller_volume else 0
        chain = RU.find_chain(b["id"], edges)
        chain_names = [participant(conn, x)["name"] for x in chain] if chain else None
        rk = RU.risk(
            buyer_deals=b["completed_deals"],
            amount_uzs=amount,
            bid_price_per_t=q["bid_price_per_t"],
            lot_price_per_t=lt["price_per_t"],
            buyer_share_pct=share,
            chain=chain,
            chain_names=chain_names,
        )
        if rk["signals"]:
            text, source = ai.explain("risk", {"buyer": b["name"], **rk})
        else:
            text, source = ai.TEMPLATES["risk"](rk), "template"
        rk["explanation"] = {"text": text, "source": source}
        inp = {"request_id": q["id"], "rule": lt["rule"]}
        db.log_decision(conn, "request", q["id"], "admission", inp, adm, None, "formula")
        db.log_decision(conn, "request", q["id"], "risk", {"request_id": q["id"]}, {k: rk[k] for k in ("score", "level", "signals")}, text, source)
        out.append(
            {
                "id": q["id"],
                "buyer": {k: b[k] for k in ("id", "name", "region", "rating", "completed_deals", "is_newbie", "defaults_12m")},
                "qty_t": q["qty_t"],
                "amount_uzs": amount,
                "bid_price_per_t": q["bid_price_per_t"],
                "status": q["status"],
                "admission": adm,
                "deposit": {"pct": d["pct"], "deposit_uzs": d["deposit_uzs"]},
                "risk": rk,
            }
        )
    return {"lot": lt, "requests": out}


# ---------------- Журнал и сброс ----------------


@app.get("/decisions")
def decisions(entity_type: str | None = None, entity_id: str | None = None, limit: int = 100, conn=Depends(get_conn)):
    q, args = "SELECT * FROM decisions_log WHERE 1=1", []
    if entity_type:
        q += " AND entity_type=?"
        args.append(entity_type)
    if entity_id:
        q += " AND entity_id=?"
        args.append(entity_id)
    q += " ORDER BY id DESC LIMIT ?"
    args.append(min(limit, 500))
    out = []
    for r in conn.execute(q, args).fetchall():
        inp, res = json.loads(r["input_json"]), json.loads(r["output_json"])
        out.append(
            {
                **{k: r[k] for k in ("id", "entity_type", "entity_id", "kind", "explanation", "source", "created_at")},
                "input": inp,
                "output": res,
                "title": _decision_title(conn, r["entity_type"], r["entity_id"]),
                "summary": _decision_summary(r["kind"], inp, res),
            }
        )
    return out


def _decision_title(conn, entity_type: str, entity_id: str) -> str:
    """Название объекта решения человеческими словами."""
    if entity_type == "request":
        q = conn.execute(
            "SELECT p.name, q.qty_t, l.product FROM requests q JOIN participants p ON p.id=q.buyer_id "
            "JOIN lots l ON l.id=q.lot_id WHERE q.id=?",
            (entity_id,),
        ).fetchone()
        return f"Заявка {q['name']}: {q['product'].lower()}, {q['qty_t']} т" if q else "Заявка"
    if entity_type == "pool":
        p = conn.execute("SELECT l.product, l.grade FROM pools x JOIN lots l ON l.id=x.lot_id WHERE x.id=?", (entity_id,)).fetchone()
        return f"Пул на {p['product'].lower()} {p['grade']}" if p else "Пул"
    if entity_type == "lot":
        lt = conn.execute("SELECT product, grade FROM lots WHERE id=?", (entity_id,)).fetchone()
        return f"Лот {lt['product'].lower()} {lt['grade']}" if lt else "Лот"
    return entity_type


def _decision_summary(kind: str, inp: dict, res: dict) -> str:
    """Короткий итог решения: что вошло и что вышло."""
    if kind == "admission":
        if res.get("locked"):
            return "Допущен ранее, залог заблокирован: новое правило на заявку не влияет"
        return "Допущен" if res.get("admitted") else "Отказ: " + "; ".join(x["message"] for x in res.get("reasons", []))
    if kind == "deposit":
        return f"Залог {res['pct']:g}% = {ai.money(res['deposit_uzs'])}" + (f", взнос {res['fee_pct']:g}%" if res.get("insurance") else "")
    if kind == "risk":
        level = {"low": "низкий", "medium": "средний", "high": "высокий"}[res["level"]]
        return f"Риск {level}, {res['score']} баллов" + (": " + "; ".join(s["message"] for s in res["signals"]) if res["signals"] else "")
    if kind == "pool":
        if "members" in res:
            return f"Подобран состав: {len(res['members'])} заявки, {res['total_t']} т; исключено {len(res.get('excluded', []))}"
        if "confirm" in inp:
            return f"Участник подтвердил, статус пула: {res['status']}" + (f", ждем еще {res['left']}" if res.get("left") else "")
        if "withdraw" in inp:
            return "Участник вышел, пул " + ("пересобран" if res.get("replanned") else "распался: замены нет")
        if "status" in res:
            return f"Показан пул, статус: {res['status']}"
        return f"Пул не собран: {res.get('reason')}"
    if kind == "rule_parse":
        lines = RU.describe_rule(res.get("rule") or res) if (res.get("rule") or "min_rating" in res) else []
        head = "Правило подтверждено продавцом" if inp.get("confirmed") else f"Разбор текста «{inp.get('text', '')}»"
        return head + (": " + "; ".join(lines) if lines else ": поля для ручного ввода")
    return ""


@app.post("/demo/reset")
def demo_reset(conn=Depends(get_conn)):
    import seed

    seed.seed(conn)
    return {"ok": True}
