# Going live: LambTech Desk

How the pieces connect, and the one-time setup to put them online. Do the
steps in order; each needs something from the one before.

```
 Staff browser                 Render (Singapore)                Supabase (Mumbai, ap-south-1)
 lambtech-desk  ──── Bearer ──▶  lambtech-desk-api (FastAPI)  ──▶  Postgres: the four tables
 (static site)        JWT        • verifies the login               and everything around them
       │                         • STAFF_EMAILS only              • Auth: staff logins
       └──────── sign in ───────────────────────────────────────▶  • migrations from GitHub
```

The database holds every rule (unique emails, lead serials, the automatic
lead on a positive reply, the do-not-email guard, payment totals). The API is
a thin, authenticated door to it; the screens only show what it says.

## Secrets: where each one lives

Never commit any of these. Each is typed once, into the place listed.

| Value | Found in | Pasted into |
|---|---|---|
| Database password / session-pooler URL | Supabase › Connect › Session pooler | Render `lambtech-desk-api` › `DATABASE_URL` |
| Staff emails | you decide | Render `lambtech-desk-api` › `STAFF_EMAILS` |
| Publishable ("anon") key | Supabase › Project Settings › API | Render `lambtech-desk` › `VITE_SUPABASE_ANON_KEY` |

The publishable key is not a secret: it is meant for browser code and cannot
read any table (RLS is on everywhere and nothing is granted to the API roles).

## 1. Database: Supabase

Project **Lambtech**, ref `yxhnejjquxiretpxxxvm`, region ap-south-1 (Mumbai).

1. **Integrations › GitHub**: connect this repository, production branch
   `main`, Supabase directory `supabase`. From then on, merging a change to
   `supabase/migrations/` into `main` applies it to the live database. No
   migration ever runs from a laptop.
2. **Authentication › Sign In / Providers**: turn **off** "Allow new users to
   sign up". Staff are invited, never self-registered.
3. **Authentication › URL Configuration**: Site URL = `https://lambtech-desk.onrender.com`,
   and add it to Redirect URLs (plus `http://localhost:5173` while developing).
4. **Connect › Session pooler**: copy the connection string (port 5432) and
   put the password in. This is `DATABASE_URL`. Not the direct connection
   (IPv6-only, Render cannot reach it).
5. Check **Table Editor** after the first merge: nine tables, four views, all
   with RLS on.

## 2. API and screens: Render

1. Render › New › **Blueprint** › this repository. `render.yaml` defines both
   services (`lambtech-desk-api`, `lambtech-desk`), region Singapore.
2. Fill in the `sync: false` values when asked (table above).
   `STAFF_EMAILS` must include your own email or nobody can sign in.
3. Check `https://lambtech-desk-api.onrender.com/health` returns `{"status":"ok"}`.
4. Open `https://lambtech-desk.onrender.com`. You should see the sign-in
   screen, not "Not configured".
5. Free plan: `.github/workflows/keep-awake.yml` pings `/health` every
   10 minutes. GitHub only runs it from the default branch, so it starts once
   this is on `main`.

If the service names are already taken on Render, change them in
`render.yaml` **and** in `CORS_ORIGINS`, `VITE_API_BASE_URL` and
`keep-awake.yml` - all four must agree.

## 3. Staff accounts

Supabase › Authentication › Users › **Invite user** with the person's email.
They click the link, choose a password, and are in, provided their email is
in `STAFF_EMAILS`. A valid login that is not on the list gets "No access yet",
by design. Removing someone: delete the user in Supabase and take them off
`STAFF_EMAILS`.

## 4. Changing the database later

Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_what.sql`, add
a test in `backend/tests/`, run the suite (README), open a pull request. When
it merges to `main`, Supabase applies it. Migrations are append-only: never
edit one that has already run.

## 5. Erasure requests (DPDP Act)

Contacts › open the person › **Anonymize**. Their name, emails and phones
become placeholders, message bodies are blanked, the address joins the
do-not-email list as `erased`, and every count and payment stays correct.

## Bucket list (not built yet)

- Sending email from the desk (today each sent email is recorded by hand).
- Pulling the lambtech.in "Book a Technical Review" form straight into
  Responses as `inbound_form`.
- DNS: lambtech.in has no DMARC record; its site lists a contact address on
  another domain. Fix both before any outreach at volume.
- hire.lambtech.in.
