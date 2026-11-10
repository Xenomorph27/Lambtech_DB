"""The resource API end to end: the whole pipeline, partial updates, refusals, filters (spec §10.2)."""

import uuid

from conftest import bearer

H = bearer()


def post(client, path, expect=201, **body):
    response = client.post(path, json=body, headers=H)
    assert response.status_code == expect, response.text
    return response.json()


def get(client, path, expect=200):
    response = client.get(path, headers=H)
    assert response.status_code == expect, response.text
    return response.json() if expect != 204 else None


def patch(client, path, expect=200, **body):
    response = client.patch(path, json=body, headers=H)
    assert response.status_code == expect, response.text
    return response.json()


def make_contact(client, email="ravi@acme.com", **extra):
    return post(client, "/contacts", full_name="Ravi Kumar", email=email, source="manual", **extra)


def make_pipeline(client):
    """Company → contact → outreach email → positive reply → lead → transaction with 2 milestones and a payment."""
    company = post(client, "/companies", name="Acme Pvt Ltd")
    contact = make_contact(client, company_id=company["id"])
    email = post(client, "/emails-sent", contact_id=contact["id"], from_email="ceo@lambtech.in", kind="outreach", subject="Hello")
    response = post(client, "/responses", email_sent_id=email["id"], subject="Re: Hello", category="positive")
    lead = get(client, "/leads")[0]
    tx = post(client, "/transactions", lead_id=lead["id"], title="AI audit", total_amount=100000, company_id=company["id"])
    m1 = post(client, "/milestones", transaction_id=tx["id"], title="Discovery", position=1)
    m2 = post(client, "/milestones", transaction_id=tx["id"], title="Build", position=2)
    payment = post(client, "/payments", transaction_id=tx["id"], amount=30000, method="upi")
    return dict(company=company, contact=contact, email=email, response=response, lead=lead, tx=tx, m1=m1, m2=m2, payment=payment)


def test_full_pipeline(client):
    p = make_pipeline(client)
    assert p["email"]["to_email"] == "ravi@acme.com"
    assert p["response"]["contact_id"] == p["contact"]["id"]

    lead = p["lead"]
    assert (lead["serial_no"], lead["full_name"], lead["company_name"]) == ("LT-0001", "Ravi Kumar", "Acme Pvt Ltd")
    assert lead["response_id"] == p["response"]["id"]

    assert p["tx"]["primary_contact_id"] == p["contact"]["id"]
    assert p["tx"]["amount_remaining"] == 100000.0

    patch(client, f"/milestones/{p['m1']['id']}", is_done=True)
    tx = get(client, f"/transactions/{p['tx']['id']}")
    assert (tx["amount_paid"], tx["amount_remaining"]) == (30000.0, 70000.0)
    assert (tx["milestones_done"], tx["milestones_total"], tx["progress_pct"]) == (1, 2, 50)
    assert tx["status"] == "active"

    patch(client, f"/milestones/{p['m2']['id']}", is_done=True)
    assert get(client, f"/transactions/{p['tx']['id']}")["status"] == "completed"


def test_patch_partial(client):
    contact = make_contact(client, phone="111", notes="met at event")
    updated = patch(client, f"/contacts/{contact['id']}", phone="222")
    assert (updated["phone"], updated["notes"], updated["full_name"]) == ("222", "met at event", "Ravi Kumar")
    cleared = patch(client, f"/contacts/{contact['id']}", notes=None)
    assert (cleared["notes"], cleared["phone"]) == (None, "222")


def test_delete_contact_with_history_409(client):
    contact = make_contact(client)
    post(client, "/emails-sent", contact_id=contact["id"], from_email="ceo@lambtech.in", kind="outreach", subject="Hi")
    response = client.delete(f"/contacts/{contact['id']}", headers=H)
    assert response.status_code == 409
    assert "related records" in response.json()["detail"]


def test_delete_204_then_404(client):
    company = post(client, "/companies", name="Gone Ltd")
    assert client.delete(f"/companies/{company['id']}", headers=H).status_code == 204
    get(client, f"/companies/{company['id']}", expect=404)


def test_duplicate_contact_409(client):
    make_contact(client, email="Ravi@Acme.com")
    response = client.post(
        "/contacts", json={"full_name": "R", "email": "ravi@acme.com", "source": "manual"}, headers=H
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_outreach_to_suppressed_422(client):
    post(client, "/suppressions", email="x@y.com", reason="manual")
    contact = make_contact(client, email="x@y.com")
    response = client.post(
        "/emails-sent",
        json={"contact_id": contact["id"], "from_email": "ceo@lambtech.in", "kind": "outreach", "subject": "Hi"},
        headers=H,
    )
    assert response.status_code == 422
    assert "do-not-email" in response.json()["detail"]


def test_invalid_enum_422(client):
    response = client.post(
        "/contacts", json={"full_name": "R", "email": "r@x.com", "source": "carrier_pigeon"}, headers=H
    )
    assert response.status_code == 422


def test_responses_filter_by_category(client):
    contact = make_contact(client)
    email = post(client, "/emails-sent", contact_id=contact["id"], from_email="ceo@lambtech.in", kind="outreach", subject="Hi")
    post(client, "/responses", email_sent_id=email["id"], category="negative")
    post(client, "/responses", email_sent_id=email["id"], category="positive")
    assert len(get(client, "/responses")) == 2
    assert [r["category"] for r in get(client, "/responses?category=positive")] == ["positive"]
    assert len(get(client, f"/responses?contact_id={contact['id']}")) == 2
    assert len(get(client, f"/emails-sent?contact_id={contact['id']}")) == 1


def test_payments_filter_by_transaction(client):
    p = make_pipeline(client)
    other = post(client, "/transactions", lead_id=p["lead"]["id"], title="Phase 2", total_amount=5000)
    post(client, "/payments", transaction_id=other["id"], amount=1000)
    assert len(get(client, "/payments")) == 2
    assert [x["amount"] for x in get(client, f"/payments?transaction_id={other['id']}")] == [1000.0]
    assert len(get(client, f"/milestones?transaction_id={p['tx']['id']}")) == 2


def test_anonymize_endpoint(client):
    contact = make_contact(client, phone="111")
    erased = post(client, f"/contacts/{contact['id']}/anonymize", expect=200)
    assert erased["is_anonymized"] is True
    assert erased["email"] != "ravi@acme.com" and erased["phone"] is None
    assert [s["reason"] for s in get(client, "/suppressions")] == ["erased"]


def test_stats_overview_counts(client):
    make_pipeline(client)
    stats = get(client, "/stats/overview")
    assert stats["contacts"] == 1
    assert stats["emails_sent"] == 1
    assert (stats["responses_unclassified"], stats["responses_a"], stats["responses_b"]) == (0, 0, 1)
    assert (stats["leads_total"], stats["leads_open"]) == (1, 1)
    assert stats["transactions_active"] == 1
    assert (stats["amount_total"], stats["amount_paid"], stats["amount_remaining"]) == (100000.0, 30000.0, 70000.0)
    assert stats["transactions_overdue"] == 0


def test_get_missing_404(client):
    get(client, f"/contacts/{uuid.uuid4()}", expect=404)
    get(client, "/contacts/not-a-uuid", expect=422)


def test_list_requires_login(client):
    assert client.get("/contacts").status_code == 401


def test_suppressions_cannot_be_edited(client):
    row = post(client, "/suppressions", email="x@y.com", reason="manual")
    assert client.patch(f"/suppressions/{row['id']}", json={"reason": "bounced"}, headers=H).status_code == 405
    assert client.delete(f"/suppressions/{row['id']}", headers=H).status_code == 204


def test_lists_newest_first(client):
    post(client, "/companies", name="First")
    post(client, "/companies", name="Second")
    assert [c["name"] for c in get(client, "/companies")] == ["Second", "First"]
