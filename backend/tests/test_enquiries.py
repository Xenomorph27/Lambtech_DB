"""Website enquiries: table, status rules, intake, confirm (spec 2026-11-13)."""

import psycopg2.errors as pg
import pytest

from conftest import insert, make_contact, make_enquiry, make_lead, make_response, make_email, one, rows


def set_status(db, enquiry, status):
    return one(db, "update enquiries set status = %s where id = %s returning *", [status, enquiry["id"]])


# --- table and rules -----------------------------------------------------------


def test_enquiry_defaults(db):
    e = make_enquiry(db)
    assert (e["status"], e["meta"], e["handled_at"], e["contact_id"]) == ("new", {}, None, None)


def test_enquiry_email_trimmed(db):
    assert make_enquiry(db, email="  Priya@Sharma.in ")["email"] == "Priya@Sharma.in"


def test_handled_at_set_when_leaving_new(db):
    e = make_enquiry(db)
    assert set_status(db, e, "contacted")["handled_at"] is not None


def test_cannot_insert_as_confirmed(db):
    with pytest.raises(pg.RaiseException):
        make_enquiry(db, status="confirmed")


def test_cannot_mark_confirmed_without_a_lead(db):
    e = make_enquiry(db)
    with pytest.raises(pg.RaiseException):
        set_status(db, e, "confirmed")


def test_lead_links_to_one_enquiry_only(db):
    contact = make_contact(db)
    e = make_enquiry(db)
    make_lead(db, contact, enquiry_id=e["id"])
    with pytest.raises(pg.UniqueViolation):
        make_lead(db, contact, enquiry_id=e["id"])


def test_lead_has_one_origin(db):
    contact = make_contact(db)
    response = make_response(db, make_email(db, contact))
    e = make_enquiry(db)
    with pytest.raises(pg.CheckViolation):
        make_lead(db, contact, enquiry_id=e["id"], response_id=response["id"])


def test_delete_enquiry_with_lead_blocked(db):
    e = make_enquiry(db)
    make_lead(db, make_contact(db), enquiry_id=e["id"])
    with pytest.raises(pg.RestrictViolation):
        rows(db, "delete from enquiries where id = %s", [e["id"]])


def test_confirmed_enquiry_reopens_only_after_its_lead_is_gone(db):
    e = make_enquiry(db)
    lead = make_lead(db, make_contact(db), enquiry_id=e["id"])
    set_status(db, e, "confirmed")  # allowed: a lead points at it
    with pytest.raises(pg.RaiseException):
        set_status(db, e, "contacted")
    rows(db, "delete from leads where id = %s", [lead["id"]])
    assert set_status(db, e, "contacted")["status"] == "contacted"


def test_leads_view_shows_enquiry_id(db):
    e = make_enquiry(db)
    lead = make_lead(db, make_contact(db), enquiry_id=e["id"])
    assert one(db, "select enquiry_id from leads_view where id = %s", [lead["id"]])["enquiry_id"] == e["id"]


def test_intake_keys_table_exists(db):
    insert(db, "enquiry_intake_keys", sha256="ab" * 32, label="test")
    assert one(db, "select count(*) as n from enquiry_intake_keys")["n"] == 1
