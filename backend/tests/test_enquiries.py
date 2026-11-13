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


# --- submit_enquiry: the public entry point ------------------------------------

import hashlib  # noqa: E402

from psycopg2.extras import Json  # noqa: E402

from conftest import as_role  # noqa: E402

SECRET = "test-intake-secret"
GOOD = dict(
    secret=SECRET,
    name="Priya, Sharma & Co.",
    email="priya@sharma.in",
    phone="+91 98765 43210",
    topic="Book a 15-minute discovery audit",
    page="/ca",
    meta={"referrer": "https://google.com/"},
    ip="ip-hash-1",
)


def register_key(db, secret=SECRET):
    insert(db, "enquiry_intake_keys", sha256=hashlib.sha256(secret.encode()).hexdigest(), label="test")


def submit(db, role="anon", **over):
    a = {**GOOD, **over}
    return as_role(
        db,
        role,
        "select submit_enquiry(%s, %s, %s, %s, %s, %s, %s, %s)",
        [a["secret"], a["name"], a["email"], a["phone"], a["topic"], a["page"], Json(a["meta"]), a["ip"]],
    )


def refused(db, message, **over):
    with pytest.raises(pg.RaiseException) as err:
        submit(db, **over)
    assert message in str(err.value)
    assert one(db, "select count(*) as n from enquiries")["n"] == 0


def test_submit_stores_a_new_enquiry(db):
    register_key(db)
    submit(db, name="  Priya, Sharma & Co. ", email=" Priya@Sharma.in ")
    e = one(db, "select * from enquiries")
    assert (e["name"], e["email"], e["phone"]) == ("Priya, Sharma & Co.", "Priya@Sharma.in", "+91 98765 43210")
    assert (e["topic"], e["page"], e["status"]) == ("Book a 15-minute discovery audit", "/ca", "new")
    assert e["meta"] == {"referrer": "https://google.com/"}
    assert e["ip_hash"] == "ip-hash-1"


def test_submit_without_a_registered_key_is_refused(db):
    refused(db, "intake_refused")


@pytest.mark.parametrize("secret", ["wrong-secret", "", None])
def test_submit_with_a_wrong_secret_is_refused(db, secret):
    register_key(db)
    refused(db, "intake_refused", secret=secret, ip="forged-ip-hash")


@pytest.mark.parametrize(
    "field, value",
    [
        ("name", "   "),
        ("name", "x" * 201),
        ("email", "not-an-email"),
        ("email", "a@b"),
        ("email", "x" * 250 + "@a.in"),
        ("phone", "12345"),
        ("phone", "9" * 16),
        ("phone", "call me maybe"),
        ("topic", "t" * 201),
        ("page", "/" + "p" * 300),
        ("meta", {"big": "x" * 3000}),
    ],
)
def test_submit_rejects_invalid_fields(db, field, value):
    register_key(db)
    refused(db, f"invalid_enquiry: {field}", **{field: value})


@pytest.mark.parametrize("phone", ["+91 98765-43210", "(022) 2345 6789", "9876543210"])
def test_submit_accepts_phones_as_people_type_them(db, phone):
    register_key(db)
    submit(db, phone=phone)
    assert one(db, "select phone from enquiries")["phone"] == phone


def test_sixth_enquiry_in_an_hour_from_one_address_is_refused(db):
    register_key(db)
    for i in range(5):
        submit(db, email=f"person{i}@firm.in")
    with pytest.raises(pg.RaiseException) as err:
        submit(db, email="person6@firm.in")
    assert "rate_limited" in str(err.value)
    submit(db, email="other@firm.in", ip="ip-hash-2")  # a different address is unaffected
    assert one(db, "select count(*) as n from enquiries")["n"] == 6


def test_double_submit_stores_one_row(db):
    register_key(db)
    submit(db)
    submit(db, email="PRIYA@sharma.in")  # same person, same button, seconds later
    assert one(db, "select count(*) as n from enquiries")["n"] == 1
    submit(db, topic="Test Our Parser on 5 Sample BoLs")  # a different button is a new enquiry
    assert one(db, "select count(*) as n from enquiries")["n"] == 2


def test_only_anon_may_call_submit(db):
    register_key(db)
    with pytest.raises(pg.InsufficientPrivilege):
        submit(db, role="authenticated")


def test_anon_still_cannot_read_what_it_submitted(db):
    register_key(db)
    submit(db)
    with pytest.raises(pg.InsufficientPrivilege):
        as_role(db, "anon", "select * from enquiries")
