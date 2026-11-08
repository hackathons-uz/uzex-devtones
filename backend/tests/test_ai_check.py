"""Проверка текстов Claude кодом: плохой текст заменяется шаблоном."""

from app.ai import check_text

P = {"winner": "Zarafshon Don", "final_price_uzs_per_kg": 4260, "below_retail_pct": 18, "winner_on_time_pct": 99}


def test_good_text_passes():
    assert check_text("Победил «Zarafshon Don»: 4 260 сум за кг и 99% поставок без срывов.", P) is None


def test_latin_only_from_payload():
    assert check_text("Победил Zarafshon Grain.", P) == "latin"


def test_self_correction_rejected():
    assert check_text("Цена ниже, точнее, на 18%.", P) == "self_correction"


def test_unknown_number_rejected():
    assert check_text("Цена на 25% ниже розницы.", P) == "unknown_number:25"
