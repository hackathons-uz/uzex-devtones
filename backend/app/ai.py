"""Вызовы Claude и запасные шаблоны.

Claude нужен только для трех задач: объяснение «почему», разбор текста правила в JSON
и формулировка причин риска. Результат Claude никогда не влияет на допуск, залог и рейтинг.
"""

import hashlib
import json
import logging
import os

from . import config as C
from . import db

log = logging.getLogger("ai")

SYSTEM_EXPLAIN = (
    "Объясняй только на основе переданных чисел, ничего не добавляй и не пересчитывай. "
    "Пиши 2-3 предложения по-русски простым языком, без биржевых терминов, без буквы ё, "
    "с конкретными числами. Суммы пиши с пробелами между разрядами и словом «сум»."
)

SYSTEM_RULE = (
    "Ты переводишь правило продавца из обычного текста в JSON по схеме. "
    "Заполняй только то, что прямо сказано в тексте; остальное оставь null. "
    "Новичок — участник меньше чем с 3 завершенными сделками. "
    "Куски текста, которые не ложатся ни в одно поле, верни в unparsed дословно."
)

RULE_SCHEMA = {
    "type": "object",
    "properties": {
        "min_rating": {"type": ["integer", "null"], "description": "минимальный рейтинг покупателя 0-100"},
        "min_prepay_pct": {"type": ["number", "null"], "description": "минимальная предоплата в процентах"},
        "newbie_max_volume_t": {"type": ["number", "null"], "description": "максимальный объем для новичка в тоннах"},
        "allow_pool": {"type": ["boolean", "null"], "description": "можно ли покупать пулом"},
        "require_guarantor_below_rating": {
            "type": ["integer", "null"],
            "description": "ниже какого рейтинга нужен поручитель",
        },
        "unparsed": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "min_rating",
        "min_prepay_pct",
        "newbie_max_volume_t",
        "allow_pool",
        "require_guarantor_below_rating",
        "unparsed",
    ],
    "additionalProperties": False,
}

_client = None
# Последняя ошибка Claude для /health: тип и код, без ключа и без текста запроса.
last_error: str | None = None
CACHE_PATH = os.environ.get("AI_CACHE_PATH", str(db.DB_PATH.with_name("ai_cache.db")))


def model() -> str:
    return os.environ.get("CLAUDE_MODEL", C.AI_DEFAULT_MODEL)


def _get_client():
    global _client
    if os.environ.get("AI_DISABLED") == "1":
        return None
    if _client is None:
        try:
            import anthropic

            _client = anthropic.Anthropic(timeout=C.AI_TIMEOUT_S, max_retries=C.AI_MAX_RETRIES)
        except Exception as e:  # нет ключа или SDK — работаем на шаблонах
            log.warning("Claude недоступен: %s", e)
            return None
    return _client


def _call(system: str, user: str, schema: dict | None = None) -> str | None:
    """Один запрос к Claude. None — значит, взять шаблон."""
    client = _get_client()
    global last_error
    if client is None:
        last_error = "client_unavailable"
        return None
    import anthropic

    output_config: dict = {"effort": "low"}
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    try:
        # temperature не передаем: текущие модели отклоняют параметры сэмплинга (HTTP 400).
        resp = client.beta.messages.create(
            model=model(),
            max_tokens=2000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config=output_config,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.APITimeoutError:
        log.warning("Claude: таймаут %s с", C.AI_TIMEOUT_S)
        last_error = "timeout"
        return None
    except anthropic.AuthenticationError:
        log.warning("Claude: нет или неверный ключ ANTHROPIC_API_KEY")
        last_error = "authentication_error (401)"
        return None
    except anthropic.APIStatusError as e:
        log.warning("Claude: HTTP %s %s", e.status_code, e.message)
        last_error = f"http_{e.status_code}: {e.message[:200]}"
        return None
    except anthropic.APIConnectionError as e:
        log.warning("Claude: нет соединения: %s", e)
        last_error = "connection_error"
        return None
    except (TypeError, anthropic.AnthropicError) as e:
        # Например, ключ не задан: SDK падает при сборке запроса. По PRD — шаблон.
        log.warning("Claude недоступен: %s", e)
        last_error = f"{type(e).__name__}: {str(e)[:200]}"
        return None
    if resp.stop_reason == "refusal":
        log.warning("Claude: отказ модели")
        last_error = "refusal"
        return None
    last_error = None
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return text or None


def _cache_conn():
    # Отдельный файл: не блокирует основную базу и переживает сброс демо.
    conn = db.connect(CACHE_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, text TEXT NOT NULL, created_at TEXT NOT NULL)")
    return conn


def _cached(key_obj, produce) -> tuple[str | None, bool]:
    """Кэш по входу: одинаковый вход — одинаковый текст при каждом прогоне демо."""
    key = hashlib.sha256((model() + db.dumps(key_obj)).encode()).hexdigest()
    conn = _cache_conn()
    try:
        row = conn.execute("SELECT text FROM ai_cache WHERE key=?", (key,)).fetchone()
        if row:
            return row["text"], True
        text = produce()
        if text:
            conn.execute("INSERT OR REPLACE INTO ai_cache VALUES (?,?,?)", (key, text, db.now_iso()))
            conn.commit()
        return text, False
    finally:
        conn.close()


def explain(kind: str, payload: dict) -> tuple[str, str]:
    """Объяснение «почему» для готового результата формулы. Возвращает (текст, источник)."""
    user = (
        f"Тип решения: {kind}.\nРезультат расчета в JSON (числа уже посчитаны, их не меняй):\n"
        + json.dumps(payload, ensure_ascii=False, indent=1)
    )
    text, _ = _cached({"explain": kind, "payload": payload}, lambda: _call(SYSTEM_EXPLAIN, user))
    if text:
        return text.replace("ё", "е").replace("Ё", "Е"), "ai"
    return TEMPLATES[kind](payload), "template"


def parse_rule(text: str) -> tuple[dict | None, list[str], str]:
    """Текст продавца -> (правило, неразобранные куски, источник).

    Если Claude недоступен, правило None: форма показывает поля для ручного заполнения.
    """
    raw, _ = _cached({"rule": text}, lambda: _call(SYSTEM_RULE, text, RULE_SCHEMA))
    if not raw:
        return None, [], "template"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("Claude вернул не JSON: %r", raw[:200])
        return None, [], "template"
    unparsed = data.pop("unparsed", []) or []
    return data, unparsed, "ai"


# ---------- Шаблоны: тот же смысл, что у Claude, но собранный кодом ----------


def money(v: int) -> str:
    if v >= 1_000_000:
        s = f"{v / 1_000_000:.2f}".rstrip("0").rstrip(".").replace(".", ",")
        return f"{s} млн сум"
    if v >= 1_000 and v % 1_000 == 0:
        return f"{v // 1000} тыс. сум"
    return f"{v:,}".replace(",", " ") + " сум"


def pct(v: float) -> str:
    return (str(int(v)) if float(v).is_integer() else str(v).replace(".", ",")) + "%"


def _tier_range(rating: int) -> str:
    floors = sorted(f for f, _ in C.DEPOSIT_TIERS)
    lo = max(f for f in floors if f <= rating)
    higher = [f for f in floors if f > lo]
    return f"{lo}–{higher[0] - 1}" if higher else f"{lo}+"


def _t_deposit(p: dict) -> str:
    d = p["deposit"]
    rating = p["rating"]
    if d.get("insurance"):
        return (
            f"Залог {pct(d['pct'])}: вы выбрали страховку. Взнос в общий фонд {pct(d['fee_pct'])}, "
            f"это {money(d['fee_uzs'])}, деньги из оборота не замораживаются."
        )
    parts = [f"Залог {pct(d['pct'])}, это {money(d['deposit_uzs'])}: рейтинг {rating} попадает в диапазон {_tier_range(rating)}."]
    for s in d["steps"][1:]:
        if s["step"] == "guarantor":
            parts.append(f"За вас ручается участник с рейтингом {s['guarantor_rating']}, поэтому залог снижен до {pct(s['pct'])}.")
        elif s["step"] == "zero_limit":
            parts.append(f"Сумма больше {money(s['limit_uzs'])}, поэтому без страховки залог не ниже {pct(s['pct'])}.")
        elif s["step"] == "large_deal":
            parts.append(f"Крупная сделка, больше {money(s['limit_uzs'])}, поэтому залог не ниже {pct(s['pct'])}.")
        elif s["step"] == "seller_prepay":
            parts.append(f"Продавец требует предоплату {pct(s['pct'])}, поэтому залог не ниже ее.")
    nxt = p.get("next_tier")
    if nxt:
        parts.append(f"Чтобы снизить его до {pct(nxt['pct'])}, нужно набрать {nxt['rating']} баллов, осталось {nxt['points_left']}.")
    return " ".join(parts)


def _t_admission(p: dict) -> str:
    if p["admitted"]:
        return "Вы подходите под правила продавца: условия выполнены, заявку можно подать."
    reasons = "; ".join(r["message"] for r in p["reasons"])
    opts = "; ".join(o["message"].lower() for o in p["options"])
    return f"Заявка не проходит: {reasons}. Что можно сделать: {opts}." if opts else f"Заявка не проходит: {reasons}."


def _t_pool(p: dict) -> str:
    names = ", ".join(f"{m['buyer_name']} {m['share_t']} т" for m in p["members"])
    text = f"В пул вошли {len(p['members'])} покупателя рядом: {names}. Вместе {p['total_t']} т из {p['volume_t']} т лота."
    if p.get("excluded"):
        text += " Не вошли: " + ", ".join(e["buyer_name"] for e in p["excluded"]) + ", причины в списке."
    text += f" Доставка общей машиной {money(p['pool_cost_uzs'])} против {money(p['alone_cost_uzs'])} по отдельности."
    return text


def _t_risk(p: dict) -> str:
    level = {"low": "низкий", "medium": "средний", "high": "высокий"}[p["level"]]
    if not p["signals"]:
        return "Риск низкий: подозрительных признаков нет."
    reasons = "; ".join(s["message"] for s in p["signals"])
    return f"Риск {level}, {p['score']} баллов: {reasons}. На допуск оценка не влияет."


TEMPLATES = {"deposit": _t_deposit, "admission": _t_admission, "pool": _t_pool, "risk": _t_risk}
