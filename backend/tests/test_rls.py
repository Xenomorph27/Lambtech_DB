"""Security: nothing in public is reachable by Supabase's anon or authenticated roles (spec §9)."""

import psycopg2.errors as pg
import pytest

from conftest import make_contact, one, rows

TABLES = [
    "companies",
    "contacts",
    "emails_sent",
    "responses",
    "leads",
    "transactions",
    "milestones",
    "payments",
    "suppressions",
]
VIEWS = ["responses_a", "responses_b", "leads_view", "transactions_view"]


def as_role(db, role, sql, params=None):
    with db.cursor() as cur:
        cur.execute(f"set role {role}")
        try:
            cur.execute(sql, params)
            return cur.fetchall() if cur.description else []
        finally:
            cur.execute("reset role")


@pytest.mark.parametrize("role", ["anon", "authenticated"])
@pytest.mark.parametrize("relation", TABLES + VIEWS)
def test_api_roles_cannot_read(db, role, relation):
    make_contact(db)
    with pytest.raises(pg.InsufficientPrivilege):
        as_role(db, role, f"select * from {relation}")


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_api_roles_cannot_write(db, role):
    with pytest.raises(pg.InsufficientPrivilege):
        as_role(db, role, "insert into suppressions (email, reason) values ('a@b.com', 'manual')")


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_api_roles_cannot_call_functions(db, role):
    contact = make_contact(db)
    with pytest.raises(pg.InsufficientPrivilege):
        as_role(db, role, "select anonymize_contact(%s)", [contact["id"]])


def test_rls_enabled_everywhere(db):
    off = rows(
        db,
        "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1",
    )
    assert [r["relname"] for r in off] == []


def test_future_tables_get_no_default_grants(db):
    rows(db, "create table public._probe (id int)")
    try:
        with pytest.raises(pg.InsufficientPrivilege):
            as_role(db, "authenticated", "select * from _probe")
    finally:
        rows(db, "drop table public._probe")


def test_backend_role_still_works(db):
    assert one(db, "select count(*) as n from contacts")["n"] == 0
