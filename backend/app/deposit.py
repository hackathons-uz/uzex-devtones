"""Залог и страховка в сумах. Чистые функции: без базы данных и без ИИ."""

import math

from . import config as C


def tier_pct(rating: int) -> float:
    for floor, pct in C.DEPOSIT_TIERS:
        if rating >= floor:
            return pct
    return C.DEPOSIT_TIERS[-1][1]


def next_tier(rating: int, current_pct: float | None = None) -> tuple[int, float] | None:
    """Ближайшая ступень, где залог ниже текущего: (нужный рейтинг, процент) или None.

    current_pct — фактический процент (например, уже сниженный поручителем); по умолчанию — по таблице.
    """
    current = tier_pct(rating) if current_pct is None else min(tier_pct(rating), current_pct)
    for floor, pct in sorted(C.DEPOSIT_TIERS):
        if floor > rating and pct < current:
            return floor, pct
    return None


def insurance_available(rating: int, amount: int) -> bool:
    return rating >= C.INSURANCE_MIN_RATING and amount <= C.INSURANCE_MAX_AMOUNT_UZS


def insurance_fee_pct(rating: int) -> float | None:
    for floor, pct in C.INSURANCE_FEE_TIERS:
        if rating >= floor:
            return pct
    return None


def compute(
    rating: int,
    amount: int,
    guarantor_rating: int | None = None,
    min_prepay_pct: float = 0,
    insurance: bool = False,
) -> dict:
    """Шаги залога строго по PRD. Возвращает итог и список примененных шагов."""
    min_prepay_pct = min_prepay_pct or 0
    steps: list[dict] = []

    if insurance:
        if not insurance_available(rating, amount):
            raise ValueError("insurance_unavailable")
        fee_pct = insurance_fee_pct(rating)
        pct = float(min_prepay_pct)
        steps.append({"step": "insurance", "pct": pct, "fee_pct": fee_pct})
        return {
            "pct": pct,
            "deposit_uzs": _money(amount, pct),
            "insurance": True,
            "fee_pct": fee_pct,
            "fee_uzs": _money(amount, fee_pct),
            "steps": steps,
        }

    pct = tier_pct(rating)
    steps.append({"step": "tier", "pct": pct, "rating": rating})

    if guarantor_rating is not None:
        g_pct = max(tier_pct(guarantor_rating), C.GUARANTOR_FLOOR_PCT)
        if g_pct < pct:
            pct = g_pct
            steps.append({"step": "guarantor", "pct": pct, "guarantor_rating": guarantor_rating})

    if rating >= 90 and amount > C.ZERO_DEPOSIT_LIMIT_UZS and pct < C.ZERO_DEPOSIT_LIMIT_FLOOR_PCT:
        pct = C.ZERO_DEPOSIT_LIMIT_FLOOR_PCT
        steps.append({"step": "zero_limit", "pct": pct, "limit_uzs": C.ZERO_DEPOSIT_LIMIT_UZS})

    if amount > C.LARGE_DEAL_LIMIT_UZS and pct < C.LARGE_DEAL_FLOOR_PCT:
        pct = C.LARGE_DEAL_FLOOR_PCT
        steps.append({"step": "large_deal", "pct": pct, "limit_uzs": C.LARGE_DEAL_LIMIT_UZS})

    if min_prepay_pct and pct < min_prepay_pct:
        pct = float(min_prepay_pct)
        steps.append({"step": "seller_prepay", "pct": pct})

    return {
        "pct": pct,
        "deposit_uzs": _money(amount, pct),
        "insurance": False,
        "fee_pct": None,
        "fee_uzs": 0,
        "steps": steps,
    }


def fund_is_sustainable(default_rate_pct: float, loss_pct: float, fee_pct: float) -> bool:
    """Фонд устойчив, если доля срывов * убыток на срыв <= взнос."""
    return default_rate_pct / 100 * loss_pct <= fee_pct + 1e-9


def _money(amount: int, pct: float) -> int:
    # Деньги — целые сумы. Округляем к ближайшему целому, половину — вверх.
    return int(math.floor(amount * pct / 100 + 0.5))
