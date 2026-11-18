"""The outreach schema's own rules (spec 2026-11-18 §4.2)."""

import psycopg2.errors as pg
import pytest

from conftest import (
    insert,
    make_campaign,
    make_contact,
    make_email,
    make_message,
    make_recipient,
    one,
    rows,
)


def test_engine_state_has_one_row_and_starts_paused(db):
    state = one(db, "select * from outreach.engine_state")
    assert state["paused"] is True
    assert state["sending_enabled"] is False
    assert state["inbox_status"] == "waiting"
    with pytest.raises(pg.UniqueViolation):
        rows(db, "insert into outreach.engine_state default values")


def test_steps_are_one_to_three_and_unique_per_campaign(db):
    campaign = make_campaign(db, steps=1)
    with pytest.raises(pg.CheckViolation):
        insert(db, "outreach.steps", campaign_id=campaign["id"], step=4,
               subject_template="s", body_template="b")
    with pytest.raises(pg.UniqueViolation):
        insert(db, "outreach.steps", campaign_id=campaign["id"], step=1,
               subject_template="s", body_template="b")


def test_a_suppressed_address_cannot_become_active(db):
    contact = make_contact(db)
    campaign = make_campaign(db)
    recipient = make_recipient(db, campaign, contact)
    rows(db, "insert into suppressions (email, reason) values ('ravi@acme.com', 'unsubscribed')")
    with pytest.raises(pg.RaiseException, match="do-not-email"):
        rows(db, "update outreach.recipients set status = 'active' where id = %s", [recipient["id"]])


def test_an_anonymized_contact_cannot_become_active(db):
    contact = make_contact(db, is_anonymized=True)
    campaign = make_campaign(db)
    with pytest.raises(pg.RaiseException, match="erased"):
        make_recipient(db, campaign, contact, status="active")


def test_a_sent_message_needs_its_email_row(db):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    with pytest.raises(pg.CheckViolation):
        make_message(db, recipient, 1, status="sent")
    email = make_email(db, contact)
    sent = make_message(db, recipient, 1, status="sent", email_sent_id=email["id"])
    assert sent["status"] == "sent"


def test_deleting_a_campaign_removes_its_recipients_and_messages(db):
    contact = make_contact(db)
    campaign = make_campaign(db)
    make_message(db, make_recipient(db, campaign, contact), 1)
    rows(db, "delete from outreach.campaigns where id = %s", [campaign["id"]])
    assert one(db, "select count(*) as n from outreach.messages")["n"] == 0
    assert one(db, "select count(*) as n from outreach.recipients")["n"] == 0


def test_a_logged_email_cannot_be_deleted_while_its_message_points_at_it(db):
    contact = make_contact(db)
    email = make_email(db, contact)
    recipient = make_recipient(db, make_campaign(db), contact)
    make_message(db, recipient, 1, status="sent", email_sent_id=email["id"])
    with pytest.raises((pg.ForeignKeyViolation, pg.RestrictViolation)):
        rows(db, "delete from emails_sent where id = %s", [email["id"]])


def test_erasing_a_contact_stops_and_blanks_their_outreach(db):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact, status="active", merge={"first_name": "Ravi"})
    make_message(db, recipient, 1, status="approved", subject="Hi Ravi", body="Dear Ravi at Acme")
    rows(db, "select anonymize_contact(%s)", [contact["id"]])
    assert one(db, "select status::text as status, merge from outreach.recipients") == {"status": "stopped", "merge": {}}
    assert one(db, "select status::text as status, subject, body from outreach.messages") == {
        "status": "skipped", "subject": "Erased", "body": "Erased"}


def test_mailbox_cap_is_bounded(db):
    with pytest.raises(pg.CheckViolation):
        insert(db, "outreach.mailboxes", email="a@lambtech.in", daily_cap=-1)
    box = insert(db, "outreach.mailboxes", email="A@Lambtech.in")
    assert box["daily_cap"] == 15 and box["is_active"] is True
