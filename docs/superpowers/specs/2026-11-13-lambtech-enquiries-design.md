# LambTech Enquiries — Design Spec

- **Date:** 2026-11-13
- **Status:** Draft for review
- **Repos:** `Xenomorph27/Lambtech_DB` (database, API, desk) and
  `Xenomorph27/Lambtech_website` (the marketing site,
  https://lambtech-website.vercel.app)
- **Depends on:** `docs/superpowers/specs/2026-11-06-lambtech-database-design.md`

## 1. Goal

Anyone who clicks a call-to-action on the LambTech website and submits the
form is recorded in the desk's database and appears in the desk. Staff work
the enquiry there; confirming it turns it into a lead, and from there the
existing pipeline (Leads → Transactions) takes over.

```
Website CTA → form → enquiries (new) → contacted → Confirm → contact + lead LT-00xx → transaction
                                                 └→ rejected / spam
```

### What success looks like

1. Every one of the site's 17 call-to-action buttons records an enquiry with
   the visitor's name, email and phone, the button they clicked and the page
   they were on.
2. A submitted enquiry is in the desk within seconds, and capture does not
   depend on the Render API being awake.
3. Confirming an enquiry creates the lead in one step and can never create
   two.
4. The public cannot read, change or flood the table.

### Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Where enquiries live | A new `enquiries` table | Inbound website interest is a different thing from a reply to outreach (`responses`) |
| Form fields | Name / Firm, Email, Phone / WhatsApp — **all three required** | User's decision; every enquiry can become a contact without chasing details |
| Write path | Website server route → one Supabase function | Supabase is always up; Render's free plan sleeps |
| Email notification of new enquiries | Not now | Mailing is parked; the desk shows new enquiries on Overview |

## 2. Data model (one new migration)

Type references are schema-qualified (`extensions.citext`), as in the
existing migrations.

### 2.1 New enum

| Enum | Values |
|---|---|
| `enquiry_status` | `new`, `contacted`, `confirmed`, `rejected`, `spam` |

### 2.2 `enquiries` †

| Column | Type | Notes |
|---|---|---|
| `name` | text, not null | "Name / Firm" as typed, trimmed, 1–200 characters |
| `email` | `extensions.citext`, not null | trimmed; must look like an address |
| `phone` | text, not null | as typed, trimmed; must contain 7–15 digits |
| `topic` | text | the label of the button clicked, e.g. "Book a 15-minute discovery audit" |
| `page` | text | path the visitor was on, e.g. `/ca` |
| `meta` | jsonb, not null, default `{}` | referrer and `utm_*` parameters when present |
| `ip_hash` | text | salted hash of the visitor's address, for rate limiting only |
| `status` | `enquiry_status`, not null, default `'new'` | |
| `notes` | text | staff notes |
| `contact_id` | uuid → `contacts` | **on delete set null**; set when confirmed |
| `handled_at` | timestamptz | set the first time `status` leaves `new` |

Index on (`status`, `created_at desc`).

### 2.3 `leads` — one new column

| Column | Type | Notes |
|---|---|---|
| `enquiry_id` | uuid → `enquiries`, **unique**, nullable | **on delete restrict**; the enquiry this lead came from |

A lead has at most one origin: `response_id` and `enquiry_id` are never both
set (check constraint). `leads_view` is recreated to include `enquiry_id`.

### 2.4 `enquiry_intake_keys`

Lets the database tell the website's server apart from anyone else holding
the public key.

| Column | Type | Notes |
|---|---|---|
| `sha256` | text, primary key | hex SHA-256 of an intake secret |
| `label` | text | e.g. `website 2026-11` |
| `created_at` | timestamptz, default now() | |

The secret itself is never stored or committed. Rotation: insert the new
hash, switch the website, delete the old hash.

### 2.5 Functions

**`submit_enquiry(p_secret, p_name, p_email, p_phone, p_topic, p_page, p_meta, p_ip_hash)`**
→ returns nothing. `security definer`, fixed `search_path`. The only thing
in the schema the `anon` role may execute.

| Check | Failure |
|---|---|
| SHA-256 of `p_secret` is in `enquiry_intake_keys` | refused (`intake_refused`) |
| name 1–200 chars; email matches `^[^@\s]+@[^@\s]+\.[^@\s]+$`, ≤ 254 chars; phone has 7–15 digits, ≤ 30 chars; topic ≤ 200; page ≤ 300; `p_meta` ≤ 2 KB | refused (`invalid_enquiry`) with which field |
| fewer than 5 enquiries from this `ip_hash` in the last hour | refused (`rate_limited`) |
| same email and same topic within the last 10 minutes | accepted silently, no second row (double submit) |

Otherwise inserts one row with `status = 'new'`.

**`confirm_enquiry(p_enquiry_id, p_full_name, p_email, p_phone, p_company_id, p_job_title, p_priority, p_description)`**
→ returns the new lead's id. Not executable by `anon` or `authenticated`.
In one transaction:

1. Locks the enquiry. Refuses if it is already `confirmed`, or is `spam`.
2. Finds the contact with that email, or creates one (`source =
   'inbound_form'`, `source_detail` = topic and page). An existing contact
   keeps its details; its `phone` is filled only if it was empty.
3. Creates the lead (`contact_id`, `enquiry_id`, priority default `warm`,
   `description` default = the topic).
4. Sets the enquiry to `confirmed`, with `contact_id` and `handled_at`.

**`anonymize_contact`** (existing) is extended: enquiries linked to the
contact, or carrying the contact's email, have `name`, `email`, `phone`,
`meta`, `notes` and `ip_hash` replaced with placeholders or blanks.

### 2.6 Rules enforced by the database

| When | Then |
|---|---|
| `enquiries.status` set to `confirmed` with no lead pointing at the enquiry | **rejected** — confirming goes through `confirm_enquiry` |
| `enquiries.status` changed away from `confirmed` while a lead still points at the enquiry | **rejected** — close the lead instead. If that lead was deleted, the enquiry may be reopened |
| `enquiries.status` first leaves `new` | `handled_at = now()` |
| An enquiry with a lead is deleted | **rejected** (foreign key) |
| Email columns written | trimmed, as on other tables |
| † row updated | `updated_at = now()` |

### 2.7 Security

- RLS enabled on `enquiries` and `enquiry_intake_keys`; no table grants to
  `anon` or `authenticated`.
- `grant execute on function submit_enquiry(...) to anon` is the single
  opening. With the public key alone a caller can do nothing: the function
  refuses without the intake secret, which exists only in the website's
  server environment.
- The intake secret can only add enquiries. It cannot read or change
  anything. The far more powerful Supabase secret key is not used anywhere
  on the website.

## 3. Website (`Lambtech_website`)

The site's own `AGENTS.md` requires reading the bundled Next.js 16 docs
(`node_modules/next/dist/docs/`) before writing route code; the plan
includes that step.

### 3.1 The form (`components/Booking.tsx`)

- Three required fields: **Name / Firm** (`name`), **Email** (`type="email"`),
  **Phone / WhatsApp** (`type="tel"`). The header line becomes
  "3 fields · 30 seconds".
- A hidden honeypot field (`website`), invisible to people and skipped by
  keyboard and screen readers.
- Sends `{ name, email, phone, topic, page, website, meta }` to
  `POST /api/enquiry` on the same site. `meta` carries `document.referrer`
  and any `utm_*` query parameters.
- Success and error states stay as they are. Rate-limited submissions show
  "Too many requests from this connection. Please try again in an hour, or
  write to us." Validation errors name the field.
- The Web3Forms call remains only as an optional, best-effort email ping
  after a successful save, and only if `NEXT_PUBLIC_WEB3FORMS_KEY` is set.
  Its failure is ignored.

### 3.2 The server route (`app/api/enquiry/route.ts`)

`POST` only. Steps:

1. Parse JSON; reject bodies over 10 KB.
2. Honeypot filled → answer success and store nothing.
3. Validate presence and lengths (the database repeats every check; this
   gives fast, friendly errors).
4. Take the visitor's address from the platform's forwarded-for header and
   compute `ip_hash = sha256(address + ENQUIRY_INTAKE_SECRET)`.
5. Call `POST {SUPABASE_URL}/rest/v1/rpc/submit_enquiry` with the
   publishable key and the intake secret, with a 10-second timeout.
6. Map the answer: success → `200 {ok: true}`; `invalid_enquiry` → `400`
   with the field; `rate_limited` → `429`; anything else → `502` with a
   generic message. Internal details are never returned to the browser.

Validation and payload-building live in `lib/enquiry.ts` as pure functions,
so they can be tested without a server.

### 3.3 Configuration (Vercel project `lambtech-website`, server-only)

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://yxhnejjquxiretpxxxvm.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | the project's publishable key |
| `ENQUIRY_INTAKE_SECRET` | a long random string; its SHA-256 is registered in `enquiry_intake_keys` |

None is `NEXT_PUBLIC_`. If any is missing, the route answers `503` and the
form shows "The booking form isn't connected yet."

### 3.4 `architecture.md`

Updated in the same change: §4 folder structure (`app/api/enquiry`,
`lib/enquiry.ts`), §5 rendering and request flow (the site now has one
server function; the diagram's Web3Forms arrow becomes the enquiry route →
Supabase), §11 lead capture (new sequence diagram and field list), §18
configuration (the three variables), §20 known gaps (booking form entry
replaced; "no email notification of new enquiries" added).

## 4. Desk (`Lambtech_DB`)

### 4.1 API

All behind staff login, as every other route.

| Route | Methods | Notes |
|---|---|---|
| `/enquiries` | GET list, GET one | filter `?status=` |
| `/enquiries/{id}` | PATCH | `status` (`new`, `contacted`, `rejected`, `spam` only) and `notes` |
| `/enquiries/{id}` | DELETE | refused with 409 when a lead came from it |
| `/enquiries/{id}/confirm` | POST | body: `full_name`, `email`, `phone`, optional `company_id`, `job_title`, `priority`, `description`; calls `confirm_enquiry`; returns the lead |
| `/stats/overview` | GET | gains `enquiries_new` |

There is no staff "create enquiry" route: enquiries come from the website,
and a lead for someone who phoned can already be added by hand.
`LeadRead` gains `enquiry_id`.

### 4.2 Screens

| Group | Screen | Route | Hue |
|---|---|---|---|
| Pipeline (first item) | Enquiries | `/enquiries` | `#ffb03a` |

- **Table:** received, name, email, phone, topic, page, status. Tabs: New ·
  Contacted · Confirmed · Closed (rejected + spam) · All, with counts.
  Search across name, email, phone and topic.
- **Drawer:** the details with `mailto:`, `tel:` and WhatsApp links, staff
  notes, and actions: **Mark contacted**, **Confirm**, **Reject**, **Spam**,
  **Delete**.
- **Confirm** opens a form pre-filled from the enquiry (name, email, phone)
  plus company, job title, priority and description. On success the drawer
  shows "Lead LT-00xx created → Open lead".
- **Leads drawer:** "Came from" shows "A website enquiry" with a link to it.
- **Overview:** a "New enquiries" tile, and the "Needs sorting" panel counts
  new enquiries alongside unclassified replies.

## 5. Error handling

| Situation | Result |
|---|---|
| Supabase unreachable or slow from the website | Form shows a retry message (and the mail link if `site.email` is set); nothing is half-saved |
| Website variables missing | Route answers 503; form says it isn't connected |
| Double click / double submit | One row |
| A burst from one address | Sixth enquiry within an hour is refused with a clear message |
| Someone calls the Supabase function directly with the public key | Refused: no intake secret |
| Confirm pressed twice, or by two staff at once | The second is refused: "already confirmed" |
| Confirm with an email that belongs to an existing contact | That contact is reused; the lead is added to them |

## 6. Testing

- **Database (pytest, real Postgres):** `submit_enquiry` accepts a good
  enquiry; refuses a missing or wrong secret, each invalid field, and the
  sixth in an hour; ignores a double submit. `confirm_enquiry` creates
  contact + lead, reuses an existing contact, fills an empty phone, refuses
  a second confirm and a spam enquiry. Status rules of §2.6. `anon` can
  execute `submit_enquiry` and still cannot read or write the tables.
  Anonymize blanks linked enquiries.
- **API:** list and filter, PATCH status and notes, PATCH to `confirmed`
  refused, confirm returns the lead and `/leads` shows it with
  `enquiry_id`, delete refused when a lead exists, overview count.
- **Website:** `lib/enquiry.ts` unit tests with Node's built-in test runner
  (validation, honeypot, payload shape, error mapping). `npm run lint` and
  `npm run build` clean.
- **End to end:** after deployment, one real submission on the live site
  appears in the desk and is confirmed into a lead; then it is deleted or
  kept as the first record, as the user chooses.

## 7. Rollout order

1. Database: merge, then `npx supabase@3.0.0 db push --remote`.
2. Generate the intake secret, register its hash (one SQL statement),
   and put the secret and the two Supabase values into Vercel.
3. Desk API and screens deploy from `main` (Render, Vercel).
4. Website: merge to `main`; Vercel deploys; run the end-to-end check.

Until step 4 the live site behaves as today.

## 8. Out of scope (for now)

- Emailing staff or the visitor when an enquiry arrives (parked with
  outreach).
- Attaching calculator or widget inputs to the enquiry.
- CAPTCHA (added only if the honeypot and rate limit prove insufficient).
- A calendar-booking step.
