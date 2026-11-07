"""Критерии готовности PRD v3: три живые функции и устойчивость демо."""

import pytest

SEED_BUYERS = ["stroyplus", "alisher", "dilnoza", "megastroy", "nadezhny", "ferganass", "somnitel", "khorezm"]


def preview(client, buyer, lot="lot-cement", qty=20, **kw):
    r = client.post("/requests/preview", json={"buyer_id": buyer, "lot_id": lot, "qty_t": qty, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def test_seed_ratings(client):
    expected = {
        "cementprom": 88,
        "stroyplus": 40,
        "alisher": 40,
        "dilnoza": 40,
        "megastroy": 81,
        "nadezhny": 92,
        "ferganass": 92,
        "somnitel": 22,
        "khorezm": 50,
    }
    for pid, value in expected.items():
        assert client.get(f"/participants/{pid}").json()["rating"] == value, pid


@pytest.mark.parametrize("buyer", SEED_BUYERS)
def test_preview_for_every_seed_buyer(client, buyer):
    r = preview(client, buyer, qty=5)
    assert "admitted" in r["admission"]
    assert r["deposit"]["deposit_uzs"] >= 0
    assert r["explanation"]["source"] == "template"
    assert r["explanation"]["text"]


def test_step1_rejected_on_sugar_with_options(client):
    r = preview(client, "stroyplus", lot="lot-sugar", qty=2)
    adm = r["admission"]
    assert adm["admitted"] is False
    assert adm["reasons"][0]["code"] == "rule_min_rating"
    codes = {o["code"] for o in adm["options"]}
    assert {"guarantor", "improve_rating"} <= codes
    assert "pool" not in codes  # на сахаре пул запрещен
    assert "40" in r["explanation"]["text"] and "70" in r["explanation"]["text"]


def test_step1_deposit_and_next_tier(client):
    r = preview(client, "stroyplus", qty=20)
    assert r["admission"]["admitted"] is True
    assert r["amount_uzs"] == 18_000_000
    assert r["deposit"]["pct"] == 10
    assert r["deposit"]["deposit_uzs"] == 1_800_000
    assert r["next_tier"] == {"rating": 60, "pct": 6.0, "points_left": 20}
    assert "Залог 10%" in r["explanation"]["text"]

    trusted = preview(client, "ferganass", qty=40)
    assert trusted["deposit"]["pct"] == 1
    assert trusted["deposit"]["deposit_uzs"] == 360_000


def test_guarantor_lowers_deposit(client):
    r = preview(client, "stroyplus", qty=20, guarantor_id="nadezhny")
    assert r["deposit"]["pct"] == 3
    bad = client.post(
        "/requests/preview", json={"buyer_id": "stroyplus", "lot_id": "lot-cement", "qty_t": 20, "guarantor_id": "khorezm"}
    )
    assert bad.status_code == 422
    assert bad.json()["error"] == "guarantor_invalid"


def test_submit_and_confirm(client):
    r = client.post("/requests", json={"buyer_id": "ferganass", "lot_id": "lot-sugar", "qty_t": 5})
    assert r.json()["status"] == "admitted"
    rid = r.json()["id"]
    assert client.post(f"/requests/{rid}/confirm").json()["status"] == "deposit_locked"
    log = client.get("/decisions", params={"entity_type": "request", "entity_id": rid}).json()
    assert {x["kind"] for x in log} == {"admission", "deposit"}


def test_duplicate_request_is_rejected(client):
    assert preview(client, "stroyplus", qty=20)["existing_request"]["id"] == "req-1"
    r = client.post("/requests", json={"buyer_id": "stroyplus", "lot_id": "lot-cement", "qty_t": 20})
    assert r.status_code == 409
    assert r.json()["error"] == "request_exists"


def _pool(client):
    r = client.get("/lots/lot-cement/pool-proposals")
    assert r.status_code == 200, r.text
    pools = r.json()["pools"]
    assert len(pools) == 1
    return pools[0]


def test_step2_pool_composition(client):
    p = _pool(client)
    assert p["total_t"] == 90
    members = {m["buyer_name"]: (m["share_t"], m["deposit_uzs"]) for m in p["members"]}
    assert members == {
        "СтройПлюс": (20, 1_800_000),
        "Бригада Алишера": (25, 2_250_000),
        "Магазин Дилноза": (30, 2_700_000),
        "МегаСтрой": (15, 405_000),
    }
    khorezm = [e for e in p["excluded"] if e["buyer_name"] == "ХорезмСтрой"]
    assert khorezm and "далеко" in khorezm[0]["message"].lower()
    assert p["route"] and p["pool_cost_uzs"] > 0 and p["alone_cost_uzs"] > 0
    assert p["status"] == "proposed"
    # Повторный запрос возвращает тот же пул, а не новый.
    assert _pool(client)["id"] == p["id"]


def test_step2_all_confirm_locks(client):
    p = _pool(client)
    buyers = [m["buyer_id"] for m in p["members"]]
    for i, b in enumerate(buyers):
        v = client.post(f"/pools/{p['id']}/confirm", params={"participant_id": b}).json()
        assert v["status"] == ("locked" if i == len(buyers) - 1 else "confirming")
    assert v["confirmed_count"] == 4


def test_step2_withdraw_recomputes(client):
    p = _pool(client)
    client.post(f"/pools/{p['id']}/confirm", params={"participant_id": "stroyplus"})
    v = client.post(f"/pools/{p['id']}/withdraw", params={"participant_id": "megastroy"}).json()
    # Без МегаСтрой остается 75 т, замены в seed нет: пул не собирается.
    assert v["status"] == "failed"
    assert v["replan"]["max_collected_t"] == 75
    assert v["replan"]["min_fill_t"] == 90


def test_step3_rule_save_rejects_suspicious(client):
    # Без Claude разбор возвращает ручную форму; продавец заполняет те же поля.
    parsed = client.post(
        "/lots/lot-cement/rules/parse", json={"text": "не продавать новичкам больше 5 т и пускать от рейтинга 40"}
    ).json()
    assert parsed["manual"] is True and parsed["source"] == "template"

    saved = client.post(
        "/lots/lot-cement/rules",
        json={"rule": {"min_rating": 40, "newbie_max_volume_t": 5}, "text": "не продавать новичкам больше 5 т и пускать от рейтинга 40", "source": "template"},
    )
    assert saved.status_code == 200
    assert saved.json()["rule"]["newbie_max_volume_t"] == 5

    rows = {r["buyer"]["name"]: r for r in client.get("/lots/lot-cement/requests").json()["requests"]}
    st = rows["СомнительТрейд"]
    assert st["admission"]["admitted"] is False
    assert st["risk"]["level"] == "high"
    assert {s["code"] for s in st["risk"]["signals"]} == {"low_price", "closed_chain"}
    ns = rows["Надежный Строй"]
    assert ns["admission"]["admitted"] is True
    assert ns["risk"]["level"] == "low"


def test_errors_have_prd_format(client):
    r = client.get("/lots/nope")
    assert r.status_code == 404
    assert set(r.json()) == {"error", "message"}


def test_demo_is_repeatable(client):
    def run():
        client.post("/demo/reset")
        a = preview(client, "stroyplus", lot="lot-sugar", qty=2)
        b = preview(client, "stroyplus", qty=20)
        p = _pool(client)
        for m in p["members"]:
            last = client.post(f"/pools/{p['id']}/confirm", params={"participant_id": m["buyer_id"]}).json()
        client.post(
            "/lots/lot-cement/rules", json={"rule": {"min_rating": 40, "newbie_max_volume_t": 5}, "source": "template"}
        )
        reqs = client.get("/lots/lot-cement/requests").json()["requests"]
        strip = lambda v: {k: v[k] for k in ("admission", "deposit", "explanation")}  # noqa: E731
        return (
            strip(a),
            strip(b),
            last["status"],
            [(m["share_t"], m["deposit_uzs"], m["pool_share_uzs"]) for m in last["members"]],
            [(r["id"], r["admission"]["status"], r["risk"]["level"], r["risk"]["score"]) for r in reqs],
        )

    first = run()
    assert run() == first
    assert run() == first


def test_without_claude_key_answer_uses_template(client, monkeypatch):
    # Критерий PRD: при отключенном ключе Claude ответ приходит с шаблонным текстом.
    from app import ai

    monkeypatch.delenv("AI_DISABLED", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setattr(ai, "_client", None)
    r = preview(client, "stroyplus", qty=20)
    assert r["explanation"]["source"] == "template"
    assert r["deposit"]["deposit_uzs"] == 1_800_000
    parsed = client.post("/lots/lot-cement/rules/parse", json={"text": "пускать от рейтинга 50"}).json()
    assert parsed["manual"] is True


def test_excluded_list_is_stable_after_lock(client):
    p = _pool(client)
    before = [(e["buyer_name"], e["message"]) for e in p["excluded"]]
    for m in p["members"]:
        v = client.post(f"/pools/{p['id']}/confirm", params={"participant_id": m["buyer_id"]}).json()
    assert v["status"] == "locked"
    assert [(e["buyer_name"], e["message"]) for e in v["excluded"]] == before
    assert any(name == "ХорезмСтрой" for name, _ in before)


def test_new_rule_does_not_reject_locked_pool_members(client):
    p = _pool(client)
    for m in p["members"]:
        client.post(f"/pools/{p['id']}/confirm", params={"participant_id": m["buyer_id"]})
    client.post("/lots/lot-cement/rules", json={"rule": {"min_rating": 40, "newbie_max_volume_t": 5}, "source": "template"})
    rows = {r["buyer"]["name"]: r for r in client.get("/lots/lot-cement/requests").json()["requests"]}
    for name in ("СтройПлюс", "Бригада Алишера", "Магазин Дилноза"):
        assert rows[name]["admission"]["admitted"] is True
        assert rows[name]["admission"]["locked"] is True
        assert rows[name]["admission"]["new_rule_would_reject"] is True
    assert rows["СомнительТрейд"]["admission"]["admitted"] is False


def test_next_tier_respects_guarantor(client):
    r = preview(client, "stroyplus", qty=20, guarantor_id="nadezhny")
    assert r["deposit"]["pct"] == 3
    assert r["next_tier"] == {"rating": 90, "pct": 1.0, "points_left": 50}
    assert "6%" not in r["explanation"]["text"]


def test_preview_is_not_logged_and_journal_is_readable(client):
    preview(client, "stroyplus", qty=20)
    assert not [d for d in client.get("/decisions").json() if d["entity_type"] == "preview"]
    client.get("/lots/lot-cement/pool-proposals")
    rows = client.get("/decisions").json()
    assert rows and all(d["title"] and d["summary"] for d in rows)


def test_search_delivery_matches_pool_math(client):
    lots = client.get("/lots", params={"buyer_id": "stroyplus", "qty_t": 20}).json()
    cement = next(l for l in lots if l["id"] == "lot-cement")
    # 1 рейс на 20 т, как в пуле «в одиночку»: 723 000 сум / 20 т.
    assert cement["delivery_estimate"]["per_t_uzs"] == 36_150
