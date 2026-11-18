"""Engine status, mailboxes and review from the desk (spec §6)."""

from conftest import (
    bearer, insert, make_campaign, make_contact, make_email, make_message, make_recipient, one, rows,
)


def test_state_starts_paused_and_pausing_is_logged(client, db):
    state = client.get("/outreach/state", headers=bearer()).json()
    assert state["paused"] is True and state["sending_enabled"] is False
    res = client.patch("/outreach/state", headers=bearer(), json={"paused": False})
    assert res.status_code == 200 and res.json()["paused"] is False and res.json()["paused_reason"] is None
    res = client.patch("/outreach/state", headers=bearer(), json={"paused": True, "reason": "Checking replies"})
    assert res.json()["paused_reason"] == "Checking replies"
    kinds = [e["kind"] for e in client.get("/outreach/events", headers=bearer()).json()]
    assert kinds[:2] == ["pause", "unpause"]
    assert "ceo@lambtech.in" in client.get("/outreach/events", headers=bearer()).json()[0]["detail"]


def test_mailbox_cap_and_switch(client, db):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in")
    res = client.patch("/outreach/mailboxes/ceo@lambtech.in", headers=bearer(), json={"daily_cap": 25, "is_active": False})
    assert res.status_code == 200 and res.json()["daily_cap"] == 25 and res.json()["is_active"] is False
    assert client.patch("/outreach/mailboxes/ceo@lambtech.in", headers=bearer(), json={"daily_cap": -1}).status_code == 422
    assert client.patch("/outreach/mailboxes/nobody@lambtech.in", headers=bearer(), json={"daily_cap": 5}).status_code == 404
    assert [m["email"] for m in client.get("/outreach/mailboxes", headers=bearer()).json()] == ["ceo@lambtech.in"]


def _stuck(db, status="needs_review", recipient_status="active"):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact, status=recipient_status)
    email = make_email(db, contact, status="queued")
    return make_message(db, recipient, 1, status=status, email_sent_id=email["id"], error="stopped mid-send"), email


def test_review_lists_stuck_and_failed_messages(client, db):
    message, _ = _stuck(db)
    items = client.get("/outreach/review", headers=bearer()).json()
    assert [i["id"] for i in items] == [str(message["id"])]
    assert items[0]["email"] == "ravi@acme.com" and items[0]["campaign"] == "Q4 CA firms"


def test_retry_requeues_and_closes_the_half_logged_email(client, db):
    message, email = _stuck(db)
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "retry"})
    assert res.status_code == 200 and res.json()["status"] == "approved" and res.json()["email_sent_id"] is None
    assert one(db, "select status from emails_sent where id = %s", [email["id"]])["status"] == "failed"


def test_skip_and_refusals(client, db):
    message, _ = _stuck(db, recipient_status="replied")
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "retry"})
    assert res.status_code == 409
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "skip"})
    assert res.status_code == 200 and res.json()["status"] == "skipped"
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "skip"})
    assert res.status_code == 409


def test_sent_origins_name_campaign_and_step(client, db):
    contact = make_contact(db)
    email = make_email(db, contact)
    make_message(db, make_recipient(db, make_campaign(db), contact), 2, status="sent", email_sent_id=email["id"])
    assert client.get("/outreach/sent-origins", headers=bearer()).json() == [
        {"email_sent_id": str(email["id"]), "campaign": "Q4 CA firms", "step": 2}
    ]


def test_overview_reports_outreach(client, db):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in", sent_today=4,
           counter_date=one(db, "select (now() at time zone 'Asia/Kolkata')::date as d")["d"])
    stats = client.get("/stats/overview", headers=bearer()).json()
    assert stats["outreach_paused"] is True and stats["outreach_sent_today"] == 4
    assert stats["outreach_queued"] == 0 and stats["outreach_sending_enabled"] is False
