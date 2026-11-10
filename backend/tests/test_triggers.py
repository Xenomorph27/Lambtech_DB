"""Automatic behaviour: triggers and anonymize_contact() (spec §6)."""

import psycopg2.errors as pg
import pytest

from conftest import (
    insert,
    make_contact,
    make_email,
    make_lead,
    make_response,
    make_transaction,
    one,
    rows,
)


def set_category(db, response, category):
    return one(
        db,
        "update responses set category = %s where id = %s returning *",
        [category, response["id"]],
    )


def leads_for(db, response):
    return rows(db, "select * from leads where response_id = %s", [response["id"]])


# --- housekeeping ------------------------------------------------------------


def test_updated_at_changes_on_update(db):
    contact = make_contact(db)
    rows(db, "select pg_sleep(0.01)")
    after = one(db, "update contacts set notes = 'x' where id = %s returning updated_at", [contact["id"]])
    assert after["updated_at"] > contact["updated_at"]


def test_email_trimmed(db):
    contact = make_contact(db, email="  ravi@acme.com ")
    assert contact["email"] == "ravi@acme.com"


# --- sending guard -----------------------------------------------------------


def test_outreach_to_suppressed_rejected(db):
    insert(db, "suppressions", email=" X@Y.com ", reason="manual")
    contact = make_contact(db, email="x@y.com")
    with pytest.raises(pg.RaiseException):
        make_email(db, contact, kind="outreach")


def test_transactional_to_unsubscribed_allowed(db):
    insert(db, "suppressions", email="x@y.com", reason="unsubscribed")
    contact = make_contact(db, email="x@y.com")
    assert make_email(db, contact, kind="transactional")["id"]


def test_any_email_to_bounced_rejected(db):
    insert(db, "suppressions", email="x@y.com", reason="bounced")
    contact = make_contact(db, email="x@y.com")
    with pytest.raises(pg.RaiseException):
        make_email(db, contact, kind="transactional")


def test_to_email_filled_from_contact(db):
    contact = make_contact(db, email="ravi@acme.com")
    email = insert(
        db, "emails_sent", contact_id=contact["id"], from_email="ceo@lambtech.in", kind="outreach", subject="Hi"
    )
    assert email["to_email"] == "ravi@acme.com"


def test_bounce_adds_suppression(db):
    contact = make_contact(db)
    email = make_email(db, contact)
    bounced = one(db, "update emails_sent set status = 'bounced' where id = %s returning *", [email["id"]])
    assert bounced["bounced_at"] is not None
    suppressed = rows(db, "select * from suppressions where email = %s", [contact["email"]])
    assert [s["reason"] for s in suppressed] == ["bounced"]


def test_bounce_on_already_suppressed_address_is_harmless(db):
    insert(db, "suppressions", email="x@y.com", reason="unsubscribed")
    contact = make_contact(db, email="x@y.com")
    invoice = make_email(db, contact, kind="transactional")
    rows(db, "update emails_sent set status = 'bounced' where id = %s", [invoice["id"]])
    suppressed = rows(db, "select reason from suppressions where email = 'x@y.com'")
    assert [s["reason"] for s in suppressed] == ["unsubscribed"]


# --- responses -> leads ------------------------------------------------------


def test_positive_creates_one_lead(db):
    response = make_response(db, make_email(db, make_contact(db)))
    assert leads_for(db, response) == []
    set_category(db, response, "positive")
    leads = leads_for(db, response)
    assert len(leads) == 1
    assert (leads[0]["status"], leads[0]["priority"], leads[0]["contact_id"]) == (
        "new",
        "warm",
        response["contact_id"],
    )


def test_insert_positive_creates_lead(db):
    email = make_email(db, make_contact(db))
    response = make_response(db, email, category="positive")
    assert len(leads_for(db, response)) == 1


def test_positive_twice_still_one_lead(db):
    response = make_response(db, make_email(db, make_contact(db)))
    set_category(db, response, "positive")
    set_category(db, response, "positive")
    assert len(leads_for(db, response)) == 1


def test_positive_negative_positive_keeps_lead(db):
    response = make_response(db, make_email(db, make_contact(db)))
    set_category(db, response, "positive")
    original = leads_for(db, response)[0]
    set_category(db, response, "negative")
    assert [l["id"] for l in leads_for(db, response)] == [original["id"]]
    set_category(db, response, "positive")
    assert [l["id"] for l in leads_for(db, response)] == [original["id"]]


def test_unsubscribe_adds_suppression(db):
    contact = make_contact(db)
    response = make_response(db, make_email(db, contact))
    set_category(db, response, "unsubscribe")
    assert one(db, "select reason from suppressions where email = %s", [contact["email"]])["reason"] == "unsubscribed"


def test_contact_filled_from_email(db):
    contact = make_contact(db)
    email = make_email(db, contact)
    response = insert(db, "responses", email_sent_id=email["id"], subject="Re: Hello")
    assert response["contact_id"] == contact["id"]


def test_contact_mismatch_rejected(db):
    ravi = make_contact(db)
    priya = make_contact(db, full_name="Priya", email="priya@acme.com")
    email = make_email(db, ravi)
    with pytest.raises(pg.RaiseException):
        insert(db, "responses", contact_id=priya["id"], email_sent_id=email["id"])


def test_classified_at_set_on_category_change(db):
    response = make_response(db, make_email(db, make_contact(db)))
    assert response["classified_at"] is None
    assert set_category(db, response, "negative")["classified_at"] is not None


# --- milestones -> transaction status ---------------------------------------


def make_tx_with_milestones(db, n=2):
    tx = make_transaction(db, make_lead(db, make_contact(db)))
    milestones = [
        insert(db, "milestones", transaction_id=tx["id"], title=f"Step {i}", position=i) for i in range(1, n + 1)
    ]
    return tx, milestones


def mark(db, milestone, is_done):
    return one(db, "update milestones set is_done = %s where id = %s returning *", [is_done, milestone["id"]])


def tx_status(db, tx):
    return one(db, "select status from transactions where id = %s", [tx["id"]])["status"]


def test_last_milestone_completes_transaction(db):
    tx, (first, second) = make_tx_with_milestones(db)
    mark(db, first, True)
    assert tx_status(db, tx) == "active"
    mark(db, second, True)
    assert tx_status(db, tx) == "completed"


def test_undo_milestone_reactivates(db):
    tx, (first, second) = make_tx_with_milestones(db)
    mark(db, first, True)
    mark(db, second, True)
    mark(db, first, False)
    assert tx_status(db, tx) == "active"


def test_done_at_set_and_cleared(db):
    _, (first, _) = make_tx_with_milestones(db)
    assert mark(db, first, True)["done_at"] is not None
    assert mark(db, first, False)["done_at"] is None


def test_primary_contact_defaults_from_lead(db):
    contact = make_contact(db)
    tx = make_transaction(db, make_lead(db, contact))
    assert tx["primary_contact_id"] == contact["id"]


# --- erasure -----------------------------------------------------------------


def test_anonymize_contact(db):
    contact = make_contact(db, phone="+91 98765 43210", secondary_email="ravi.k@gmail.com")
    email = make_email(db, contact, body_text="Hi Ravi, ...")
    response = make_response(db, email, from_email="ravi@acme.com", body_text="Sure, let's talk")

    rows(db, "select anonymize_contact(%s)", [contact["id"]])

    after = one(db, "select * from contacts where id = %s", [contact["id"]])
    assert after["is_anonymized"] is True
    assert after["full_name"] != "Ravi Kumar"
    assert after["email"] != "ravi@acme.com"
    assert after["secondary_email"] is None and after["phone"] is None

    sent = one(db, "select * from emails_sent where id = %s", [email["id"]])
    assert sent["to_email"] != "ravi@acme.com" and sent["body_text"] is None

    reply = one(db, "select * from responses where id = %s", [response["id"]])
    assert reply["from_email"] is None and reply["body_text"] is None

    assert one(db, "select reason from suppressions where email = 'ravi@acme.com'")["reason"] == "erased"
    assert one(db, "select count(*) as n from emails_sent")["n"] == 1
    assert one(db, "select count(*) as n from responses")["n"] == 1
