"""The Outreach page: one read-only summary of how the engine is doing."""

from datetime import datetime, timedelta, timezone

from conftest import (
    bearer, insert, make_campaign, make_contact, make_email, make_message, make_recipient, make_response, one,
)
from routers.outreach_dashboard import engine_status

IST = timezone(timedelta(hours=5, minutes=30))


def _state(**kw):
    base = {
        "paused": False, "paused_reason": None, "sending_enabled": True, "inbox_status": "ok",
        "inbox_detail": None, "last_cycle_at": datetime(2026, 11, 24, 11, 0, tzinfo=IST),
    }
    return {**base, **kw}


def _status(state=None, now=None, mailboxes=1, cap_left=15, due=3):
    now = now or datetime(2026, 11, 24, 11, 5, tzinfo=IST)  # a Tuesday, inside the window
    return engine_status(state or _state(), now, mailboxes=mailboxes, cap_left=cap_left, due=due)


# --- the one-line status, in the engine's own order -------------------------------------------


def test_status_sending_when_nothing_holds_it_back():
    assert _status()["code"] == "sending"
    assert _status()["tone"] == "ok"


def test_status_never_run():
    assert _status(_state(last_cycle_at=None))["code"] == "never_run"


def test_status_stale_when_no_run_for_over_three_hours_beats_everything():
    stale = _state(last_cycle_at=datetime(2026, 11, 24, 7, 30, tzinfo=IST), sending_enabled=False, paused=True)
    result = _status(stale)
    assert result["code"] == "stale" and result["tone"] == "danger"
    assert "GitHub" in result["detail"]


def test_stale_is_strict_in_sending_hours_and_patient_outside_them():
    # In the window runs come every 10 minutes: an hour without one is a fault.
    in_window = datetime(2026, 11, 24, 11, 5, tzinfo=IST)
    assert _status(_state(last_cycle_at=in_window - timedelta(minutes=70)), now=in_window)["code"] == "stale"
    assert _status(_state(last_cycle_at=in_window - timedelta(minutes=40)), now=in_window)["code"] != "stale"
    # Outside it runs are 2 hours apart and GitHub may skip one: 4 hours is still fine.
    night = datetime(2026, 11, 24, 23, 0, tzinfo=IST)
    assert _status(_state(last_cycle_at=night - timedelta(hours=4)), now=night)["code"] == "outside_window"
    stale = _status(_state(last_cycle_at=night - timedelta(hours=5)), now=night)
    assert stale["code"] == "stale" and stale["headline"] == "No engine run for 5 hours"


def test_status_follows_the_engine_gate_order():
    assert _status(mailboxes=0)["code"] == "no_mailboxes"
    assert _status(_state(sending_enabled=False, paused=True))["code"] == "sending_disabled"
    paused = _status(_state(paused=True, paused_reason="Paused automatically: 2 of 10 emails bounced today"))
    assert paused["code"] == "paused" and "bounced" in paused["detail"]
    assert _status(_state(inbox_status="error", inbox_detail="login failed"))["code"] == "inbox_error"


def test_status_outside_the_window_says_when_it_opens():
    friday_evening = datetime(2026, 11, 27, 18, 0, tzinfo=IST)
    result = _status(_state(last_cycle_at=friday_evening), now=friday_evening)
    assert result["code"] == "outside_window"
    assert "Mon 30 Nov, 10:00" in result["detail"]
    early = datetime(2026, 11, 24, 8, 0, tzinfo=IST)
    assert "Tue 24 Nov, 10:00" in _status(_state(last_cycle_at=early), now=early)["detail"]


def test_status_limit_reached_then_nothing_due():
    assert _status(cap_left=0)["code"] == "limit_reached"
    assert _status(due=0)["code"] == "nothing_due"


# --- the numbers ------------------------------------------------------------------------------


def _engine_send(db, campaign, n, *, status="sent", sent_at=None, step=1):
    contact = make_contact(db, email=f"p{n}@firm{n}.in", full_name=f"Person {n}")
    recipient = make_recipient(db, campaign, contact, status="active")
    email = make_email(db, contact, status=status, sent_at=sent_at or datetime.now(timezone.utc))
    make_message(db, recipient, step, status="sent", email_sent_id=email["id"])
    return email


def test_dashboard_counts_only_engine_sends_and_their_replies(client, db):
    campaign = make_campaign(db)
    a = _engine_send(db, campaign, 1)
    b = _engine_send(db, campaign, 2)
    _engine_send(db, campaign, 3, status="bounced")
    _engine_send(db, campaign, 4, sent_at=datetime.now(timezone.utc) - timedelta(days=40))  # outside 30 days
    make_response(db, a, category="negative", received_at=datetime.now(timezone.utc))
    make_response(db, b, category="auto_reply", received_at=datetime.now(timezone.utc), provider_message_id="x2")
    # A hand-sent email and its reply are not the engine's.
    manual = make_email(db, make_contact(db, email="own@desk.in"), status="sent", sent_at=datetime.now(timezone.utc))
    make_response(db, manual, category="positive", received_at=datetime.now(timezone.utc), provider_message_id="x3")

    res = client.get("/outreach/dashboard", headers=bearer())
    assert res.status_code == 200
    d = res.json()
    k = d["kpis"]
    assert k["sent_30d"] == 3 and k["sent_today"] == 3 and k["bounced_30d"] == 1 and k["bounced_today"] == 1
    assert k["people_emailed_30d"] == 3 and k["people_replied_30d"] == 1  # the auto-reply is not a person replying
    assert d["replies_by_type"] == {
        "positive": 0, "unclassified": 0, "negative": 1, "unsubscribe": 0, "auto_reply": 1, "bounced": 1,
    }
    assert len(d["daily"]) == 14
    today = d["daily"][-1]
    assert today["sent"] == 3 and today["replies"] == 1
    assert all(day["sent"] == 0 for day in d["daily"][:-1])


def test_dashboard_lists_what_is_due_next_and_waiting_follow_ups(client, db):
    campaign = make_campaign(db, name="CA firms, Mumbai")
    later = datetime.now(timezone.utc) + timedelta(days=2)
    for n in range(3):
        contact = make_contact(db, email=f"q{n}@firm.in", full_name=f"Q {n}")
        recipient = make_recipient(db, campaign, contact, status="active")
        make_message(db, recipient, 1, status="approved", due_at=datetime.now(timezone.utc) - timedelta(hours=1))
        make_message(db, recipient, 2, status="approved", due_at=later if n == 0 else None)
    stopped = make_recipient(db, campaign, make_contact(db, email="gone@firm.in"), status="stopped")
    make_message(db, stopped, 1, status="approved", due_at=datetime.now(timezone.utc))

    d = client.get("/outreach/dashboard", headers=bearer()).json()
    assert [(u["campaign"], u["emails"], u["follow_ups"]) for u in d["upcoming"]] == [
        ("CA firms, Mumbai", 3, 0), ("CA firms, Mumbai", 1, 1),
    ]
    assert d["waiting_follow_ups"] == 2
    assert d["kpis"]["due_now"] == 3


def test_dashboard_status_and_caps_come_from_the_live_state(client, db):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in", daily_cap=15, configured=True)
    d = client.get("/outreach/dashboard", headers=bearer()).json()
    assert d["status"]["code"] == "never_run"  # a fresh database has had no cycle yet
    assert d["kpis"]["cap_today"] == 15
    assert d["state"]["paused"] is True


def test_dashboard_needs_a_staff_login(client):
    assert client.get("/outreach/dashboard").status_code == 401
