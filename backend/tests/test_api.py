"""Сценарий демо целиком через API, Claude выключен: работают разбор кодом и шаблоны."""

POOL = "flour-samarkand-2611"
DEAL = "P-2611-0417"


def _need(client, *messages, asked=()):
    return client.post("/need", json={"messages": list(messages), "asked": [None, *asked]}).json()


def test_need_full_request(client):
    r = _need(client, "2 т муки в/с в Самарканд до 25 ноября")
    assert r["source"] == "template" and r["missing"] == [] and r["question"] is None
    assert r["spec"]["product"] == "Мука пшеничная, высший сорт, ГОСТ 26574"
    assert (r["spec"]["qty_t"], r["spec"]["due_text"], r["spec"]["due_source"]) == (2, "25 ноября", "given")
    assert r["spec"]["hub"] == "Самарканд, склад «Север»" and r["spec"]["budget_uzs"] == 4600
    assert r["pool"] == {
        "id": POOL,
        "members": 36,
        "lot_t": 60,
        "lot_unit": "вагон",
        "lot_unit_ins": "вагонами",
        "who": "пекарен",
        "joined": False,
    }


def test_need_asks_missing_due_then_qty(client):
    r = _need(client, "мука в Самарканд")
    assert r["missing"] == ["qty_t", "due"] and r["pool"] is None
    assert r["question"] == (
        "Уточните, пожалуйста: сколько нужно — в тоннах или килограммах "
        "и к какому числу нужна поставка (если срок не важен, так и напишите)."
    )
    r = _need(client, "мука в Самарканд", "2", asked=["qty_t"])
    assert r["missing"] == ["due"] and r["spec"]["qty_t"] == 2
    r = _need(client, "мука в Самарканд", "2", "через неделю", asked=["qty_t", "due"])
    assert r["missing"] == [] and r["spec"]["due_text"] == "24 ноября" and r["pool"]["id"] == POOL


def test_need_flexible_due_and_uz(client):
    r = _need(client, "Samarqandga 2 tonna un", "farqi yo'q", asked=["due"])
    assert r["missing"] == [] and r["spec"]["due_source"] == "flexible" and r["pool"]["id"] == POOL
    r = _need(client, "25-noyabrgacha Samarqandga 2 tonna un")
    assert r["spec"]["due_source"] == "given" and r["pool"]["id"] == POOL


def test_need_past_or_early_due(client):
    r = _need(client, "2 т муки в Самарканд до 10 ноября")
    assert r["missing"] == ["due"] and r["question"].startswith("Эта дата уже прошла")
    r = _need(client, "2 т муки в Самарканд до 20 ноября")
    assert r["pool"] is None and r["pool_late"] == {"delivery_text": "22 ноября"}


def test_need_unknown_product(client):
    r = _need(client, "золото 20 т до 30 ноября")
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
    again = _need(client, "2 т муки в Самарканд до 25 ноября")
    assert again["pool"]["joined"] is True


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


def test_stt_without_key(client, monkeypatch):
    monkeypatch.delenv("UZBEKVOICE_API_KEY", raising=False)
    r = client.post("/stt", content=b"\x00\x01", headers={"Content-Type": "audio/webm"})
    assert r.status_code == 503 and r.json()["error"] == "stt_unavailable"


def test_stt_passes_text(client, monkeypatch):
    import httpx

    from app import stt

    sent = {}

    def fake_post(url, headers, files, data, timeout):
        sent.update(url=url, auth=headers["Authorization"], file=files["file"], data=data)
        return httpx.Response(200, json={"id": "1", "result": {"text": "2 тонны муки"}, "state": "SUCCESS"})

    monkeypatch.setenv("UZBEKVOICE_API_KEY", "test-key")
    monkeypatch.setattr(stt.httpx, "post", fake_post)
    r = client.post("/stt", content=b"abc", headers={"Content-Type": "audio/webm;codecs=opus"})
    assert r.json() == {"text": "2 тонны муки"}
    assert sent["auth"] == "test-key" and sent["file"] == ("voice.webm", b"abc", "audio/webm")
    assert sent["data"]["language"] == "uz-ru" and sent["data"]["blocking"] == "true"


def test_need_correction_after_complete(client):
    r = _need(client, "2 т муки в/с в Самарканд до 25 ноября", "нет, давай 3 т", asked=[None])
    assert r["missing"] == [] and r["spec"]["qty_t"] == 3 and r["spec"]["due_text"] == "25 ноября"
    r = _need(client, "2 т муки в/с в Самарканд до 25 ноября", "нет, давай 3 т", "срок до 30 ноября", asked=[None, None])
    assert (r["spec"]["qty_t"], r["spec"]["due_text"]) == (3, "30 ноября")


def test_offer_from_history(client):
    o = client.get("/offer").json()
    assert o["draft"] == "2 т муки в/с в Самарканд до 25 ноября"
    assert (o["forecast"]["days_left"], o["forecast"]["interval_days"], o["forecast"]["purchases"]) == (8, 22, 4)
    assert (o["pool"]["id"], o["pool"]["members"], o["pool"]["price_uzs"], o["pool"]["discount_pct"]) == (POOL, 36, 4260, 18)
    r = _need(client, o["draft"])
    assert r["missing"] == [] and r["pool"]["id"] == POOL


def test_no_offer_without_history_or_after_join(client):
    from app import db

    client.post(f"/pools/{POOL}/join", json={"qty_t": 2})
    assert client.get("/offer").json() is None
    client.post("/demo/reset")
    with db.session() as conn:
        conn.execute("UPDATE business SET purchases='[]'")
    assert client.get("/offer").json() is None


def test_any_product_gets_own_pool(client):
    r = _need(client, "5 т цемента М500 в Ташкент до 30 ноября")
    assert r["missing"] == [] and r["pool"]["id"] == "cement-tashkent-2611" and r["pool"]["who"] in ("стройкомпании", "стройкомпаний")
    assert r["spec"]["product"] == "Цемент, М500, ГОСТ 31108"
    # Поменяли объем до вступления — пул собирается заново под новую долю.
    r = _need(client, "5 т цемента М500 в Ташкент до 30 ноября", "давай 7 т", asked=[None])
    pid = r["pool"]["id"]
    j = client.post(f"/pools/{pid}/join", json={"qty_t": 7}).json()
    assert j["pool"]["status"] == "filled"
    a = client.get(f"/pools/{pid}/auction").json()
    assert a["final_price"] == 1120 and a["dropped_count"] == 2 and len(a["excluded"]) == 1
    deal = a["deal_id"]
    client.post(f"/deals/{deal}/pay")
    client.post(f"/deals/{deal}/dispute")
    s = client.get(f"/deals/{deal}/dispute").json()
    assert s["decision"]["shortfall_kg"] == 210 and s["decision"]["refund_uzs"] == 210 * 1120 and s["decision"]["fault"] == "hub"
    d = _need(client, "дизель 10 тонн в Бухару, срок не важен")
    assert d["pool"]["id"] == "diesel-bukhara-2611" and d["pool"]["lot_unit"] == "цистерна"


def test_product_outside_catalog_uses_ai_card(client, monkeypatch):
    from app import ai

    card = {
        "is_commodity": True,
        "name": "Карбамид",
        "standard": None,
        "avg_uzs_per_kg": 3000,
        "retail_uzs_per_kg": 3600,
        "lot_t": 60,
        "lot_unit": "вагон",
        "who": ["ферма", "фермы", "ферм"],
        "audience": "Пул фермеров",
        "sellers": [{"short": f"Agro {k}", "about": "Завод, Навои"} for k in range(5)],
    }
    monkeypatch.setattr(
        ai,
        "parse_need",
        lambda msgs, today: {
            "product": "other",
            "other_name": "Карбамид",
            "grade": None,
            "qty_t": 10,
            "city": "fergana",
            "due_day": 30,
            "due_month": 11,
            "due_flexible": False,
        },
    )
    monkeypatch.setattr(ai, "describe_product", lambda name: card)
    r = _need(client, "10 т карбамида в Фергану до 30 ноября")
    assert r["spec"]["product"] == "Карбамид" and r["pool"]["who"] in ("фермы", "ферм")
    p = client.get(f"/pools/{r['pool']['id']}?qty_t=10").json()
    assert p["price"]["source"] == "ai" and p["price"]["expected_uzs"] == 2910
    assert client.get(f"/pools/{POOL}").json()["price"]["source"] == "exchange"
