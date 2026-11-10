"""
Test harness: a real Postgres with the real migrations applied.

    .\\scripts\\test-db.ps1 start
    backend\\.venv\\Scripts\\python -m pytest backend\\tests -q

The database named by TEST_DATABASE_URL is WIPED. Never point it at Supabase.

Every business rule lives in the database, so the tests talk to the database
directly through psycopg2 (autocommit, so a refused statement does not poison
the next one), and the API tests go through FastAPI on top of the same data.
"""

import glob
import os
import sys

import psycopg2
import psycopg2.extras
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
APP = os.path.join(ROOT, "backend", "app")
MIGRATIONS = os.path.join(ROOT, "supabase", "migrations")
sys.path.insert(0, APP)

TEST_DB = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres@localhost:54329/lambtech_test"
)
if "supabase" in TEST_DB or "pooler" in TEST_DB:
    raise RuntimeError("TEST_DATABASE_URL points at a hosted database. The tests wipe it. Refusing.")

# Supabase gives every new table in public to anon and authenticated by
# default. The bootstrap copies that, so the RLS migration's revokes are tested
# against the same starting point the live project has.
BOOTSTRAP = """
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
drop schema if exists public cascade;
drop schema if exists extensions cascade;
create schema public;
create schema extensions;
grant usage on schema public to anon, authenticated;
grant usage on schema extensions to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
"""


def apply_migrations():
    conn = psycopg2.connect(TEST_DB)
    conn.autocommit = True
    with conn.cursor() as cur:
        dbname = conn.get_dsn_parameters()["dbname"]
        # Supabase's own search_path for the postgres role includes extensions.
        cur.execute(f'alter database "{dbname}" set search_path = "$user", public, extensions')
        cur.execute(BOOTSTRAP)
        for path in sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql"))):
            with open(path, encoding="utf-8") as handle:
                cur.execute(handle.read())
    conn.close()


@pytest.fixture(scope="session", autouse=True)
def migrated():
    apply_migrations()


@pytest.fixture
def db():
    """A fresh, empty database per test."""
    conn = psycopg2.connect(TEST_DB, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(
            "select tablename from pg_tables where schemaname = 'public'"
        )
        tables = [row["tablename"] for row in cur.fetchall()]
        if tables:
            cur.execute("truncate " + ", ".join(f'"{t}"' for t in tables) + " restart identity cascade")
        cur.execute(
            "select 1 from pg_class where relkind = 'S' and relname = 'lead_serial_seq'"
        )
        if cur.fetchone():
            cur.execute("alter sequence lead_serial_seq restart with 1")
    yield conn
    conn.close()


# --- small helpers ---------------------------------------------------------


def rows(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def one(conn, sql, params=None):
    result = rows(conn, sql, params)
    return result[0] if result else None


def insert(conn, table, **values):
    cols = ", ".join(values)
    marks = ", ".join(["%s"] * len(values))
    return one(conn, f"insert into {table} ({cols}) values ({marks}) returning *", list(values.values()))


def make_company(conn, **values):
    return insert(conn, "companies", **{"name": "Acme Pvt Ltd", **values})


def make_contact(conn, **values):
    return insert(
        conn,
        "contacts",
        **{"full_name": "Ravi Kumar", "email": "ravi@acme.com", "source": "manual", **values},
    )


def make_email(conn, contact, **values):
    return insert(
        conn,
        "emails_sent",
        **{
            "contact_id": contact["id"],
            "from_email": "ceo@lambtech.in",
            "kind": "outreach",
            "subject": "Hello",
            **values,
        },
    )


def make_response(conn, email, **values):
    return insert(
        conn,
        "responses",
        **{"email_sent_id": email["id"], "subject": "Re: Hello", **values},
    )


def make_lead(conn, contact, **values):
    return insert(conn, "leads", **{"contact_id": contact["id"], **values})


def make_transaction(conn, lead, **values):
    return insert(
        conn,
        "transactions",
        **{"lead_id": lead["id"], "title": "AI audit", "total_amount": 100000, **values},
    )
