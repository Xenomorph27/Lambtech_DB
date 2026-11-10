# LambTech Desk

The system of record for LambTech's outreach and client work, in four
connected tables:

| Table | Screen | What it holds |
|---|---|---|
| 1 `emails_sent` | Emails sent | every email that went out |
| 2 `responses` | Responses | who wrote back — **A** (automated / no) and **B** (positive) |
| 3 `leads` | Leads | the positive replies, numbered `LT-0001…`, with priority and status |
| 4 `transactions` | Transactions | paid work: milestones, deadline, paid and remaining |

Around them: `contacts` (each person once), `companies`, `milestones`,
`payments` and `suppressions` (the do-not-email list). Changing one table
changes the others through foreign keys and triggers: a reply marked Positive
creates its lead; a bounce adds the address to the do-not-email list; ticking
the last milestone completes the transaction; payment totals are never typed,
only summed.

Design: [docs/superpowers/specs/2026-11-06-lambtech-database-design.md](docs/superpowers/specs/2026-11-06-lambtech-database-design.md).
Deployment: [DEPLOY.md](DEPLOY.md).

## Layout

```
supabase/migrations/   the schema, triggers, views and security - the source of truth
backend/app/           FastAPI: staff login, CRUD routes, error mapping
backend/tests/         pytest, against a real local Postgres
frontend/              React 19 + Vite + Tailwind 4, the "Client Desk" design system
scripts/test-db.ps1    throwaway Postgres for the tests
render.yaml            Render Blueprint for the API; frontend/vercel.json for the screens
```

## Run it locally

Needs Python 3.12, Node 22 and PostgreSQL 18 (installed, service not required).

```powershell
# 1. Test database (from an interactive terminal, not a background job)
.\scripts\test-db.ps1 start

# 2. Backend
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
copy backend\app\.env.example backend\app\.env   # then edit
cd backend\app; ..\.venv\Scripts\python -m uvicorn main:app --reload --port 8000

# 3. Frontend
cd frontend; npm install; copy .env.example .env.local; npm run dev
```

For local work without a login, set `AUTH_REQUIRED=false` in
`backend/app/.env` and leave the two `VITE_SUPABASE_*` values empty; the
screens then go through the backend's own "auth disabled" answer. Every
deployment keeps `AUTH_REQUIRED=true`.

To point the local backend at the test database:
`DATABASE_URL=postgresql://postgres@localhost:54329/lambtech_test` (apply the
migrations first by running the tests once).

## Tests

```powershell
backend\.venv\Scripts\python -m pytest backend\tests -q
```

The suite applies `supabase/migrations/*.sql` to the local Postgres and checks
every rule the spec names: constraints, triggers, views, that the API roles
can read nothing, and the HTTP API end to end. It wipes that database, so
`TEST_DATABASE_URL` refuses anything that looks hosted.
