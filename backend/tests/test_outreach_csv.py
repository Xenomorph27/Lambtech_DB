"""Outreach CSV handling: no database, no network."""

import pytest

import outreach_csv as oc


def test_column_tag():
    assert oc.column_tag("Company Name for Emails") == "company_name_for_emails"
    assert oc.column_tag("  # Employees ") == "employees"


def test_parse_csv_reads_utf8_with_bom_and_lowercases_keys():
    data = "﻿Email,First Name,Company Name\r\nRavi@Acme.com,Ravi,Acme\r\n".encode("utf-8")
    parsed = oc.parse_csv(data)
    assert parsed.rows == [{"email": "Ravi@Acme.com", "first name": "Ravi", "company name": "Acme"}]
    assert {"name": "First Name", "tag": "first_name"} in parsed.columns
    assert parsed.is_apollo is True


def test_parse_csv_refuses_an_excel_ansi_file_in_plain_words():
    data = "email,name\r\nzoë@acme.com,Zoë\r\n".encode("cp1252")
    with pytest.raises(ValueError, match="CSV UTF-8"):
        oc.parse_csv(data)


def test_parse_csv_needs_an_email_column():
    with pytest.raises(ValueError, match="email"):
        oc.parse_csv(b"name,company\r\nRavi,Acme\r\n")


def test_person_from_an_apollo_row():
    person = oc.person_from_row(
        {"email": " Ravi@Acme.com ", "first name": "Ravi", "last name": "Kumar",
         "company name": "Acme Pvt Ltd", "title": "Partner", "city": "Mumbai", "# employees": "40"}
    )
    assert person.email == "ravi@acme.com"
    assert person.full_name == "Ravi Kumar"
    assert person.first_name == "Ravi"
    assert person.company == "Acme Pvt Ltd"
    assert person.job_title == "Partner"
    assert person.merge["company"] == "Acme Pvt Ltd"
    assert person.merge["role"] == "Partner"
    assert person.merge["employees"] == "40"
    assert person.merge["website"] == "acme.com"


def test_person_without_a_name_falls_back_to_the_address_but_not_the_greeting():
    person = oc.person_from_row({"email": "info@acme.com"})
    assert person.full_name == "info"
    assert person.first_name == ""


def test_person_from_row_rejects_a_bad_address():
    assert oc.person_from_row({"email": "not-an-address"}) is None
    assert oc.normalise_email("a@b") is None
    assert oc.normalise_email("A@B.co ") == "a@b.co"


def test_render_fills_known_tags_and_leaves_unknown_ones_visible():
    text = oc.render("Hi {first_name} at {company} {mystery}", {"first_name": "Ravi", "company": None})
    assert text == "Hi Ravi at  {mystery}"
    assert oc.unresolved(text) == ["mystery"]


def test_check_domains_asks_once_per_domain():
    asked = []

    def lookup(domain):
        asked.append(domain)
        return "no_domain" if domain == "nowhere.test" else "ok"

    result = oc.check_domains(["acme.com", "acme.com", "nowhere.test"], lookup)
    assert result == {"acme.com": "ok", "nowhere.test": "no_domain"}
    assert sorted(asked) == ["acme.com", "nowhere.test"]
