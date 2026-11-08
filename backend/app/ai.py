"""Вызовы Claude и запасные шаблоны.

Claude нужен для двух задач: разобрать заявку своими словами в поля и объяснить итог торгов.
Результат Claude никогда не влияет на цену, задаток, рейтинг и решение по спору.
"""

import hashlib
import json
import logging
import os
import re
from pathlib import Path

from . import config as C
from . import db

log = logging.getLogger("ai")

SYSTEM_EXPLAIN = (
    "Объясняй только на основе переданных чисел и фактов, ничего не добавляй и не пересчитывай. "
    "Пиши по-русски простым языком, без биржевых терминов, без буквы е с точками. "
    "Суммы пиши с пробелами между разрядами. Названия компаний пиши точно как во входе."
)

SYSTEM_AUCTION = (
    SYSTEM_EXPLAIN + " Верни ровно 4 пункта, каждый — одно короткое предложение до 20 слов: "
    "1) сколько продавцов боролись и сколько вышли, потому что цена стала ниже их себестоимости; "
    "2) кто победил и почему: цена и доля поставок без срывов; "
    "3) на сколько процентов цена ниже розницы и средней биржевой цены; "
    "4) что цена одна для всех участников пула, независимо от объема."
)

SYSTEM_NEED = (
    "Ты разбираешь заявку малого бизнеса на закупку, написанную своими словами по-русски или по-узбекски. "
    "Заполняй только то, что прямо сказано в тексте; остальное оставь null. "
    "product: flour — любая мука (un). grade: top — высший сорт (в/с, oliy nav). "
    "qty_t — объем в тоннах (2000 кг = 2). due_day и due_month — срок «до какого числа»."
)

NEED_SCHEMA = {
    "type": "object",
    "properties": {
        "product": {"type": ["string", "null"], "enum": ["flour", None]},
        "grade": {"type": ["string", "null"], "enum": ["top", None]},
        "qty_t": {"type": ["number", "null"]},
        "city": {"type": ["string", "null"], "enum": ["samarkand", "tashkent", None]},
        "due_day": {"type": ["integer", "null"]},
        "due_month": {"type": ["integer", "null"]},
    },
    "required": ["product", "grade", "qty_t", "city", "due_day", "due_month"],
    "additionalProperties": False,
}

AUCTION_SCHEMA = {
    "type": "object",
    "properties": {"points": {"type": "array", "items": {"type": "string"}}},
    "required": ["points"],
    "additionalProperties": False,
}

PROMPTS_VERSION = SYSTEM_AUCTION + SYSTEM_NEED

_client = None
# Последняя ошибка Claude для /health: тип и код, без ключа и без текста запроса.
last_error: str | None = None
CACHE_PATH = os.environ.get("AI_CACHE_PATH", str(Path(db.DB_PATH).with_name("ai_cache.db")))


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
    # В ключе — модель, промпты и вход: поменяли промпт — старый текст из кэша не вернется.
    key = hashlib.sha256((model() + PROMPTS_VERSION + db.dumps(key_obj)).encode()).hexdigest()
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


# ---------- Проверка текста Claude кодом до показа ----------

_SELF_FIX = re.compile(r"\b(точнее|вернее|то есть нет|извините|ой)\b", re.IGNORECASE)
_NUM = re.compile(r"\d{1,3}(?:[  ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?")


def _payload_numbers(obj) -> set[float]:
    """Все числа из входа и их записи в тысячах и миллионах (1 800 000 -> 1,8 млн)."""
    out: set[float] = set()

    def walk(v):
        if isinstance(v, bool):
            return
        if isinstance(v, (int, float)):
            # Без знака: экономия -85000 в тексте звучит как «переплатят 85 000 сум».
            n = abs(float(v))
            out.update({n, round(n / 1000, 3), round(n / 1_000_000, 3), round(n * 100, 3)})
        elif isinstance(v, str):
            for m in _NUM.findall(v):
                out.add(_to_float(m))
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)

    walk(obj)
    return out


def _to_float(s: str) -> float:
    return float(re.sub(r"[  ]", "", s).replace(",", "."))


def check_text(text: str, payload: dict) -> str | None:
    """None — текст можно показывать. Иначе — причина отказа."""
    # Латиница допустима только в словах из входа: названия вроде «Zarafshon Don».
    allowed = {w.lower() for w in re.findall(r"[A-Za-z]+", db.dumps(payload))}
    if any(w.lower() not in allowed for w in re.findall(r"[A-Za-z]+", text)):
        return "latin"
    if _SELF_FIX.search(text):
        return "self_correction"
    # Длину текста не проверяем: лишнее предложение — не повод заменять живой текст шаблоном.
    known = _payload_numbers(payload)
    for m in _NUM.findall(text):
        n = _to_float(m)
        # Небольшие счетные числа (2-3 предложения, 1 рейс) допустимы; суммы и проценты — только из входа.
        if n <= 10 and float(n).is_integer():
            continue
        if not any(abs(n - k) <= max(0.051, abs(k) * 0.001) for k in known):
            return f"unknown_number:{m}"
    return None


def parse_need(text: str) -> dict | None:
    """Текст заявки -> поля по NEED_SCHEMA. None — Claude недоступен, берем разбор кодом."""
    raw, _ = _cached({"need": text}, lambda: _call(SYSTEM_NEED, text, NEED_SCHEMA))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        log.warning("Claude вернул не JSON: %r", raw[:200])
        return None


def explain_auction(payload: dict, fallback: list[str]) -> tuple[list[str], str]:
    """4 пункта «как сложилась цена». Каждый пункт проверяется кодом; не прошел — шаблон."""
    user = "Итог торгов в JSON (числа уже посчитаны, их не меняй):\n" + json.dumps(payload, ensure_ascii=False, indent=1)

    def produce() -> str | None:
        raw = _call(SYSTEM_AUCTION, user, AUCTION_SCHEMA)
        if raw is None:
            return None
        if _bad_points(raw, payload):
            return None
        return raw

    raw, _ = _cached({"auction": payload}, produce)
    if raw and not _bad_points(raw, payload):
        return [p.replace("ё", "е").replace("Ё", "Е") for p in json.loads(raw)["points"]], "ai"
    return fallback, "template"


def _bad_points(raw: str, payload: dict) -> str | None:
    global last_error
    try:
        points = json.loads(raw)["points"]
    except (json.JSONDecodeError, KeyError, TypeError):
        last_error = "rejected_text: not_json"
        return "not_json"
    if len(points) != 4:
        last_error = f"rejected_text: {len(points)} points"
        return "count"
    for p in points:
        problem = check_text(p, payload)
        if problem:
            last_error = f"rejected_text: {problem}"
            log.warning("Claude: пункт отклонен (%s): %r", problem, p[:200])
            return problem
    return None
