"""Views: response buckets, leads with contact fields, transaction maths (spec §7)."""

from decimal import Decimal

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


def test_responses_buckets(db):
    contact = make_contact(db)
    email = make_email(db, contact)
    for category in ("unclassified", "auto_reply", "negative", "unsubscribe", "positive"):
        make_response(db, email, category=category, subject=category)

    a = rows(db, "select * from responses_a order by subject")
    b = rows(db, "select * from responses_b")
    assert [r["subject"] for r in a] == ["auto_reply", "negative", "unsubscribe"]
    assert [r["subject"] for r in b] == ["positive"]
    assert (a[0]["full_name"], a[0]["email"]) == ("Ravi Kumar", "ravi@acme.com")
    assert (b[0]["full_name"], b[0]["email"]) == ("Ravi Kumar", "ravi@acme.com")


def test_leads_view_shows_contact_fields(db):
    company = make_company(db, name="Acme Pvt Ltd")
    contact = make_contact(db, company_id=company["id"], phone="111")
    lead = make_lead(db, contact, description="Wants an AI audit")

    row = one(db, "select * from leads_view where id = %s", [lead["id"]])
    assert (row["serial_no"], row["priority"], row["status"]) == ("LT-0001", "warm", "new")
    assert (row["full_name"], row["email"], row["phone"], row["company_name"]) == (
        "Ravi Kumar",
        "ravi@acme.com",
        "111",
        "Acme Pvt Ltd",
    )

    rows(db, "update contacts set phone = '222' where id = %s", [contact["id"]])
    assert one(db, "select phone from leads_view where id = %s", [lead["id"]])["phone"] == "222"


def test_transactions_view_money_and_progress(db):
    tx = make_transaction(db, make_lead(db, make_contact(db)), total_amount=100000)
    insert(db, "payments", transaction_id=tx["id"], amount=30000)
    insert(db, "payments", transaction_id=tx["id"], amount=20000)
    for i in range(1, 5):
        insert(db, "milestones", transaction_id=tx["id"], title=f"Step {i}", position=i, is_done=(i == 1))

    row = one(db, "select * from transactions_view where id = %s", [tx["id"]])
    assert row["amount_paid"] == Decimal("50000.00")
    assert row["amount_remaining"] == Decimal("50000.00")
    assert (row["milestones_done"], row["milestones_total"]) == (1, 4)
    assert row["progress_pct"] == 25


def test_transactions_view_empty(db):
    tx = make_transaction(db, make_lead(db, make_contact(db)), total_amount=100000)
    row = one(db, "select * from transactions_view where id = %s", [tx["id"]])
    assert row["amount_paid"] == Decimal("0")
    assert row["amount_remaining"] == Decimal("100000.00")
    assert (row["milestones_done"], row["milestones_total"], row["progress_pct"]) == (0, 0, 0)
    assert row["days_left"] is None
    assert row["is_overdue"] is False


def test_overdue_flag(db):
    lead = make_lead(db, make_contact(db))
    tx = make_transaction(db, lead, start_date="2026-01-01", deadline="2026-01-31")

    row = one(db, "select * from transactions_view where id = %s", [tx["id"]])
    assert row["is_overdue"] is True
    assert row["days_left"] < 0

    for status in ("completed", "cancelled"):
        rows(db, "update transactions set status = %s where id = %s", [status, tx["id"]])
        assert one(db, "select is_overdue from transactions_view where id = %s", [tx["id"]])["is_overdue"] is False

    future = make_transaction(db, lead, deadline="2099-12-31")
    assert one(db, "select is_overdue from transactions_view where id = %s", [future["id"]])["is_overdue"] is False
