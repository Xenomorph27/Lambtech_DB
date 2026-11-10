# LambTech Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the LambTech database (Supabase migrations), a FastAPI backend for Render, and a React frontend in the Client Desk design, connected end to end.

**Architecture:** All business rules live in Postgres (constraints, triggers, views) so they hold no matter who writes. FastAPI is a thin, staff-only CRUD layer over those tables and views, copying the CRM's auth and error-handling patterns. The React app is a port of the CRM's design system with LambTech's screens.

**Tech Stack:** Postgres 17 (Supabase) / 18 (local tests), SQL migrations; Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, psycopg2, PyJWT, pytest; React 19, Vite 8, Tailwind 4, react-router 7, lucide-react, @supabase/supabase-js.

**Spec:** `docs/superpowers/specs/2026-11-06-lambtech-database-design.md`

**Reference implementation:** `C:\Users\BARNAK\Desktop\Customer Relationship Management\Client-Relationship-Management-System` (the "CRM"). Files copied from it are named per task.

## Global Constraints

- Supabase project ref `yxhnejjquxiretpxxxvm`; nothing is applied to it from this plan. Migrations reach it only when `main` is merged.
- Emails are `extensions.citext`; extension created `with schema extensions`.
- IDs `uuid default gen_random_uuid()`; timestamps `timestamptz`.
- Lead serial format `LT-` + 4-digit zero-padded sequence (`LT-0001`); grows past 4 digits naturally.
- Currency default `INR`; money `numeric(12,2)`.
- No grants to `anon` / `authenticated`; RLS enabled on every table.
- `AUTH_REQUIRED` defaults to true; staff = `STAFF_EMAILS`.
- Brand text: "LambTech Desk". Screen hues exactly as spec §10.3.
- Never commit `.env` files or secrets.

## Review Focus

1. Email typed with different case or stray spaces in any email column — must match/suppress the same address (test in Task 2/3).
2. Reclassifying a positive reply twice, or positive → negative → positive — exactly one lead, never deleted (Task 3).
3. A transaction with zero milestones or zero payments — progress 0, paid 0, remaining = total, no division error (Task 4).
4. PATCH that sends only one field must not null the others (Task 7).
5. Deleting a record that has history — a clear 409 message, not a 500 (Task 6/7).

---

### Task 1: Repo scaffold and test-database harness

**Files:**
- Create: `.gitignore` (CRM's, plus `node_modules/`, `frontend/dist/`, `.pgtest/`)
- Create: `supabase/config.toml` (via `npx supabase@3.0.0 init`)
- Create: `scripts/test-db.ps1` — `start` / `stop` / `reset`: `initdb` a trust-auth cluster in `.pgtest/` on port 54329, create database `lambtech_test`
- Create: `backend/requirements.txt` (CRM's minus email-validator; plus `pytest`, `cryptography`)
- Create: `backend/tests/conftest.py` — `apply_migrations()` creates roles `anon`/`authenticated` if missing, drops/recreates `public` and `extensions`, runs `supabase/migrations/*.sql` in name order; session fixture applies once; per-test fixture truncates all public tables and restarts sequences.

- [ ] Write `scripts/test-db.ps1`, run `scripts/test-db.ps1 start`, verify `psql`-free connection with Python: `python -c "import psycopg2; psycopg2.connect('postgresql://postgres@localhost:54329/lambtech_test').close()"`.
- [ ] Create venv `backend/.venv`, install requirements.
- [ ] Commit.

### Task 2: Schema migration (`<ts>_init_schema.sql`)

**Produces:** enums and tables exactly as spec §4–§5; `lead_serial_seq`; constraints: `responses_email_reply_needs_email` (`channel <> 'email_reply' or email_sent_id is not null`), `transactions_deadline_after_start`, amount checks.

**Tests (`backend/tests/test_schema.py`):**
- `test_contact_email_unique_ignores_case` — insert `Ravi@Acme.com`, then `ravi@acme.com` → `UniqueViolation`.
- `test_lead_serial_format` — two leads get `LT-0001`, `LT-0002`.
- `test_email_reply_requires_email_sent` → `CheckViolation`.
- `test_deadline_before_start_rejected` → `CheckViolation`.
- `test_payment_amount_positive` → `CheckViolation` for 0.
- `test_delete_contact_with_email_blocked` → `ForeignKeyViolation`.
- `test_delete_transaction_with_payment_blocked`; `test_delete_transaction_cascades_milestones`.
- `test_company_delete_sets_contact_company_null`.

- [ ] Write tests → run `pytest tests/test_schema.py` → FAIL (no tables).
- [ ] Write migration → tests PASS → commit.

### Task 3: Triggers and functions (`<ts>_triggers.sql`)

**Produces** (all `security definer` not needed; plain plpgsql): `set_updated_at()`, `trim_email_columns()` (per-table trigger with column list via `TG_ARGV`), `emails_sent_before_insert()` (fill `to_email`, suppression checks), `emails_sent_after_bounce()`, `responses_before_write()` (fill `contact_id`, contact match check, `classified_at`), `responses_after_write()` (create lead / add suppression), `milestones_before_write()` (`done_at`), `milestones_after_write()` (transaction status), `transactions_before_insert()` (`primary_contact_id`), `anonymize_contact(uuid)`.

**Tests (`backend/tests/test_triggers.py`):** every row of spec §6 plus Review Focus 1–2:
- `test_updated_at_changes_on_update`, `test_email_trimmed`
- `test_outreach_to_suppressed_rejected` (suppression stored as ` X@Y.com `, email to `x@y.com`)
- `test_transactional_to_unsubscribed_allowed`, `test_any_email_to_bounced_rejected`
- `test_to_email_filled_from_contact`
- `test_bounce_adds_suppression` (idempotent when already suppressed)
- `test_positive_creates_one_lead`, `test_positive_twice_still_one_lead`, `test_positive_negative_positive_keeps_lead`
- `test_unsubscribe_adds_suppression`, `test_contact_filled_from_email`, `test_contact_mismatch_rejected`
- `test_classified_at_set_on_category_change`
- `test_last_milestone_completes_transaction`, `test_undo_milestone_reactivates`, `test_done_at_set_and_cleared`
- `test_primary_contact_defaults_from_lead`
- `test_anonymize_contact` (personal fields blanked in contacts, emails_sent, responses; suppression `erased`; rows kept)

- [ ] Tests → FAIL → migration → PASS → commit.

### Task 4: Views (`<ts>_views.sql`)

**Produces:** `responses_a`, `responses_b`, `leads_view`, `transactions_view` (columns per spec §7), all `with (security_invoker = true)`.

**Tests (`backend/tests/test_views.py`):** `test_responses_buckets`, `test_leads_view_shows_contact_fields` (edit contact phone → view changes), `test_transactions_view_money_and_progress` (total 100000, payments 30000+20000 → paid 50000, remaining 50000; 1 of 4 milestones → 25), `test_transactions_view_empty` (Review Focus 3), `test_overdue_flag`.

- [ ] Tests → FAIL → migration → PASS → commit.

### Task 5: Grants and RLS (`<ts>_rls.sql`)

**Produces:** `alter table … enable row level security` for all 9 tables; `revoke all on all tables/sequences/functions in schema public from anon, authenticated`; `alter default privileges … revoke`.

**Tests (`backend/tests/test_rls.py`):** `test_anon_cannot_read` and `test_authenticated_cannot_read` via `set role` → `InsufficientPrivilege` on each table and view.

- [ ] Tests → FAIL → migration → PASS → commit.

### Task 6: Backend core

**Files:** `backend/app/{main.py, auth.py, settings.py, errors.py, database.py}`; `backend/app/.env.example`.

**Interfaces:**
- `settings.Settings`: `database_url`, `cors_origins`, `auth_required=True`, `supabase_url`, `supabase_jwt_secret`, `staff_emails`; `staff_email_set`.
- `auth.require_staff()` → `{"email", "user_id", "auth"}` (CRM's, staff check = `STAFF_EMAILS` only).
- `errors.install(app)` maps `sqlalchemy.exc.DBAPIError` by `orig.pgcode`: `23505`→409 "That already exists: …", `23503`→409 "This record still has related records, so it cannot be deleted." (or "…refers to a record that does not exist." on insert/update), `23514`/`P0001`/`22P02`→422 with the Postgres message.
- `database.get_db()`.

**Tests (`backend/tests/test_api_auth.py`):** fake JWKS as in the CRM tests: `test_health_public`, `test_no_token_401`, `test_expired_401`, `test_wrong_key_401`, `test_not_staff_403`, `test_staff_me_200`.

- [ ] Tests → FAIL → implement → PASS → commit.

### Task 7: Backend resources

**Files:** `backend/app/models.py` (all tables + 2 views as SQLAlchemy models), `backend/app/schemas.py` (Pydantic Create/Update/Read per resource; enums as `Literal`), `backend/app/crud.py` (`list_rows(db, model, filters, skip, limit, order_by)`, `get_row`, `create_row`, `update_row(exclude_unset)`, `delete_row`), `backend/app/routers/{companies,contacts,emails_sent,responses,leads,transactions,milestones,payments,suppressions,stats}.py`, using one helper `make_crud_router(prefix, model, read_model, schemas, filters)` in `routers/base.py`.

**Behaviour:** after a write, leads and transactions are re-read from their view so the response carries computed fields. Writes commit and return 201 for POST, 200 PATCH, 204 DELETE.

**Tests (`backend/tests/test_api_resources.py`):** auth disabled via settings override.
- `test_full_pipeline` — create company → contact → email → response (positive) → GET `/leads` has 1 lead with contact name → POST transaction → milestones → payment → GET `/transactions/{id}` shows paid/remaining/progress.
- `test_patch_partial` (Review Focus 4)
- `test_delete_contact_with_history_409` (Review Focus 5)
- `test_duplicate_contact_409`, `test_outreach_to_suppressed_422`
- `test_responses_filter_by_category`, `test_payments_filter_by_transaction`
- `test_anonymize_endpoint`, `test_stats_overview_counts`, `test_get_missing_404`

- [ ] Tests → FAIL → implement → PASS → commit.

### Task 8: Frontend scaffold (design system port)

**Files (copied from CRM `frontend/`, then edited):** `package.json`, `vite.config.js`, `index.html` (title "LambTech Desk"), `src/index.css` (verbatim), `src/main.jsx`, `src/hooks/useAsync.js`, `src/components/ui/*` (Button, ConfirmDialog, Drawer, EmptyState, Field, Spinner), `src/components/layout/{AppShell,PageHeader,Sidebar}.jsx`, `src/components/data/{DataTable,FormDrawer,Toolbar,StatTile}.jsx`, `src/components/auth/AuthGate.jsx`, `src/lib/supabase.js`.
**Create:** `src/api/client.js` (CRM's `http()` + `httpResource()`, no mock transport; `API_BASE` required, clear error if unset), `src/api/resources.js` (one `makeResource` per collection plus `anonymizeContact`, `overviewStats`), `src/lib/screens.js` (hue map from spec §10.3), `src/lib/domain.js` (priority/status/category/channel/source/method meta), `src/lib/format.js` (₹, en-IN dates), `src/components/ui/Chips.jsx`.

- [ ] `npm install`, `npm run build` succeeds with an Overview placeholder → commit.

### Task 9: Records screens — Contacts, Companies

Contacts: table (name, email, company, title, source, phone, added), filters (search, source, company), drawer with details + that contact's emails and responses + Anonymize (confirm dialog), add/edit form. Companies: table (name, domain, industry, city, contacts count), drawer listing contacts, add/edit/delete.

- [ ] Build passes; checked in browser against local backend → commit.

### Task 10: Pipeline screens — Emails sent, Responses

Emails: table (sent, to, contact, kind, subject, status), filters (kind, status, search), "Record email" form (contact picker, kind, from, subject, body, status), drawer with Mark bounced. Responses: tabs Unclassified / A / B with counts, table (received, contact, channel, category, subject), drawer with body and category buttons; "Record response" form (contact, channel, linked email optional, subject, body, category). After classifying Positive, drawer shows "Lead LT-xxxx created" link.

- [ ] Build passes; checked in browser → commit.

### Task 11: Pipeline screens — Leads, Transactions

Leads: table (serial, name, company, priority chip, status, email, phone, added), filters (priority, status, search), drawer (contact fields, description, source reply) with Edit and Start transaction. Transactions: table (title, lead serial, client, progress bar, paid/total, remaining, deadline/days left, status), filters (status, overdue), drawer with stat row, milestone checklist (toggle, add, delete), payments (add, delete), Edit.

- [ ] Build passes; checked in browser → commit.

### Task 12: Overview and Do-not-email

Overview: stat row (contacts, emails sent, reply rate, positive replies, open leads, active transactions, outstanding ₹, overdue), "Hot leads" list, "Due in the next 14 days" list, "Unclassified responses" count with link. Do-not-email: table (email, reason, source, added), add form, delete with confirm.

- [ ] Build passes; checked in browser → commit.

### Task 13: Deployment files and docs

**Files:** `render.yaml` (backend `lambtech-desk-api`, region singapore — the closest Render region to ap-south-1; static site `lambtech-desk`), `.github/workflows/keep-awake.yml`, `DEPLOY.md` (Supabase settings, Render Blueprint, secrets table, staff invites, merge-to-main = migrate), `README.md`.

- [ ] Commit.

### Task 14: End-to-end verification

- [ ] Full `pytest` run green.
- [ ] Backend on local test DB with `AUTH_REQUIRED=false`, seeded via the API; frontend dev server with `VITE_API_BASE_URL`; walk every screen and the full pipeline in the browser; screenshot.
- [ ] `npm run build` clean.
