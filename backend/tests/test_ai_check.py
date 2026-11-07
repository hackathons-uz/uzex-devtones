"""Проверка текстов Claude кодом: плохой текст заменяется шаблоном."""

from app.ai import check_text

P = {"rating": 40, "amount_uzs": 18_000_000, "deposit": {"pct": 10.0, "deposit_uzs": 1_800_000}, "next_tier": {"rating": 60, "pct": 6.0, "points_left": 20}}


def test_good_text_passes():
    t = "Залог 10%, это 1 800 000 сум: рейтинг 40. До 6% осталось 20 баллов."
    assert check_text(t, P) is None
    assert check_text("Залог 1,8 млн сум при сумме 18 млн сум.", P) is None


def test_latin_and_self_correction_rejected():
    assert check_text("Выгоднее это Дилfiroz, ей проще.", P) == "latin"
    assert check_text("Выгоднее всего, точнее, Магазину Дилноза.", P) == "self_correction"


def test_long_text_is_not_rejected():
    assert check_text("Раз. Два. Три. Четыре. Пять.", P) is None


def test_negative_numbers_match_without_sign():
    assert check_text("СтройПлюс переплатит 85 000 сум.", {"saving_uzs": -85_000}) is None


def test_unknown_number_rejected():
    assert check_text("Залог 12% от суммы.", P) == "unknown_number:12"
    assert check_text("Залог составит 2 000 000 сум.", P).startswith("unknown_number")
