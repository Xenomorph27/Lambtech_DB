"""Enquiries through the desk API (spec 2026-11-13 §4.1)."""

import uuid

from conftest import bearer, make_enquiry

H = bearer()
CONFIRM = {"full_name": "Priya Sharma", "email": "priya@sharma.in", "phone": "+91 98765 43210"}


def test_list_and_filter_by_status(client, db):
    make_enquiry(db, email="a@firm.in")
    second = make_enquiry(db, email="b@firm.in")
    client.patch(f"/enquiries/{second['id']}", json={"status": "contacted"}, headers=H)

    assert len(client.get("/enquiries", headers=H).json()) == 2
    only_new = client.get("/enquiries?status=new", headers=H).json()
    assert [e["email"] for e in only_new] == ["a@firm.in"]


def test_read_shape_hides_the_ip_hash(client, db):
    e = make_enquiry(db, ip_hash="secret-hash", meta={"referrer": "https://google.com/"})
    body = client.get(f"/enquiries/{e['id']}", headers=H).json()
    assert "ip_hash" not in body
    assert (body["name"], body["status"], body["meta"]) == ("Priya, Sharma & Co.", "new", {"referrer": "https://google.com/"})


def test_patch_status_and_notes(client, db):
    e = make_enquiry(db)
    body = client.patch(f"/enquiries/{e['id']}", json={"status": "contacted", "notes": "Called, call back Friday"}, headers=H).json()
    assert (body["status"], body["notes"]) == ("contacted", "Called, call back Friday")
    assert body["handled_at"] is not None
    only_notes = client.patch(f"/enquiries/{e['id']}", json={"notes": "x"}, headers=H).json()
    assert (only_notes["status"], only_notes["notes"]) == ("contacted", "x")


def test_patch_cannot_confirm(client, db):
    e = make_enquiry(db)
    assert client.patch(f"/enquiries/{e['id']}", json={"status": "confirmed"}, headers=H).status_code == 422


def test_confirm_creates_the_lead(client, db):
    e = make_enquiry(db, topic="Book a call")
    response = client.post(f"/enquiries/{e['id']}/confirm", json={**CONFIRM, "priority": "hot"}, headers=H)
    assert response.status_code == 201, response.text
    lead = response.json()
    assert (lead["serial_no"], lead["priority"], lead["full_name"], lead["enquiry_id"]) == ("LT-0001", "hot", "Priya Sharma", e["id"])
    assert lead["description"] == "Book a call"

    after = client.get(f"/enquiries/{e['id']}", headers=H).json()
    assert (after["status"], after["contact_id"]) == ("confirmed", lead["contact_id"])
    assert [l["id"] for l in client.get(f"/leads?enquiry_id={e['id']}", headers=H).json()] == [lead["id"]]


def test_confirm_twice_is_refused_with_a_readable_message(client, db):
    e = make_enquiry(db)
    assert client.post(f"/enquiries/{e['id']}/confirm", json=CONFIRM, headers=H).status_code == 201
    again = client.post(f"/enquiries/{e['id']}/confirm", json=CONFIRM, headers=H)
    assert again.status_code == 422
    assert "already confirmed" in again.json()["detail"]
    assert len(client.get("/leads", headers=H).json()) == 1


def test_confirm_needs_all_three_details(client, db):
    e = make_enquiry(db)
    for missing in ("full_name", "email", "phone"):
        body = {k: v for k, v in CONFIRM.items() if k != missing}
        assert client.post(f"/enquiries/{e['id']}/confirm", json=body, headers=H).status_code == 422


def test_confirm_unknown_enquiry_404(client):
    assert client.post(f"/enquiries/{uuid.uuid4()}/confirm", json=CONFIRM, headers=H).status_code == 404


def test_delete_new_enquiry_then_404(client, db):
    e = make_enquiry(db)
    assert client.delete(f"/enquiries/{e['id']}", headers=H).status_code == 204
    assert client.get(f"/enquiries/{e['id']}", headers=H).status_code == 404


def test_delete_confirmed_enquiry_409(client, db):
    e = make_enquiry(db)
    client.post(f"/enquiries/{e['id']}/confirm", json=CONFIRM, headers=H)
    response = client.delete(f"/enquiries/{e['id']}", headers=H)
    assert response.status_code == 409
    assert "related records" in response.json()["detail"]


def test_overview_counts_new_enquiries(client, db):
    make_enquiry(db, email="a@firm.in")
    handled = make_enquiry(db, email="b@firm.in")
    client.patch(f"/enquiries/{handled['id']}", json={"status": "rejected"}, headers=H)
    assert client.get("/stats/overview", headers=H).json()["enquiries_new"] == 1


def test_enquiries_require_login(client):
    assert client.get("/enquiries").status_code == 401
    assert client.post(f"/enquiries/{uuid.uuid4()}/confirm", json=CONFIRM).status_code == 401
