"""Сценарий демо целиком через API, Claude выключен: работают разбор кодом и шаблоны."""

POOL = "flour-samarkand-2611"
DEAL = "P-2611-0417"


def test_need_ru_and_uz(client):
    r = client.post("/need", json={"text": "2 т муки в/с в Самарканд"}).json()
    assert r["source"] == "template"
    assert r["spec"]["product"] == "Мука пшеничная, высший сорт, ГОСТ 26574"
    assert r["spec"]["qty_t"] == 2
    assert r["spec"]["hub"] == "Самарканд, хаб «Север»"
    assert r["spec"]["due_text"] == "25 ноября"
    assert r["spec"]["budget_uzs"] == 4600
    assert r["pool"] == {"id": POOL, "members": 36, "lot_t": 60, "lot_unit": "вагон"}
    uz = client.post("/need", json={"text": "25-noyabrgacha Samarqandga 2 tonna un"}).json()
    assert uz["spec"]["qty_t"] == 2 and uz["spec"]["due_given"] and uz["pool"]["id"] == POOL


def test_need_unknown_product(client):
    r = client.post("/need", json={"text": "цемент 20 т"}).json()
    assert r["pool"] is None and r["missing"] == ["product"]


def test_pool_view_matches_design(client):
    p = client.get(f"/pools/{POOL}?qty_t=2").json()
    assert (p["filled_t"], p["left_t"], p["members"], p["days_left"]) == (50, 10, 36, 3)
    assert p["price"]["expected_uzs"] == 4260 and p["price"]["discount_pct"] == 18
    assert p["price"]["order_uzs"] == 8_520_000 and p["price"]["retail_order_uzs"] == 10_400_000
    assert p["price"]["sellers_confirmed"] == 4
    t = p["trust"]
    assert (t["rating"], t["deposit_pct"], t["deposit_uzs"], t["hint"]["deals"]) == (82, 2.5, 213_000, 3)


def test_auction_needs_filled_pool(client):
    r = client.get(f"/pools/{POOL}/auction")
    assert r.status_code == 409 and r.json()["error"] == "pool_not_filled"


def _to_deal(client):
    j = client.post(f"/pools/{POOL}/join", json={"qty_t": 2}).json()
    assert [e["qty_t"] for e in j["events"]] == [2, 1, 3, 2]
    assert j["pool"]["status"] == "filled" and j["pool"]["members"] == 41
    assert [s["you"] for s in j["pool"]["segments"]][:2] == [False, True]
    a = client.get(f"/pools/{POOL}/auction").json()
    assert a["final_price"] == 4260 and a["winner"]["short"] == "Zarafshon Don"
    assert a["explain"]["source"] == "template"
    assert a["explain"]["points"][0] == "За вагон боролись 4 продавца. Двое вышли, когда цена стала ниже их себестоимости."
    assert a["deal_id"] == DEAL


def test_join_twice_or_too_much(client):
    assert client.post(f"/pools/{POOL}/join", json={"qty_t": 11}).status_code == 409
    _to_deal(client)
    assert client.post(f"/pools/{POOL}/join", json={"qty_t": 2}).json()["error"] == "pool_closed"


def test_deal_happy_path(client):
    _to_deal(client)
    d = client.get(f"/deals/{DEAL}").json()
    assert (d["stage"], d["total_uzs"], d["deposit_uzs"], d["recipients"]) == (1, 8_520_000, 213_000, 41)
    assert client.post(f"/deals/{DEAL}/confirm").status_code == 409
    assert client.post(f"/deals/{DEAL}/pay").json()["stage"] == 3
    d = client.post(f"/deals/{DEAL}/confirm").json()
    assert d["status"] == "settled"
    assert d["rating_change"] == {"before": 82, "after": 84, "next_deposit_pct": 2.3}


def test_dispute_accept(client):
    _to_deal(client)
    client.post(f"/deals/{DEAL}/pay")
    assert client.post(f"/deals/{DEAL}/dispute").json()["status"] == "dispute"
    s = client.get(f"/deals/{DEAL}/dispute").json()
    assert s["decision"]["refund_uzs"] == 255_600 and s["decision"]["to_seller_uzs"] == 8_264_400
    assert s["checks"]["confirmed_others"] == 40 and s["checks"]["seller_disputes_12m"] == 1
    r = client.post(f"/deals/{DEAL}/dispute/accept").json()
    assert r["deal"]["refund_uzs"] == 255_600 and r["deal"]["status"] == "settled"


def test_dispute_escalate(client):
    _to_deal(client)
    client.post(f"/deals/{DEAL}/pay")
    client.post(f"/deals/{DEAL}/dispute")
    r = client.post(f"/deals/{DEAL}/dispute/escalate").json()
    assert r["deal"]["status"] == "arbiter"
    assert client.post(f"/deals/{DEAL}/dispute/accept").status_code == 409
