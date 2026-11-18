"""Creating outreach campaigns from a CSV (spec §4.1, §6)."""

import json

import pytest

import outreach_csv
from conftest import bearer, make_contact, make_email, one, rows

STEPS = [
    {"step": 1, "subject": "Quick idea for {company}", "body": "Hi {first_name},\nA note.", "wait_days": 1},
    {"step": 2, "subject": "Re: Quick idea for {company}", "body": "Hi {first_name}, following up.", "wait_days": 3},
    {"step": 3, "subject": "Re: Quick idea for {company}", "body": "Last note, {first_name}.", "wait_days": 4},
]
CSV = (
    "email,first name,last name,company name,title\r\n"
    "ravi@acme.com,Ravi,Kumar,Acme Pvt Ltd,Partner\r\n"
    "priya@sharma.in,Priya,Sharma,Sharma & Co,CA\r\n"
)


@pytest.fixture(autouse=True)
def no_dns(monkeypatch):
    monkeypatch.setattr(outreach_csv, "mx_status", lambda d: "no_domain" if d.endswith(".test") else "ok")


def upload(client, csv_text=CSV, steps=STEPS, name="Q4 CA firms"):
    return client.post(
        "/outreach/campaigns",
        headers=bearer(),
        data={"name": name, "steps": json.dumps(steps)},
        files={"file": ("leads.csv", csv_text.encode("utf-8"), "text/csv")},
    )


def test_upload_creates_contacts_recipients_and_rendered_drafts(client, db):
    res = upload(client)
    assert res.status_code == 201, res.text
    report = res.json()
    assert report["added"] == 2 and report["unknown_tags"] == []
    contact = one(db, "select * from contacts where email = 'ravi@acme.com'")
    assert contact["full_name"] == "Ravi Kumar" and contact["source"] == "apollo"
    assert contact["source_detail"] == "Q4 CA firms" and contact["job_title"] == "Partner"
    company = one(db, "select * from companies where id = %s", [contact["company_id"]])
    assert company["name"] == "Acme Pvt Ltd" and company["domain"] == "acme.com"
    messages = rows(db, "select m.step, m.subject, m.body, m.status from outreach.messages m "
                        "join outreach.recipients r on r.id = m.recipient_id where r.contact_id = %s order by m.step",
                    [contact["id"]])
    assert [m["step"] for m in messages] == [1, 2, 3]
    assert messages[0]["subject"] == "Quick idea for Acme Pvt Ltd"
    assert messages[0]["body"] == "Hi Ravi,\nA note."
    assert {m["status"] for m in messages} == {"draft"}
    waits = rows(db, "select step, wait_days from outreach.steps order by step")
    assert [w["wait_days"] for w in waits] == [1, 3, 4]


def test_upload_skips_what_must_not_be_emailed(client, db):
    make_contact(db, email="old@acme.com", full_name="Old Lead")
    make_email(db, one(db, "select * from contacts where email = 'old@acme.com'"))
    make_contact(db, email="gone@acme.com", full_name="Erased", is_anonymized=True)
    rows(db, "insert into suppressions (email, reason) values ('no@acme.com', 'unsubscribed')")
    csv_text = (
        "email,name\r\n"
        "ravi@acme.com,Ravi\r\n"
        "RAVI@acme.com,Ravi again\r\n"
        "old@acme.com,Old\r\n"
        "gone@acme.com,Gone\r\n"
        "no@acme.com,No\r\n"
        "nobody@nowhere.test,Nobody\r\n"
        "not-an-address,Bad\r\n"
    )
    report = upload(client, csv_text).json()
    assert report["added"] == 1
    assert report["duplicates"] == 1
    assert report["already_contacted"] == 1
    assert report["suppressed"] == 2
    assert report["bad_domain"] == 1
    assert report["invalid"] == 1


def test_existing_contact_is_reused_and_only_empty_fields_filled(client, db):
    make_contact(db, email="ravi@acme.com", full_name="Ravi K (client)", source="manual")
    upload(client)
    contact = one(db, "select * from contacts where email = 'ravi@acme.com'")
    assert contact["full_name"] == "Ravi K (client)"
    assert contact["source"] == "manual"
    assert contact["job_title"] == "Partner"


def test_unknown_tags_are_reported(client):
    steps = [{"step": 1, "subject": "Hi {first_name}", "body": "About {mystery_column}", "wait_days": 1}]
    report = upload(client, steps=steps).json()
    assert report["unknown_tags"] == ["mystery_column"]


def test_csv_without_email_column_is_a_plain_422(client):
    res = upload(client, "name,company\r\nRavi,Acme\r\n")
    assert res.status_code == 422
    assert "email" in res.json()["detail"]


@pytest.mark.parametrize(
    "steps",
    [
        [{"step": 2, "subject": "s", "body": "b", "wait_days": 3}],
        [{"step": 1, "subject": "s", "body": "b"}, {"step": 2, "subject": "s", "body": "b", "wait_days": 0}],
        [{"step": 1, "subject": " ", "body": "b"}],
        "not json",
    ],
)
def test_bad_steps_are_refused(client, steps):
    data = {"name": "X", "steps": steps if isinstance(steps, str) else json.dumps(steps)}
    res = client.post("/outreach/campaigns", headers=bearer(), data=data,
                      files={"file": ("l.csv", CSV.encode(), "text/csv")})
    assert res.status_code == 422


def test_csv_columns_preview(client):
    res = client.post("/outreach/csv-columns", headers=bearer(),
                      files={"file": ("l.csv", CSV.encode(), "text/csv")})
    assert res.status_code == 200
    body = res.json()
    assert body["rows"] == 2 and body["is_apollo"] is True
    assert {"name": "company name", "tag": "company_name"} in body["columns"]


def test_outreach_routes_are_staff_only(client):
    assert client.post("/outreach/campaigns").status_code == 401
    assert client.get("/outreach/campaigns").status_code == 401
