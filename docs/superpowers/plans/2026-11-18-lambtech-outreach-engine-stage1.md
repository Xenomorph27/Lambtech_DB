# Outreach Engine, Stage 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The outreach bot runs hosted on Render as a background worker. It writes every
send and reply into the desk's database, with each reply typed. It is managed from new
Campaigns and Mailboxes screens in the desk. The PC copy's history is imported. Sending
stays switched off until Stage 2.

**Architecture:** The desk repo owns the schema: a new `outreach` Postgres schema
beside the desk's tables, with RLS on and no API-role grants. It also owns the
staff-only HTTP routes and the two new screens. The engine repo
(`Xenomorph27/emailauto-LT`) is rebuilt as a headless worker. Every 5 minutes, under a
Postgres advisory lock, it:

- reads the inboxes over IMAP, turns replies into `responses`, and
- sends due messages over SMTP, logging each one in `emails_sent` before and after.

Screens and engine talk only through the database.

**Tech Stack:** Postgres 17 (Supabase; local tests on Postgres 18, port 54329), FastAPI
0.115 + SQLAlchemy Core + psycopg2, React 19 + Vite + Tailwind 4, Python 3.12 worker with
psycopg2 + pydantic-settings + stdlib smtplib/imaplib, Render background worker.

**Spec:** `docs/superpowers/specs/2026-11-18-lambtech-outreach-engine-design.md` (desk repo).

**This plan covers spec §8 Stage 1 only.** Stage 2 gets its own plan after Stage 1 is live:

- bounce notices, List-Unsubscribe and the one-click endpoint;
- the postal-address footer, the Hunter verifier;
- setting `SENDING_ENABLED=true`.

## Global Constraints

- All schedule logic uses the `Asia/Kolkata` timezone explicitly. Never use naive or
  server-local times. The send window is weekdays 10:00–17:00.
- `outreach.engine_state.paused` defaults to `true`. The engine also refuses to send while
  `SENDING_ENABLED` is false, and it stays false throughout Stage 1.
- The engine never writes `responses.category = 'positive'`.
- Every `outreach` table has RLS enabled and no grants to `anon`, `authenticated` or
  `public`. Every `outreach` function has execute revoked from them.
- Migrations live only in the desk repo (`supabase/migrations/`). The engine's tests
  apply them from a sibling checkout (`DESK_REPO_DIR`, default `../Lambtech`).
- Mailbox passwords live only in the engine's environment, never in the database.
- At most 3 mailboxes. Per-mailbox daily cap defaults to 15. At most 5 sends per cycle,
  with 8–18 s between sends.
- A message left in `sending` is never resent automatically; it becomes `needs_review`.
- The desk API's new routes are mounted behind `require_staff` like every other router.
- Python pins:
  - Desk: add `python-multipart==0.0.20` and `dnspython==2.7.0`.
  - Engine: `psycopg2-binary==2.9.12`, `pydantic==2.13.4`, `pydantic-settings==2.15.0`,
    `tzdata==2025.2`, `pytest==8.4.2`.
- Desk tests run with `backend\.venv\Scripts\python -m pytest backend\tests -q`.
- Engine tests run with `.venv\Scripts\python -m pytest -q` from the engine repo. Both
  need the local test Postgres: run `.\scripts\test-db.ps1 start` from the desk repo in
  an interactive terminal tab.
- Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Ruling recorded with this plan:** an **auto-reply** (out-of-office) is logged as a
`responses` row of category `auto_reply`, but it does **not** stop the sequence. A machine
answering is not the person replying. Spec §5 step 2 is amended in Task 1 to say "any reply
other than an auto-reply".

## Review Focus

1. **A CSV saved by Excel as "CSV" (cp1252), not "CSV UTF-8".** The person expects a
   plain-words error asking for UTF-8, not a 500. Tested in Task 2.
2. **A reply whose `From` differs in case from the stored address**
   (`Ravi@Acme.com` vs `ravi@acme.com`). The person expects it matched to the send.
   Tested in Task 10.
3. **Two engine instances during a Render deploy.** Exactly one runs the cycle; the other
   sends nothing. Tested in Task 12.
4. **A recipient who replies after being queued but before their follow-up is due.** The
   follow-up is never sent. Tested in Task 10 (store) and Task 12 (cycle).
5. **An address suppressed after the campaign was queued.** The send is skipped and the
   recipient stopped, not failed, and nothing is sent. Tested in Task 12.

---

## File structure

**Desk repo** (`C:\Users\BARNAK\Desktop\Lambtech`, branch `feat/outreach-engine`):

| File | Responsibility |
|---|---|
| `supabase/migrations/20261118090000_outreach.sql` | `outreach` schema, tables, trigger, RLS, revokes |
| `backend/tests/conftest.py` (modify) | wipe/reset `outreach` too; helpers for campaigns/recipients/messages |
| `backend/tests/test_outreach_schema.py` | schema rules |
| `backend/tests/test_rls.py` (modify) | `outreach` tables unreachable, RLS on |
| `backend/app/outreach_csv.py` | pure: CSV parsing, people from rows, merge tags, MX checks |
| `backend/tests/test_outreach_csv.py` | unit tests for the above |
| `backend/app/outreach_upload.py` | creating a campaign from a CSV inside one transaction |
| `backend/app/routers/outreach.py` | campaign routes: upload, list, recipients, edit, queue, stop, delete |
| `backend/app/routers/outreach_ops.py` | engine state, mailboxes, events, review/resolve, sent-origins |
| `backend/app/schemas.py` (modify) | outreach request/response models; Overview fields |
| `backend/app/routers/stats.py` (modify) | outreach numbers on Overview |
| `backend/app/main.py` (modify) | mount the two routers behind `STAFF_ONLY` |
| `backend/requirements.txt` (modify) | `python-multipart`, `dnspython` |
| `backend/tests/test_api_outreach_campaigns.py` | upload + campaign route tests |
| `backend/tests/test_api_outreach_ops.py` | state/mailbox/review route tests |
| `frontend/src/api/client.js` (modify) | `form` (multipart) support in `http()` |
| `frontend/src/api/resources.js` (modify) | `outreach` API handle |
| `frontend/src/pages/Campaigns.jsx` | campaigns list, new-campaign drawer, campaign drawer |
| `frontend/src/pages/Mailboxes.jsx` | engine status, pause switch, mailboxes, review, events |
| `frontend/src/App.jsx`, `components/layout/Sidebar.jsx`, `lib/screens.js` (modify) | routes and navigation |
| `frontend/src/pages/Overview.jsx`, `frontend/src/pages/Emails.jsx` (modify) | Outreach tile; Campaign column |
| `DEPLOY.md`, `README.md` (modify) | §8 Outreach engine; table row |

**Engine repo** (`C:\Users\BARNAK\Desktop\emailauto-LT`, clone of
`Xenomorph27/emailauto-LT`, branch `feat/hosted-engine`):

| File | Responsibility |
|---|---|
| `engine/__init__.py` | `VERSION` |
| `engine/config.py` | `Settings`, `Mailbox` |
| `engine/db.py` | `connect(url)` |
| `engine/clock.py` | India-time window maths |
| `engine/classify.py` | reply categories |
| `engine/mail.py` | building, sending, reading mail; `footer()` |
| `engine/store.py` | every SQL statement the engine runs |
| `engine/cycle.py` | one cycle: lock, inbox pass, gate, send |
| `engine/__main__.py` | the forever loop (`python -m engine`) |
| `scripts/__init__.py`, `scripts/import_sqlite.py` | one-off import of the PC copy |
| `tests/conftest.py`, `tests/test_*.py` | tests against local Postgres with the desk's migrations |
| `requirements.txt`, `requirements-dev.txt`, `render.yaml`, `.env.example`, `README.md` | run and deploy |
| removed | `backend/`, `_dashboard.html`, `desktop*`, `migrate.py`, `run.py`, `setup_templates.py`, `test_setup.py`, `test_upload.*`, old `tests/` |

---

### Task 1: The `outreach` schema

**Files:**
- Create: `supabase/migrations/20261118090000_outreach.sql`
- Modify: `backend/tests/conftest.py`, `backend/tests/test_rls.py`,
  `docs/superpowers/specs/2026-11-18-lambtech-outreach-engine-design.md` (§5 step 2
  wording)
- Test: `backend/tests/test_outreach_schema.py`

**Interfaces:**
- Produces:
  - **Tables:**
    - `outreach.campaigns(id, created_at, updated_at, name, created_by, archived_at)`
    - `outreach.steps(id, created_at, updated_at, campaign_id, step, subject_template, body_template, wait_days)`
    - `outreach.recipients(id, created_at, updated_at, campaign_id, contact_id, merge jsonb, status outreach.recipient_status, stop_reason, current_step)`
    - `outreach.messages(id, created_at, updated_at, recipient_id, step, subject, body, status outreach.message_status, due_at, email_sent_id, mailbox, error)`
    - `outreach.mailboxes(email citext pk, created_at, updated_at, daily_cap, is_active, sent_today, counter_date, configured)`
    - `outreach.engine_state(id boolean pk, paused, paused_reason, paused_at, sending_enabled, last_cycle_at, last_inbox_check_at, inbox_status, inbox_detail, engine_version, updated_at)` (one row)
    - `outreach.inbox_seen(mailbox, message_key, seen_at, outcome)`
    - `outreach.events(id bigint identity, created_at, kind, detail)`
  - **Enums:**
    - recipient status: `pending|active|replied|stopped|completed|bounced`
    - message status: `draft|approved|sending|sent|failed|skipped|needs_review`
  - **conftest helpers:**
    - `make_campaign(conn, name='Q4 CA firms', steps=3)`, which returns the campaign row
      and creates `steps` rows with wait_days 1, 3, 4;
    - `make_recipient(conn, campaign, contact, **values)`;
    - `make_message(conn, recipient, step, **values)`.

- [ ] **Step 1: Write the failing schema tests**

Create `backend/tests/test_outreach_schema.py`:

```python
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


def test_mailbox_cap_is_bounded(db):
    with pytest.raises(pg.CheckViolation):
        insert(db, "outreach.mailboxes", email="a@lambtech.in", daily_cap=-1)
    box = insert(db, "outreach.mailboxes", email="A@Lambtech.in")
    assert box["daily_cap"] == 15 and box["is_active"] is True
```

- [ ] **Step 2: Add the conftest helpers and the schema reset**

In `backend/tests/conftest.py`, change `BOOTSTRAP` so that it drops `outreach` first. Its
first lines become:

```python
BOOTSTRAP = """
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
drop schema if exists outreach cascade;
drop schema if exists public cascade;
```

The rest of `BOOTSTRAP` is unchanged. Replace the body of the `db` fixture with:

```python
@pytest.fixture
def db():
    """A fresh, empty database per test."""
    conn = psycopg2.connect(TEST_DB, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(
            "select schemaname, tablename from pg_tables where schemaname in ('public', 'outreach')"
        )
        tables = [f'"{row["schemaname"]}"."{row["tablename"]}"' for row in cur.fetchall()]
        if tables:
            cur.execute("truncate " + ", ".join(tables) + " restart identity cascade")
        cur.execute(
            "select 1 from pg_class where relkind = 'S' and relname = 'lead_serial_seq'"
        )
        if cur.fetchone():
            cur.execute("alter sequence lead_serial_seq restart with 1")
        cur.execute("select 1 from pg_namespace where nspname = 'outreach'")
        if cur.fetchone():
            cur.execute("insert into outreach.engine_state default values on conflict do nothing")
    yield conn
    conn.close()
```

Append these helpers at the end of `conftest.py`:

```python
def make_campaign(conn, name="Q4 CA firms", steps=3):
    campaign = insert(conn, "outreach.campaigns", name=name, created_by="ceo@lambtech.in")
    waits = {1: 1, 2: 3, 3: 4}
    for step in range(1, steps + 1):
        insert(
            conn,
            "outreach.steps",
            campaign_id=campaign["id"],
            step=step,
            subject_template=f"Step {step} for {{company}}",
            body_template=f"Hi {{first_name}}, step {step}.",
            wait_days=waits[step],
        )
    return campaign


def make_recipient(conn, campaign, contact, **values):
    if "merge" in values:
        values["merge"] = psycopg2.extras.Json(values["merge"])
    return insert(
        conn,
        "outreach.recipients",
        **{"campaign_id": campaign["id"], "contact_id": contact["id"], **values},
    )


def make_message(conn, recipient, step, **values):
    return insert(
        conn,
        "outreach.messages",
        **{
            "recipient_id": recipient["id"],
            "step": step,
            "subject": f"Subject {step}",
            "body": f"Body {step}",
            **values,
        },
    )
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_outreach_schema.py -q`
Expected: FAIL. Every test errors with `relation "outreach.campaigns" does not exist` or
`relation "outreach.engine_state" does not exist`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261118090000_outreach.sql`:

```sql
-- Outreach engine: the hosted bot's working data (spec 2026-11-18 §4.2).
-- Records of what was sent and received stay in the desk's own tables
-- (emails_sent, responses, suppressions); this schema holds campaigns, the
-- send queue, mailbox settings and the engine's status.
-- Nothing here is reachable through Supabase's API roles.

create schema if not exists outreach;
revoke all on schema outreach from public;
revoke all on schema outreach from anon, authenticated;

create type outreach.recipient_status as enum
  ('pending', 'active', 'replied', 'stopped', 'completed', 'bounced');
create type outreach.message_status as enum
  ('draft', 'approved', 'sending', 'sent', 'failed', 'skipped', 'needs_review');

create table outreach.campaigns (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (length(btrim(name)) between 1 and 200),
  created_by  text,
  archived_at timestamptz
);

create table outreach.steps (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  campaign_id      uuid not null references outreach.campaigns (id) on delete cascade,
  step             integer not null check (step between 1 and 3),
  subject_template text not null check (length(btrim(subject_template)) > 0),
  body_template    text not null check (length(btrim(body_template)) > 0),
  wait_days        integer not null default 3 check (wait_days between 1 and 60),
  unique (campaign_id, step)
);

create table outreach.recipients (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  campaign_id  uuid not null references outreach.campaigns (id) on delete cascade,
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  merge        jsonb not null default '{}'::jsonb check (jsonb_typeof(merge) = 'object'),
  status       outreach.recipient_status not null default 'pending',
  stop_reason  text,
  current_step integer not null default 0 check (current_step between 0 and 3),
  unique (campaign_id, contact_id)
);
create index recipients_contact_id_idx on outreach.recipients (contact_id);

create table outreach.messages (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  recipient_id  uuid not null references outreach.recipients (id) on delete cascade,
  step          integer not null check (step between 1 and 3),
  subject       text not null,
  body          text not null,
  status        outreach.message_status not null default 'draft',
  due_at        timestamptz,
  email_sent_id uuid unique references public.emails_sent (id) on delete restrict,
  mailbox       text,
  error         text,
  unique (recipient_id, step),
  constraint messages_sent_needs_email check (status <> 'sent' or email_sent_id is not null)
);
create index messages_due_idx on outreach.messages (status, due_at);

create table outreach.mailboxes (
  email        extensions.citext primary key,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  daily_cap    integer not null default 15 check (daily_cap between 0 and 500),
  is_active    boolean not null default true,
  sent_today   integer not null default 0 check (sent_today >= 0),
  counter_date date,
  configured   boolean not null default true
);

create table outreach.engine_state (
  id                  boolean primary key default true check (id),
  paused              boolean not null default true,
  paused_reason       text default 'The engine starts paused. A person unpauses it on the Mailboxes screen.',
  paused_at           timestamptz default now(),
  sending_enabled     boolean not null default false,
  last_cycle_at       timestamptz,
  last_inbox_check_at timestamptz,
  inbox_status        text not null default 'waiting' check (inbox_status in ('waiting', 'ok', 'error')),
  inbox_detail        text,
  engine_version      text,
  updated_at          timestamptz not null default now()
);
insert into outreach.engine_state default values;

create table outreach.inbox_seen (
  mailbox     extensions.citext not null,
  message_key text not null,
  seen_at     timestamptz not null default now(),
  outcome     text not null,
  primary key (mailbox, message_key)
);

create table outreach.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null,
  detail     text
);
create index events_created_at_idx on outreach.events (created_at desc);

-- A suppressed or erased person can never be an active recipient. The
-- emails_sent trigger is the last guard at send time; this one stops them
-- being queued at all.
create or replace function outreach.recipients_before_write() returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  why suppression_reason;
  erased boolean;
begin
  if new.status = 'active' then
    select c.is_anonymized into erased from contacts c where c.id = new.contact_id;
    if erased then
      raise exception 'This person asked for their data to be erased; they cannot be emailed'
        using errcode = 'P0001';
    end if;
    select s.reason into why
      from suppressions s join contacts c on c.email = s.email
     where c.id = new.contact_id;
    if why is not null then
      raise exception 'Address is on the do-not-email list (%)', why using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger recipients_10_before_write before insert or update on outreach.recipients
  for each row execute function outreach.recipients_before_write();

create trigger campaigns_90_updated_at before update on outreach.campaigns
  for each row execute function public.set_updated_at();
create trigger steps_90_updated_at before update on outreach.steps
  for each row execute function public.set_updated_at();
create trigger recipients_90_updated_at before update on outreach.recipients
  for each row execute function public.set_updated_at();
create trigger messages_90_updated_at before update on outreach.messages
  for each row execute function public.set_updated_at();
create trigger mailboxes_90_updated_at before update on outreach.mailboxes
  for each row execute function public.set_updated_at();
create trigger engine_state_90_updated_at before update on outreach.engine_state
  for each row execute function public.set_updated_at();

alter table outreach.campaigns    enable row level security;
alter table outreach.steps        enable row level security;
alter table outreach.recipients   enable row level security;
alter table outreach.messages     enable row level security;
alter table outreach.mailboxes    enable row level security;
alter table outreach.engine_state enable row level security;
alter table outreach.inbox_seen   enable row level security;
alter table outreach.events       enable row level security;

revoke all on all tables in schema outreach from public, anon, authenticated;
revoke all on all sequences in schema outreach from public, anon, authenticated;
revoke all on all functions in schema outreach from public, anon, authenticated;
alter default privileges in schema outreach revoke all on tables from public, anon, authenticated;
alter default privileges in schema outreach revoke all on sequences from public, anon, authenticated;
alter default privileges in schema outreach revoke all on functions from public, anon, authenticated;
```

- [ ] **Step 5: Run the schema tests**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_outreach_schema.py -q`
Expected: `8 passed`.

- [ ] **Step 6: Extend the security tests**

In `backend/tests/test_rls.py`, add after the `VIEWS` line:

```python
OUTREACH_TABLES = [
    "outreach.campaigns",
    "outreach.steps",
    "outreach.recipients",
    "outreach.messages",
    "outreach.mailboxes",
    "outreach.engine_state",
    "outreach.inbox_seen",
    "outreach.events",
]
```

Change the read test's parametrize line to
`@pytest.mark.parametrize("relation", TABLES + VIEWS + OUTREACH_TABLES)`. Append:

```python
def test_rls_enabled_on_every_outreach_table(db):
    off = rows(
        db,
        "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'outreach' and c.relkind = 'r' and not c.relrowsecurity order by 1",
    )
    assert [r["relname"] for r in off] == []


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_api_roles_cannot_touch_outreach_functions(db, role):
    with pytest.raises(pg.InsufficientPrivilege):
        as_role(db, role, "select outreach.recipients_before_write()")
```

- [ ] **Step 7: Run the whole desk suite**

Run: `backend\.venv\Scripts\python -m pytest backend\tests -q`
Expected: all pass, with 27 more tests than before:

- 8 schema tests;
- 16 new parametrized RLS reads (8 tables × 2 roles);
- 1 RLS-enabled test;
- 2 function tests.

The function test raises `InsufficientPrivilege` on the schema (no `usage`) before it ever
reaches the function. That still passes, because `pytest.raises` matches the class.

- [ ] **Step 8: Amend the spec's auto-reply wording**

In `docs/superpowers/specs/2026-11-18-lambtech-outreach-engine-design.md` §5 step 2,
replace `**Any reply** stops that recipient's remaining messages` with
`**Any reply other than an auto-reply** stops that recipient's remaining messages; an
auto-reply is logged and the sequence continues`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261118090000_outreach.sql backend/tests/conftest.py backend/tests/test_outreach_schema.py backend/tests/test_rls.py docs/superpowers/specs/2026-11-18-lambtech-outreach-engine-design.md
git commit -m "feat(db): outreach schema for the hosted engine (locked down, starts paused)"
```

---

### Task 2: CSV parsing, merge tags and domain checks (pure)

**Files:**
- Create: `backend/app/outreach_csv.py`
- Modify: `backend/requirements.txt` (append `python-multipart==0.0.20` and `dnspython==2.7.0`)
- Test: `backend/tests/test_outreach_csv.py`

**Interfaces:**
- Produces:
  - **Types:**
    - `Person` dataclass: `email, full_name, first_name, last_name, company, job_title, city, website, merge: dict[str, str]`
    - `ParsedCsv` dataclass: `columns: list[dict]` (`{"name", "tag"}`), `rows: list[dict[str, str]]` (keys lower-cased headers), `is_apollo: bool`
  - **Functions:**
    - `column_tag(header: str) -> str`
    - `parse_csv(data: bytes) -> ParsedCsv`, which raises `ValueError` with a person-readable message
    - `normalise_email(raw: str) -> Optional[str]`
    - `person_from_row(row: dict) -> Optional[Person]`
    - `render(template: str, merge: dict) -> str` (unknown tags left as written)
    - `unresolved(text: str) -> list[str]`
    - `mx_status(domain: str) -> str` (`ok|no_domain|no_mail|unknown`)
    - `check_domains(domains, lookup=None) -> dict[str, str]`
  - **Constant:** `FREE_MAIL: frozenset[str]`

- [ ] **Step 1: Install the two new packages**

Append to `backend/requirements.txt`:

```
python-multipart==0.0.20
dnspython==2.7.0
```

Run: `backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt -q`
Expected: exits 0.

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_outreach_csv.py`:

```python
"""Outreach CSV handling: no database, no network."""

import pytest

import outreach_csv as oc


def test_column_tag():
    assert oc.column_tag("Company Name for Emails") == "company_name_for_emails"
    assert oc.column_tag("  # Employees ") == "employees"


def test_parse_csv_reads_utf8_with_bom_and_lowercases_keys():
    data = "\ufeffEmail,First Name,Company Name\r\nRavi@Acme.com,Ravi,Acme\r\n".encode("utf-8")
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
```

- [ ] **Step 3: Run them to see them fail**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_outreach_csv.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'outreach_csv'`.

- [ ] **Step 4: Write the module**

Create `backend/app/outreach_csv.py`:

```python
"""
Outreach uploads: reading the CSV, turning rows into people, merge tags, and
the domain check. Pure functions - no database - so they are tested alone.
"""

import csv
import io
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable, Iterable, Optional

import dns.exception
import dns.resolver

MAX_ROWS = 5000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TAG_RE = re.compile(r"\{([a-z0-9_]+)\}")
APOLLO_HINTS = {"first name", "last name", "company name for emails", "# employees", "person linkedin url"}
FREE_MAIL = frozenset(
    {
        "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "hotmail.com",
        "outlook.com", "live.com", "icloud.com", "aol.com", "zoho.com", "protonmail.com",
        "proton.me", "mail.com", "yandex.com", "rediffmail.com",
    }
)


def column_tag(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (header or "").strip().lower()).strip("_")


@dataclass
class ParsedCsv:
    columns: list
    rows: list
    is_apollo: bool


@dataclass
class Person:
    email: str
    full_name: str
    first_name: str
    last_name: str
    company: str
    job_title: str
    city: str
    website: str
    merge: dict = field(default_factory=dict)


def parse_csv(data: bytes) -> ParsedCsv:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError(
            "This file is not UTF-8. In Excel choose Save As > 'CSV UTF-8 (Comma delimited)' and upload it again."
        )
    try:
        reader = csv.DictReader(io.StringIO(text))
        headers = [h for h in (reader.fieldnames or []) if h and h.strip()]
        rows = []
        for raw in reader:
            rows.append(
                {
                    key.strip().lower(): (value.strip() if isinstance(value, str) else "")
                    for key, value in raw.items()
                    if key
                }
            )
            if len(rows) > MAX_ROWS:
                raise ValueError(f"The file has more than {MAX_ROWS} rows. Split it into smaller files.")
    except csv.Error as exc:
        raise ValueError(f"The file is not a readable CSV ({exc}).")
    lower = [h.strip().lower() for h in headers]
    if "email" not in lower:
        raise ValueError("The CSV must have a column named email.")
    columns = [{"name": h.strip(), "tag": column_tag(h)} for h in headers if column_tag(h)]
    return ParsedCsv(columns=columns, rows=rows, is_apollo=bool(APOLLO_HINTS & set(lower)))


def normalise_email(raw: str) -> Optional[str]:
    value = (raw or "").strip().lower()
    if len(value) > 254 or not EMAIL_RE.match(value):
        return None
    return value


def person_from_row(row: dict) -> Optional[Person]:
    email = normalise_email(row.get("email", ""))
    if email is None:
        return None
    domain = email.split("@", 1)[1]
    first = row.get("first name", "")
    last = row.get("last name", "")
    named = row.get("name") or " ".join(part for part in (first, last) if part)
    full_name = named or email.split("@", 1)[0]
    first_name = first or (named.split()[0] if named else "")
    company = row.get("company") or row.get("company name") or row.get("company name for emails") or ""
    job_title = row.get("role") or row.get("title") or ""
    city = row.get("city") or row.get("company city") or ""
    website = row.get("website") or ""
    merge = {
        "name": named,
        "first_name": first_name,
        "last_name": last,
        "company": company,
        "role": job_title,
        "email": email,
        "website": website or domain,
        "city": city,
    }
    for key, value in row.items():
        tag = column_tag(key)
        if tag and tag not in merge:
            merge[tag] = value
    return Person(email, full_name, first_name, last, company, job_title, city, website, merge)


def render(template: str, merge: dict) -> str:
    def fill(match):
        tag = match.group(1)
        return str(merge.get(tag) or "") if tag in merge else match.group(0)

    return TAG_RE.sub(fill, template or "")


def unresolved(text: str) -> list:
    return TAG_RE.findall(text or "")


def mx_status(domain: str) -> str:
    try:
        answers = dns.resolver.resolve(domain, "MX", lifetime=4)
    except dns.resolver.NXDOMAIN:
        return "no_domain"
    except dns.resolver.NoAnswer:
        return "ok"  # no MX record: mail still goes to the address record (RFC 5321 §5.1)
    except (dns.exception.DNSException, OSError):
        return "unknown"
    hosts = [str(record.exchange).rstrip(".") for record in answers]
    return "ok" if any(hosts) else "no_mail"  # a null MX ("." ) says the domain takes no mail


def check_domains(domains: Iterable[str], lookup: Optional[Callable[[str], str]] = None) -> dict:
    lookup = lookup or mx_status
    unique = sorted(set(domains))
    if not unique:
        return {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        return dict(zip(unique, pool.map(lookup, unique)))
```

- [ ] **Step 5: Run the tests**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_outreach_csv.py -q`
Expected: `9 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/outreach_csv.py backend/tests/test_outreach_csv.py backend/requirements.txt
git commit -m "feat(api): outreach CSV parsing, merge tags and domain checks"
```

---

### Task 3: Create a campaign from a CSV

**Files:**
- Create: `backend/app/outreach_upload.py`, `backend/app/routers/outreach.py`
- Modify: `backend/app/main.py`, `backend/app/schemas.py`
- Test: `backend/tests/test_api_outreach_campaigns.py`

**Interfaces:**
- Consumes: Task 2's `outreach_csv` functions.
- Produces:
  - `outreach_upload.StepIn(step: int, subject: str, body: str, wait_days: int = 3)`
  - `outreach_upload.create_campaign(db, *, name, csv_bytes, steps, created_by) -> dict`. The
    dict has keys `campaign_id, added, invalid, duplicates, already_contacted, suppressed,
    bad_domain, unknown_tags`. It raises `ValueError`.
  - `POST /outreach/campaigns` (multipart: `name`, `steps` as a JSON list of
    `{step, subject, body, wait_days}`, `file`) → 201 with that dict.
  - `POST /outreach/csv-columns` (multipart `file`) → `{"columns": [...], "rows": int, "is_apollo": bool}`.
  - `routers.outreach.router` (prefix `/outreach`).

- [ ] **Step 1: Write the failing API tests**

Create `backend/tests/test_api_outreach_campaigns.py`:

```python
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_api_outreach_campaigns.py -q`
Expected: FAIL. Responses are 404 because `/outreach/...` is not mounted.

- [ ] **Step 3: Write the upload service**

Create `backend/app/outreach_upload.py`:

```python
"""
Creating an outreach campaign from a CSV, in one transaction (spec §4.1, §6).

People who must not be emailed are skipped and counted, never stored as
recipients: suppressed or erased addresses, people already emailed by any
campaign, addresses whose domain does not exist or takes no mail.
"""

import json
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

import outreach_csv as oc


@dataclass
class StepIn:
    step: int
    subject: str
    body: str
    wait_days: int = 3


BLOCKED_SQL = text(
    """
    select 1 from suppressions where email = :email
    union all
    select 1 from contacts where email = :email and is_anonymized
    limit 1
    """
)
CONTACTED_SQL = text(
    """
    select 1 from emails_sent where contact_id = :cid and kind in ('outreach', 'follow_up')
    union all
    select 1 from outreach.recipients where contact_id = :cid and status <> 'pending'
    limit 1
    """
)


def _check(name: str, steps: list) -> str:
    clean = (name or "").strip()
    if not 1 <= len(clean) <= 200:
        raise ValueError("Give the campaign a name (up to 200 characters).")
    numbers = [s.step for s in steps]
    if not steps or len(steps) > 3 or numbers != list(range(1, len(steps) + 1)):
        raise ValueError("Steps must be step 1, optionally followed by steps 2 and 3.")
    for s in steps:
        if not str(s.subject).strip() or not str(s.body).strip():
            raise ValueError(f"Step {s.step} needs a subject and a message.")
        if s.step > 1 and not 1 <= int(s.wait_days) <= 60:
            raise ValueError(f"Step {s.step} must wait between 1 and 60 days.")
    return clean


def _company_id(db: Session, person: oc.Person, domain: str) -> Optional[str]:
    if domain in oc.FREE_MAIL:
        return None
    found = db.execute(text("select id from companies where domain = :d"), {"d": domain}).first()
    if found:
        return found.id
    if not person.company:
        return None
    return db.execute(
        text("insert into companies (name, domain, website, city) values (:n, :d, :w, :c) returning id"),
        {"n": person.company, "d": domain, "w": person.website or None, "c": person.city or None},
    ).scalar_one()


def create_campaign(db: Session, *, name: str, csv_bytes: bytes, steps: list, created_by: Optional[str]) -> dict:
    parsed = oc.parse_csv(csv_bytes)
    clean_name = _check(name, steps)
    report = {"added": 0, "invalid": 0, "duplicates": 0, "already_contacted": 0, "suppressed": 0, "bad_domain": 0}

    people, seen = [], set()
    for row in parsed.rows:
        person = oc.person_from_row(row)
        if person is None:
            report["invalid"] += 1
        elif person.email in seen:
            report["duplicates"] += 1
        else:
            seen.add(person.email)
            people.append(person)
    domain_status = oc.check_domains([p.email.split("@", 1)[1] for p in people])

    campaign_id = db.execute(
        text("insert into outreach.campaigns (name, created_by) values (:n, :b) returning id"),
        {"n": clean_name, "b": created_by},
    ).scalar_one()
    for s in steps:
        db.execute(
            text(
                "insert into outreach.steps (campaign_id, step, subject_template, body_template, wait_days) "
                "values (:c, :s, :subj, :body, :w)"
            ),
            {"c": campaign_id, "s": s.step, "subj": s.subject, "body": s.body, "w": max(1, int(s.wait_days))},
        )

    source = "apollo" if parsed.is_apollo else "import"
    unknown = set()
    for person in people:
        domain = person.email.split("@", 1)[1]
        if domain_status.get(domain) in ("no_domain", "no_mail"):
            report["bad_domain"] += 1
            continue
        if db.execute(BLOCKED_SQL, {"email": person.email}).first():
            report["suppressed"] += 1
            continue
        existing = db.execute(text("select id from contacts where email = :e"), {"e": person.email}).first()
        if existing and db.execute(CONTACTED_SQL, {"cid": existing.id}).first():
            report["already_contacted"] += 1
            continue
        company_id = _company_id(db, person, domain)
        if existing:
            contact_id = existing.id
            db.execute(
                text(
                    "update contacts set job_title = coalesce(job_title, :jt), "
                    "company_id = coalesce(company_id, :co) where id = :id"
                ),
                {"jt": person.job_title or None, "co": company_id, "id": contact_id},
            )
        else:
            contact_id = db.execute(
                text(
                    "insert into contacts (full_name, email, job_title, company_id, source, source_detail) "
                    "values (:n, :e, :jt, :co, cast(:src as contact_source), :sd) returning id"
                ),
                {"n": person.full_name, "e": person.email, "jt": person.job_title or None,
                 "co": company_id, "src": source, "sd": clean_name},
            ).scalar_one()
        recipient_id = db.execute(
            text(
                "insert into outreach.recipients (campaign_id, contact_id, merge) "
                "values (:c, :ct, cast(:m as jsonb)) returning id"
            ),
            {"c": campaign_id, "ct": contact_id, "m": json.dumps(person.merge)},
        ).scalar_one()
        for s in steps:
            subject = oc.render(s.subject, person.merge)
            body = oc.render(s.body, person.merge)
            unknown.update(oc.unresolved(subject + "\n" + body))
            db.execute(
                text("insert into outreach.messages (recipient_id, step, subject, body) values (:r, :s, :subj, :body)"),
                {"r": recipient_id, "s": s.step, "subj": subject, "body": body},
            )
        report["added"] += 1

    db.commit()
    return {"campaign_id": str(campaign_id), **report, "unknown_tags": sorted(unknown)}
```

- [ ] **Step 4: Write the router with the two upload routes**

Create `backend/app/routers/outreach.py`:

```python
"""Outreach campaigns: upload, list, review drafts, queue, stop (spec §6)."""

import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import text
from sqlalchemy.orm import Session

import outreach_csv as oc
import schemas as s
from auth import require_staff
from database import get_db
from outreach_upload import StepIn, create_campaign

router = APIRouter(prefix="/outreach", tags=["Outreach"])

MAX_UPLOAD_BYTES = 5_000_000


def _read_upload(file: UploadFile) -> bytes:
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The file is larger than 5 MB.")
    return data


@router.post("/csv-columns", response_model=s.CsvPreview)
def csv_columns(file: UploadFile = File(...)):
    try:
        parsed = oc.parse_csv(_read_upload(file))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"columns": parsed.columns, "rows": len(parsed.rows), "is_apollo": parsed.is_apollo}


@router.post("/campaigns", response_model=s.UploadReport, status_code=status.HTTP_201_CREATED)
def upload_campaign(
    name: str = Form(...),
    steps: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    staff: dict = Depends(require_staff),
):
    try:
        step_list = [StepIn(**item) for item in json.loads(steps)]
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Steps are not in the expected shape.")
    try:
        return create_campaign(
            db, name=name, csv_bytes=_read_upload(file), steps=step_list, created_by=staff.get("email")
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
```

Append to `backend/app/schemas.py`:

```python
# --- outreach ------------------------------------------------------------------

RecipientStatus = Literal["pending", "active", "replied", "stopped", "completed", "bounced"]
MessageStatus = Literal["draft", "approved", "sending", "sent", "failed", "skipped", "needs_review"]


class CsvColumn(BaseModel):
    name: str
    tag: str


class CsvPreview(BaseModel):
    columns: list[CsvColumn]
    rows: int
    is_apollo: bool


class UploadReport(BaseModel):
    campaign_id: UUID
    added: int
    invalid: int
    duplicates: int
    already_contacted: int
    suppressed: int
    bad_domain: int
    unknown_tags: list[str]
```

In `backend/app/main.py`, change the router import to
`from routers import enquiries, outreach, resources, stats`. After the enquiries
`include_router` line, add:

```python
app.include_router(outreach.router, dependencies=STAFF_ONLY)
```

- [ ] **Step 5: Run the tests**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_api_outreach_campaigns.py -q`
Expected: `10 passed, 1 failed`. The one failure is `test_outreach_routes_are_staff_only`,
on its GET line: it gets 405, because `GET /outreach/campaigns` arrives in Task 4. It turns
green there. Any other failure is real.

- [ ] **Step 6: Commit**

```bash
git add backend/app/outreach_upload.py backend/app/routers/outreach.py backend/app/schemas.py backend/app/main.py backend/tests/test_api_outreach_campaigns.py
git commit -m "feat(api): create outreach campaigns from a CSV"
```

---

### Task 4: Campaign routes: list, recipients, edit, queue, stop, delete

**Files:**
- Modify: `backend/app/routers/outreach.py`, `backend/app/schemas.py`
- Test: `backend/tests/test_api_outreach_campaigns.py` (append)

**Interfaces:**
- Produces:
  - `GET /outreach/campaigns` → `list[CampaignSummary]` (`id, name, created_at,
    created_by, recipients, drafts, queued, sent, replied, problems`).
  - `GET /outreach/campaigns/{id}` → `CampaignDetail` (`id, name, created_at,
    created_by, steps: list[{step, subject_template, body_template, wait_days}]`).
  - `GET /outreach/campaigns/{id}/recipients` → `list[RecipientRead]` (`id, status,
    stop_reason, current_step, contact_id, full_name, email, messages:
    list[MessageRead]`).
    - `MessageRead`: `id, step, status, subject, body, due_at, error, email_sent_id`.
  - `PATCH /outreach/messages/{id}` with `{subject?, body?}` → `MessageRead`; 409 unless
    the message is draft or approved.
  - `POST /outreach/campaigns/{id}/queue` → `{"queued_recipients": int, "stopped": int}`;
    422 if any draft still has a `{tag}`.
  - `POST /outreach/recipients/{id}/stop` → 204; 409 unless pending or active.
  - `DELETE /outreach/campaigns/{id}` → 204; 409 once anything was sent.

- [ ] **Step 1: Append the failing tests**

Append to `backend/tests/test_api_outreach_campaigns.py`:

```python
from conftest import make_campaign, make_message, make_recipient  # noqa: E402


def _campaign_id(client):
    return upload(client).json()["campaign_id"]


def test_list_and_detail(client):
    cid = _campaign_id(client)
    listed = client.get("/outreach/campaigns", headers=bearer()).json()
    assert listed[0]["id"] == cid and listed[0]["recipients"] == 2 and listed[0]["drafts"] == 6
    detail = client.get(f"/outreach/campaigns/{cid}", headers=bearer()).json()
    assert [st["step"] for st in detail["steps"]] == [1, 2, 3]
    recipients = client.get(f"/outreach/campaigns/{cid}/recipients", headers=bearer()).json()
    assert {r["email"] for r in recipients} == {"ravi@acme.com", "priya@sharma.in"}
    assert [m["step"] for m in recipients[0]["messages"]] == [1, 2, 3]


def test_edit_a_draft_but_not_a_sent_message(client, db):
    cid = _campaign_id(client)
    message = client.get(f"/outreach/campaigns/{cid}/recipients", headers=bearer()).json()[0]["messages"][0]
    res = client.patch(f"/outreach/messages/{message['id']}", headers=bearer(), json={"subject": "New subject"})
    assert res.status_code == 200 and res.json()["subject"] == "New subject"
    contact = one(db, "select * from contacts where email = 'ravi@acme.com'")
    email = make_email(db, contact)
    rows(db, "update outreach.messages set status = 'sent', email_sent_id = %s where id = %s", [email["id"], message["id"]])
    res = client.patch(f"/outreach/messages/{message['id']}", headers=bearer(), json={"body": "x"})
    assert res.status_code == 409


def test_queue_approves_drafts_and_makes_step_one_due(client, db):
    cid = _campaign_id(client)
    res = client.post(f"/outreach/campaigns/{cid}/queue", headers=bearer())
    assert res.status_code == 200 and res.json() == {"queued_recipients": 2, "stopped": 0}
    statuses = rows(db, "select step, status, due_at from outreach.messages order by step")
    assert {m["status"] for m in statuses} == {"approved"}
    assert all(m["due_at"] is not None for m in statuses if m["step"] == 1)
    assert all(m["due_at"] is None for m in statuses if m["step"] > 1)
    assert {r["status"] for r in rows(db, "select status from outreach.recipients")} == {"active"}


def test_queue_stops_people_suppressed_since_upload(client, db):
    cid = _campaign_id(client)
    rows(db, "insert into suppressions (email, reason) values ('priya@sharma.in', 'unsubscribed')")
    assert client.post(f"/outreach/campaigns/{cid}/queue", headers=bearer()).json() == {
        "queued_recipients": 1, "stopped": 1}
    stopped = one(db, "select r.* from outreach.recipients r join contacts c on c.id = r.contact_id "
                      "where c.email = 'priya@sharma.in'")
    assert stopped["status"] == "stopped"
    assert one(db, "select count(*) as n from outreach.messages where recipient_id = %s and status = 'skipped'",
               [stopped["id"]])["n"] == 3


def test_queue_refuses_unfilled_tags(client):
    steps = [{"step": 1, "subject": "Hi", "body": "About {mystery}", "wait_days": 1}]
    cid = upload(client, steps=steps).json()["campaign_id"]
    res = client.post(f"/outreach/campaigns/{cid}/queue", headers=bearer())
    assert res.status_code == 422 and "{tag}" in res.json()["detail"]


def test_stop_a_recipient_skips_their_unsent_messages(client, db):
    cid = _campaign_id(client)
    client.post(f"/outreach/campaigns/{cid}/queue", headers=bearer())
    recipient = client.get(f"/outreach/campaigns/{cid}/recipients", headers=bearer()).json()[0]
    assert client.post(f"/outreach/recipients/{recipient['id']}/stop", headers=bearer()).status_code == 204
    assert one(db, "select status from outreach.recipients where id = %s", [recipient["id"]])["status"] == "stopped"
    assert client.post(f"/outreach/recipients/{recipient['id']}/stop", headers=bearer()).status_code == 409


def test_delete_only_before_anything_was_sent(client, db):
    cid = _campaign_id(client)
    contact = one(db, "select * from contacts where email = 'ravi@acme.com'")
    email = make_email(db, contact)
    rows(db, "update outreach.messages m set status = 'sent', email_sent_id = %s from outreach.recipients r "
             "where r.id = m.recipient_id and r.contact_id = %s and m.step = 1", [email["id"], contact["id"]])
    assert client.delete(f"/outreach/campaigns/{cid}", headers=bearer()).status_code == 409
    cid2 = upload(client, "email\r\nnew@acme.com\r\n", name="Second").json()["campaign_id"]
    assert client.delete(f"/outreach/campaigns/{cid2}", headers=bearer()).status_code == 204
    assert client.get(f"/outreach/campaigns/{cid2}", headers=bearer()).status_code == 404
```

- [ ] **Step 2: Run them to see them fail**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_api_outreach_campaigns.py -q`
Expected: the 7 new tests fail with 404 or 405. The 11 earlier tests pass.

- [ ] **Step 3: Add the response models**

Append to `backend/app/schemas.py`:

```python
class CampaignSummary(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    created_by: Optional[str] = None
    recipients: int
    drafts: int
    queued: int
    sent: int
    replied: int
    problems: int


class CampaignStep(BaseModel):
    step: int
    subject_template: str
    body_template: str
    wait_days: int


class CampaignDetail(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    created_by: Optional[str] = None
    steps: list[CampaignStep]


class MessageRead(BaseModel):
    id: UUID
    step: int
    status: MessageStatus
    subject: str
    body: str
    due_at: Optional[datetime] = None
    error: Optional[str] = None
    email_sent_id: Optional[UUID] = None


class RecipientRead(BaseModel):
    id: UUID
    status: RecipientStatus
    stop_reason: Optional[str] = None
    current_step: int
    contact_id: UUID
    full_name: str
    email: str
    messages: list[MessageRead]


class MessageUpdate(BaseModel):
    subject: Optional[str] = Field(None, min_length=1, max_length=300)
    body: Optional[str] = Field(None, min_length=1, max_length=20000)


class QueueResult(BaseModel):
    queued_recipients: int
    stopped: int
```

- [ ] **Step 4: Add the routes**

Append to `backend/app/routers/outreach.py`:

```python
LIST_SQL = text(
    """
    select c.id, c.name, c.created_at, c.created_by,
           count(distinct r.id)                                          as recipients,
           count(m.id) filter (where m.status = 'draft')                 as drafts,
           count(m.id) filter (where m.status = 'approved')              as queued,
           count(m.id) filter (where m.status = 'sent')                  as sent,
           count(distinct r.id) filter (where r.status = 'replied')      as replied,
           count(m.id) filter (where m.status in ('failed', 'needs_review')) as problems
      from outreach.campaigns c
      left join outreach.recipients r on r.campaign_id = c.id
      left join outreach.messages m on m.recipient_id = r.id
     where c.archived_at is null
     group by c.id
     order by c.created_at desc
    """
)
RECIPIENTS_SQL = text(
    """
    select r.id, r.status, r.stop_reason, r.current_step,
           ct.id as contact_id, ct.full_name, ct.email::text as email,
           coalesce(
             json_agg(json_build_object(
               'id', m.id, 'step', m.step, 'status', m.status, 'subject', m.subject,
               'body', m.body, 'due_at', m.due_at, 'error', m.error, 'email_sent_id', m.email_sent_id
             ) order by m.step) filter (where m.id is not null),
             '[]'::json
           ) as messages
      from outreach.recipients r
      join contacts ct on ct.id = r.contact_id
      left join outreach.messages m on m.recipient_id = r.id
     where r.campaign_id = :cid
     group by r.id, ct.id
     order by ct.full_name, ct.email
     limit 2000
    """
)
UNFILLED_SQL = text(
    r"""
    select count(*) from outreach.messages m
      join outreach.recipients r on r.id = m.recipient_id
     where r.campaign_id = :cid and m.status = 'draft'
       and (m.subject ~ '\{[a-z0-9_]+\}' or m.body ~ '\{[a-z0-9_]+\}')
    """
)
STOP_SUPPRESSED_SQL = text(
    """
    update outreach.recipients r
       set status = 'stopped', stop_reason = 'on the do-not-email list'
      from contacts ct
     where ct.id = r.contact_id and r.campaign_id = :cid and r.status = 'pending'
       and (ct.is_anonymized or exists (select 1 from suppressions s where s.email = ct.email))
    """
)
SKIP_STOPPED_SQL = text(
    """
    update outreach.messages m set status = 'skipped', error = 'Recipient stopped'
      from outreach.recipients r
     where r.id = m.recipient_id and r.campaign_id = :cid and r.status = 'stopped'
       and m.status in ('draft', 'approved')
    """
)
APPROVE_SQL = text(
    """
    update outreach.messages m
       set status = 'approved', due_at = case when m.step = 1 then now() else null end
      from outreach.recipients r
     where r.id = m.recipient_id and r.campaign_id = :cid and r.status = 'active' and m.status = 'draft'
    """
)


def _campaign_or_404(db: Session, campaign_id: UUID):
    row = db.execute(
        text("select id, name, created_at, created_by from outreach.campaigns where id = :id"), {"id": campaign_id}
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return row


@router.get("/campaigns", response_model=list[s.CampaignSummary])
def list_campaigns(db: Session = Depends(get_db)):
    return [dict(r._mapping) for r in db.execute(LIST_SQL)]


@router.get("/campaigns/{campaign_id}", response_model=s.CampaignDetail)
def get_campaign(campaign_id: UUID, db: Session = Depends(get_db)):
    campaign = dict(_campaign_or_404(db, campaign_id)._mapping)
    campaign["steps"] = [
        dict(r._mapping)
        for r in db.execute(
            text(
                "select step, subject_template, body_template, wait_days from outreach.steps "
                "where campaign_id = :id order by step"
            ),
            {"id": campaign_id},
        )
    ]
    return campaign


@router.get("/campaigns/{campaign_id}/recipients", response_model=list[s.RecipientRead])
def list_recipients(campaign_id: UUID, db: Session = Depends(get_db)):
    _campaign_or_404(db, campaign_id)
    return [dict(r._mapping) for r in db.execute(RECIPIENTS_SQL, {"cid": campaign_id})]


@router.patch("/messages/{message_id}", response_model=s.MessageRead)
def edit_message(message_id: UUID, body: s.MessageUpdate, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            "update outreach.messages set subject = coalesce(:subject, subject), body = coalesce(:body, body) "
            "where id = :id and status in ('draft', 'approved') "
            "returning id, step, status, subject, body, due_at, error, email_sent_id"
        ),
        {"id": message_id, "subject": body.subject, "body": body.body},
    ).first()
    if row is None:
        exists = db.execute(text("select 1 from outreach.messages where id = :id"), {"id": message_id}).first()
        db.rollback()
        if exists is None:
            raise HTTPException(status_code=404, detail="Message not found.")
        raise HTTPException(status_code=409, detail="Only unsent messages can be edited.")
    db.commit()
    return dict(row._mapping)


@router.post("/campaigns/{campaign_id}/queue", response_model=s.QueueResult)
def queue_campaign(campaign_id: UUID, db: Session = Depends(get_db)):
    _campaign_or_404(db, campaign_id)
    unfilled = db.execute(UNFILLED_SQL, {"cid": campaign_id}).scalar_one()
    if unfilled:
        raise HTTPException(
            status_code=422,
            detail=f"{unfilled} message(s) still contain an unfilled {{tag}}. Edit them before queueing.",
        )
    stopped = db.execute(STOP_SUPPRESSED_SQL, {"cid": campaign_id}).rowcount
    db.execute(SKIP_STOPPED_SQL, {"cid": campaign_id})
    queued = db.execute(
        text("update outreach.recipients set status = 'active' where campaign_id = :cid and status = 'pending'"),
        {"cid": campaign_id},
    ).rowcount
    db.execute(APPROVE_SQL, {"cid": campaign_id})
    db.commit()
    return {"queued_recipients": queued, "stopped": stopped}


@router.post("/recipients/{recipient_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
def stop_recipient(recipient_id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            "update outreach.recipients set status = 'stopped', stop_reason = 'Stopped by staff' "
            "where id = :id and status in ('pending', 'active') returning id"
        ),
        {"id": recipient_id},
    ).first()
    if row is None:
        exists = db.execute(text("select 1 from outreach.recipients where id = :id"), {"id": recipient_id}).first()
        db.rollback()
        if exists is None:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        raise HTTPException(status_code=409, detail="Only pending or active recipients can be stopped.")
    db.execute(
        text(
            "update outreach.messages set status = 'skipped', error = 'Recipient stopped' "
            "where recipient_id = :id and status in ('draft', 'approved')"
        ),
        {"id": recipient_id},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: UUID, db: Session = Depends(get_db)):
    _campaign_or_404(db, campaign_id)
    started = db.execute(
        text(
            "select 1 from outreach.messages m join outreach.recipients r on r.id = m.recipient_id "
            "where r.campaign_id = :cid and m.status in ('sending', 'sent', 'needs_review', 'failed') limit 1"
        ),
        {"cid": campaign_id},
    ).first()
    if started:
        raise HTTPException(
            status_code=409, detail="This campaign has already sent email. Stop its recipients instead."
        )
    db.execute(text("delete from outreach.campaigns where id = :id"), {"id": campaign_id})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 5: Run the campaign tests**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_api_outreach_campaigns.py -q`
Expected: `18 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/outreach.py backend/app/schemas.py backend/tests/test_api_outreach_campaigns.py
git commit -m "feat(api): outreach campaign list, drafts, queue, stop and delete"
```

---

### Task 5: Engine state, mailboxes, review, events, sent-origins, Overview

**Files:**
- Create: `backend/app/routers/outreach_ops.py`
- Modify: `backend/app/schemas.py`, `backend/app/main.py`, `backend/app/routers/stats.py`
- Test: `backend/tests/test_api_outreach_ops.py`

**Interfaces:**
- Produces:
  - **State:**
    - `GET /outreach/state` → `EngineState` (`paused, paused_reason, paused_at,
      sending_enabled, last_cycle_at, last_inbox_check_at, inbox_status, inbox_detail,
      engine_version, queued, needs_review`).
    - `PATCH /outreach/state` with `{paused: bool, reason?: str}` → `EngineState`. It logs
      an `events` row of kind `pause` or `unpause`, with the staff email.
  - **Mailboxes:**
    - `GET /outreach/mailboxes` → `list[MailboxRead]` (`email, daily_cap, is_active,
      sent_today, counter_date, configured`).
    - `PATCH /outreach/mailboxes/{email}` with `{daily_cap?: 0..500, is_active?: bool}` →
      `MailboxRead`.
  - **Events and review:**
    - `GET /outreach/events?limit=50` → `list[EventRead]` (`id, created_at, kind, detail`).
    - `GET /outreach/review` → `list[ReviewItem]` (`id, step, status, error, subject,
      email, full_name, campaign, updated_at`) for `needs_review` and `failed`.
    - `POST /outreach/messages/{id}/resolve` with `{action: 'retry'|'skip'}` →
      `MessageRead`. It is 409 when the message is not needs_review/failed, or for a retry
      when the recipient is not active.
  - **Sent-origins:** `GET /outreach/sent-origins` → `list[SentOrigin]` (`email_sent_id,
    campaign, step`).
  - **Overview:** gains `outreach_paused: bool`, `outreach_sending_enabled: bool`,
    `outreach_sent_today: int`, `outreach_queued: int`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_api_outreach_ops.py`:

```python
"""Engine status, mailboxes and review from the desk (spec §6)."""

from conftest import (
    bearer, insert, make_campaign, make_contact, make_email, make_message, make_recipient, one, rows,
)


def test_state_starts_paused_and_pausing_is_logged(client, db):
    state = client.get("/outreach/state", headers=bearer()).json()
    assert state["paused"] is True and state["sending_enabled"] is False
    res = client.patch("/outreach/state", headers=bearer(), json={"paused": False})
    assert res.status_code == 200 and res.json()["paused"] is False and res.json()["paused_reason"] is None
    res = client.patch("/outreach/state", headers=bearer(), json={"paused": True, "reason": "Checking replies"})
    assert res.json()["paused_reason"] == "Checking replies"
    kinds = [e["kind"] for e in client.get("/outreach/events", headers=bearer()).json()]
    assert kinds[:2] == ["pause", "unpause"]
    assert "ceo@lambtech.in" in client.get("/outreach/events", headers=bearer()).json()[0]["detail"]


def test_mailbox_cap_and_switch(client, db):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in")
    res = client.patch("/outreach/mailboxes/ceo@lambtech.in", headers=bearer(), json={"daily_cap": 25, "is_active": False})
    assert res.status_code == 200 and res.json()["daily_cap"] == 25 and res.json()["is_active"] is False
    assert client.patch("/outreach/mailboxes/ceo@lambtech.in", headers=bearer(), json={"daily_cap": -1}).status_code == 422
    assert client.patch("/outreach/mailboxes/nobody@lambtech.in", headers=bearer(), json={"daily_cap": 5}).status_code == 404
    assert [m["email"] for m in client.get("/outreach/mailboxes", headers=bearer()).json()] == ["ceo@lambtech.in"]


def _stuck(db, status="needs_review", recipient_status="active"):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact, status=recipient_status)
    email = make_email(db, contact, status="queued")
    return make_message(db, recipient, 1, status=status, email_sent_id=email["id"], error="stopped mid-send"), email


def test_review_lists_stuck_and_failed_messages(client, db):
    message, _ = _stuck(db)
    items = client.get("/outreach/review", headers=bearer()).json()
    assert [i["id"] for i in items] == [str(message["id"])]
    assert items[0]["email"] == "ravi@acme.com" and items[0]["campaign"] == "Q4 CA firms"


def test_retry_requeues_and_closes_the_half_logged_email(client, db):
    message, email = _stuck(db)
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "retry"})
    assert res.status_code == 200 and res.json()["status"] == "approved" and res.json()["email_sent_id"] is None
    assert one(db, "select status from emails_sent where id = %s", [email["id"]])["status"] == "failed"


def test_skip_and_refusals(client, db):
    message, _ = _stuck(db, recipient_status="replied")
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "retry"})
    assert res.status_code == 409
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "skip"})
    assert res.status_code == 200 and res.json()["status"] == "skipped"
    res = client.post(f"/outreach/messages/{message['id']}/resolve", headers=bearer(), json={"action": "skip"})
    assert res.status_code == 409


def test_sent_origins_name_campaign_and_step(client, db):
    contact = make_contact(db)
    email = make_email(db, contact)
    make_message(db, make_recipient(db, make_campaign(db), contact), 2, status="sent", email_sent_id=email["id"])
    assert client.get("/outreach/sent-origins", headers=bearer()).json() == [
        {"email_sent_id": str(email["id"]), "campaign": "Q4 CA firms", "step": 2}
    ]


def test_overview_reports_outreach(client, db):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in", sent_today=4,
           counter_date=one(db, "select (now() at time zone 'Asia/Kolkata')::date as d")["d"])
    stats = client.get("/stats/overview", headers=bearer()).json()
    assert stats["outreach_paused"] is True and stats["outreach_sent_today"] == 4
    assert stats["outreach_queued"] == 0 and stats["outreach_sending_enabled"] is False
```

- [ ] **Step 2: Run them to see them fail**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_api_outreach_ops.py -q`
Expected: FAIL. Responses are 404, and the Overview test fails with `KeyError: 'outreach_paused'`.

- [ ] **Step 3: Add the models**

Append to `backend/app/schemas.py`:

```python
class EngineState(BaseModel):
    paused: bool
    paused_reason: Optional[str] = None
    paused_at: Optional[datetime] = None
    sending_enabled: bool
    last_cycle_at: Optional[datetime] = None
    last_inbox_check_at: Optional[datetime] = None
    inbox_status: Literal["waiting", "ok", "error"]
    inbox_detail: Optional[str] = None
    engine_version: Optional[str] = None
    queued: int
    needs_review: int


class EngineStateUpdate(BaseModel):
    paused: bool
    reason: Optional[str] = Field(None, max_length=300)


class MailboxRead(BaseModel):
    email: str
    daily_cap: int
    is_active: bool
    sent_today: int
    counter_date: Optional[date] = None
    configured: bool


class MailboxUpdate(BaseModel):
    daily_cap: Optional[int] = Field(None, ge=0, le=500)
    is_active: Optional[bool] = None


class EventRead(BaseModel):
    id: int
    created_at: datetime
    kind: str
    detail: Optional[str] = None


class ReviewItem(BaseModel):
    id: UUID
    step: int
    status: MessageStatus
    error: Optional[str] = None
    subject: str
    email: str
    full_name: str
    campaign: str
    updated_at: datetime


class ResolveAction(BaseModel):
    action: Literal["retry", "skip"]


class SentOrigin(BaseModel):
    email_sent_id: UUID
    campaign: str
    step: int
```

In the `Overview` class in `schemas.py`, add after `enquiries_new: int`:

```python
    outreach_paused: bool
    outreach_sending_enabled: bool
    outreach_sent_today: int
    outreach_queued: int
```

- [ ] **Step 4: Write the router**

Create `backend/app/routers/outreach_ops.py`:

```python
"""The engine's controls and health, as the desk sees them (spec §6 Mailboxes)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

import schemas as s
from auth import require_staff
from database import get_db

router = APIRouter(prefix="/outreach", tags=["Outreach engine"])

STATE_SQL = text(
    """
    select st.paused, st.paused_reason, st.paused_at, st.sending_enabled, st.last_cycle_at,
           st.last_inbox_check_at, st.inbox_status, st.inbox_detail, st.engine_version,
           (select count(*) from outreach.messages where status = 'approved')     as queued,
           (select count(*) from outreach.messages where status = 'needs_review') as needs_review
      from outreach.engine_state st
    """
)
MAILBOX_COLUMNS = "email::text as email, daily_cap, is_active, sent_today, counter_date, configured"
REVIEW_SQL = text(
    """
    select m.id, m.step, m.status, m.error, m.subject, m.updated_at,
           ct.email::text as email, ct.full_name, c.name as campaign
      from outreach.messages m
      join outreach.recipients r on r.id = m.recipient_id
      join outreach.campaigns c on c.id = r.campaign_id
      join contacts ct on ct.id = r.contact_id
     where m.status in ('needs_review', 'failed')
     order by m.updated_at desc
     limit 200
    """
)


def _state(db: Session) -> dict:
    return dict(db.execute(STATE_SQL).first()._mapping)


@router.get("/state", response_model=s.EngineState)
def get_state(db: Session = Depends(get_db)):
    return _state(db)


@router.patch("/state", response_model=s.EngineState)
def set_state(body: s.EngineStateUpdate, db: Session = Depends(get_db), staff: dict = Depends(require_staff)):
    who = staff.get("email") or "staff"
    db.execute(
        text(
            "update outreach.engine_state set paused = :p, "
            "paused_reason = case when :p then coalesce(:r, 'Paused by ' || :who) else null end, "
            "paused_at = case when :p then now() else null end"
        ),
        {"p": body.paused, "r": body.reason, "who": who},
    )
    db.execute(
        text("insert into outreach.events (kind, detail) values (:k, :d)"),
        {"k": "pause" if body.paused else "unpause",
         "d": f"{'Paused' if body.paused else 'Unpaused'} by {who}" + (f": {body.reason}" if body.reason else "")},
    )
    db.commit()
    return _state(db)


@router.get("/mailboxes", response_model=list[s.MailboxRead])
def list_mailboxes(db: Session = Depends(get_db)):
    return [dict(r._mapping) for r in db.execute(text(f"select {MAILBOX_COLUMNS} from outreach.mailboxes order by email"))]


@router.patch("/mailboxes/{email}", response_model=s.MailboxRead)
def update_mailbox(email: str, body: s.MailboxUpdate, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            "update outreach.mailboxes set daily_cap = coalesce(:cap, daily_cap), "
            f"is_active = coalesce(:active, is_active) where email = :email returning {MAILBOX_COLUMNS}"
        ),
        {"cap": body.daily_cap, "active": body.is_active, "email": email},
    ).first()
    if row is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Mailbox not found.")
    db.commit()
    return dict(row._mapping)


@router.get("/events", response_model=list[s.EventRead])
def list_events(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return [
        dict(r._mapping)
        for r in db.execute(
            text("select id, created_at, kind, detail from outreach.events order by id desc limit :n"), {"n": limit}
        )
    ]


@router.get("/review", response_model=list[s.ReviewItem])
def list_review(db: Session = Depends(get_db)):
    return [dict(r._mapping) for r in db.execute(REVIEW_SQL)]


@router.post("/messages/{message_id}/resolve", response_model=s.MessageRead)
def resolve_message(message_id: UUID, body: s.ResolveAction, db: Session = Depends(get_db)):
    current = db.execute(
        text(
            "select m.status, m.email_sent_id, r.status as recipient_status from outreach.messages m "
            "join outreach.recipients r on r.id = m.recipient_id where m.id = :id"
        ),
        {"id": message_id},
    ).first()
    if current is None:
        raise HTTPException(status_code=404, detail="Message not found.")
    if current.status not in ("needs_review", "failed"):
        raise HTTPException(status_code=409, detail="Only stuck or failed messages can be resolved.")
    if body.action == "retry" and current.recipient_status != "active":
        raise HTTPException(status_code=409, detail="This person's sequence has stopped, so it cannot be retried.")
    if current.email_sent_id is not None:
        db.execute(
            text("update emails_sent set status = 'failed' where id = :id and status = 'queued'"),
            {"id": current.email_sent_id},
        )
    row = db.execute(
        text(
            "update outreach.messages set "
            "status = case when :a = 'retry' then 'approved'::outreach.message_status else 'skipped'::outreach.message_status end, "
            "email_sent_id = null, due_at = case when :a = 'retry' then now() else due_at end, "
            "error = case when :a = 'retry' then null else 'Skipped by staff' end "
            "where id = :id returning id, step, status, subject, body, due_at, error, email_sent_id"
        ),
        {"a": body.action, "id": message_id},
    ).first()
    db.commit()
    return dict(row._mapping)


@router.get("/sent-origins", response_model=list[s.SentOrigin])
def sent_origins(db: Session = Depends(get_db)):
    return [
        dict(r._mapping)
        for r in db.execute(
            text(
                "select m.email_sent_id, c.name as campaign, m.step from outreach.messages m "
                "join outreach.recipients r on r.id = m.recipient_id "
                "join outreach.campaigns c on c.id = r.campaign_id "
                "where m.email_sent_id is not null order by m.updated_at desc limit 5000"
            )
        )
    ]
```

In `backend/app/main.py`, extend the import to
`from routers import enquiries, outreach, outreach_ops, resources, stats` and add after the
outreach line:

```python
app.include_router(outreach_ops.router, dependencies=STAFF_ONLY)
```

In `backend/app/routers/stats.py`, replace the last line of the select list,
`(select count(*) from enquiries where status = 'new')                        as enquiries_new`,
with:

```sql
      (select count(*) from enquiries where status = 'new')                        as enquiries_new,
      (select paused from outreach.engine_state)                                   as outreach_paused,
      (select sending_enabled from outreach.engine_state)                          as outreach_sending_enabled,
      (select coalesce(sum(sent_today), 0) from outreach.mailboxes
        where counter_date = (now() at time zone 'Asia/Kolkata')::date)            as outreach_sent_today,
      (select count(*) from outreach.messages where status = 'approved')           as outreach_queued
```

- [ ] **Step 5: Run the ops tests, then the whole desk suite**

Run: `backend\.venv\Scripts\python -m pytest backend\tests\test_api_outreach_ops.py -q`
Expected: `7 passed`.

Run: `backend\.venv\Scripts\python -m pytest backend\tests -q`
Expected: all pass. Read the summary line; zero failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/outreach_ops.py backend/app/schemas.py backend/app/main.py backend/app/routers/stats.py backend/tests/test_api_outreach_ops.py
git commit -m "feat(api): outreach engine state, mailboxes, review and overview numbers"
```

---

### Task 6: Campaigns screen

**Files:**
- Modify: `frontend/src/api/client.js`, `frontend/src/api/resources.js`,
  `frontend/src/App.jsx`, `frontend/src/components/layout/Sidebar.jsx`,
  `frontend/src/lib/screens.js`
- Create: `frontend/src/pages/Campaigns.jsx`

**Interfaces:**
- Consumes: Task 3–5 routes.
- Produces:
  - `http(path, { form })` sends a `FormData` body.
  - `outreach` handle in `resources.js` (used by Tasks 6–7).
  - Route `/campaigns`.

- [ ] **Step 1: Teach `http()` to send a form**

In `frontend/src/api/client.js`, change the signature line to
`export async function http(path, { method = 'GET', body, query, form } = {}) {`. Change
the fetch call to:

```js
    response = await fetch(url, {
      method,
      headers,
      body: form !== undefined ? form : body === undefined ? undefined : JSON.stringify(body),
    })
```

The `Content-Type` header stays tied to `body !== undefined`. With `form`, the browser sets
the multipart boundary itself.

- [ ] **Step 2: Add the API handle**

Append to `frontend/src/api/resources.js`:

```js
const formOf = (fields) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return form
}

/** The outreach engine, through the desk API (campaigns, queue, controls). */
export const outreach = {
  campaigns: () => http('/outreach/campaigns'),
  campaign: (id) => http(`/outreach/campaigns/${id}`),
  recipients: (id) => http(`/outreach/campaigns/${id}/recipients`),
  inspectCsv: (file) => http('/outreach/csv-columns', { method: 'POST', form: formOf({ file }) }),
  createCampaign: ({ name, file, steps }) =>
    http('/outreach/campaigns', { method: 'POST', form: formOf({ name, steps: JSON.stringify(steps), file }) }),
  queue: (id) => http(`/outreach/campaigns/${id}/queue`, { method: 'POST' }),
  removeCampaign: (id) => http(`/outreach/campaigns/${id}`, { method: 'DELETE' }),
  editMessage: (id, payload) => http(`/outreach/messages/${id}`, { method: 'PATCH', body: payload }),
  stopRecipient: (id) => http(`/outreach/recipients/${id}/stop`, { method: 'POST' }),
  state: () => http('/outreach/state'),
  setPaused: (paused, reason) => http('/outreach/state', { method: 'PATCH', body: { paused, reason } }),
  mailboxes: () => http('/outreach/mailboxes'),
  updateMailbox: (email, payload) =>
    http(`/outreach/mailboxes/${encodeURIComponent(email)}`, { method: 'PATCH', body: payload }),
  events: () => http('/outreach/events', { query: { limit: 50 } }),
  review: () => http('/outreach/review'),
  resolve: (id, action) => http(`/outreach/messages/${id}/resolve`, { method: 'POST', body: { action } }),
  sentOrigins: () => http('/outreach/sent-origins'),
}
```

- [ ] **Step 3: Write the screen**

Create `frontend/src/pages/Campaigns.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react'
import { Megaphone, Plus, Send } from 'lucide-react'
import { outreach } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { DataTable } from '../components/data/DataTable.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { Drawer, DetailSection } from '../components/ui/Drawer.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Field, TextArea, TextField, TextInput } from '../components/ui/Field.jsx'
import { FormDrawer } from '../components/data/FormDrawer.jsx'
import { formatDateTime, relativeTime } from '../lib/format.js'

const DEFAULT_STEPS = [
  { step: 1, subject: 'A quick idea for {company}', body: 'Hi {first_name},\n\n', wait_days: 1 },
  { step: 2, subject: 'Re: A quick idea for {company}', body: 'Hi {first_name},\n\nFollowing up on my note below.', wait_days: 3 },
  { step: 3, subject: 'Re: A quick idea for {company}', body: 'Hi {first_name},\n\nOne last note from me.', wait_days: 4 },
]

const MESSAGE_TONE = {
  draft: 'text-ink-3',
  approved: 'text-accent',
  sending: 'text-heat-3',
  sent: 'text-[#00e093]',
  failed: 'text-heat-1',
  skipped: 'text-ink-3',
  needs_review: 'text-heat-2',
}

export default function Campaigns() {
  const list = useAsync(() => outreach.campaigns(), [])
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(null)
  const rows = list.data ?? []

  const columns = [
    { key: 'name', header: 'Campaign', width: '30%', render: (c) => <span className="text-ink">{c.name}</span> },
    { key: 'recipients', header: 'People', width: '10%', align: 'right', mono: true },
    { key: 'drafts', header: 'Drafts', width: '10%', align: 'right', mono: true },
    { key: 'queued', header: 'Queued', width: '10%', align: 'right', mono: true },
    { key: 'sent', header: 'Sent', width: '10%', align: 'right', mono: true },
    { key: 'replied', header: 'Replied', width: '10%', align: 'right', mono: true },
    {
      key: 'problems',
      header: 'Problems',
      width: '10%',
      align: 'right',
      mono: true,
      render: (c) => <span className={c.problems ? 'text-heat-1' : 'text-ink-3'}>{c.problems}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      width: '10%',
      align: 'right',
      sortValue: (c) => new Date(c.created_at).getTime(),
      render: (c) => <span className="text-ink-2">{relativeTime(c.created_at)}</span>,
    },
  ]

  return (
    <Screen>
      <PageHeader
        title="Campaigns"
        count={list.loading ? null : rows.length}
        description="Upload a list, write the emails, queue them; the engine sends within caps and hours"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New campaign
          </Button>
        }
      />
      <Panel>
        <DataTable
          columns={columns}
          rows={rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onRowClick={(c) => setOpenId(c.id)}
          activeId={openId}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          empty={
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              body="Upload a CSV of people (an Apollo export works as it is), write up to three emails, then queue them."
              action={<Button variant="primary" onClick={() => setCreating(true)}>New campaign</Button>}
            />
          }
        />
      </Panel>

      <NewCampaign
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false)
          list.reload()
          setOpenId(id)
        }}
      />
      <CampaignDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />
    </Screen>
  )
}

function NewCampaign({ open, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [followUps, setFollowUps] = useState(true)
  const [steps, setSteps] = useState(DEFAULT_STEPS)
  const [report, setReport] = useState(null)
  const lastField = useRef({ step: 1, field: 'body' })
  const save = useSave()
  const inspect = useSave()

  function reset() {
    setName('')
    setFile(null)
    setPreview(null)
    setSteps(DEFAULT_STEPS)
    setFollowUps(true)
    setReport(null)
    save.clear()
  }

  async function chooseFile(event) {
    const chosen = event.target.files?.[0] ?? null
    setFile(chosen)
    setPreview(null)
    if (chosen) await inspect.run(async () => setPreview(await outreach.inspectCsv(chosen)))
  }

  const setStep = (step, field) => (event) =>
    setSteps((all) => all.map((s) => (s.step === step ? { ...s, [field]: event.target.value } : s)))

  function insertTag(tag) {
    const { step, field } = lastField.current
    setSteps((all) => all.map((s) => (s.step === step ? { ...s, [field]: s[field] + '{' + tag + '}' } : s)))
  }

  async function submit() {
    const chosen = followUps ? steps : steps.slice(0, 1)
    let result = null
    const ok = await save.run(async () => {
      result = await outreach.createCampaign({
        name,
        file,
        steps: chosen.map((s) => ({ ...s, wait_days: Number(s.wait_days) })),
      })
    })
    if (ok) setReport(result)
  }

  const visible = followUps ? steps : steps.slice(0, 1)

  return (
    <Drawer
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={report ? 'Campaign created' : 'New campaign'}
      subtitle={report ? name : 'Nothing is sent until you queue it, and the engine is unpaused'}
      width="max-w-2xl"
      footer={
        report ? (
          <Button
            variant="primary"
            onClick={() => {
              const id = report.campaign_id
              reset()
              onCreated(id)
            }}
          >
            Review the drafts
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={save.busy || !name.trim() || !file} onClick={submit}>
              {save.busy ? 'Checking addresses…' : 'Create drafts'}
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="space-y-2 p-4 text-sm">
          <p className="text-ink">{report.added} people added, each with their drafts.</p>
          <ul className="space-y-1 text-ink-2">
            <li>{report.already_contacted} skipped: already emailed before</li>
            <li>{report.suppressed} skipped: on the do-not-email list or erased</li>
            <li>{report.duplicates} skipped: listed twice in the file</li>
            <li>{report.bad_domain} skipped: their domain does not exist or takes no mail</li>
            <li>{report.invalid} skipped: not a valid address</li>
          </ul>
          {report.unknown_tags.length > 0 && (
            <p className="text-heat-2">
              These tags matched no column and were left as written: {report.unknown_tags.map((t) => '{' + t + '}').join(' ')}.
              Edit those drafts before queueing.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <TextField label="Campaign name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="CA firms, Mumbai, November" />
          <Field label="People (CSV)" required hint="Needs an email column. Save from Excel as CSV UTF-8.">
            <TextInput type="file" accept=".csv,text/csv" onChange={chooseFile} />
          </Field>
          {inspect.error && <p className="text-sm text-heat-1">{inspect.error}</p>}
          {preview && (
            <div className="text-xs text-ink-2">
              <p className="mb-1">
                {preview.rows} rows{preview.is_apollo ? ' · Apollo export' : ''}. Click a tag to add it where you were typing:
              </p>
              <div className="flex flex-wrap gap-1">
                {['first_name', 'name', 'company', 'role', ...preview.columns.map((c) => c.tag)]
                  .filter((tag, i, all) => all.indexOf(tag) === i)
                  .map((tag) => (
                    <button key={tag} type="button" className="rounded-control bg-raised px-1.5 py-0.5 text-ink hover:bg-raised-2" onClick={() => insertTag(tag)}>
                      {'{' + tag + '}'}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={followUps} onChange={(e) => setFollowUps(e.target.checked)} />
            Send two follow-ups to people who do not reply
          </label>
          {visible.map((s) => (
            <DetailSection key={s.step} title={s.step === 1 ? 'Email 1' : `Follow-up ${s.step - 1}`}>
              <div className="space-y-2 px-4 pb-3">
                {s.step > 1 && (
                  <TextField
                    label="Days after the previous email"
                    type="number"
                    min={1}
                    max={60}
                    value={s.wait_days}
                    onChange={setStep(s.step, 'wait_days')}
                  />
                )}
                <TextField
                  label="Subject"
                  value={s.subject}
                  onChange={setStep(s.step, 'subject')}
                  onFocus={() => (lastField.current = { step: s.step, field: 'subject' })}
                />
                <Field label="Message">
                  <TextArea
                    rows={6}
                    value={s.body}
                    onChange={setStep(s.step, 'body')}
                    onFocus={() => (lastField.current = { step: s.step, field: 'body' })}
                  />
                </Field>
              </div>
            </DetailSection>
          ))}
          {save.error && <p className="text-sm text-heat-1">{save.error}</p>}
        </div>
      )}
    </Drawer>
  )
}

function CampaignDrawer({ id, onClose, onChanged }) {
  const campaign = useAsync(() => (id ? outreach.campaign(id) : null), [id])
  const people = useAsync(() => (id ? outreach.recipients(id) : null), [id])
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const act = useSave()
  const save = useSave()

  const all = people.data ?? []
  const counts = useMemo(() => {
    const messages = all.flatMap((p) => p.messages)
    return {
      drafts: messages.filter((m) => m.status === 'draft').length,
      sent: messages.filter((m) => ['sent', 'sending', 'needs_review', 'failed'].includes(m.status)).length,
    }
  }, [all])

  const refresh = () => {
    people.reload()
    onChanged()
  }

  async function runConfirmed() {
    const ok = await act.run(async () => {
      if (confirm === 'queue') await outreach.queue(id)
      if (confirm === 'delete') await outreach.removeCampaign(id)
    })
    if (ok) {
      const was = confirm
      setConfirm(null)
      if (was === 'delete') {
        onChanged()
        onClose()
      } else refresh()
    }
  }

  async function saveMessage(values) {
    const ok = await save.run(() => outreach.editMessage(editing.id, { subject: values.subject, body: values.body }))
    if (ok) {
      setEditing(null)
      people.reload()
    }
  }

  return (
    <>
      <Drawer
        open={Boolean(id)}
        onClose={onClose}
        title={campaign.data?.name ?? 'Campaign'}
        subtitle={all.length + ' people'}
        width="max-w-3xl"
        footer={
          <>
            {counts.sent === 0 && (
              <Button variant="dangerGhost" onClick={() => { act.clear(); setConfirm('delete') }}>
                Delete campaign
              </Button>
            )}
            <Button variant="primary" disabled={counts.drafts === 0} onClick={() => { act.clear(); setConfirm('queue') }}>
              <Send size={14} /> Queue {counts.drafts} drafts
            </Button>
          </>
        }
      >
        <div className="divide-y divide-rule/60">
          {people.loading && <p className="p-4 text-xs text-ink-3">Loading…</p>}
          {all.map((person) => (
            <div key={person.id} className="px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {person.full_name} <span className="text-ink-3">· {person.email}</span>
                </span>
                <span className="text-xs text-ink-2">{person.status}{person.stop_reason ? ` (${person.stop_reason})` : ''}</span>
                {['pending', 'active'].includes(person.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await act.run(() => outreach.stopRecipient(person.id))) refresh()
                    }}
                  >
                    Stop
                  </Button>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {person.messages.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-ink-3">Email {m.step}</span>
                    <span className={'w-24 shrink-0 ' + (MESSAGE_TONE[m.status] ?? 'text-ink-2')}>{m.status.replace('_', ' ')}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{m.subject}</span>
                    {m.due_at && m.status === 'approved' && <span className="text-ink-3">due {formatDateTime(m.due_at)}</span>}
                    {['draft', 'approved'].includes(m.status) && (
                      <button type="button" className="text-accent hover:underline" onClick={() => { save.clear(); setEditing(m) }}>
                        Edit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {act.error && !confirm && <p className="p-4 text-sm text-heat-1">{act.error}</p>}
        </div>
      </Drawer>

      <FormDrawer
        value={editing}
        fields={[
          { name: 'subject', label: 'Subject', type: 'text', required: true },
          { name: 'body', label: 'Message', type: 'textarea', rows: 12, required: true },
        ]}
        busy={save.busy}
        error={save.error}
        onCancel={() => setEditing(null)}
        onSave={saveMessage}
        titleEdit={editing ? `Edit email ${editing.step}` : ''}
        subtitle="Only this person's copy changes"
        width="max-w-2xl"
      />

      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
        busy={act.busy}
        error={act.error}
        danger={confirm === 'delete'}
        confirmLabel={confirm === 'queue' ? 'Queue' : 'Delete'}
        title={confirm === 'queue' ? `Queue ${counts.drafts} drafts?` : 'Delete this campaign?'}
        body={
          confirm === 'queue'
            ? 'They will be sent by the engine within the daily caps and weekday hours, once the engine is unpaused. Anyone now on the do-not-email list is left out.'
            : 'Its people and drafts are removed. Their contact records stay.'
        }
      />
    </>
  )
}
```

- [ ] **Step 4: Route and navigation**

In `frontend/src/App.jsx`, add `import Campaigns from './pages/Campaigns.jsx'` after the
Overview import, and `<Route path="campaigns" element={<Campaigns />} />` before the
`emails` route.

In `frontend/src/lib/screens.js`, add
`'/campaigns': { key: 'campaigns', label: 'Campaigns', accent: '#c58cff' },` after the
`/enquiries` line.

In `frontend/src/components/layout/Sidebar.jsx`, add `Megaphone` to the lucide import
list in alphabetical position. Insert
`{ to: '/campaigns', label: 'Campaigns', icon: Megaphone },` as the **first** item of the
Pipeline group. Outreach starts the pipeline, so it comes before Enquiries.

- [ ] **Step 5: Build**

Run: `cd frontend; npm run build`
Expected: `✓ built in` with no errors. Warnings about chunk size are acceptable.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/resources.js frontend/src/pages/Campaigns.jsx frontend/src/App.jsx frontend/src/lib/screens.js frontend/src/components/layout/Sidebar.jsx
git commit -m "feat(web): Campaigns screen - upload, drafts, queue"
```

---

### Task 7: Mailboxes screen, Overview tile, Campaign column on Emails sent

**Files:**
- Create: `frontend/src/pages/Mailboxes.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/lib/screens.js`,
  `frontend/src/components/layout/Sidebar.jsx`, `frontend/src/pages/Overview.jsx`,
  `frontend/src/pages/Emails.jsx`

**Interfaces:**
- Consumes: the `outreach` handle (Task 6); Task 5 routes and Overview fields.
- Produces: route `/mailboxes`.

- [ ] **Step 1: Write the screen**

Create `frontend/src/pages/Mailboxes.jsx`:

```jsx
import { useState } from 'react'
import { AlertTriangle, Pause, Play } from 'lucide-react'
import { outreach } from '../api/resources.js'
import { useAsync } from '../hooks/useAsync.js'
import { useSave } from '../hooks/useSave.js'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { DetailSection } from '../components/ui/Drawer.jsx'
import { ErrorState } from '../components/ui/EmptyState.jsx'
import { TextInput } from '../components/ui/Field.jsx'
import { formatDateTime, relativeTime } from '../lib/format.js'

export default function Mailboxes() {
  const state = useAsync(() => outreach.state(), [])
  const boxes = useAsync(() => outreach.mailboxes(), [])
  const review = useAsync(() => outreach.review(), [])
  const events = useAsync(() => outreach.events(), [])
  const [confirmUnpause, setConfirmUnpause] = useState(false)
  const act = useSave()
  const s = state.data

  const reloadAll = () => {
    state.reload()
    boxes.reload()
    review.reload()
    events.reload()
  }

  async function setPaused(paused) {
    if (await act.run(() => outreach.setPaused(paused))) {
      setConfirmUnpause(false)
      reloadAll()
    }
  }

  return (
    <Screen>
      <PageHeader title="Mailboxes" description="The outreach engine: on/off, daily caps, inbox checks, anything needing a person" />
      <Panel className="overflow-y-auto">
        {state.error ? (
          <ErrorState error={state.error} onRetry={state.reload} />
        ) : (
          <DetailSection title="Engine">
            <div className="space-y-2 px-4 pb-4 text-sm">
              <div className="flex items-center gap-3">
                <span className={'text-base ' + (s?.paused ? 'text-heat-2' : 'text-[#00e093]')}>
                  {s ? (s.paused ? 'Paused' : 'Active') : '…'}
                </span>
                {s?.paused_reason && <span className="text-ink-2">{s.paused_reason}</span>}
                <span className="ml-auto" />
                {s && (s.paused ? (
                  <Button variant="primary" onClick={() => { act.clear(); setConfirmUnpause(true) }}>
                    <Play size={14} /> Unpause
                  </Button>
                ) : (
                  <Button onClick={() => setPaused(true)}>
                    <Pause size={14} /> Pause now
                  </Button>
                ))}
              </div>
              {s && !s.sending_enabled && (
                <p className="flex items-center gap-1.5 text-heat-3">
                  <AlertTriangle size={14} /> Sending is switched off on the engine itself (Stage 2 turns it on). Replies are still read and logged.
                </p>
              )}
              <p className="text-ink-2">
                Last cycle {s?.last_cycle_at ? relativeTime(s.last_cycle_at) : 'never'}
                {s?.engine_version ? ` · engine ${s.engine_version}` : ''} · {s?.queued ?? '…'} queued
              </p>
              <p className={s?.inbox_status === 'error' ? 'text-heat-1' : 'text-ink-2'}>
                Inbox check: {s?.inbox_status ?? '…'}
                {s?.last_inbox_check_at ? ` (${relativeTime(s.last_inbox_check_at)})` : ''}
                {s?.inbox_detail ? ` — ${s.inbox_detail}` : ''}
              </p>
              {act.error && !confirmUnpause && <p className="text-heat-1">{act.error}</p>}
            </div>
          </DetailSection>
        )}

        <DetailSection title="Mailboxes">
          <div className="divide-y divide-rule/60">
            {(boxes.data ?? []).length === 0 && !boxes.loading && (
              <p className="px-4 py-3 text-sm text-ink-3">No mailboxes yet. They appear after the engine's first cycle on Render.</p>
            )}
            {(boxes.data ?? []).map((box) => (
              <MailboxRow key={box.email} box={box} onSaved={boxes.reload} />
            ))}
          </div>
        </DetailSection>

        <DetailSection title={`Needs a person (${(review.data ?? []).length})`}>
          <ul className="divide-y divide-rule/60">
            {(review.data ?? []).length === 0 && <li className="px-4 py-3 text-sm text-ink-3">Nothing stuck or failed.</li>}
            {(review.data ?? []).map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{item.full_name}</span> <span className="text-ink-3">· {item.email} · {item.campaign} · email {item.step}</span>
                  <span className="block truncate text-xs text-heat-2">{item.error}</span>
                </span>
                <Button size="sm" onClick={async () => { if (await act.run(() => outreach.resolve(item.id, 'retry'))) reloadAll() }}>Retry</Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (await act.run(() => outreach.resolve(item.id, 'skip'))) reloadAll() }}>Skip</Button>
              </li>
            ))}
          </ul>
        </DetailSection>

        <DetailSection title="Recent engine events">
          <ul className="divide-y divide-rule/60 pb-2">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-1.5 text-xs">
                <span className="tnum w-36 shrink-0 text-ink-3">{formatDateTime(e.created_at)}</span>
                <span className="w-28 shrink-0 text-ink-2">{e.kind}</span>
                <span className="min-w-0 flex-1 text-ink">{e.detail}</span>
              </li>
            ))}
          </ul>
        </DetailSection>
      </Panel>

      <ConfirmDialog
        open={confirmUnpause}
        onCancel={() => setConfirmUnpause(false)}
        onConfirm={() => setPaused(false)}
        busy={act.busy}
        error={act.error}
        danger={false}
        confirmLabel="Unpause"
        title="Unpause the engine?"
        body="Queued emails will start going out within the daily caps, on weekdays 10:00–17:00 India time."
      />
    </Screen>
  )
}

function MailboxRow({ box, onSaved }) {
  const [cap, setCap] = useState(String(box.daily_cap))
  const save = useSave()
  const update = async (payload) => {
    if (await save.run(() => outreach.updateMailbox(box.email, payload))) onSaved()
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-ink">
        {box.email}
        {!box.configured && <span className="ml-2 text-xs text-heat-2">not configured on the engine</span>}
      </span>
      <span className="tnum text-ink-2">{box.sent_today} sent today</span>
      <TextInput className="w-20" type="number" min={0} max={500} value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Daily cap" />
      <Button size="sm" disabled={save.busy || cap === String(box.daily_cap)} onClick={() => update({ daily_cap: Number(cap) })}>
        Save cap
      </Button>
      <Button size="sm" variant={box.is_active ? 'ghost' : 'primary'} onClick={() => update({ is_active: !box.is_active })}>
        {box.is_active ? 'Switch off' : 'Switch on'}
      </Button>
      {save.error && <span className="text-xs text-heat-1">{save.error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Route and navigation**

In `App.jsx`, add `import Mailboxes from './pages/Mailboxes.jsx'` and
`<Route path="mailboxes" element={<Mailboxes />} />` before the `suppressions` route.

In `screens.js`, add
`'/mailboxes': { key: 'mailboxes', label: 'Mailboxes', accent: '#ff9f43' },` before
`/suppressions`.

In `Sidebar.jsx`, add `Mailbox` to the lucide import and make the Safety group:

```js
  {
    heading: 'Safety',
    items: [
      { to: '/mailboxes', label: 'Mailboxes', icon: Mailbox },
      { to: '/suppressions', label: 'Do-not-email', icon: MailX },
    ],
  },
```

- [ ] **Step 3: Overview tile**

In `frontend/src/pages/Overview.jsx`, insert a tile directly after the "New enquiries"
`StatTile`:

```jsx
            <StatTile
              label="Outreach"
              value={s ? (s.outreach_paused || !s.outreach_sending_enabled ? 'Paused' : 'Active') : '…'}
              sub={s ? s.outreach_sent_today + ' sent today · ' + s.outreach_queued + ' queued' : null}
              accent={s && !s.outreach_paused && s.outreach_sending_enabled ? '#00e093' : '#ff9f43'}
            />
```

- [ ] **Step 4: Campaign column on Emails sent**

In `frontend/src/pages/Emails.jsx`:

- Add `outreach` to the import from `'../api/resources.js'`.
- After the `contactName` line, add:

```jsx
  const origins = useAsync(() => outreach.sentOrigins(), [])
  const originById = useMemo(
    () => Object.fromEntries((origins.data ?? []).map((o) => [o.email_sent_id, o])),
    [origins.data],
  )
```

Then insert this column object directly after the `sent_at` column:

```jsx
    {
      key: 'campaign',
      header: 'Campaign',
      width: '14%',
      sortValue: (e) => originById[e.id]?.campaign ?? null,
      render: (e) =>
        originById[e.id] ? (
          <span className="text-ink-2">
            {originById[e.id].campaign} · {originById[e.id].step}
          </span>
        ) : (
          <span className="text-ink-3">By hand</span>
        ),
    },
```

Rebalance the widths so they still sum to 100%. Change `contact_id` from `'17%'` to
`'13%'`, and take the other 10 points from the subject column, the widest text column.

- [ ] **Step 5: Build**

Run: `cd frontend; npm run build`
Expected: `✓ built in` with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Mailboxes.jsx frontend/src/App.jsx frontend/src/lib/screens.js frontend/src/components/layout/Sidebar.jsx frontend/src/pages/Overview.jsx frontend/src/pages/Emails.jsx
git commit -m "feat(web): Mailboxes screen, Outreach tile, campaign column on Emails sent"
```

---

### Task 8: Engine repo — strip the desktop app and scaffold the worker

**Files (engine repo):**
- Delete: `backend/`, `_dashboard.html`, `desktop-python.txt`, `desktop_launcher.cs`,
  `desktop_server.py`, `migrate.py`, `run.py`, `setup_templates.py`, `test_setup.py`,
  `test_upload.bat`, `test_upload.py`, `tests/`
- Create: `engine/__init__.py`, `engine/config.py`, `engine/db.py`, `requirements.txt`
  (replace), `requirements-dev.txt`, `.env.example` (replace), `render.yaml`, `README.md`
  (replace), `tests/__init__.py` (empty), `tests/conftest.py`, `tests/test_config.py`

**Interfaces:**
- Produces:
  - `engine.VERSION = "2.0.0"`
  - `engine.config.Mailbox(email: str, password: str)` (frozen dataclass)
  - `engine.config.Settings` with fields:
    - `database_url, smtp_host, smtp_port, imap_host, imap_port`
    - `mailbox_{1,2,3}_{email,password}`
    - `sender_name, sender_signature, timezone, send_window_start, send_window_end`
    - `cycle_minutes, max_per_cycle, min_gap_seconds, max_gap_seconds`
    - `bounce_pause_percent, bounce_min_sends, inbox_lookback_days, reply_fallback_days`
    - `sending_enabled`
    - method `mailboxes() -> list[Mailbox]`
  - `engine.db.connect(url) -> psycopg2 connection` (RealDictCursor, autocommit off)
  - **Test helpers in `tests/conftest.py`:**
    - fixture `db`, a fresh database with the desk's migrations;
    - `rows`, `one`, `insert`, `make_contact`, `make_campaign`, `make_recipient`,
      `make_message`, `settings(**overrides) -> Settings`.

- [ ] **Step 1: Clone and branch**

```bash
cd C:\Users\BARNAK\Desktop
git clone https://github.com/Xenomorph27/emailauto-LT.git
cd emailauto-LT
git checkout -b feat/hosted-engine
py -3.12 -m venv .venv
```

- [ ] **Step 2: Remove the desktop app**

```bash
git rm -r -q backend tests _dashboard.html desktop-python.txt desktop_launcher.cs desktop_server.py migrate.py run.py setup_templates.py test_setup.py test_upload.bat test_upload.py
```

Keep `samples/sample_leads.csv` and `.gitignore`. Append to `.gitignore`:
`.pytest_cache/` and `*.sqlite3`.

- [ ] **Step 3: Requirements**

`requirements.txt`:

```
psycopg2-binary==2.9.12
pydantic==2.13.4
pydantic-settings==2.15.0
tzdata==2025.2
```

`requirements-dev.txt`:

```
-r requirements.txt
pytest==8.4.2
```

Run: `.venv\Scripts\python -m pip install -r requirements-dev.txt -q`
Expected: exits 0.

- [ ] **Step 4: Write the failing config test and the conftest**

`tests/__init__.py`: empty file.

`tests/conftest.py`:

```python
"""
Engine tests run against a real Postgres carrying the DESK's migrations, so
the engine is tested against the same triggers and constraints it meets live.

    (desk repo)   .\\scripts\\test-db.ps1 start
    (engine repo) .venv\\Scripts\\python -m pytest -q

DESK_REPO_DIR points at the desk checkout (default: ..\\Lambtech).
The database named by TEST_DATABASE_URL is WIPED.
"""

import glob
import os
import sys

import psycopg2
import psycopg2.extras
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, ROOT)

DESK = os.environ.get("DESK_REPO_DIR", os.path.abspath(os.path.join(ROOT, "..", "Lambtech")))
MIGRATIONS = os.path.join(DESK, "supabase", "migrations")
TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres@localhost:54329/lambtech_engine_test")
if "supabase" in TEST_DB or "pooler" in TEST_DB:
    raise RuntimeError("TEST_DATABASE_URL points at a hosted database. The tests wipe it. Refusing.")

BOOTSTRAP = """
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
drop schema if exists outreach cascade;
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


def _ensure_database():
    base, name = TEST_DB.rsplit("/", 1)
    admin = psycopg2.connect(base + "/postgres")
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute("select 1 from pg_database where datname = %s", (name,))
        if cur.fetchone() is None:
            cur.execute(f'create database "{name}"')
    admin.close()


@pytest.fixture(scope="session", autouse=True)
def migrated():
    files = sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql")))
    if not files:
        raise RuntimeError(f"No desk migrations found in {MIGRATIONS}. Set DESK_REPO_DIR.")
    _ensure_database()
    conn = psycopg2.connect(TEST_DB)
    conn.autocommit = True
    with conn.cursor() as cur:
        name = conn.get_dsn_parameters()["dbname"]
        cur.execute(f'alter database "{name}" set search_path = "$user", public, extensions')
        cur.execute(BOOTSTRAP)
        for path in files:
            with open(path, encoding="utf-8") as handle:
                cur.execute(handle.read())
    conn.close()


@pytest.fixture
def db():
    conn = psycopg2.connect(TEST_DB, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("select schemaname, tablename from pg_tables where schemaname in ('public', 'outreach')")
        tables = [f'"{r["schemaname"]}"."{r["tablename"]}"' for r in cur.fetchall()]
        cur.execute("truncate " + ", ".join(tables) + " restart identity cascade")
        cur.execute("insert into outreach.engine_state default values on conflict do nothing")
    yield conn
    conn.close()


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


def make_contact(conn, **values):
    return insert(conn, "contacts", **{"full_name": "Ravi Kumar", "email": "ravi@acme.com", "source": "import", **values})


def make_campaign(conn, name="Q4 CA firms", steps=3):
    campaign = insert(conn, "outreach.campaigns", name=name, created_by="test")
    for step, wait in zip(range(1, steps + 1), (1, 3, 4)):
        insert(conn, "outreach.steps", campaign_id=campaign["id"], step=step,
               subject_template="s", body_template="b", wait_days=wait)
    return campaign


def make_recipient(conn, campaign, contact, **values):
    return insert(conn, "outreach.recipients",
                  **{"campaign_id": campaign["id"], "contact_id": contact["id"], "status": "active", **values})


def make_message(conn, recipient, step, **values):
    return insert(conn, "outreach.messages",
                  **{"recipient_id": recipient["id"], "step": step, "subject": f"Subject {step}",
                     "body": f"Body {step}", "status": "approved", **values})


def settings(**overrides):
    from engine.config import Settings

    base = {
        "database_url": TEST_DB,
        "mailbox_1_email": "ceo@lambtech.in",
        "mailbox_1_password": "pw",
        "sending_enabled": True,
        "min_gap_seconds": 0,
        "max_gap_seconds": 0,
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)
```

`tests/test_config.py`:

```python
from conftest import settings


def test_mailboxes_need_both_address_and_password():
    s = settings(mailbox_2_email="Sales@LambTech.in", mailbox_2_password="x", mailbox_3_email="nopass@lambtech.in")
    assert [m.email for m in s.mailboxes()] == ["ceo@lambtech.in", "sales@lambtech.in"]


def test_defaults_are_safe():
    from engine.config import Settings

    s = Settings(_env_file=None)
    assert s.sending_enabled is False
    assert s.timezone == "Asia/Kolkata"
    assert (s.send_window_start, s.send_window_end) == ("10:00", "17:00")
    assert s.max_per_cycle == 5 and s.cycle_minutes == 5
```

Run: `.venv\Scripts\python -m pytest -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'engine'`.

- [ ] **Step 5: Write the package**

`engine/__init__.py`:

```python
"""LambTech outreach engine: the hosted bot (desk spec 2026-11-18)."""

VERSION = "2.0.0"
```

`engine/config.py`:

```python
from dataclasses import dataclass

from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass(frozen=True)
class Mailbox:
    email: str
    password: str


class Settings(BaseSettings):
    """Everything comes from the environment (Render) or a local .env. Never from the database."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    smtp_host: str = "smtp.titan.email"
    smtp_port: int = 465
    imap_host: str = "imap.titan.email"
    imap_port: int = 993
    mailbox_1_email: str = ""
    mailbox_1_password: str = ""
    mailbox_2_email: str = ""
    mailbox_2_password: str = ""
    mailbox_3_email: str = ""
    mailbox_3_password: str = ""
    sender_name: str = "Jonathan Jaladi"
    sender_signature: str = "LambTech | https://lambtech.in"
    timezone: str = "Asia/Kolkata"
    send_window_start: str = "10:00"
    send_window_end: str = "17:00"
    cycle_minutes: int = 5
    max_per_cycle: int = 5
    min_gap_seconds: float = 8.0
    max_gap_seconds: float = 18.0
    bounce_pause_percent: float = 5.0
    bounce_min_sends: int = 10
    inbox_lookback_days: int = 14
    reply_fallback_days: int = 30
    sending_enabled: bool = False

    def mailboxes(self) -> list:
        found = []
        for index in (1, 2, 3):
            email = getattr(self, f"mailbox_{index}_email").strip().lower()
            password = getattr(self, f"mailbox_{index}_password")
            if email and password:
                found.append(Mailbox(email, password))
        return found
```

`engine/db.py`:

```python
import psycopg2
import psycopg2.extras


def connect(url: str):
    """One connection per cycle. Session pooler (port 5432) keeps advisory locks valid for the session."""
    conn = psycopg2.connect(
        url,
        cursor_factory=psycopg2.extras.RealDictCursor,
        connect_timeout=15,
        application_name="lambtech-outreach-engine",
    )
    conn.autocommit = False
    return conn
```

- [ ] **Step 6: Run the config tests**

Run: `.venv\Scripts\python -m pytest -q`
Expected: `2 passed`. This also proves the desk migrations apply into
`lambtech_engine_test`.

- [ ] **Step 7: Deploy files**

`.env.example`:

```
# Local runs only. On Render these are typed into the service's Environment page.
DATABASE_URL=postgresql://postgres@localhost:54329/lambtech_engine_test
MAILBOX_1_EMAIL=ceo@lambtech.in
MAILBOX_1_PASSWORD=
SMTP_HOST=smtp.titan.email
SMTP_PORT=465
IMAP_HOST=imap.titan.email
IMAP_PORT=993
SENDER_NAME=Jonathan Jaladi
SENDING_ENABLED=false
```

`render.yaml`:

```yaml
# Render Blueprint for the LambTech outreach engine: a background worker
# (no public address). Render > New > Blueprint > this repository.
# Values marked sync: false are typed into Render, never committed.
services:
  - type: worker
    name: lambtech-outreach-engine
    runtime: python
    plan: starter # always on; the free plan has no workers
    region: singapore
    buildCommand: pip install -r requirements.txt
    startCommand: python -m engine
    autoDeploy: true
    envVars:
      - key: PYTHON_VERSION
        value: 3.12.7
      - key: TZ
        value: Asia/Kolkata
      # Same value as the desk API: Supabase > Connect > Session pooler (port 5432).
      - key: DATABASE_URL
        sync: false
      - key: MAILBOX_1_EMAIL
        sync: false
      - key: MAILBOX_1_PASSWORD
        sync: false
      - key: MAILBOX_2_EMAIL
        sync: false
      - key: MAILBOX_2_PASSWORD
        sync: false
      - key: MAILBOX_3_EMAIL
        sync: false
      - key: MAILBOX_3_PASSWORD
        sync: false
      - key: SMTP_HOST
        value: smtp.titan.email
      - key: IMAP_HOST
        value: imap.titan.email
      - key: SENDER_NAME
        value: Jonathan Jaladi
      # Stage 2 sets this to true. Until then replies are read and logged; nothing is sent.
      - key: SENDING_ENABLED
        value: "false"
```

`README.md`:

```markdown
# LambTech outreach engine

The hosted outreach bot. A background worker on Render that, every 5 minutes:

1. reads the outreach mailboxes and logs every reply in the LambTech Desk
   (Responses), typed as negative / unsubscribe / auto-reply / unclassified;
2. sends whatever is due, logging each email in the desk (Emails sent),
   within the daily caps and weekday 10:00–17:00 India time.

Campaigns, drafts, caps and the pause switch are managed in the desk
(Campaigns and Mailboxes screens). The schema lives in the desk repo
(`supabase/migrations`); this repo holds no migrations.

Design: desk repo `docs/superpowers/specs/2026-11-18-lambtech-outreach-engine-design.md`.
Started from Jonathan Jaladi's desktop bot (`jonathan-jaladi/emailauto-LT`).

## Run the tests

Needs the desk repo checked out beside this one and its test database running
(`.\scripts\test-db.ps1 start` in the desk repo, from an interactive terminal).

    py -3.12 -m venv .venv
    .venv\Scripts\python -m pip install -r requirements-dev.txt
    .venv\Scripts\python -m pytest -q

## Import the desktop bot's history (once)

    .venv\Scripts\python -m scripts.import_sqlite C:\path\to\outreach.db          # dry run
    .venv\Scripts\python -m scripts.import_sqlite C:\path\to\outreach.db --apply  # writes

The desktop copy must be stopped for good first; two copies would email people twice.
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: strip the desktop app; scaffold the hosted engine worker"
```

---

### Task 9: India-time clock and reply classification

**Files (engine repo):**
- Create: `engine/clock.py`, `engine/classify.py`
- Test: `tests/test_clock.py`, `tests/test_classify.py`

**Interfaces:**
- Produces:
  - **`clock`:**
    - `clock.in_window(at: datetime, tz: str, start: str, end: str) -> bool`
    - `clock.next_window(at: datetime, tz: str, start: str, end: str) -> datetime` (UTC,
      aware)
    - `clock.local_date(at, tz) -> date`
    - All of these raise `ValueError` on a naive datetime.
  - **`classify`:**
    - `classify.strip_quoted(body: str) -> str`
    - `classify.is_auto_reply(headers: dict, subject: str) -> bool`
    - `classify.reply_category(body: str, subject: str, headers: dict) -> str` →
      `unsubscribe|negative|auto_reply|unclassified`

- [ ] **Step 1: Write the failing tests**

`tests/test_clock.py`:

```python
from datetime import datetime, timezone

import pytest

from engine import clock

TZ = "Asia/Kolkata"


def ist(y, m, d, hh, mm):
    """A time on the India clock (UTC+05:30)."""
    return datetime.fromisoformat(f"{y:04d}-{m:02d}-{d:02d}T{hh:02d}:{mm:02d}:00+05:30")


def test_in_window_weekday_hours_only():
    assert clock.in_window(ist(2026, 11, 18, 10, 0), TZ, "10:00", "17:00")       # Wednesday
    assert not clock.in_window(ist(2026, 11, 18, 9, 59), TZ, "10:00", "17:00")
    assert not clock.in_window(ist(2026, 11, 18, 17, 1), TZ, "10:00", "17:00")
    assert not clock.in_window(ist(2026, 11, 21, 12, 0), TZ, "10:00", "17:00")   # Saturday


def test_in_window_uses_india_time_not_utc():
    # 05:00 UTC is 10:30 in India
    assert clock.in_window(datetime(2026, 11, 18, 5, 0, tzinfo=timezone.utc), TZ, "10:00", "17:00")


def test_next_window_moves_evening_and_weekend_to_the_next_working_morning():
    assert clock.next_window(ist(2026, 11, 18, 18, 0), TZ, "10:00", "17:00") == ist(2026, 11, 19, 10, 0)
    assert clock.next_window(ist(2026, 11, 20, 18, 0), TZ, "10:00", "17:00") == ist(2026, 11, 23, 10, 0)
    assert clock.next_window(ist(2026, 11, 21, 12, 0), TZ, "10:00", "17:00") == ist(2026, 11, 23, 10, 0)
    assert clock.next_window(ist(2026, 11, 18, 8, 0), TZ, "10:00", "17:00") == ist(2026, 11, 18, 10, 0)
    inside = ist(2026, 11, 18, 11, 30)
    assert clock.next_window(inside, TZ, "10:00", "17:00") == inside
    assert clock.next_window(inside, TZ, "10:00", "17:00").tzinfo == timezone.utc


def test_naive_times_are_refused():
    with pytest.raises(ValueError):
        clock.in_window(datetime(2026, 11, 18, 11, 0), TZ, "10:00", "17:00")


def test_local_date_crosses_midnight_in_india_first():
    assert str(clock.local_date(datetime(2026, 11, 18, 19, 0, tzinfo=timezone.utc), TZ)) == "2026-11-19"
```

`tests/test_classify.py`:

```python
import pytest

from engine.classify import is_auto_reply, reply_category, strip_quoted


@pytest.mark.parametrize(
    "body, expected",
    [
        ("Please unsubscribe me.", "unsubscribe"),
        ("Remove me from your list", "unsubscribe"),
        ("stop", "unsubscribe"),
        ("Don't email me again", "unsubscribe"),
        ("Not interested, thanks.", "negative"),
        ("No.", "negative"),
        ("nope", "negative"),
        ("We're not interested at this time", "negative"),
        ("Sounds good, can we talk Tuesday?", "unclassified"),
        ("No problem, send me the deck", "unclassified"),
    ],
)
def test_reply_categories(body, expected):
    assert reply_category(body, "Re: A quick idea", {}) == expected


def test_quoted_text_and_our_footer_are_ignored():
    body = "Thanks, tell me more.\n\nOn Mon, Ravi wrote:\n> To opt out, reply unsubscribe\n> stop"
    assert strip_quoted(body) == "Thanks, tell me more."
    assert reply_category(body, "Re: hi", {}) == "unclassified"


def test_auto_replies_by_header_or_subject():
    assert is_auto_reply({"Auto-Submitted": "auto-replied"}, "Re: hi")
    assert not is_auto_reply({"Auto-Submitted": "no"}, "Re: hi")
    assert is_auto_reply({"X-Autoreply": "yes"}, "Re: hi")
    assert is_auto_reply({}, "Automatic reply: A quick idea")
    assert is_auto_reply({}, "Out of Office: back Monday")
    assert reply_category("I am away until Monday. Unsubscribe links below.", "Out of office", {}) == "auto_reply"
```

Run: `.venv\Scripts\python -m pytest tests\test_clock.py tests\test_classify.py -q`
Expected: FAIL with `ImportError: cannot import name 'clock'`.

- [ ] **Step 2: Write `engine/clock.py`**

```python
"""Send-window maths, always in the configured timezone (India), never server time."""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def _hhmm(value: str) -> time:
    hours, minutes = value.strip().split(":")
    return time(int(hours), int(minutes))


def _local(at: datetime, tz: str) -> datetime:
    if at.tzinfo is None:
        raise ValueError("A timezone-aware datetime is required.")
    return at.astimezone(ZoneInfo(tz))


def local_date(at: datetime, tz: str) -> date:
    return _local(at, tz).date()


def in_window(at: datetime, tz: str, start: str, end: str) -> bool:
    here = _local(at, tz)
    return here.weekday() < 5 and _hhmm(start) <= here.time() <= _hhmm(end)


def next_window(at: datetime, tz: str, start: str, end: str) -> datetime:
    zone = ZoneInfo(tz)
    here = _local(at, tz)
    opens, closes = _hhmm(start), _hhmm(end)
    for _ in range(10):
        if here.weekday() >= 5 or here.time() > closes:
            here = datetime.combine(here.date() + timedelta(days=1), opens, tzinfo=zone)
        elif here.time() < opens:
            here = datetime.combine(here.date(), opens, tzinfo=zone)
        else:
            return here.astimezone(timezone.utc)
    raise RuntimeError("Could not place a time inside the send window.")
```

- [ ] **Step 3: Write `engine/classify.py`**

```python
"""What kind of reply is this? Never 'positive': a person decides that (spec §4.1)."""

import re

_QUOTE_START = re.compile(r"^(?:on .+ wrote:|-+\s*original message\s*-+|from:\s.+)$", re.IGNORECASE)
_FOOTER = re.compile(r"(?im)^\s*to opt out of future (?:communications|emails)\b")
_OPT_OUT = [
    re.compile(p, re.IGNORECASE | re.MULTILINE)
    for p in (
        r"\b(?:unsubscribe|opt[\s-]?out)\b",
        r"^\s*(?:please\s+)?stop\s*[.!]*$",
        r"\bremove\s+me\b",
        r"\b(?:take|remove)\s+me\s+(?:off|from)\b",
        r"\bremove\s+my\s+(?:email|address)\b",
        r"\bdo\s+not\s+(?:send|email|contact|message|write)\b",
        r"\bdon['’]?t\s+(?:send|email|contact|message|write)\b",
        r"\b(?:stop|cease)\s+(?:sending|emailing|contacting|writing)\b",
        r"\b(?:stop|cease)\s+(?:all\s+)?(?:emails?|messages?|outreach|communications?)\b",
        r"\bno\s+(?:more|further)\s+(?:emails?|messages?|contact)\b",
    )
]
_NEGATIVE = re.compile(
    r"\b(?:not interested|no thanks|no thank you|not a fit|not for us|not needed|no need|please pass|"
    r"we(?:'re| are) not interested)\b",
    re.IGNORECASE,
)
_BARE_NO = re.compile(r"^\s*(?:no|nope|nah)\s*[.!]*\s*$", re.IGNORECASE)
_AUTO_SUBJECT = re.compile(
    r"^\s*(?:automatic reply|auto(?:matic)?[- ]?reply|auto:|out of (?:the )?office|ooo\b|away from (?:the )?office|on leave)",
    re.IGNORECASE,
)


def strip_quoted(body: str) -> str:
    kept = []
    for line in (body or "").splitlines():
        stripped = line.strip()
        if stripped.startswith(">") or _QUOTE_START.match(stripped):
            break
        kept.append(line)
    return _FOOTER.split("\n".join(kept), maxsplit=1)[0].strip()


def is_auto_reply(headers: dict, subject: str) -> bool:
    lower = {str(k).lower(): str(v or "").strip().lower() for k, v in (headers or {}).items()}
    if lower.get("auto-submitted", "no") not in ("", "no"):
        return True
    if any(key in lower for key in ("x-autoreply", "x-autorespond", "x-autoresponse")):
        return True
    if lower.get("precedence") == "auto_reply":
        return True
    return bool(_AUTO_SUBJECT.match(subject or ""))


def reply_category(body: str, subject: str, headers: dict) -> str:
    if is_auto_reply(headers, subject):
        return "auto_reply"
    text = strip_quoted(body)
    if any(pattern.search(text) for pattern in _OPT_OUT):
        return "unsubscribe"
    first_line = text.splitlines()[0] if text else ""
    if _NEGATIVE.search(text) or _BARE_NO.match(first_line):
        return "negative"
    return "unclassified"
```

- [ ] **Step 4: Run them**

Run: `.venv\Scripts\python -m pytest tests\test_clock.py tests\test_classify.py -q`
Expected: `17 passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/clock.py engine/classify.py tests/test_clock.py tests/test_classify.py
git commit -m "feat: India-time send window and reply classification"
```

---

### Task 10: The engine's SQL (`store`)

**Files (engine repo):**
- Create: `engine/store.py`
- Test: `tests/test_store.py`

**Interfaces:**
- Consumes: `engine.clock.next_window`; the tables from Task 1.
- Produces (all take a psycopg2 `conn`; none commits unless stated):

  **Engine state and bookkeeping**
  - `log(conn, kind: str, detail: str) -> None`
  - `sync_mailboxes(conn, emails: list[str], today: date) -> None`
  - `get_state(conn) -> dict`
  - `set_paused(conn, paused: bool, reason: str | None) -> None`
  - `record_cycle(conn, *, inbox_ok: bool, inbox_detail: str | None, sending_enabled: bool, version: str) -> None`
  - `recover_stuck(conn) -> int`
  - `is_seen(conn, mailbox: str, key: str) -> bool`
  - `mark_seen(conn, mailbox: str, key: str, outcome: str) -> None`

  **Replies**
  - `find_engine_send(conn, message_ids: list[str]) -> dict | None` with keys `id, contact_id, from_email, message_id, recipient_id`
  - `latest_send_to(conn, from_addr: str, mailbox: str, since: datetime) -> dict | None` (same keys)
  - `record_reply(conn, sent: dict, inbound, category: str) -> bool`. `inbound` has `.key .message_id .from_addr .subject .body .received_at`.

  **Sending**
  - `bounce_counts(conn, day: date, tz: str) -> tuple[int, int]` returns `(sent, bounced)`
  - `due_messages(conn, now: datetime, limit: int) -> list[dict]` with keys `id, step, subject, body, recipient_id, campaign_id, contact_id, to_email`
  - `is_suppressed(conn, email: str) -> bool`
  - `pick_mailbox(conn, configured: list[str]) -> str | None`
  - `claim(conn, message_id) -> bool` (commits)
  - `thread_root(conn, recipient_id) -> str | None`
  - `insert_queued(conn, row: dict, *, from_email, subject, body, message_id, provider, thread_id) -> uuid` (commits; raises `psycopg2.errors.RaiseException` when the guard refuses)
  - `mark_sent(conn, row: dict, email_sent_id, mailbox: str, sent_at: datetime, settings) -> None` (commits)
  - `mark_failed(conn, message_id, email_sent_id, error: str) -> None` (commits)
  - `mark_skipped(conn, message_id, reason: str, stop_recipient: bool) -> None` (commits)

- [ ] **Step 1: Write the failing tests**

`tests/test_store.py`:

```python
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import psycopg2.errors as pg
import pytest

from conftest import TEST_DB, insert, make_campaign, make_contact, make_message, make_recipient, one, rows, settings
from engine import store
from engine.db import connect

NOW = datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc)  # 11:30 India, Wednesday


@dataclass
class In:
    key: str
    message_id: str
    from_addr: str
    subject: str
    body: str
    received_at: datetime = NOW


@pytest.fixture
def conn(db):
    c = connect(TEST_DB)
    yield c
    c.rollback()
    c.close()


def sent_email(db, contact, recipient, step=1, message_id="<m1@lambtech.in>", sent_at=NOW):
    email = insert(db, "emails_sent", contact_id=contact["id"], to_email=contact["email"],
                   from_email="ceo@lambtech.in", kind="outreach" if step == 1 else "follow_up",
                   subject="Hello", provider="smtp:test", provider_message_id=message_id,
                   status="sent", sent_at=sent_at)
    make_message(db, recipient, step, status="sent", email_sent_id=email["id"])
    return email


def test_sync_mailboxes_marks_unconfigured_and_resets_counters(db, conn):
    insert(db, "outreach.mailboxes", email="old@lambtech.in", sent_today=9, counter_date=date(2026, 11, 17))
    store.sync_mailboxes(conn, ["ceo@lambtech.in"], date(2026, 11, 18))
    conn.commit()
    boxes = {r["email"]: r for r in rows(db, "select email::text as email, configured, sent_today from outreach.mailboxes")}
    assert boxes["ceo@lambtech.in"]["configured"] is True
    assert boxes["old@lambtech.in"] == {"email": "old@lambtech.in", "configured": False, "sent_today": 0}


def test_recover_stuck_turns_sending_into_needs_review(db, conn):
    recipient = make_recipient(db, make_campaign(db), make_contact(db))
    make_message(db, recipient, 1, status="sending")
    assert store.recover_stuck(conn) == 1
    conn.commit()
    assert one(db, "select status from outreach.messages")["status"] == "needs_review"


def test_reply_is_matched_case_insensitively_and_stops_the_follow_ups(db, conn):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    sent_email(db, contact, recipient)
    make_message(db, recipient, 2, status="approved", due_at=NOW + timedelta(days=3))
    sent = store.latest_send_to(conn, "Ravi@Acme.com", "ceo@lambtech.in", NOW - timedelta(days=30))
    assert sent is not None
    assert store.record_reply(conn, sent, In("<r1@acme.com>", "<r1@acme.com>", "ravi@acme.com", "Re: Hello", "Tell me more"), "unclassified")
    conn.commit()
    response = one(db, "select * from responses")
    assert response["category"] == "unclassified" and response["classified_by"] is None
    assert one(db, "select status from outreach.recipients")["status"] == "replied"
    assert one(db, "select status from outreach.messages where step = 2")["status"] == "skipped"
    assert store.record_reply(conn, sent, In("<r1@acme.com>", "<r1@acme.com>", "ravi@acme.com", "Re", "dup"), "unclassified") is False


def test_auto_reply_is_logged_but_the_sequence_continues(db, conn):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    sent_email(db, contact, recipient)
    make_message(db, recipient, 2, status="approved")
    sent = store.find_engine_send(conn, ["<m1@lambtech.in>"])
    store.record_reply(conn, sent, In("<ooo@acme.com>", "<ooo@acme.com>", "ravi@acme.com", "Out of office", "Away"), "auto_reply")
    conn.commit()
    assert one(db, "select category, classified_by from responses") == {"category": "auto_reply", "classified_by": "engine"}
    assert one(db, "select status from outreach.recipients")["status"] == "active"
    assert one(db, "select status from outreach.messages where step = 2")["status"] == "approved"


def test_negative_reply_adds_the_address_to_the_do_not_email_list(db, conn):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    sent_email(db, contact, recipient)
    sent = store.find_engine_send(conn, ["<m1@lambtech.in>"])
    store.record_reply(conn, sent, In("<n@acme.com>", "<n@acme.com>", "ravi@acme.com", "Re", "Not interested"), "negative")
    conn.commit()
    assert one(db, "select reason::text, source from suppressions") == {"reason": "manual", "source": "engine:not_interested"}


def test_a_client_email_without_an_engine_send_is_not_a_reply(db, conn):
    make_contact(db)
    insert(db, "emails_sent", contact_id=one(db, "select id from contacts")["id"], to_email="ravi@acme.com",
           from_email="ceo@lambtech.in", kind="transactional", subject="Invoice", status="sent", sent_at=NOW)
    assert store.latest_send_to(conn, "ravi@acme.com", "ceo@lambtech.in", NOW - timedelta(days=30)) is None


def test_due_messages_put_follow_ups_first(db, conn):
    campaign = make_campaign(db)
    first = make_recipient(db, campaign, make_contact(db, email="a@acme.com"))
    second = make_recipient(db, campaign, make_contact(db, email="b@acme.com"))
    make_message(db, first, 1, due_at=NOW - timedelta(hours=2))
    make_message(db, second, 2, due_at=NOW - timedelta(hours=1))
    make_message(db, second, 3, due_at=NOW + timedelta(days=1))
    due = store.due_messages(conn, NOW, 10)
    assert [(d["to_email"], d["step"]) for d in due] == [("b@acme.com", 2), ("a@acme.com", 1)]


def test_pick_mailbox_respects_caps_switches_and_configuration(db, conn):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in", daily_cap=2, sent_today=2)
    insert(db, "outreach.mailboxes", email="sales@lambtech.in", daily_cap=10, sent_today=1)
    insert(db, "outreach.mailboxes", email="off@lambtech.in", daily_cap=10, is_active=False)
    assert store.pick_mailbox(conn, ["ceo@lambtech.in", "sales@lambtech.in", "off@lambtech.in"]) == "sales@lambtech.in"
    assert store.pick_mailbox(conn, ["ceo@lambtech.in"]) is None


def test_insert_queued_is_refused_for_a_suppressed_address(db, conn):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    message = make_message(db, recipient, 1)
    rows(db, "insert into suppressions (email, reason) values ('ravi@acme.com', 'manual')")
    row = {"id": message["id"], "step": 1, "contact_id": contact["id"], "to_email": "ravi@acme.com", "recipient_id": recipient["id"]}
    with pytest.raises(pg.RaiseException):
        store.insert_queued(conn, row, from_email="ceo@lambtech.in", subject="s", body="b",
                            message_id="<x@lambtech.in>", provider="smtp:test", thread_id="<x@lambtech.in>")


def test_mark_sent_schedules_the_next_step_inside_the_window(db, conn):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in")
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    message = make_message(db, recipient, 1)
    follow_up = make_message(db, recipient, 2)
    row = {"id": message["id"], "step": 1, "contact_id": contact["id"], "to_email": "ravi@acme.com", "recipient_id": recipient["id"]}
    assert store.claim(conn, message["id"]) is True
    assert store.claim(conn, message["id"]) is False
    email_id = store.insert_queued(conn, row, from_email="ceo@lambtech.in", subject="s", body="b",
                                   message_id="<x@lambtech.in>", provider="smtp:test", thread_id="<x@lambtech.in>")
    friday_evening = datetime.fromisoformat("2026-11-20T18:00:00+05:30")
    store.mark_sent(conn, row, email_id, "ceo@lambtech.in", friday_evening - timedelta(days=3), settings())
    assert one(db, "select status::text from emails_sent")["status"] == "sent"
    assert one(db, "select sent_today from outreach.mailboxes")["sent_today"] == 1
    # wait_days for step 2 is 3: Tuesday 18:00 + 3 days = Friday 18:00 -> Monday 10:00 India
    due = one(db, "select due_at from outreach.messages where id = %s", [follow_up["id"]])["due_at"]
    assert due == datetime.fromisoformat("2026-11-23T10:00:00+05:30")
    assert one(db, "select current_step from outreach.recipients")["current_step"] == 1


def test_mark_sent_on_the_last_step_completes_the_recipient(db, conn):
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in")
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db, steps=1), contact)
    message = make_message(db, recipient, 1)
    row = {"id": message["id"], "step": 1, "contact_id": contact["id"], "to_email": "ravi@acme.com", "recipient_id": recipient["id"]}
    store.claim(conn, message["id"])
    email_id = store.insert_queued(conn, row, from_email="ceo@lambtech.in", subject="s", body="b",
                                   message_id="<y@lambtech.in>", provider="smtp:test", thread_id="<y@lambtech.in>")
    store.mark_sent(conn, row, email_id, "ceo@lambtech.in", NOW, settings())
    assert one(db, "select status from outreach.recipients")["status"] == "completed"


def test_mark_skipped_can_stop_the_recipient(db, conn):
    recipient = make_recipient(db, make_campaign(db), make_contact(db))
    first = make_message(db, recipient, 1)
    make_message(db, recipient, 2)
    store.mark_skipped(conn, first["id"], "on the do-not-email list", stop_recipient=True)
    assert one(db, "select status, stop_reason from outreach.recipients") == {
        "status": "stopped", "stop_reason": "on the do-not-email list"}
    assert {r["status"] for r in rows(db, "select status from outreach.messages")} == {"skipped"}


def test_set_paused_and_bounce_counts(db, conn):
    store.set_paused(conn, False, None)
    conn.commit()
    assert one(db, "select paused from outreach.engine_state")["paused"] is False
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    sent_email(db, contact, recipient)
    assert store.bounce_counts(conn, date(2026, 11, 18), "Asia/Kolkata") == (1, 0)
```

Run: `.venv\Scripts\python -m pytest tests\test_store.py -q`
Expected: FAIL with `ImportError: cannot import name 'store'`.

- [ ] **Step 2: Write `engine/store.py`**

```python
"""Every SQL statement the engine runs. Commits only where the docstring says so."""

from datetime import date, datetime, timedelta

from engine import clock

SEND_COLUMNS = "e.id, e.contact_id, e.from_email::text as from_email, m.id as message_id, m.recipient_id"


def _one(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone() if cur.description else None


def _all(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def _run(conn, sql, params=None) -> int:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


def log(conn, kind, detail):
    _run(conn, "insert into outreach.events (kind, detail) values (%s, %s)", (kind, (detail or "")[:2000]))


def sync_mailboxes(conn, emails, today):
    for email in emails:
        _run(conn, "insert into outreach.mailboxes (email) values (%s) on conflict (email) do update set configured = true", (email,))
    _run(conn, "update outreach.mailboxes set configured = lower(email::text) = any(%s)", ([e.lower() for e in emails],))
    _run(conn, "update outreach.mailboxes set sent_today = 0, counter_date = %s where counter_date is distinct from %s", (today, today))


def get_state(conn):
    return _one(conn, "select * from outreach.engine_state")


def set_paused(conn, paused, reason):
    _run(
        conn,
        "update outreach.engine_state set paused = %s, paused_reason = %s, "
        "paused_at = case when %s then now() else null end",
        (paused, reason if paused else None, paused),
    )


def record_cycle(conn, *, inbox_ok, inbox_detail, sending_enabled, version):
    _run(
        conn,
        "update outreach.engine_state set last_cycle_at = now(), "
        "last_inbox_check_at = case when %s then now() else last_inbox_check_at end, "
        "inbox_status = %s, inbox_detail = %s, sending_enabled = %s, engine_version = %s",
        (inbox_ok, "ok" if inbox_ok else "error", inbox_detail, sending_enabled, version),
    )


def recover_stuck(conn):
    return _run(
        conn,
        "update outreach.messages set status = 'needs_review', "
        "error = 'The engine stopped while sending this. Check the Sent folder, then Retry or Skip.' "
        "where status = 'sending'",
    )


def is_seen(conn, mailbox, key):
    return _one(conn, "select 1 as hit from outreach.inbox_seen where mailbox = %s and message_key = %s", (mailbox, key)) is not None


def mark_seen(conn, mailbox, key, outcome):
    _run(
        conn,
        "insert into outreach.inbox_seen (mailbox, message_key, outcome) values (%s, %s, %s) "
        "on conflict (mailbox, message_key) do nothing",
        (mailbox, key, outcome),
    )


def find_engine_send(conn, message_ids):
    ids = [i.strip() for i in message_ids if i and i.strip()]
    if not ids:
        return None
    return _one(
        conn,
        f"select {SEND_COLUMNS} from emails_sent e join outreach.messages m on m.email_sent_id = e.id "
        "where e.provider_message_id = any(%s) order by e.sent_at desc nulls last limit 1",
        (ids,),
    )


def latest_send_to(conn, from_addr, mailbox, since):
    return _one(
        conn,
        f"select {SEND_COLUMNS} from emails_sent e "
        "join outreach.messages m on m.email_sent_id = e.id "
        "join contacts c on c.id = e.contact_id "
        "where c.email = %s and e.from_email = %s and e.status in ('sent', 'bounced') and e.sent_at >= %s "
        "order by e.sent_at desc limit 1",
        (from_addr, mailbox, since),
    )


def record_reply(conn, sent, inbound, category):
    inserted = _one(
        conn,
        "insert into responses (contact_id, email_sent_id, channel, received_at, from_email, subject, body_text, "
        "category, classified_by, provider_message_id) "
        "values (%s, %s, 'email_reply', %s, %s, %s, %s, %s, %s, %s) "
        "on conflict (provider_message_id) do nothing returning id",
        (sent["contact_id"], sent["id"], inbound.received_at, inbound.from_addr, inbound.subject,
         inbound.body, category, None if category == "unclassified" else "engine",
         inbound.message_id or inbound.key),
    )
    if inserted is None:
        return False
    if category != "auto_reply":
        _run(
            conn,
            "update outreach.recipients set status = 'replied', stop_reason = %s "
            "where id = %s and status in ('pending', 'active')",
            ("Replied (" + category.replace("_", " ") + ")", sent["recipient_id"]),
        )
        _run(
            conn,
            "update outreach.messages set status = 'skipped', error = 'Recipient replied' "
            "where recipient_id = %s and status in ('draft', 'approved')",
            (sent["recipient_id"],),
        )
    if category == "negative":
        _run(
            conn,
            "insert into suppressions (email, reason, source) "
            "select email, 'manual', 'engine:not_interested' from contacts where id = %s "
            "on conflict (email) do nothing",
            (sent["contact_id"],),
        )
    return True


def bounce_counts(conn, day, tz):
    row = _one(
        conn,
        "select count(*) filter (where e.status in ('sent', 'bounced')) as sent, "
        "count(*) filter (where e.status = 'bounced') as bounced "
        "from emails_sent e join outreach.messages m on m.email_sent_id = e.id "
        "where (e.sent_at at time zone %s)::date = %s",
        (tz, day),
    )
    return int(row["sent"]), int(row["bounced"])


def due_messages(conn, now, limit):
    return _all(
        conn,
        "select m.id, m.step, m.subject, m.body, r.id as recipient_id, r.campaign_id, "
        "c.id as contact_id, c.email::text as to_email "
        "from outreach.messages m "
        "join outreach.recipients r on r.id = m.recipient_id "
        "join contacts c on c.id = r.contact_id "
        "where m.status = 'approved' and r.status = 'active' and m.due_at is not null and m.due_at <= %s "
        "order by (m.step = 1), m.due_at, m.created_at limit %s",
        (now, limit),
    )


def is_suppressed(conn, email):
    return _one(conn, "select 1 as hit from suppressions where email = %s", (email,)) is not None


def pick_mailbox(conn, configured):
    row = _one(
        conn,
        "select email::text as email from outreach.mailboxes "
        "where configured and is_active and daily_cap > 0 and sent_today < daily_cap "
        "and lower(email::text) = any(%s) "
        "order by sent_today::float / daily_cap, email limit 1",
        ([c.lower() for c in configured],),
    )
    return row["email"] if row else None


def claim(conn, message_id):
    """Commits."""
    claimed = _run(conn, "update outreach.messages set status = 'sending' where id = %s and status = 'approved'", (message_id,))
    conn.commit()
    return claimed == 1


def thread_root(conn, recipient_id):
    row = _one(
        conn,
        "select e.provider_message_id from outreach.messages m join emails_sent e on e.id = m.email_sent_id "
        "where m.recipient_id = %s and m.step = 1",
        (recipient_id,),
    )
    return row["provider_message_id"] if row else None


def insert_queued(conn, row, *, from_email, subject, body, message_id, provider, thread_id):
    """Commits. The desk's emails_sent trigger refuses suppressed addresses (RaiseException)."""
    created = _one(
        conn,
        "insert into emails_sent (contact_id, to_email, from_email, kind, subject, body_text, provider, "
        "provider_message_id, thread_id, status) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'queued') returning id",
        (row["contact_id"], row["to_email"], from_email, "outreach" if row["step"] == 1 else "follow_up",
         subject, body, provider, message_id, thread_id),
    )
    _run(conn, "update outreach.messages set email_sent_id = %s, mailbox = %s where id = %s", (created["id"], from_email, row["id"]))
    conn.commit()
    return created["id"]


def mark_sent(conn, row, email_sent_id, mailbox, sent_at, settings):
    """Commits."""
    _run(conn, "update emails_sent set status = 'sent', sent_at = %s where id = %s", (sent_at, email_sent_id))
    _run(conn, "update outreach.messages set status = 'sent', error = null where id = %s", (row["id"],))
    _run(conn, "update outreach.mailboxes set sent_today = sent_today + 1 where lower(email::text) = %s", (mailbox.lower(),))
    _run(conn, "update outreach.recipients set current_step = %s where id = %s", (row["step"], row["recipient_id"]))
    following = _one(
        conn,
        "select m.id, s.wait_days from outreach.messages m "
        "join outreach.recipients r on r.id = m.recipient_id "
        "join outreach.steps s on s.campaign_id = r.campaign_id and s.step = m.step "
        "where m.recipient_id = %s and m.step = %s and m.status = 'approved'",
        (row["recipient_id"], row["step"] + 1),
    )
    if following:
        due = clock.next_window(
            sent_at + timedelta(days=following["wait_days"]),
            settings.timezone, settings.send_window_start, settings.send_window_end,
        )
        _run(conn, "update outreach.messages set due_at = %s where id = %s", (due, following["id"]))
    else:
        _run(conn, "update outreach.recipients set status = 'completed' where id = %s and status = 'active'", (row["recipient_id"],))
    conn.commit()


def mark_failed(conn, message_id, email_sent_id, error):
    """Commits."""
    if email_sent_id is not None:
        _run(conn, "update emails_sent set status = 'failed' where id = %s", (email_sent_id,))
    _run(conn, "update outreach.messages set status = 'failed', error = %s where id = %s", (error[:1000], message_id))
    conn.commit()


def mark_skipped(conn, message_id, reason, stop_recipient):
    """Commits."""
    row = _one(
        conn,
        "update outreach.messages set status = 'skipped', error = %s where id = %s returning recipient_id",
        (reason, message_id),
    )
    if stop_recipient and row:
        _run(
            conn,
            "update outreach.recipients set status = 'stopped', stop_reason = %s where id = %s and status = 'active'",
            (reason, row["recipient_id"]),
        )
        _run(
            conn,
            "update outreach.messages set status = 'skipped', error = %s "
            "where recipient_id = %s and status in ('draft', 'approved')",
            (reason, row["recipient_id"]),
        )
    conn.commit()
```

- [ ] **Step 3: Run the store tests**

Run: `.venv\Scripts\python -m pytest tests\test_store.py -q`
Expected: `13 passed`.

- [ ] **Step 4: Commit**

```bash
git add engine/store.py tests/test_store.py
git commit -m "feat: the engine's database operations against the desk schema"
```

---

### Task 11: Mail: building, sending, reading

**Files (engine repo):**
- Create: `engine/mail.py`
- Test: `tests/test_mail.py`

**Interfaces:**
- Produces:
  - **Building messages:**
    - `Outgoing(from_name, from_email, to_email, subject, body, in_reply_to=None)`
    - `footer(sender_name: str, signature: str) -> str`
    - `new_message_id(from_email: str) -> str`
    - `build_message(out: Outgoing, message_id: str, when: datetime) -> EmailMessage`
  - **Sending:**
    - `SendError(Exception)`
    - `SmtpSender(host, port, timeout=30).send(mailbox: Mailbox, msg: EmailMessage) -> None`.
      It raises `SendError`.
  - **Reading:**
    - `Inbound(key, message_id, in_reply_to, references, from_addr, subject, body,
      headers, received_at, is_bounce)`
    - `parse_inbound(raw: bytes) -> Inbound`
    - `ImapInbox(host, port, timeout=30)`, with these methods:
      - `.recent(mailbox, since: date, skip: Callable[[str], bool]) -> list[Inbound]`
      - `.find_sent(mailbox, message_id) -> Inbound | None`
      - `.save_sent(mailbox, msg) -> None`

- [ ] **Step 1: Write the failing tests**

`tests/test_mail.py`:

```python
from datetime import datetime, timezone

from engine.mail import Outgoing, build_message, footer, new_message_id, parse_inbound, sent_folder_name

WHEN = datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc)


def test_build_message_is_plain_text_with_threading_headers():
    out = Outgoing("Jonathan Jaladi", "ceo@lambtech.in", "ravi@acme.com", "Re: A quick idea", "Hi Ravi" + footer("Jonathan", "LambTech"), in_reply_to="<root@lambtech.in>")
    msg = build_message(out, "<id1@lambtech.in>", WHEN)
    assert msg["From"] == "Jonathan Jaladi <ceo@lambtech.in>"
    assert msg["Message-ID"] == "<id1@lambtech.in>"
    assert msg["In-Reply-To"] == "<root@lambtech.in>" and msg["References"] == "<root@lambtech.in>"
    assert msg.get_content_type() == "text/plain"
    assert "reply with 'unsubscribe'" in msg.get_content()


def test_new_message_id_uses_the_sender_domain():
    assert new_message_id("ceo@lambtech.in").endswith("@lambtech.in>")


RAW_REPLY = (
    b"From: Ravi Kumar <Ravi@Acme.com>\r\n"
    b"To: ceo@lambtech.in\r\n"
    b"Subject: =?utf-8?q?Re=3A_A_quick_idea?=\r\n"
    b"Message-ID: <r1@acme.com>\r\n"
    b"In-Reply-To: <id1@lambtech.in>\r\n"
    b"References: <root@lambtech.in> <id1@lambtech.in>\r\n"
    b"Date: Wed, 18 Nov 2026 12:00:00 +0530\r\n"
    b"Content-Type: multipart/alternative; boundary=b\r\n\r\n"
    b"--b\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTell me more\r\n"
    b"--b\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Tell me more</p>\r\n--b--\r\n"
)


def test_parse_inbound_reply():
    inbound = parse_inbound(RAW_REPLY)
    assert inbound.key == "<r1@acme.com>" and inbound.message_id == "<r1@acme.com>"
    assert inbound.from_addr == "ravi@acme.com"
    assert inbound.subject == "Re: A quick idea"
    assert inbound.in_reply_to == "<id1@lambtech.in>"
    assert inbound.references == ["<root@lambtech.in>", "<id1@lambtech.in>"]
    assert inbound.body.strip() == "Tell me more"
    assert inbound.received_at == datetime(2026, 11, 18, 6, 30, tzinfo=timezone.utc)
    assert inbound.is_bounce is False


def test_parse_inbound_flags_bounces_and_keys_messages_without_an_id():
    raw = (b"From: Mail Delivery System <MAILER-DAEMON@titan.email>\r\nSubject: Undelivered\r\n"
           b"Content-Type: multipart/report; report-type=delivery-status; boundary=x\r\n\r\n"
           b"--x\r\nContent-Type: text/plain\r\n\r\nfailed\r\n--x--\r\n")
    inbound = parse_inbound(raw)
    assert inbound.is_bounce is True
    assert inbound.key.startswith("sha256:") and inbound.message_id == ""


def test_parse_inbound_survives_a_bad_charset():
    raw = b"From: a@b.com\r\nSubject: x\r\nContent-Type: text/plain; charset=x-unknown\r\n\r\nhello\r\n"
    assert parse_inbound(raw).body.strip() == "hello"


def test_sent_folder_name_prefers_the_special_use_flag():
    class Fake:
        def list(self):
            return "OK", [b'(\\HasNoChildren) "/" "INBOX"', b'(\\HasNoChildren \\Sent) "/" "Sent Items"', b'(\\HasNoChildren) "/" "Sent-old"']

    assert sent_folder_name(Fake()) == "Sent Items"
```

Run: `.venv\Scripts\python -m pytest tests\test_mail.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'engine.mail'`.

- [ ] **Step 2: Write `engine/mail.py`**

```python
"""Building, sending and reading mail. Network classes are thin so the cycle can use fakes in tests."""

import email
import email.utils
import hashlib
import imaplib
import re
import smtplib
import ssl
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from email.message import EmailMessage
from email.policy import default as DEFAULT_POLICY
from typing import Callable, Optional

from engine.config import Mailbox


@dataclass
class Outgoing:
    from_name: str
    from_email: str
    to_email: str
    subject: str
    body: str
    in_reply_to: Optional[str] = None


def footer(sender_name: str, signature: str) -> str:
    return f"\n\n--\n{sender_name}\n{signature}\nTo opt out of future emails, reply with 'unsubscribe'."


def new_message_id(from_email: str) -> str:
    return email.utils.make_msgid(domain=from_email.split("@", 1)[1])


def build_message(out: Outgoing, message_id: str, when: datetime) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = email.utils.formataddr((out.from_name, out.from_email))
    msg["To"] = out.to_email
    msg["Subject"] = out.subject
    msg["Date"] = email.utils.format_datetime(when)
    msg["Message-ID"] = message_id
    if out.in_reply_to:
        msg["In-Reply-To"] = out.in_reply_to
        msg["References"] = out.in_reply_to
    msg.set_content(out.body)
    return msg


class SendError(Exception):
    pass


class SmtpSender:
    def __init__(self, host: str, port: int, timeout: int = 30):
        self.host, self.port, self.timeout = host, port, timeout

    def send(self, mailbox: Mailbox, msg: EmailMessage) -> None:
        context = ssl.create_default_context()
        try:
            if self.port == 465:
                server = smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout, context=context)
            else:
                server = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
                server.starttls(context=context)
            try:
                server.login(mailbox.email, mailbox.password)
                refused = server.send_message(msg)
                if refused:
                    raise SendError(f"Recipient refused: {refused}")
            finally:
                try:
                    server.quit()
                except Exception:
                    pass  # the message was already accepted or already failed
        except SendError:
            raise
        except (smtplib.SMTPException, OSError) as exc:
            raise SendError(f"{type(exc).__name__}: {exc}") from exc


@dataclass
class Inbound:
    key: str
    message_id: str
    in_reply_to: str
    references: list
    from_addr: str
    subject: str
    body: str
    headers: dict = field(default_factory=dict)
    received_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    is_bounce: bool = False


def _plain_body(msg) -> str:
    part = msg.get_body(preferencelist=("plain",))
    if part is None:
        return ""
    try:
        return part.get_content()
    except (LookupError, UnicodeDecodeError):
        payload = part.get_payload(decode=True) or b""
        return payload.decode("utf-8", errors="replace")


def parse_inbound(raw: bytes) -> Inbound:
    msg = email.message_from_bytes(raw, policy=DEFAULT_POLICY)
    message_id = str(msg.get("Message-ID", "") or "").strip()
    from_addr = email.utils.parseaddr(str(msg.get("From", "") or ""))[1].strip().lower()
    in_reply = re.findall(r"<[^>]+>", str(msg.get("In-Reply-To", "") or ""))
    try:
        received = email.utils.parsedate_to_datetime(str(msg.get("Date")))
        if received.tzinfo is None:
            received = received.replace(tzinfo=timezone.utc)
        received = received.astimezone(timezone.utc)
    except (TypeError, ValueError):
        received = datetime.now(timezone.utc)
    local_part = from_addr.split("@", 1)[0]
    is_bounce = local_part in ("mailer-daemon", "postmaster") or (
        msg.get_content_type() == "multipart/report"
        and str(msg.get_param("report-type", "")).lower() == "delivery-status"
    )
    return Inbound(
        key=message_id or "sha256:" + hashlib.sha256(raw).hexdigest(),
        message_id=message_id,
        in_reply_to=in_reply[0] if in_reply else "",
        references=re.findall(r"<[^>]+>", str(msg.get("References", "") or "")),
        from_addr=from_addr,
        subject=str(msg.get("Subject", "") or ""),
        body=_plain_body(msg),
        headers={k: str(v) for k, v in msg.items()},
        received_at=received,
        is_bounce=is_bounce,
    )


def sent_folder_name(conn) -> str:
    status, entries = conn.list()
    if status != "OK":
        raise RuntimeError("Could not list IMAP folders.")
    names, flagged = [], []
    for entry in entries or []:
        if not entry:
            continue
        match = re.search(rb'"((?:[^"\\]|\\.)*)"\s*$', entry)
        name = (match.group(1) if match else entry.rsplit(None, 1)[-1]).decode("utf-8", errors="replace")
        names.append(name)
        if re.search(rb"\\Sent(?:\s|\))", entry, re.IGNORECASE):
            flagged.append(name)
    candidates = flagged or [n for n in names if "sent" in n.lower()]
    if not candidates:
        raise RuntimeError("No Sent folder was found.")
    return candidates[0]


def _quoted(folder: str) -> str:
    return '"' + folder.replace('"', '\\"') + '"'


class ImapInbox:
    def __init__(self, host: str, port: int, timeout: int = 30):
        self.host, self.port, self.timeout = host, port, timeout

    def _open(self, mailbox: Mailbox):
        conn = imaplib.IMAP4_SSL(self.host, self.port, timeout=self.timeout)
        conn.login(mailbox.email, mailbox.password)
        return conn

    @staticmethod
    def _close(conn):
        try:
            conn.logout()
        except Exception:
            pass

    def recent(self, mailbox: Mailbox, since: date, skip: Callable[[str], bool]) -> list:
        conn = self._open(mailbox)
        try:
            status, _ = conn.select("INBOX", readonly=True)
            if status != "OK":
                raise RuntimeError("Could not open INBOX.")
            status, data = conn.search(None, "SINCE", since.strftime("%d-%b-%Y"))
            if status != "OK":
                raise RuntimeError("Could not search INBOX.")
            found = []
            for number in (data[0] or b"").split():
                status, head = conn.fetch(number, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
                if status != "OK":
                    raise RuntimeError("Could not read a message header.")
                header = head[0][1] if head and isinstance(head[0], tuple) else b""
                ids = re.findall(rb"<[^>]+>", header)
                if ids and skip(ids[0].decode("utf-8", errors="replace")):
                    continue
                status, parts = conn.fetch(number, "(BODY.PEEK[])")
                if status != "OK" or not parts or not isinstance(parts[0], tuple):
                    raise RuntimeError("Could not read a message.")
                found.append(parse_inbound(parts[0][1]))
            return found
        finally:
            self._close(conn)

    def find_sent(self, mailbox: Mailbox, message_id: str) -> Optional[Inbound]:
        conn = self._open(mailbox)
        try:
            conn.select(_quoted(sent_folder_name(conn)), readonly=True)
            status, data = conn.search(None, "HEADER", "Message-ID", message_id)
            numbers = (data[0] or b"").split() if status == "OK" else []
            if not numbers:
                return None
            status, parts = conn.fetch(numbers[0], "(BODY.PEEK[])")
            if status != "OK" or not parts or not isinstance(parts[0], tuple):
                return None
            return parse_inbound(parts[0][1])
        finally:
            self._close(conn)

    def save_sent(self, mailbox: Mailbox, msg: EmailMessage) -> None:
        conn = self._open(mailbox)
        try:
            status, _ = conn.append(
                _quoted(sent_folder_name(conn)), r"(\Seen)", imaplib.Time2Internaldate(time.time()), msg.as_bytes()
            )
            if status != "OK":
                raise RuntimeError("The Sent folder did not accept the copy.")
        finally:
            self._close(conn)
```

- [ ] **Step 3: Run the mail tests**

Run: `.venv\Scripts\python -m pytest tests\test_mail.py -q`
Expected: `6 passed`.

- [ ] **Step 4: Commit**

```bash
git add engine/mail.py tests/test_mail.py
git commit -m "feat: build, send and read mail (SMTP/IMAP)"
```

---

### Task 12: The cycle and the worker loop

**Files (engine repo):**
- Create: `engine/cycle.py`, `engine/__main__.py`
- Test: `tests/test_cycle.py`

**Interfaces:**
- Consumes:
  - `store.*` (Task 10)
  - `mail.Outgoing`, `build_message`, `new_message_id`, `footer`, `SendError` (Task 11)
  - `classify.reply_category` (Task 9)
  - `clock` (Task 9)
- Produces:
  - `cycle.LOCK_KEY = 7270001`
  - `cycle.Deps(settings, connect, sender, inbox, now, sleep, should_stop)`
  - `cycle.run_cycle(deps) -> dict`, returning a summary with keys `locked, replies, sent,
    skipped, failed, stopped_by`

- [ ] **Step 1: Write the failing tests**

`tests/test_cycle.py`:

```python
from datetime import datetime, timedelta, timezone

import psycopg2
import pytest

from conftest import TEST_DB, insert, make_campaign, make_contact, make_message, make_recipient, one, rows, settings
from engine.cycle import LOCK_KEY, Deps, run_cycle
from engine.db import connect
from engine.mail import Inbound, SendError

NOW = datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc)      # Wednesday 11:30 India
NIGHT = datetime(2026, 11, 18, 17, 0, tzinfo=timezone.utc)   # 22:30 India


class FakeSender:
    def __init__(self, fail_for=()):
        self.sent, self.fail_for = [], set(fail_for)

    def send(self, mailbox, msg):
        if msg["To"] in self.fail_for:
            raise SendError("550 mailbox unavailable")
        self.sent.append(msg)


class FakeInbox:
    def __init__(self, messages=None, broken=False):
        self.messages, self.broken, self.saved = messages or [], broken, []

    def recent(self, mailbox, since, skip):
        if self.broken:
            raise OSError("IMAP login failed")
        return [m for m in self.messages if not skip(m.key)]

    def save_sent(self, mailbox, msg):
        self.saved.append(msg)


def deps(sender=None, inbox=None, now=NOW, **overrides):
    return Deps(
        settings=settings(**overrides),
        connect=lambda: connect(TEST_DB),
        sender=sender or FakeSender(),
        inbox=inbox or FakeInbox(),
        now=lambda: now,
        sleep=lambda seconds: None,
    )


def unpause(db):
    rows(db, "update outreach.engine_state set paused = false, paused_reason = null")


def queued(db, email="ravi@acme.com", steps=3):
    contact = make_contact(db, email=email)
    recipient = make_recipient(db, make_campaign(db, name=email, steps=steps), contact)
    first = make_message(db, recipient, 1, due_at=NOW - timedelta(minutes=5), subject="Hi Ravi", body="Hello")
    for step in range(2, steps + 1):
        make_message(db, recipient, step)
    return contact, recipient, first


def test_paused_engine_sends_nothing_but_records_the_cycle(db):
    queued(db)
    sender = FakeSender()
    summary = run_cycle(deps(sender))
    assert summary["stopped_by"] == "paused" and sender.sent == []
    state = one(db, "select * from outreach.engine_state")
    assert state["last_cycle_at"] is not None and state["inbox_status"] == "ok"
    assert state["sending_enabled"] is True and state["engine_version"] == "2.0.0"
    assert one(db, "select configured from outreach.mailboxes where email = 'ceo@lambtech.in'")["configured"] is True


def test_sending_disabled_on_the_engine_wins_over_unpaused(db):
    queued(db)
    unpause(db)
    sender = FakeSender()
    assert run_cycle(deps(sender, sending_enabled=False))["stopped_by"].startswith("sending is disabled")
    assert sender.sent == []


def test_outside_the_window_nothing_is_sent(db):
    queued(db)
    unpause(db)
    sender = FakeSender()
    assert run_cycle(deps(sender, now=NIGHT))["stopped_by"] == "outside the send window"
    assert sender.sent == []


def test_a_due_email_is_sent_and_logged_before_and_after(db):
    contact, recipient, first = queued(db)
    unpause(db)
    sender, inbox = FakeSender(), FakeInbox()
    summary = run_cycle(deps(sender, inbox))
    assert summary["sent"] == 1 and len(sender.sent) == 1 and len(inbox.saved) == 1
    email = one(db, "select * from emails_sent")
    assert email["status"] == "sent" and email["kind"] == "outreach"
    assert email["from_email"] == "ceo@lambtech.in" and email["subject"] == "Hi Ravi"
    assert email["body_text"].startswith("Hello") and "unsubscribe" in email["body_text"]
    assert email["provider_message_id"] == sender.sent[0]["Message-ID"]
    assert email["thread_id"] == email["provider_message_id"]
    assert one(db, "select status, email_sent_id from outreach.messages where id = %s", [first["id"]]) == {
        "status": "sent", "email_sent_id": email["id"]}
    assert one(db, "select due_at from outreach.messages where step = 2")["due_at"] is not None


def test_a_reply_is_logged_and_stops_the_follow_up(db):
    contact, recipient, first = queued(db)
    unpause(db)
    sender = FakeSender()
    run_cycle(deps(sender))
    message_id = one(db, "select provider_message_id from emails_sent")["provider_message_id"]
    reply = Inbound(key="<r1@acme.com>", message_id="<r1@acme.com>", in_reply_to=message_id, references=[],
                    from_addr="ravi@acme.com", subject="Re: Hi Ravi", body="Not interested, thanks",
                    headers={}, received_at=NOW, is_bounce=False)
    rows(db, "update outreach.messages set due_at = %s where step = 2", [NOW - timedelta(minutes=1)])
    summary = run_cycle(deps(sender, FakeInbox([reply])))
    assert summary["replies"] == 1 and summary["sent"] == 0 and len(sender.sent) == 1
    assert one(db, "select category::text from responses")["category"] == "negative"
    assert one(db, "select status from outreach.recipients")["status"] == "replied"
    # seen once: a second cycle does not log it again
    run_cycle(deps(sender, FakeInbox([reply])))
    assert one(db, "select count(*) as n from responses")["n"] == 1


def test_bounce_notices_are_left_unread_for_stage_two(db):
    queued(db)
    bounce = Inbound(key="<b1@titan>", message_id="<b1@titan>", in_reply_to="", references=[],
                     from_addr="mailer-daemon@titan.email", subject="Undelivered", body="failed",
                     headers={}, received_at=NOW, is_bounce=True)
    run_cycle(deps(inbox=FakeInbox([bounce])))
    assert one(db, "select count(*) as n from outreach.inbox_seen")["n"] == 0


def test_an_address_suppressed_after_queueing_is_skipped_not_sent(db):
    queued(db)
    unpause(db)
    rows(db, "insert into suppressions (email, reason) values ('ravi@acme.com', 'unsubscribed')")
    sender = FakeSender()
    summary = run_cycle(deps(sender))
    assert summary["skipped"] == 1 and sender.sent == []
    assert one(db, "select status from outreach.recipients")["status"] == "stopped"
    assert one(db, "select count(*) as n from emails_sent")["n"] == 0


def test_an_smtp_refusal_marks_the_email_failed(db):
    queued(db)
    unpause(db)
    summary = run_cycle(deps(FakeSender(fail_for={"ravi@acme.com"})))
    assert summary["failed"] == 1
    assert one(db, "select status::text from emails_sent")["status"] == "failed"
    assert "550" in one(db, "select error from outreach.messages where step = 1")["error"]


def test_caps_make_emails_wait_rather_than_fail(db):
    queued(db, "a@acme.com")
    queued(db, "b@acme.com")
    unpause(db)
    insert(db, "outreach.mailboxes", email="ceo@lambtech.in", daily_cap=1)
    sender = FakeSender()
    run_cycle(deps(sender))
    assert len(sender.sent) == 1
    assert one(db, "select count(*) as n from outreach.messages where step = 1 and status = 'approved'")["n"] == 1


def test_inbox_failure_blocks_sending(db):
    queued(db)
    unpause(db)
    sender = FakeSender()
    summary = run_cycle(deps(sender, FakeInbox(broken=True)))
    assert summary["stopped_by"] == "inbox check failed" and sender.sent == []
    state = one(db, "select inbox_status, inbox_detail from outreach.engine_state")
    assert state["inbox_status"] == "error" and "IMAP login failed" in state["inbox_detail"]


def test_a_second_engine_holding_the_lock_means_this_one_does_nothing(db):
    queued(db)
    unpause(db)
    other = psycopg2.connect(TEST_DB)
    other.autocommit = True
    with other.cursor() as cur:
        cur.execute("select pg_advisory_lock(%s)", (LOCK_KEY,))
    try:
        sender = FakeSender()
        summary = run_cycle(deps(sender))
        assert summary["locked"] is False and sender.sent == []
    finally:
        other.close()


def test_a_crash_mid_send_becomes_needs_review_and_is_not_resent(db):
    contact, recipient, first = queued(db)
    unpause(db)
    rows(db, "update outreach.messages set status = 'sending' where id = %s", [first["id"]])
    sender = FakeSender()
    run_cycle(deps(sender))
    assert sender.sent == []
    assert one(db, "select status from outreach.messages where id = %s", [first["id"]])["status"] == "needs_review"


def test_high_bounce_rate_pauses_the_engine_and_the_pause_persists(db):
    contact = make_contact(db)
    recipient = make_recipient(db, make_campaign(db), contact)
    for n in range(10):
        email = insert(db, "emails_sent", contact_id=contact["id"], to_email=contact["email"], from_email="ceo@lambtech.in",
                       kind="outreach", subject="s", status="bounced" if n == 0 else "sent", sent_at=NOW - timedelta(hours=1),
                       provider_message_id=f"<b{n}@lambtech.in>")
        r = make_recipient(db, make_campaign(db, name=f"c{n}"), contact) if n else recipient
        make_message(db, r, 1, status="sent", email_sent_id=email["id"])
    queued(db, "new@acme.com")
    unpause(db)
    sender = FakeSender()
    assert run_cycle(deps(sender))["stopped_by"] == "bounce rate"
    state = one(db, "select paused, paused_reason from outreach.engine_state")
    assert state["paused"] is True and "1 of 10" in state["paused_reason"]
```

Run: `.venv\Scripts\python -m pytest tests\test_cycle.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'engine.cycle'`.

- [ ] **Step 2: Write `engine/cycle.py`**

```python
"""One engine cycle (spec §5): lock, mailboxes, inbox pass, gate, send."""

import logging
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable

from psycopg2 import errors as pgerr

from engine import VERSION, classify, clock, store
from engine.config import Settings
from engine.mail import Outgoing, SendError, build_message, footer, new_message_id

LOCK_KEY = 7270001
logger = logging.getLogger("engine.cycle")


@dataclass
class Deps:
    settings: Settings
    connect: Callable
    sender: object
    inbox: object
    now: Callable[[], datetime] = field(default=lambda: datetime.now(timezone.utc))
    sleep: Callable[[float], None] = time.sleep
    should_stop: Callable[[], bool] = field(default=lambda: False)


def run_cycle(deps: Deps) -> dict:
    summary = {"locked": False, "replies": 0, "sent": 0, "skipped": 0, "failed": 0, "stopped_by": None}
    conn = deps.connect()
    try:
        with conn.cursor() as cur:
            cur.execute("select pg_try_advisory_lock(%s) as ok", (LOCK_KEY,))
            got = cur.fetchone()["ok"]
        conn.commit()
        if not got:
            summary["stopped_by"] = "another engine holds the lock"
            return summary
        summary["locked"] = True
        try:
            _cycle(deps, conn, summary)
        finally:
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute("select pg_advisory_unlock(%s)", (LOCK_KEY,))
            conn.commit()
        return summary
    finally:
        conn.close()


def _cycle(deps, conn, summary):
    s = deps.settings
    now = deps.now()
    mailboxes = s.mailboxes()
    today = clock.local_date(now, s.timezone)

    stuck = store.recover_stuck(conn)
    if stuck:
        store.log(conn, "needs_review", f"{stuck} message(s) were mid-send when the engine stopped")
    store.sync_mailboxes(conn, [m.email for m in mailboxes], today)
    conn.commit()

    inbox_ok, detail = True, None
    since = today - timedelta(days=s.inbox_lookback_days)
    for box in mailboxes:
        try:
            summary["replies"] += _read_inbox(deps, conn, box, since, now)
        except Exception as exc:  # one bad mailbox must not stop the others being read
            conn.rollback()
            inbox_ok = False
            detail = f"{box.email}: {type(exc).__name__}: {exc}"[:500]
            store.log(conn, "inbox_error", detail)
            conn.commit()
    store.record_cycle(conn, inbox_ok=inbox_ok, inbox_detail=detail, sending_enabled=s.sending_enabled, version=VERSION)
    conn.commit()

    summary["stopped_by"] = _gate(deps, conn, now, inbox_ok, mailboxes)
    if summary["stopped_by"] is None:
        _send_due(deps, conn, mailboxes, summary)


def _read_inbox(deps, conn, box, since, now) -> int:
    count = 0
    for inbound in deps.inbox.recent(box, since, lambda key: store.is_seen(conn, box.email, key)):
        if store.is_seen(conn, box.email, inbound.key):
            continue
        if inbound.is_bounce:
            continue  # Stage 2 reads bounce notices; leave them unseen until then
        sent = store.find_engine_send(conn, [inbound.in_reply_to, *inbound.references])
        if sent is None:
            sent = store.latest_send_to(
                conn, inbound.from_addr, box.email, now - timedelta(days=deps.settings.reply_fallback_days)
            )
        if sent is None:
            store.mark_seen(conn, box.email, inbound.key, "ignored")
            conn.commit()
            continue
        category = classify.reply_category(inbound.body, inbound.subject, inbound.headers)
        if store.record_reply(conn, sent, inbound, category):
            count += 1
        store.mark_seen(conn, box.email, inbound.key, "reply:" + category)
        conn.commit()
    return count


def _gate(deps, conn, now, inbox_ok, mailboxes):
    s = deps.settings
    if not mailboxes:
        return "no mailboxes configured"
    if not s.sending_enabled:
        return "sending is disabled on the engine (SENDING_ENABLED)"
    if store.get_state(conn)["paused"]:
        return "paused"
    if not inbox_ok:
        return "inbox check failed"
    if not clock.in_window(now, s.timezone, s.send_window_start, s.send_window_end):
        return "outside the send window"
    sent, bounced = store.bounce_counts(conn, clock.local_date(now, s.timezone), s.timezone)
    if sent >= s.bounce_min_sends and bounced * 100.0 / sent >= s.bounce_pause_percent:
        reason = f"Paused automatically: {bounced} of {sent} emails bounced today"
        store.set_paused(conn, True, reason)
        store.log(conn, "auto_pause", reason)
        conn.commit()
        return "bounce rate"
    return None


def _send_due(deps, conn, mailboxes, summary):
    s = deps.settings
    by_email = {m.email: m for m in mailboxes}
    due = store.due_messages(conn, deps.now(), s.max_per_cycle)
    conn.commit()
    for index, row in enumerate(due):
        if deps.should_stop():
            break
        if index:
            deps.sleep(random.uniform(s.min_gap_seconds, s.max_gap_seconds))
        if store.is_suppressed(conn, row["to_email"]):
            store.mark_skipped(conn, row["id"], "on the do-not-email list", stop_recipient=True)
            summary["skipped"] += 1
            continue
        box_email = store.pick_mailbox(conn, list(by_email))
        if box_email is None:
            store.log(conn, "cap", "Every mailbox has reached today's cap; the rest wait for tomorrow")
            conn.commit()
            break
        if not store.claim(conn, row["id"]):
            continue
        box = by_email[box_email]
        message_id = new_message_id(box.email)
        root = store.thread_root(conn, row["recipient_id"]) if row["step"] > 1 else None
        body = row["body"] + footer(s.sender_name, s.sender_signature)
        try:
            email_id = store.insert_queued(
                conn, row, from_email=box.email, subject=row["subject"], body=body,
                message_id=message_id, provider="smtp:" + s.smtp_host, thread_id=root or message_id,
            )
        except pgerr.RaiseException as exc:
            conn.rollback()
            store.mark_skipped(conn, row["id"], exc.diag.message_primary or "refused by the database", stop_recipient=True)
            summary["skipped"] += 1
            continue
        msg = build_message(
            Outgoing(s.sender_name, box.email, row["to_email"], row["subject"], body, in_reply_to=root),
            message_id, deps.now(),
        )
        try:
            deps.sender.send(box, msg)
        except SendError as exc:
            store.mark_failed(conn, row["id"], email_id, str(exc))
            store.log(conn, "send_failed", f"{row['to_email']}: {exc}")
            conn.commit()
            summary["failed"] += 1
            continue
        store.mark_sent(conn, row, email_id, box.email, deps.now(), s)
        summary["sent"] += 1
        try:
            deps.inbox.save_sent(box, msg)
        except Exception as exc:
            store.log(conn, "sent_copy_failed", f"{message_id}: {type(exc).__name__}")
            conn.commit()
```

- [ ] **Step 3: Write `engine/__main__.py`**

```python
"""`python -m engine`: run a cycle every CYCLE_MINUTES until Render stops the worker."""

import logging
import signal
import sys
import time

from engine import VERSION
from engine.config import Settings
from engine.cycle import Deps, run_cycle
from engine.db import connect
from engine.mail import ImapInbox, SmtpSender


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings()
    if not settings.database_url:
        sys.exit("DATABASE_URL is not set.")
    stopping = {"flag": False}
    signal.signal(signal.SIGTERM, lambda *_: stopping.update(flag=True))
    deps = Deps(
        settings=settings,
        connect=lambda: connect(settings.database_url),
        sender=SmtpSender(settings.smtp_host, settings.smtp_port),
        inbox=ImapInbox(settings.imap_host, settings.imap_port),
        should_stop=lambda: stopping["flag"],
    )
    logging.info(
        "Outreach engine %s: %d mailbox(es), sending %s",
        VERSION, len(settings.mailboxes()), "enabled" if settings.sending_enabled else "disabled",
    )
    while not stopping["flag"]:
        try:
            logging.info("cycle %s", run_cycle(deps))
        except Exception:
            logging.exception("cycle failed")
        for _ in range(settings.cycle_minutes * 60):
            if stopping["flag"]:
                break
            time.sleep(1)
    logging.info("stopped")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the cycle tests, then everything**

Run: `.venv\Scripts\python -m pytest tests\test_cycle.py -q`
Expected: `13 passed`.

Run: `.venv\Scripts\python -m pytest -q`
Expected: all pass, `51 passed` (2 + 17 + 13 + 6 + 13).

- [ ] **Step 5: Commit**

```bash
git add engine/cycle.py engine/__main__.py tests/test_cycle.py
git commit -m "feat: the engine cycle (lock, replies, gate, send) and worker loop"
```

---

### Task 13: Import the PC copy's history

**Files (engine repo):**
- Create: `scripts/__init__.py` (empty), `scripts/import_sqlite.py`
- Test: `tests/test_import.py`

**Interfaces:**
- Consumes:
  - `engine.clock.next_window`, `engine.config.Settings`, `engine.db.connect`
  - `engine.mail.ImapInbox.find_sent`
- Produces:
  - `import_sqlite.run_import(bot: sqlite3.Connection, conn, settings, lookup_sent=None) -> dict`.
    Its report keys:
    - `campaigns`, `contacts_new`, `contacts_reused`, `skipped_erased`
    - `emails`, `emails_subject_recovered`, `emails_subject_missing`
    - `replies`, `replies_orphan`, `bounced_marked`
    - `suppressions`, `pending_messages`, `failed_skipped`, `stopped_now_suppressed`

    It never commits. `lookup_sent(sender, message_id) -> (subject, body) | None`.
  - CLI: `python -m scripts.import_sqlite PATH [--apply] [--no-imap]`.

- [ ] **Step 1: Write the failing tests**

`tests/test_import.py`:

```python
import sqlite3
from datetime import datetime, timezone

import pytest

from conftest import TEST_DB, make_contact, one, rows, settings
from engine.db import connect
from scripts.import_sqlite import NOT_RECORDED, run_import

BOT_SCHEMA = """
create table campaigns (id integer primary key, name text, created_at text);
create table sequence_steps (id integer primary key, campaign_id integer, step_number integer, wait_days_after_prev integer);
create table leads (id integer primary key, campaign_id integer, email text, name text, company text, role text,
  status text, current_step integer, last_sent_at text, website text);
create table emails (id integer primary key, campaign_id integer, lead_id integer, step_number integer, subject text,
  body_text text, status text, message_id text, sent_at text, scheduled_for text, created_at text);
create table replies (id integer primary key, email_id integer, lead_id integer, message_id text, in_reply_to text,
  subject text, body_text text, category text, received_at text);
create table suppression_list (id integer primary key, email text, reason text, added_at text);
create table events (id integer primary key, event_type text, details text, created_at text);
"""


@pytest.fixture
def bot():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(BOT_SCHEMA)
    conn.executescript(
        """
        insert into campaigns values (1, 'Nov CA firms', '2026-11-10 09:00:00');
        insert into sequence_steps values (1, 1, 2, 3), (2, 1, 3, 4);
        insert into leads values
          (1, 1, 'ravi@acme.com', 'Ravi Kumar', 'Acme Pvt Ltd', 'Partner', 'sequence_active', 1, '2026-11-16 05:00:00', 'acme.com'),
          (2, 1, 'priya@sharma.in', 'Priya', 'Sharma & Co', 'CA', 'replied', 1, '2026-11-16 05:00:00', 'sharma.in'),
          (3, 1, 'stop@x.com', 'Stop', '', '', 'unsubscribed', 1, '2026-11-16 05:00:00', 'x.com');
        insert into emails values
          (1, 1, 1, 1, '', '', 'sent', '<a1@lambtech.in>', '2026-11-16 05:00:00', null, '2026-11-15 05:00:00'),
          (2, 1, 1, 2, 'Re: idea', 'Following up', 'approved', null, null, null, '2026-11-15 05:00:00'),
          (3, 1, 1, 3, 'Re: idea', 'Last note', 'approved', null, null, null, '2026-11-15 05:00:00'),
          (4, 1, 2, 1, '', '', 'sent', '<b1@lambtech.in>', '2026-11-16 05:00:00', null, '2026-11-15 05:00:00'),
          (5, 1, 3, 1, '', '', 'sent', '<c1@lambtech.in>', '2026-11-16 05:00:00', null, '2026-11-15 05:00:00'),
          (6, 1, 3, 2, 'x', 'y', 'failed', null, null, null, '2026-11-15 05:00:00');
        insert into replies values
          (1, 4, 2, '<pr@sharma.in>', '<b1@lambtech.in>', 'Re: idea', 'Sounds good, call me', 'other', '2026-11-16 08:00:00'),
          (2, 5, 3, '<st@x.com>', '<c1@lambtech.in>', 'Re', 'unsubscribe', 'unsubscribe', '2026-11-16 09:00:00');
        insert into suppression_list values (1, 'stop@x.com', 'unsubscribe', '2026-11-16 09:00:00');
        insert into events values (1, 'send', '[sales@lambtech.in] SMTP accepted Step 1 to ravi@acme.com', '2026-11-16 05:00:00');
        """
    )
    yield conn
    conn.close()


@pytest.fixture
def conn(db):
    c = connect(TEST_DB)
    yield c
    c.rollback()
    c.close()


def lookup(sender, message_id):
    return ("A quick idea for Acme", "Hi Ravi, the full text") if message_id == "<a1@lambtech.in>" else None


def test_import_brings_history_opt_outs_and_running_sequences(bot, conn, db):
    report = run_import(bot, conn, settings(), lookup)
    conn.commit()
    assert report["campaigns"] == 1 and report["contacts_new"] == 3
    assert report["emails"] == 3 and report["emails_subject_recovered"] == 1 and report["emails_subject_missing"] == 2
    assert report["replies"] == 2 and report["suppressions"] == 0  # the unsubscribe reply already suppressed stop@x.com
    assert report["failed_skipped"] == 1

    ravi = one(db, "select * from emails_sent where provider_message_id = '<a1@lambtech.in>'")
    assert ravi["subject"] == "A quick idea for Acme" and ravi["from_email"] == "sales@lambtech.in"
    assert ravi["provider"] == "import:bot" and ravi["status"] == "sent"
    priya = one(db, "select * from emails_sent where provider_message_id = '<b1@lambtech.in>'")
    assert priya["subject"] == NOT_RECORDED and priya["from_email"] == "ceo@lambtech.in"

    assert one(db, "select category::text from responses where provider_message_id = '<pr@sharma.in>'")["category"] == "unclassified"
    assert one(db, "select reason::text from suppressions where email = 'stop@x.com'")["reason"] == "unsubscribed"

    follow_up = one(db, "select m.status, m.due_at from outreach.messages m join outreach.recipients r on r.id = m.recipient_id "
                        "join contacts c on c.id = r.contact_id where c.email = 'ravi@acme.com' and m.step = 2")
    # sent Mon 16 Nov 10:30 India + 3 days = Thu 19 Nov 10:30 India, inside the window
    assert follow_up["status"] == "approved"
    assert follow_up["due_at"] == datetime(2026, 11, 19, 5, 0, tzinfo=timezone.utc)
    statuses = {r["email"]: r["status"] for r in rows(
        db, "select c.email::text as email, r.status::text from outreach.recipients r join contacts c on c.id = r.contact_id")}
    assert statuses == {"ravi@acme.com": "active", "priya@sharma.in": "replied", "stop@x.com": "stopped"}


def test_erased_people_are_not_recreated(bot, conn, db):
    make_contact(db, email="ravi@acme.com", full_name="Erased", is_anonymized=True)
    report = run_import(bot, conn, settings(), None)
    assert report["skipped_erased"] == 1
    assert report["emails_subject_missing"] == 2


def test_dry_run_leaves_nothing_behind(bot, conn, db):
    run_import(bot, conn, settings(), None)
    conn.rollback()
    assert one(db, "select count(*) as n from emails_sent")["n"] == 0
    assert one(db, "select count(*) as n from outreach.campaigns")["n"] == 0
```

Run: `.venv\Scripts\python -m pytest tests\test_import.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.import_sqlite'`.

- [ ] **Step 2: Write `scripts/import_sqlite.py`**

```python
"""
One-off: bring the desktop bot's outreach.db into the desk (spec §7).

    python -m scripts.import_sqlite C:\\path\\outreach.db            dry run: counts only, nothing kept
    python -m scripts.import_sqlite C:\\path\\outreach.db --apply    writes
    --no-imap   do not look up the deleted subjects in the Sent folders

Order matters: sends are written before any suppression, because the desk
refuses to log an outreach email to a suppressed address.
"""

import argparse
import json
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

from engine import clock
from engine.config import Settings
from engine.db import connect
from engine.mail import ImapInbox

NOT_RECORDED = "(not recorded by the old bot)"
SEND_EVENT = re.compile(r"^\[(?P<sender>[^\]]+)\] SMTP accepted Step (?P<step>\d+) to (?P<to>\S+)$")
FREE_MAIL = {"gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "hotmail.com", "outlook.com",
             "live.com", "icloud.com", "aol.com", "zoho.com", "protonmail.com", "proton.me", "rediffmail.com"}
SUPPRESSION_MAP = {
    "unsubscribe": ("unsubscribed", "import:unsubscribe"),
    "bounce": ("bounced", "import:bounce"),
    "not_interested": ("manual", "import:not_interested"),
    "manual": ("manual", "import:manual"),
}
REPLY_MAP = {"positive": "unclassified", "question": "unclassified", "other": "unclassified",
             "not_interested": "negative", "unsubscribe": "unsubscribe", "out_of_office": "auto_reply"}
LEAD_STATUS_MAP = {"sequence_active": "active", "paused": "active", "replied": "replied", "completed": "completed",
                   "bounced": "bounced", "unsubscribed": "stopped", "rejected": "stopped",
                   "approved": "pending", "pending": "pending"}
STATUS_RANK = {"sent": 3, "approved": 2, "scheduled": 2, "draft": 1}


def _dt(value):
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _one(cur, sql, params=None):
    cur.execute(sql, params)
    return cur.fetchone()


def run_import(bot, conn, settings: Settings, lookup_sent=None) -> dict:
    report = {key: 0 for key in (
        "campaigns", "contacts_new", "contacts_reused", "skipped_erased", "emails", "emails_subject_recovered",
        "emails_subject_missing", "replies", "replies_orphan", "bounced_marked", "suppressions",
        "pending_messages", "failed_skipped", "stopped_now_suppressed")}
    cur = conn.cursor()
    boxes = settings.mailboxes()
    default_sender = boxes[0].email if boxes else (settings.mailbox_1_email or "ceo@lambtech.in").lower()
    senders = {}
    for event in bot.execute("select details from events where event_type = 'send'"):
        match = SEND_EVENT.match(event["details"] or "")
        if match:
            senders[(match["to"].lower(), int(match["step"]))] = match["sender"].lower()

    campaigns, waits = {}, {}
    for c in bot.execute("select id, name from campaigns order by id"):
        new_id = _one(cur, "insert into outreach.campaigns (name, created_by) values (%s, 'import') returning id",
                      (f"{c['name']} (imported)",))["id"]
        campaigns[c["id"]] = new_id
        report["campaigns"] += 1
        found = {r["step_number"]: r["wait_days_after_prev"]
                 for r in bot.execute("select step_number, wait_days_after_prev from sequence_steps where campaign_id = ?", (c["id"],))}
        waits[c["id"]] = {2: int(found.get(2) or 3), 3: int(found.get(3) or 4)}
        for step in (1, 2, 3):
            cur.execute(
                "insert into outreach.steps (campaign_id, step, subject_template, body_template, wait_days) "
                "values (%s, %s, '(imported)', '(imported)', %s)",
                (new_id, step, waits[c["id"]].get(step, 1)),
            )

    email_map = {}
    for lead in bot.execute("select * from leads order by id"):
        address = (lead["email"] or "").strip().lower()
        if not address or lead["campaign_id"] not in campaigns:
            continue
        found = _one(cur, "select id, is_anonymized from contacts where email = %s", (address,))
        suppressed = _one(cur, "select reason::text as reason from suppressions where email = %s", (address,))
        if (found and found["is_anonymized"]) or (suppressed and suppressed["reason"] == "erased"):
            report["skipped_erased"] += 1
            continue
        domain = address.split("@", 1)[1]
        company_id = None
        if domain not in FREE_MAIL:
            company = _one(cur, "select id from companies where domain = %s", (domain,))
            if company:
                company_id = company["id"]
            elif lead["company"]:
                company_id = _one(cur, "insert into companies (name, domain) values (%s, %s) returning id",
                                  (lead["company"], domain))["id"]
        if found:
            contact_id = found["id"]
            report["contacts_reused"] += 1
            cur.execute("update contacts set company_id = coalesce(company_id, %s), job_title = coalesce(job_title, %s) "
                        "where id = %s", (company_id, lead["role"] or None, contact_id))
        else:
            contact_id = _one(
                cur,
                "insert into contacts (full_name, email, job_title, company_id, source, source_detail) "
                "values (%s, %s, %s, %s, 'import', 'outreach bot import') returning id",
                (lead["name"] or address.split("@", 1)[0], address, lead["role"] or None, company_id),
            )["id"]
            report["contacts_new"] += 1

        status = LEAD_STATUS_MAP.get(lead["status"] or "", "stopped")
        if status == "active" and suppressed:
            status = "stopped"
        recipient_id = _one(
            cur,
            "insert into outreach.recipients (campaign_id, contact_id, status, stop_reason, current_step) "
            "values (%s, %s, %s, %s, %s) returning id",
            (campaigns[lead["campaign_id"]], contact_id, status,
             None if status in ("active", "pending", "completed") else f"Imported ({lead['status']})",
             int(lead["current_step"] or 0)),
        )["id"]

        by_step = {}
        for e in bot.execute("select * from emails where lead_id = ? order by id", (lead["id"],)):
            if e["status"] in ("failed", "sending"):
                report["failed_skipped"] += 1
                continue
            best = by_step.get(e["step_number"])
            if best is None or STATUS_RANK.get(e["status"], 0) >= STATUS_RANK.get(best["status"], 0):
                by_step[e["step_number"]] = e

        root, last_sent = None, None
        for step in sorted(by_step):
            e = by_step[step]
            if e["status"] == "sent" and e["message_id"]:
                sender = senders.get((address, step), default_sender)
                recovered = lookup_sent(sender, e["message_id"]) if lookup_sent else None
                subject, body = recovered if recovered else (NOT_RECORDED, "")
                report["emails_subject_recovered" if recovered else "emails_subject_missing"] += 1
                sent_at = _dt(e["sent_at"])
                root = root or e["message_id"]
                email_id = _one(
                    cur,
                    "insert into emails_sent (contact_id, to_email, from_email, kind, subject, body_text, provider, "
                    "provider_message_id, thread_id, status, sent_at) "
                    "values (%s, %s, %s, %s, %s, %s, 'import:bot', %s, %s, 'sent', %s) returning id",
                    (contact_id, address, sender, "outreach" if step == 1 else "follow_up", subject, body,
                     e["message_id"], root, sent_at),
                )["id"]
                email_map[e["id"]] = email_id
                cur.execute(
                    "insert into outreach.messages (recipient_id, step, subject, body, status, email_sent_id, mailbox) "
                    "values (%s, %s, %s, %s, 'sent', %s, %s)",
                    (recipient_id, step, subject, body, email_id, sender),
                )
                report["emails"] += 1
                last_sent = (step, sent_at)
            elif e["subject"] and e["body_text"]:
                due = None
                message_status = "approved" if status == "active" else "draft" if status == "pending" else "skipped"
                if message_status == "approved" and last_sent and step == last_sent[0] + 1 and last_sent[1]:
                    due = clock.next_window(
                        last_sent[1] + timedelta(days=waits[lead["campaign_id"]].get(step, 3)),
                        settings.timezone, settings.send_window_start, settings.send_window_end,
                    )
                cur.execute(
                    "insert into outreach.messages (recipient_id, step, subject, body, status, due_at) "
                    "values (%s, %s, %s, %s, %s, %s)",
                    (recipient_id, step, e["subject"], e["body_text"], message_status, due),
                )
                report["pending_messages"] += 1

    for r in bot.execute("select * from replies order by id"):
        email_id = email_map.get(r["email_id"])
        if email_id is None:
            report["replies_orphan"] += 1
            continue
        if r["category"] == "bounce":
            cur.execute("update emails_sent set status = 'bounced', bounced_at = %s where id = %s",
                        (_dt(r["received_at"]), email_id))
            report["bounced_marked"] += 1
            continue
        category = REPLY_MAP.get(r["category"] or "other", "unclassified")
        cur.execute(
            "insert into responses (contact_id, email_sent_id, channel, received_at, from_email, subject, body_text, "
            "category, classified_by, provider_message_id) "
            "select contact_id, id, 'email_reply', %s, to_email, %s, %s, %s, %s, %s from emails_sent where id = %s "
            "on conflict (provider_message_id) do nothing",
            (_dt(r["received_at"]) or datetime.now(timezone.utc), r["subject"], r["body_text"] or "", category,
             None if category == "unclassified" else "import", r["message_id"] or f"import-reply-{r['id']}", email_id),
        )
        report["replies"] += cur.rowcount

    for s in bot.execute("select email, reason from suppression_list"):
        mapped = SUPPRESSION_MAP.get(s["reason"] or "")
        if mapped is None:
            continue
        cur.execute(
            "insert into suppressions (email, reason, source) values (%s, %s, %s) on conflict (email) do nothing",
            ((s["email"] or "").strip().lower(), mapped[0], mapped[1]),
        )
        report["suppressions"] += cur.rowcount

    cur.execute(
        "update outreach.recipients r set status = 'stopped', stop_reason = 'on the do-not-email list' "
        "from contacts c where c.id = r.contact_id and r.status in ('active', 'pending') "
        "and exists (select 1 from suppressions s where s.email = c.email)"
    )
    report["stopped_now_suppressed"] = cur.rowcount
    cur.execute(
        "update outreach.messages m set status = 'skipped', error = 'Recipient stopped' "
        "from outreach.recipients r where r.id = m.recipient_id and r.status = 'stopped' "
        "and m.status in ('draft', 'approved')"
    )
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description="Import the desktop bot's outreach.db into the desk.")
    parser.add_argument("path")
    parser.add_argument("--apply", action="store_true", help="write the import (default: dry run)")
    parser.add_argument("--no-imap", action="store_true", help="skip recovering subjects from Sent folders")
    args = parser.parse_args(argv)

    settings = Settings()
    if not settings.database_url:
        sys.exit("DATABASE_URL is not set.")
    bot = sqlite3.connect(f"file:{args.path}?mode=ro", uri=True)
    bot.row_factory = sqlite3.Row
    conn = connect(settings.database_url)
    lookup = None
    if not args.no_imap:
        inbox = ImapInbox(settings.imap_host, settings.imap_port)
        boxes = {m.email: m for m in settings.mailboxes()}

        def lookup(sender, message_id):
            box = boxes.get(sender)
            if box is None:
                return None
            found = inbox.find_sent(box, message_id)
            return (found.subject, found.body) if found else None

    try:
        with conn.cursor() as cur:
            cur.execute("select 1 from outreach.campaigns where created_by = 'import' limit 1")
            if cur.fetchone():
                sys.exit("An import has already been applied to this database. Refusing to import twice.")
        report = run_import(bot, conn, settings, lookup)
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
        print(json.dumps(report, indent=2))
        print("APPLIED" if args.apply else "DRY RUN - nothing was kept")
    finally:
        conn.close()
        bot.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the import tests, then everything**

Run: `.venv\Scripts\python -m pytest tests\test_import.py -q`
Expected: `3 passed`.

Run: `.venv\Scripts\python -m pytest -q`
Expected: `54 passed`.

- [ ] **Step 4: Commit**

```bash
git add scripts/__init__.py scripts/import_sqlite.py tests/test_import.py
git commit -m "feat: one-off import of the desktop bot's history"
```

---

### Task 14: Docs, review, and Stage 1 rollout

**Files:**
- Modify (desk): `DEPLOY.md` (new §8 "Outreach engine", bucket-list line updated),
  `README.md` (outreach row and layout line)
- Push: both branches; open both PRs.

- [ ] **Step 1: Desk docs**

In `DEPLOY.md`, insert before `## Bucket list (not built yet)`:

```markdown
## 8. Outreach engine

The outreach bot runs on Render as a **background worker**,
`lambtech-outreach-engine` (repo `Xenomorph27/emailauto-LT`, Starter plan, always on).
It has no public address.

**What it does every 5 minutes:**

- reads the outreach mailboxes, and logs each reply under **Responses**;
- sends what is due, logging each email under **Emails sent**.

**Where it is managed:** Campaigns and the pause switch are on the desk's **Campaigns**
and **Mailboxes** screens.

**Order matters.** Push the outreach migration (`npx supabase@3.0.0 db push --remote`,
from the branch) before merging the desk change, as in §7.

**One-time setup:**

1. Render › New › **Blueprint** › `Xenomorph27/emailauto-LT`. It creates the worker from
   `render.yaml`.
2. Type the `sync: false` values: `DATABASE_URL` (same value as the desk API) and each
   mailbox's address and app password (`MAILBOX_1_EMAIL` / `MAILBOX_1_PASSWORD` …).
3. Check the worker's log: `Outreach engine 2.0.0: N mailbox(es), sending disabled`,
   then a `cycle {...}` line every 5 minutes. The desk's Mailboxes screen shows the
   mailboxes and "Last cycle … ago".

**Safety:**

- The engine starts **paused**, and with `SENDING_ENABLED=false` it reads and logs replies
  but sends nothing. Stage 2 turns sending on.
- Mailbox passwords live only on Render.
- Never run the old desktop bot again: two copies would email people twice.
```

In the bucket list, replace `- Sending email from the desk (today each sent email is
recorded by hand).` with:

```markdown
- Outreach Stage 2: bounce reading, one-click unsubscribe, postal address, verifier, then `SENDING_ENABLED=true`.
```

In `README.md`, add a row under the table header:
`| — outreach | Campaigns, Mailboxes | the hosted outreach engine's campaigns and queue; it logs into Emails sent and Responses |`.

- [ ] **Step 2: Full test runs**

Run (desk): `backend\.venv\Scripts\python -m pytest backend\tests -q`, then
`cd frontend; npm run build`.

Run (engine): `.venv\Scripts\python -m pytest -q`.

Expected: all green; build succeeds.

- [ ] **Step 3: Commit and push both branches**

```bash
git add DEPLOY.md README.md
git commit -m "docs: outreach engine deployment (stage 1)"
git push -u origin feat/outreach-engine
```

```bash
cd C:\Users\BARNAK\Desktop\emailauto-LT
git push -u origin feat/hosted-engine
```

Open both PRs (`gh pr create`). Each body names the spec, says "Stage 1: sending stays
off", and links the other PR.

- [ ] **Step 4: Final whole-branch review**

This is the executing skill's final review. Fix Critical and Important findings with
RED→GREEN tests before rollout.

- [ ] **Step 5: Rollout (user steps marked USER; never merge without the user's go-ahead)**

1. **USER:** run `npx supabase@3.0.0 db push --remote` from the desk branch. Then verify
   read-only:
   - the `outreach` schema exists;
   - `select count(*) from outreach.engine_state` = 1;
   - anon cannot read `outreach.campaigns`.
2. **USER:** merge the desk PR. Then check `/health`, and that the Campaigns and
   Mailboxes screens load.
3. **USER:** merge the engine PR.
4. **USER:** create the Render worker from the Blueprint and type the secrets (DEPLOY.md
   §8).
5. Check the worker log and the Mailboxes screen. Mailboxes are listed, the inbox check is
   `ok`, and the engine is paused with sending disabled.
6. **USER:** stop the desktop bot for good, and copy its `outreach.db` to this computer.
7. Run the import as a **dry run** against production, with `DATABASE_URL` from the user's
   own terminal. Show the counts. Then, on the user's yes, run with `--apply`.
8. Check in the desk:
   - imported campaigns, contacts, Emails sent (with recovered subjects) and Responses;
   - the do-not-email list;
   - active sequences show their next due date.
9. Update memory `lambtech-deploy-state.md`, and delete the SDD workspace.
