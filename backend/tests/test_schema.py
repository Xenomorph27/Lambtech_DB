"""Tables, keys and constraints (spec §4-§5)."""

import psycopg2.errors as pg
import pytest

from conftest import (
    insert,
    make_company,
    make_contact,
    make_email,
    make_lead,
    make_response,
    make_transaction,
    one,
    rows,
)


def test_contact_email_unique_ignores_case(db):
    make_contact(db, email="Ravi@Acme.com")
    with pytest.raises(pg.UniqueViolation):
        make_contact(db, email="ravi@acme.com")


def test_lead_serial_format(db):
    contact = make_contact(db)
    first = make_lead(db, contact)
    second = make_lead(db, contact)
    assert (first["serial_no"], second["serial_no"]) == ("LT-0001", "LT-0002")


def test_lead_defaults(db):
    lead = make_lead(db, make_contact(db))
    assert (lead["priority"], lead["status"]) == ("warm", "new")


def test_email_reply_requires_email_sent(db):
    contact = make_contact(db)
    with pytest.raises(pg.CheckViolation):
        insert(db, "responses", contact_id=contact["id"], channel="email_reply")


def test_inbound_form_response_needs_no_email(db):
    contact = make_contact(db)
    response = insert(db, "responses", contact_id=contact["id"], channel="inbound_form")
    assert response["category"] == "unclassified"


def test_deadline_before_start_rejected(db):
    lead = make_lead(db, make_contact(db))
    with pytest.raises(pg.CheckViolation):
        make_transaction(db, lead, start_date="2026-12-01", deadline="2026-11-01")


def test_negative_total_rejected(db):
    lead = make_lead(db, make_contact(db))
    with pytest.raises(pg.CheckViolation):
        make_transaction(db, lead, total_amount=-1)


def test_payment_amount_positive(db):
    tx = make_transaction(db, make_lead(db, make_contact(db)))
    with pytest.raises(pg.CheckViolation):
        insert(db, "payments", transaction_id=tx["id"], amount=0)


def test_currency_defaults_to_inr(db):
    tx = make_transaction(db, make_lead(db, make_contact(db)))
    assert tx["currency"] == "INR"


def test_unknown_enum_value_rejected(db):
    with pytest.raises(pg.InvalidTextRepresentation):
        make_contact(db, source="carrier_pigeon")


def test_delete_contact_with_email_blocked(db):
    contact = make_contact(db)
    make_email(db, contact)
    with pytest.raises(pg.RestrictViolation):
        rows(db, "delete from contacts where id = %s", [contact["id"]])


def test_delete_email_with_response_blocked(db):
    email = make_email(db, make_contact(db))
    make_response(db, email)
    with pytest.raises(pg.RestrictViolation):
        rows(db, "delete from emails_sent where id = %s", [email["id"]])


def test_delete_lead_with_transaction_blocked(db):
    lead = make_lead(db, make_contact(db))
    make_transaction(db, lead)
    with pytest.raises(pg.RestrictViolation):
        rows(db, "delete from leads where id = %s", [lead["id"]])


def test_delete_transaction_with_payment_blocked(db):
    tx = make_transaction(db, make_lead(db, make_contact(db)))
    insert(db, "payments", transaction_id=tx["id"], amount=5000)
    with pytest.raises(pg.RestrictViolation):
        rows(db, "delete from transactions where id = %s", [tx["id"]])


def test_delete_transaction_cascades_milestones(db):
    tx = make_transaction(db, make_lead(db, make_contact(db)))
    insert(db, "milestones", transaction_id=tx["id"], title="Discovery", position=1)
    rows(db, "delete from transactions where id = %s", [tx["id"]])
    assert one(db, "select count(*) as n from milestones")["n"] == 0


def test_company_delete_sets_contact_company_null(db):
    company = make_company(db)
    contact = make_contact(db, company_id=company["id"])
    rows(db, "delete from companies where id = %s", [company["id"]])
    assert one(db, "select company_id from contacts where id = %s", [contact["id"]])["company_id"] is None


def test_one_lead_per_response(db):
    contact = make_contact(db)
    response = make_response(db, make_email(db, contact))
    make_lead(db, contact, response_id=response["id"])
    with pytest.raises(pg.UniqueViolation):
        make_lead(db, contact, response_id=response["id"])


def test_suppression_email_unique_ignores_case(db):
    insert(db, "suppressions", email="x@y.com", reason="manual")
    with pytest.raises(pg.UniqueViolation):
        insert(db, "suppressions", email="X@Y.COM", reason="manual")
