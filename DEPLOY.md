# Going live: LambTech Desk

How the pieces connect, and the one-time setup to put them online. Do the
steps in order; each needs something from the one before.

```
 Staff browser                 Render (Singapore)                Supabase (Mumbai, ap-south-1)
 lambtechdb.vercel.app ─ JWT ─▶  lambtech-desk-api (FastAPI)  ──▶  Postgres: the four tables
 (Vercel, static)                • verifies the login               and everything around them
       │                         • STAFF_EMAILS only              • Auth: staff logins
       └──────── sign in ───────────────────────────────────────▶
```

The database holds every rule (unique emails, lead serials, the automatic
lead on a positive reply, the do-not-email guard, payment totals). The API is
a thin, authenticated door to it; the screens only show what it says.

## Secrets: where each one lives

Never commit any of these. Each is typed once, into the place listed.
(The Supabase publishable key is public and lives in `frontend/.env.production`.)

| Value | Found in | Pasted into |
|---|---|---|
| Database password / session-pooler URL | Supabase › Connect › Session pooler | Render `lambtech-desk-api` › `DATABASE_URL` |
| Staff emails | you decide | Render `lambtech-desk-api` › `STAFF_EMAILS` |

The publishable key is not a secret: it is meant for browser code and cannot
read any table (RLS is on everywhere and nothing is granted to the API roles).

## 1. Database: Supabase

Project **Lambtech**, ref `yxhnejjquxiretpxxxvm`, region ap-south-1 (Mumbai).

1. **Apply the schema.** Two ways; use one.
   - *GitHub integration* — Supabase › Integrations › GitHub: connect this
     repository, production branch `main`, Supabase directory `supabase`,
     "Deploy to production" on. From then on, merging a change to
     `supabase/migrations/` into `main` applies it. **Check it worked**:
     Table Editor must show nine tables; if it shows none, the integration
     is not wired up and the migrations were not applied.
   - *Command line* — from this repository, in your own terminal (it asks
     for the database password):
     ```powershell
     npx supabase@3.0.0 link --project-ref yxhnejjquxiretpxxxvm
     npx supabase@3.0.0 db push
     ```
     This applies every file in `supabase/migrations/` in order and records
     them, so a later GitHub-integration run does not re-apply them.
2. **Authentication › Sign In / Providers**: turn **off** "Allow new users to
   sign up". Staff are invited, never self-registered.
3. **Authentication › URL Configuration**: Site URL = `https://lambtechdb.vercel.app`,
   and add it to Redirect URLs (plus `http://localhost:5173` while developing).
4. **Connect › Session pooler**: copy the connection string (port 5432) and
   put the password in. This is `DATABASE_URL`. Not the direct connection
   (IPv6-only, Render cannot reach it).
5. Check **Table Editor** afterwards: nine tables, four views, all with RLS on.

## 2. API: Render

1. Render › New › **Blueprint** › this repository. `render.yaml` defines one
   service, `lambtech-desk-api`, region Singapore, free plan.
2. Fill in the `sync: false` values when asked (table above).
   `STAFF_EMAILS` must include your own email or nobody can sign in.
3. Check `https://lambtech-desk-api.onrender.com/health` returns `{"status":"ok"}`.
4. Free plan: `.github/workflows/keep-awake.yml` pings `/health` every
   10 minutes so the service does not sleep (GitHub runs it from `main`).

If the service name is taken, change it in `render.yaml` **and** in
`keep-awake.yml` and Vercel's `VITE_API_BASE_URL` - all three must agree.

## 3. Screens: Vercel

Vercel project `lambtech_db` → `https://lambtechdb.vercel.app`, connected to
this repository, production branch `main`. Every push to `main` that changes
`frontend/` deploys automatically.

1. **Settings › Build and Deployment › Root Directory** = `frontend` (the app
   is not at the repo root; without this Vercel finds nothing to build and
   serves a 404). `frontend/vercel.json` sets the build, output and the
   single-page rewrite.
2. **No environment variables needed.** The three public values
   (`VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are
   committed in `frontend/.env.production`. A variable set in Vercel would
   override them; leave the list empty unless you mean to.
3. Open the site: you should see the sign-in screen, not "Not configured".

The API only accepts browser calls from `https://lambtechdb.vercel.app` and
`http://localhost:5173` (`CORS_ORIGINS` in `render.yaml`). A custom domain
later means adding it there too.

## 4. Staff accounts

Supabase › Authentication › Users › **Invite user** with the person's email.
They click the link, choose a password, and are in, provided their email is
in `STAFF_EMAILS`. A valid login that is not on the list gets "No access yet",
by design. Removing someone: delete the user in Supabase and take them off
`STAFF_EMAILS`.

## 5. Changing the database later

Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_what.sql`, add
a test in `backend/tests/`, run the suite (README), open a pull request. When
it merges to `main`, apply it the same way as in §1. Migrations are
append-only: never edit one that has already run.

## 6. Erasure requests (DPDP Act)

Contacts › open the person › **Anonymize**. Their name, emails, phones and
subject lines become placeholders, message bodies are blanked, the address
joins the do-not-email list as `erased`, and every count and payment stays
correct.

## 7. Website enquiries

The marketing site (`Xenomorph27/Lambtech_website`, Vercel project
`lambtech-website`) saves each form submission by calling one database
function, `submit_enquiry`. It is the only thing the public key can do, and
it refuses callers that do not also present the intake secret.

One-time setup, after the enquiries migration has been pushed:

1. Run `.\scripts\new-intake-secret.ps1` in your own terminal.
2. Paste the SQL line it prints into Supabase › SQL Editor and run it.
3. In Vercel › `lambtech-website` › Settings › Environment Variables
   (Production and Preview), add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://yxhnejjquxiretpxxxvm.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | the publishable key (same one as in `frontend/.env.production`) |
   | `ENQUIRY_INTAKE_SECRET` | the secret the script printed |

4. Redeploy the website.

Check: submit the form on the live site; the enquiry appears in the desk
under Enquiries within seconds. If the form says it "isn't connected yet", a
variable is missing; if it says "something went wrong", the secret's hash is
not registered (repeat steps 1–3) or Supabase › Settings › API does not
expose the `public` schema.

New enquiries are **not** emailed to anyone yet: watch the "New enquiries"
tile on Overview.

## Bucket list (not built yet)

- Sending email from the desk (today each sent email is recorded by hand).
- Email or WhatsApp notification when a website enquiry arrives.
- DNS: lambtech.in has no DMARC record; its site lists a contact address on
  another domain. Fix both before any outreach at volume.
- hire.lambtech.in.
