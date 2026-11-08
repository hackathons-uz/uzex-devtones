"""Открытые формулы: рейтинг, задаток, цена, торги, спор. Чистые функции без базы и без ИИ."""

from dataclasses import dataclass
from datetime import date, timedelta
from itertools import pairwise

from . import config as C

MONTHS_IN = [
    "январе",
    "феврале",
    "марте",
    "апреле",
    "мае",
    "июне",
    "июле",
    "августе",
    "сентябре",
    "октябре",
    "ноябре",
    "декабре",
]
MONTHS_GEN = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
]
COUNT_WORDS = {1: "Одна", 2: "Две", 3: "Три", 4: "Четыре"}


def plural(n: int, one: str, few: str, many: str) -> str:
    """plural(14, 'сделка', 'сделки', 'сделок') -> 'сделок'."""
    n = abs(n) % 100
    if 11 <= n <= 14:
        return many
    if n % 10 == 1:
        return one
    if 2 <= n % 10 <= 4:
        return few
    return many


def fmt_pct(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".").replace(".", ",") + "%"


def round_to(v: float, step: int) -> int:
    return int(round(v / step) * step)


# ---------- Рейтинг и задаток ----------


@dataclass
class History:
    clean_deals: int
    tax_clean_years: int
    business_years: int
    stable_turnover: bool
    late_payments: list[date]


def _tier(value: int, tiers: list[tuple[int, int]]) -> int:
    return next((pts for floor, pts in tiers if value >= floor), 0)


def rating_factors(h: History, today: date = C.DEMO_TODAY) -> list[dict]:
    """Факторы рейтинга. points — баллы рейтинга, deposit_pp — влияние на задаток в п.п."""
    out = []
    if h.clean_deals > 0:
        pts = min(C.DEAL_POINTS_MAX, C.DEAL_POINTS_FIRST + C.DEAL_POINTS_PER * h.clean_deals)
        out.append(
            {"key": "deals", "label": f"{h.clean_deals} {plural(h.clean_deals, 'сделка', 'сделки', 'сделок')} без срывов", "points": pts}
        )
    tax = _tier(h.tax_clean_years, C.TAX_TIERS)
    if tax:
        y = h.tax_clean_years
        out.append({"key": "tax", "label": f"Налоги без долгов {y} {plural(y, 'год', 'года', 'лет')}", "points": tax})
    age = _tier(h.business_years, C.AGE_TIERS) if h.stable_turnover else 0
    if age:
        y = h.business_years
        out.append({"key": "age", "label": f"Бизнесу {y} {plural(y, 'год', 'года', 'лет')}, обороты стабильны", "points": age})
    late = sorted(d for d in h.late_payments if (today - d).days <= C.LATE_WINDOW_DAYS)
    if late:
        n = len(late)
        word = COUNT_WORDS.get(n, str(n))
        when = f" в {MONTHS_IN[late[-1].month - 1]}" if n == 1 else " за 12 месяцев"
        out.append(
            {
                "key": "late",
                "label": f"{word} {plural(n, 'задержка', 'задержки', 'задержек')} оплаты{when}",
                "points": C.LATE_PAYMENT_POINTS * n,
            }
        )
    for f in out:
        f["deposit_pp"] = -f["points"] / C.POINTS_PER_PCT
    return out


def rating(factors: list[dict]) -> int:
    return max(0, min(100, C.RATING_BASE + sum(f["points"] for f in factors)))


def deposit_pct(factors: list[dict]) -> float:
    pct = C.DEPOSIT_MAX_PCT - sum(f["points"] for f in factors) / C.POINTS_PER_PCT
    return round(max(C.DEPOSIT_MIN_PCT, min(C.DEPOSIT_MAX_PCT, pct)), 1)


def deposit_uzs(pct: float, order_uzs: int) -> int:
    return round_to(order_uzs * pct / 100, C.DEPOSIT_ROUND_UZS)


def deals_to_target(h: History, target_pct: float = C.DEPOSIT_HINT_TARGET_PCT, today: date = C.DEMO_TODAY) -> int | None:
    """Сколько еще сделок без срывов нужно, чтобы задаток стал не больше target_pct. None — не достичь."""
    for extra in range(30):
        nh = History(h.clean_deals + extra, h.tax_clean_years, h.business_years, h.stable_turnover, h.late_payments)
        if deposit_pct(rating_factors(nh, today)) <= target_pct:
            return extra
    return None


def trust(h: History, order_uzs: int, today: date = C.DEMO_TODAY) -> dict:
    """Рейтинг, задаток и разбор «почему» одним объектом для API."""
    f = rating_factors(h, today)
    pct = deposit_pct(f)
    return {
        "rating": rating(f),
        "deposit_pct": pct,
        "deposit_uzs": deposit_uzs(pct, order_uzs),
        "deposit_max_pct": C.DEPOSIT_MAX_PCT,
        "deposit_min_pct": C.DEPOSIT_MIN_PCT,
        "factors": f,
        "hint": {"deals": deals_to_target(h, today=today), "target_pct": C.DEPOSIT_HINT_TARGET_PCT},
    }


# ---------- Цена ----------


def expected_price(avg_exchange_uzs: int) -> dict:
    lo, hi = C.VOLUME_DISCOUNT_RANGE_PCT
    mid = (lo + hi) / 2
    return {"price_uzs": round_to(avg_exchange_uzs * (1 - mid / 100), C.PRICE_ROUND_UZS), "discount_range_pct": [lo, hi]}


def discount_pct(price: int, base: int) -> int:
    """На сколько процентов price ниже base, целым числом."""
    return round((1 - price / base) * 100)


def budget(past_prices: list[int]) -> int | None:
    """Средняя цена прошлых закупок + запас, вверх до 100 сум. Без истории бюджета нет."""
    if not past_prices:
        return None
    avg = sum(past_prices) / len(past_prices)
    step = C.BUDGET_ROUND_UZS
    return int(-(-avg * (1 + C.BUDGET_MARGIN_PCT / 100) // step) * step)


def forecast(purchases: list[dict], today: date = C.DEMO_TODAY) -> dict | None:
    """Когда закончится товар: последняя закупка + средний интервал между закупками.

    purchases — закупки одного товара. Меньше OFFER_MIN_PURCHASES — ритма нет, прогноза нет.
    """
    if len(purchases) < C.OFFER_MIN_PURCHASES:
        return None
    dates = sorted(date.fromisoformat(p["date"]) for p in purchases)
    gaps = [(b - a).days for a, b in pairwise(dates)]
    interval = round(sum(gaps) / len(gaps))
    runout = dates[-1] + timedelta(days=interval)
    qtys = sorted(p["qty_t"] for p in purchases)
    return {
        "purchases": len(purchases),
        "interval_days": interval,
        "last_date": dates[-1].isoformat(),
        "runout": runout.isoformat(),
        "days_left": max(0, (runout - today).days),
        "qty_t": qtys[len(qtys) // 2],
    }


# ---------- Торги ----------


def auction(sellers: list[dict]) -> dict:
    """Раунды на понижение. sellers: [{id, name, rating, on_time_pct, bids: [цена или None по раундам]}].

    Продавцы с рейтингом ниже порога к торгам не допускаются. None в ставке — продавец вышел:
    цена стала ниже его себестоимости. Победитель — самая низкая цена последнего раунда.
    """
    admitted = [s for s in sellers if s["rating"] >= C.SELLER_MIN_RATING]
    excluded = [{"id": s["id"], "name": s["name"], "rating": s["rating"]} for s in sellers if s["rating"] < C.SELLER_MIN_RATING]
    rounds = []
    for r in range(C.AUCTION_ROUNDS):
        bids = []
        for s in admitted:
            # Вышедший продавец не возвращается в торги.
            alive = all(s["bids"][k] is not None for k in range(r + 1))
            bids.append({"seller_id": s["id"], "price": s["bids"][r] if alive else None})
        live = [b for b in bids if b["price"] is not None]
        if not live:
            raise ValueError(f"в раунде {r + 1} не осталось ставок")
        best = min(live, key=lambda b: b["price"])
        rounds.append({"round": r + 1, "bids": bids, "best_price": best["price"], "leader_id": best["seller_id"]})
    last = rounds[-1]
    winner = next(s for s in admitted if s["id"] == last["leader_id"])
    dropped = [b["seller_id"] for b in last["bids"] if b["price"] is None]
    return {
        "sellers": [{k: s[k] for k in ("id", "name", "rating", "on_time_pct")} for s in admitted],
        "excluded": excluded,
        "rounds": rounds,
        "round_min": C.AUCTION_ROUND_MIN,
        "final_price": last["best_price"],
        "winner": {k: winner[k] for k in ("id", "name", "rating", "on_time_pct")},
        "dropped_count": len(dropped),
    }


# ---------- Спор ----------


def dispute_decision(*, waybill_kg: int, received_kg: int, price_uzs: int, total_uzs: int, recipients: int, confirmed_others: int) -> dict:
    """Возврат за недовес из эскроу. Если остальные получатели вагона подтвердили вес,
    а недовес только в одной доле, ошибка на хабе: рейтинг продавца не снижается."""
    short = max(0, waybill_kg - received_kg)
    refund = short * price_uzs
    hub_fault = short > 0 and confirmed_others == recipients - 1
    return {
        "shortfall_kg": short,
        "refund_uzs": refund,
        "to_seller_uzs": total_uzs - refund,
        "fault": "hub" if hub_fault else "seller",
        "seller_rating_changes": not hub_fault,
    }


def date_ru(d: date) -> str:
    return f"{d.day} {MONTHS_GEN[d.month - 1]}"
