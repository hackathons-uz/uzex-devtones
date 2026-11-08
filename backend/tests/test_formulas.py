"""Формулы на числах из макета: 82 балла, задаток 2,5% = 213 000 сум, цена 4 260 сум/кг."""

from datetime import date

import pytest
from app import formulas as F

H = F.History(clean_deals=14, tax_clean_years=3, business_years=4, stable_turnover=True, late_payments=[date(2026, 8, 14)])


def test_rating_and_deposit_from_factors():
    f = F.rating_factors(H)
    assert [x["label"] for x in f] == [
        "14 сделок без срывов",
        "Налоги без долгов 3 года",
        "Бизнесу 4 года, обороты стабильны",
        "Одна задержка оплаты в августе",
    ]
    assert [x["deposit_pp"] for x in f] == [-3.0, -2.5, -2.5, 0.5]
    assert F.rating(f) == 82
    assert F.deposit_pct(f) == 2.5
    assert F.deposit_uzs(2.5, 8_520_000) == 213_000


def test_next_deal_and_hint():
    nh = F.History(15, 3, 4, True, H.late_payments)
    f = F.rating_factors(nh)
    assert F.rating(f) == 84
    assert F.deposit_pct(f) == 2.3
    assert F.deals_to_target(H) == 3


def test_old_late_payment_expires():
    old = F.History(14, 3, 4, True, [date(2025, 8, 14)])
    assert F.rating(F.rating_factors(old)) == 87


def test_deposit_bounds():
    newbie = F.History(0, 0, 0, False, [])
    assert F.deposit_pct(F.rating_factors(newbie)) == 10.0
    best = F.History(40, 5, 10, True, [])
    assert F.deposit_pct(F.rating_factors(best)) == 1.0


def test_price():
    assert F.expected_price(4390)["price_uzs"] == 4260
    assert F.discount_pct(4260, 5200) == 18
    assert F.discount_pct(4260, 4390) == 3
    assert F.budget([4350, 4420, 4380, 4370]) == 4600


def _s(sid, rating, bids):
    return {"id": sid, "name": sid, "rating": rating, "on_time_pct": 90, "bids": bids}


def test_auction_winner_drops_and_exclusion():
    r = F.auction(
        [
            _s("a", 4.9, [4520, 4450, 4380, 4320, 4280, 4260]),
            _s("b", 4.7, [4550, 4480, 4400, 4340, 4300, 4290]),
            _s("c", 4.5, [4600, 4520, 4450, 4400, None, None]),
            _s("d", 4.2, [4580, 4500, None, None, None, None]),
            _s("x", 3.7, [4000] * 6),
        ]
    )
    assert r["final_price"] == 4260
    assert r["winner"]["id"] == "a"
    assert r["dropped_count"] == 2
    assert [e["id"] for e in r["excluded"]] == ["x"]
    assert [x["best_price"] for x in r["rounds"]] == [4520, 4450, 4380, 4320, 4280, 4260]


def test_auction_seller_cannot_return():
    r = F.auction([_s("a", 4.9, [100, 90, 80, 70, 60, 55]), _s("b", 4.8, [110, None, 50, 40, 30, 20])])
    assert r["winner"]["id"] == "a"
    assert r["rounds"][2]["bids"][1]["price"] is None


def test_dispute_decision():
    d = F.dispute_decision(waybill_kg=2000, received_kg=1940, price_uzs=4260, total_uzs=8_520_000, recipients=41, confirmed_others=40)
    assert d == {"shortfall_kg": 60, "refund_uzs": 255_600, "to_seller_uzs": 8_264_400, "fault": "hub", "seller_rating_changes": False}
    d2 = F.dispute_decision(waybill_kg=2000, received_kg=1940, price_uzs=4260, total_uzs=8_520_000, recipients=41, confirmed_others=30)
    assert d2["fault"] == "seller"


@pytest.mark.parametrize(("n", "word"), [(1, "сделка"), (2, "сделки"), (5, "сделок"), (11, "сделок"), (21, "сделка"), (14, "сделок")])
def test_plural(n, word):
    assert F.plural(n, "сделка", "сделки", "сделок") == word
