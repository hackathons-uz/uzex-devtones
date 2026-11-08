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
    "samarkand": {"name": "Самарканд", "hub": "Самарканд, хаб «Север»", "keywords": [r"самарканд", r"samarqand", r"samarkand"]},
    "tashkent": {"name": "Ташкент", "hub": "Ташкент, хаб «Сергели»", "keywords": [r"ташкент", r"toshkent", r"tashkent"]},
}
UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
# Если срок не назван: запас по истории закупок покупателя.
DEFAULT_LEAD_DAYS = 8


def _find(keys: list[str], text: str) -> bool:
    return any(re.search(k, text) for k in keys)


def parse(text: str, today: date = C.DEMO_TODAY) -> dict:
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
    return {"product": product, "grade": grade, "qty_t": qty_t, "city": city, "due": due}


def resolve_due(due: tuple[int, int] | None, today: date = C.DEMO_TODAY) -> tuple[date, bool]:
    """(дата, названа ли она в тексте). Прошедшая дата в этом году — значит, следующий год."""
    if due is None:
        return today + timedelta(days=DEFAULT_LEAD_DAYS), False
    d = date(today.year, due[1], due[0])
    if d < today:
        d = date(today.year + 1, due[1], due[0])
    return d, True
