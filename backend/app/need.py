"""Заявка своими словами -> поля заявки. Разбор без ИИ: запасной путь и проверка ответа Claude."""

import re
from datetime import date, timedelta

from . import config as C
from .formulas import MONTHS_GEN

# Товары, которые есть в демо-каталоге биржи. keywords — основы слов на русском и узбекском.
PRODUCTS = {
    "flour": {
        "name": "Мука пшеничная",
        "keywords": [r"мук", r"\bun\b", r"\bunni\b", r"\buni\b", r"flour"],
        "grades": {"top": ("высший сорт", [r"в/?с\b", r"высш", r"oliy"])},
        "standard": "ГОСТ 26574",
    },
}
CITIES = {
    "samarkand": {"name": "Самарканд", "hub": "Самарканд, склад «Север»", "keywords": [r"самарканд", r"samarqand", r"samarkand"]},
    "tashkent": {"name": "Ташкент", "hub": "Ташкент, склад «Сергели»", "keywords": [r"ташкент", r"toshkent", r"tashkent"]},
}
UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
# Если срок не важен: запас по истории закупок покупателя.
DEFAULT_LEAD_DAYS = 8


def _find(keys: list[str], text: str) -> bool:
    return any(re.search(k, text) for k in keys)


def parse(text: str, today: date = C.DEMO_TODAY) -> dict:
    """Разбор правилами. text — все сообщения покупателя по этой заявке подряд."""
    t = text.lower().replace("ё", "е")
    product = next((k for k, p in PRODUCTS.items() if _find(p["keywords"], t)), None)
    grade = None
    if product:
        grade = next((g for g, (_, keys) in PRODUCTS[product]["grades"].items() if _find(keys, t)), None)
    city = next((k for k, c in CITIES.items() if _find(c["keywords"], t)), None)

    qty_t = None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(т\b|тонн|тн\b|tonna|tonn|t\b)", t)
    if m:
        qty_t = float(m.group(1).replace(",", "."))
    else:
        m = re.search(r"(\d[\d\s]*)\s*(кг|kg)", t)
        if m:
            qty_t = int(re.sub(r"\s", "", m.group(1))) / 1000

    due = None
    m = re.search(r"(\d{1,2})[\s-]*(" + "|".join(MONTHS_GEN) + ")", t)
    if m:
        due = (int(m.group(1)), MONTHS_GEN.index(m.group(2)) + 1)
    else:
        m = re.search(r"(\d{1,2})[\s-]*(" + "|".join(UZ_MONTHS) + ")", t)
        if m:
            due = (int(m.group(1)), UZ_MONTHS.index(m.group(2)) + 1)
    if due is None:
        m = re.search(r"\b(\d{1,2})\.(\d{1,2})\b", t)
        if m and 1 <= int(m.group(2)) <= 12:
            due = (int(m.group(1)), int(m.group(2)))
    if due is None:
        rel = _relative_days(t)
        if rel is not None:
            d = today + timedelta(days=rel)
            due = (d.day, d.month)
    return {
        "product": product,
        "grade": grade,
        "qty_t": qty_t,
        "city": city,
        "due": due,
        "due_flexible": due is None and _find(FLEXIBLE, t),
    }


def parse_dialog(messages: list[str], asked: list[str | None]) -> dict:
    """Разбор нескольких сообщений: поле из более позднего ответа заменяет поле из раннего.

    asked[i] — о каком поле агент спросил перед сообщением i.
    """
    out = parse(messages[0])
    for msg, q in zip(messages[1:], asked[1:], strict=True):
        p = parse(msg)
        bare = msg.strip().replace(",", ".")
        if q == "qty_t" and re.fullmatch(r"\d+(\.\d+)?", bare):
            p["qty_t"] = float(bare)
        for k, v in p.items():
            if v:
                out[k] = v
    if out["due"]:
        out["due_flexible"] = False
    return out


# «срок не важен» по-русски и по-узбекски: тогда берем ближайшую поставку и не переспрашиваем.
FLEXIBLE = [
    r"не важн",
    r"неважн",
    r"любой срок",
    r"когда угодно",
    r"без срока",
    r"не срочно",
    r"farqi yo",
    r"muhim emas",
    r"shoshilinch emas",
]
WORD_NUM = {
    "один": 1,
    "одну": 1,
    "два": 2,
    "две": 2,
    "три": 3,
    "четыре": 4,
    "пять": 5,
    "bir": 1,
    "ikki": 2,
    "uch": 3,
    "to'rt": 4,
    "besh": 5,
}


def _relative_days(t: str) -> int | None:
    if re.search(r"послезавтра|indinga", t):
        return 2
    if re.search(r"завтра|ertaga", t):
        return 1
    m = re.search(r"через\s+(\d+|\w+)?\s*(дн|день|недел)", t)
    if m:
        n = m.group(1)
        k = int(n) if n and n.isdigit() else WORD_NUM.get(n or "", 1)
        return k * 7 if m.group(2).startswith("недел") else k
    m = re.search(r"(\d+|\w+)\s+(kun|hafta)dan\s+keyin", t)
    if m:
        n = m.group(1)
        k = int(n) if n.isdigit() else WORD_NUM.get(n, 1)
        return k * 7 if m.group(2) == "hafta" else k
    return None


# Дата раньше сегодняшней не больше чем на столько дней — это ошибка, а не следующий год.
PAST_WINDOW_DAYS = 60


def resolve_due(due: tuple[int, int] | None, flexible: bool, today: date = C.DEMO_TODAY) -> tuple[date | None, str]:
    """(дата, откуда она). Источник: given — назван, flexible — срок не важен, missing — не назван, past — уже прошел.

    ValueError — такой даты не бывает (31 февраля).
    """
    if due is None:
        if flexible:
            return today + timedelta(days=DEFAULT_LEAD_DAYS), "flexible"
        return None, "missing"
    d = date(today.year, due[1], due[0])
    if d < today:
        if (today - d).days <= PAST_WINDOW_DAYS:
            return d, "past"
        d = date(today.year + 1, due[1], due[0])
    return d, "given"


# Части общего вопроса, когда не хватает сразу нескольких полей.
PARTS = {
    "product": "какой товар нужен (в демо есть мука)",
    "qty_t": "сколько нужно — в тоннах или килограммах",
    "due": "к какому числу нужна поставка (если срок не важен, так и напишите)",
    "past": "к какому числу нужна поставка — названная дата уже прошла",
}


def question(missing: list[str], due_past: bool) -> str | None:
    """Один вопрос сразу обо всем, чего не хватает. Одно поле — короткий вопрос, несколько — список."""
    if not missing:
        return None
    keys = ["past" if k == "due" and due_past else k for k in missing]
    if len(keys) == 1:
        return QUESTIONS[keys[0]]
    parts = [PARTS[k] for k in keys]
    return "Уточните, пожалуйста: " + ", ".join(parts[:-1]) + " и " + parts[-1] + "."


QUESTIONS = {
    "product": "Какой товар нужен? Сейчас в демо на бирже есть мука.",
    "qty_t": "Сколько нужно? Можно в тоннах или килограммах.",
    "due": "К какому числу нужна поставка? Если срок не важен, так и напишите.",
    "past": "Эта дата уже прошла. К какому числу нужна поставка?",
}
