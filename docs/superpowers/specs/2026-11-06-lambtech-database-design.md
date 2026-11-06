# LambTech Database — Design Spec

- **Date:** 2026-11-06
- **Status:** Draft, awaiting review
- **Repo:** `Xenomorph27/Lambtech_DB` (Supabase project connected through the GitHub integration)
- **Scope:** lambtech.in only. hire.lambtech.in comes later.

## 1. Goal

One Supabase Postgres database that tracks the whole path a contact can take:

```
emailed → replied → positive reply → lead → paid work in progress
```

Each fact is stored **once**. Tables point to each other with foreign keys, so editing a row
(for example a contact's phone number) is reflected everywhere that row is used. Where one
table should *change* another (a positive reply creates a lead, a payment updates the amount
remaining), triggers or computed views do it, never manual copying.

### What success looks like

- From the Supabase dashboard you can answer, without spreadsheets:
  who we emailed, who replied and how, which replies became leads, and for each paid project
  how much work and money is done vs. left.
- The same email address can never be stored as two contacts, and an address on the
  do-not-email list can never be sent outreach.
- No history (emails, replies, payments) can be lost by deleting a parent row by accident.

## 2. Mapping to the original 4-table plan

| Original idea | In this design |
|---|---|
| Table 1 — sent | `emails_sent` |
| Table 2 — responses | `responses`, with a `category` column |
| Table 2a — automated + genuine negative | view `responses_a` (`auto_reply`, `negative`, `unsubscribe`) |
| Table 2b — genuine positive | view `responses_b` (`positive`) |
| Table 3 — leads (name, email, phone, serial no, priority, description) | `leads` + view `leads_view` (name/email/phone come from `contacts`) |
| Table 4 — ongoing transactions (work done/left, deadline, paid/remaining) | `transactions` + `milestones` + `payments` + view `transactions_view` |
| *(new)* | `companies`, `contacts`, `suppressions` |

## 3. Entity relationships

```
companies 1───* contacts 1───* emails_sent 1───* responses 1───0..1 leads 1───* transactions
                   │  ▲                                                          │    │
                   │  └── previous_contact_id (same person, new job)             │    ├──* milestones
                   └──────────────────────────────────* responses (no email)     │    └──* payments
companies 1───* transactions ────────────────────────────────────────────────────┘

suppressions   (stands alone, keyed by email address, no foreign key)
```

## 4. Types (Postgres enums)

| Enum | Values |
|---|---|
| `contact_source` | `inbound_form`, `apollo`, `linkedin`, `referral`, `event`, `import`, `manual`, `other` |
| `email_kind` | `outreach`, `follow_up`, `transactional` |
| `email_status` | `queued`, `sent`, `delivered`, `bounced`, `failed` |
| `response_channel` | `email_reply`, `inbound_form`, `phone`, `whatsapp`, `other` |
| `response_category` | `unclassified`, `auto_reply`, `negative`, `unsubscribe`, `positive` |
| `lead_priority` | `hot`, `warm`, `cold` |
| `lead_status` | `new`, `contacted`, `qualified`, `proposal`, `won`, `lost` |
| `transaction_status` | `active`, `on_hold`, `completed`, `cancelled` |
| `payment_method` | `bank_transfer`, `upi`, `card`, `cash`, `other` |
| `suppression_reason` | `unsubscribed`, `bounced`, `complained`, `manual`, `erased` |

## 5. Tables

All tables have `id uuid primary key default gen_random_uuid()` and `created_at timestamptz not null default now()`.
Tables marked † also have `updated_at timestamptz not null default now()`, maintained by a trigger.
Email columns use `citext` (case-insensitive), and a trigger trims surrounding spaces before saving.

### 5.1 `companies` †

| Column | Type | Notes |
|---|---|---|
| `name` | text, not null | |
| `domain` | citext, unique, nullable | e.g. `acme.com` |
| `industry` | text | |
| `city` | text | |
| `country` | text, default `'India'` | |
| `website` | text | |
| `notes` | text | |

### 5.2 `contacts` †

Each person is stored once. A person who changes jobs gets a **new** row, linked to the old one through `previous_contact_id`.

| Column | Type | Notes |
|---|---|---|
| `company_id` | uuid → `companies` | **on delete set null** |
| `full_name` | text, not null | |
| `email` | citext, not null, **unique** | primary email |
| `secondary_email` | citext | |
| `phone` | text | |
| `secondary_phone` | text | |
| `job_title` | text | |
| `source` | `contact_source`, not null | where we found them |
| `source_detail` | text | e.g. search query, event name, referrer |
| `previous_contact_id` | uuid → `contacts` | **on delete set null** |
| `is_anonymized` | boolean, not null, default false | set by `anonymize_contact()` |
| `notes` | text | |

### 5.3 `emails_sent` †

| Column | Type | Notes |
|---|---|---|
| `contact_id` | uuid → `contacts`, not null | **on delete restrict** |
| `to_email` | citext, not null | **copy** of the address actually used (deliberate exception, see §8) |
| `from_email` | citext, not null | sending mailbox |
| `kind` | `email_kind`, not null | |
| `subject` | text, not null | |
| `body_text` | text | |
| `provider` | text | e.g. `postmark`, `gmail` |
| `provider_message_id` | text, unique | used to match replies and bounces |
| `thread_id` | text | |
| `status` | `email_status`, not null, default `'sent'` | |
| `sent_at` | timestamptz | |
| `bounced_at` | timestamptz | |

If `to_email` is left empty on insert, it is filled from the contact's current email.

### 5.4 `responses` †

A reply to one of our emails, or an inbound contact such as the lambtech.in form, a phone call or a WhatsApp message.

| Column | Type | Notes |
|---|---|---|
| `contact_id` | uuid → `contacts`, not null | **on delete restrict**; filled from the email if left empty |
| `email_sent_id` | uuid → `emails_sent`, nullable | **on delete restrict**; empty for inbound form, phone, WhatsApp |
| `channel` | `response_channel`, not null, default `'email_reply'` | |
| `received_at` | timestamptz, not null, default now() | |
| `from_email` | citext | |
| `subject` | text | |
| `body_text` | text | |
| `category` | `response_category`, not null, default `'unclassified'` | |
| `classified_by` | text | `'human'` or `'ai'` |
| `classified_at` | timestamptz | set automatically when `category` changes |
| `provider_message_id` | text, unique | |

Constraint: if `email_sent_id` is set, `contact_id` must equal that email's `contact_id` (checked by trigger).
Constraint: `channel = 'email_reply'` requires `email_sent_id`.

### 5.5 `leads` †

| Column | Type | Notes |
|---|---|---|
| `serial_no` | text, not null, **unique** | auto-generated `LT-0001`, `LT-0002`, … from a sequence; never reused |
| `contact_id` | uuid → `contacts`, not null | **on delete restrict** |
| `response_id` | uuid → `responses`, **unique**, nullable | **on delete restrict**; empty for leads entered by hand |
| `priority` | `lead_priority`, not null, default `'warm'` | |
| `status` | `lead_status`, not null, default `'new'` | |
| `description` | text | |

A contact can become a lead more than once over time (one lead per positive reply).

### 5.6 `transactions` †

An ongoing piece of paid work.

| Column | Type | Notes |
|---|---|---|
| `lead_id` | uuid → `leads`, not null | **on delete restrict** |
| `company_id` | uuid → `companies`, nullable | **on delete restrict**; empty for individual clients |
| `primary_contact_id` | uuid → `contacts`, nullable | **on delete set null**; defaults to the lead's contact |
| `title` | text, not null | |
| `scope` | text | |
| `start_date` | date | |
| `deadline` | date | |
| `total_amount` | numeric(12,2), not null, ≥ 0 | |
| `currency` | char(3), not null, default `'INR'` | |
| `status` | `transaction_status`, not null, default `'active'` | |

`deadline` must not be before `start_date` when both are set.

### 5.7 `milestones` †

| Column | Type | Notes |
|---|---|---|
| `transaction_id` | uuid → `transactions`, not null | **on delete cascade** |
| `title` | text, not null | e.g. Discovery, Architecture, Build, Deploy |
| `position` | integer, not null | display order |
| `due_date` | date | |
| `is_done` | boolean, not null, default false | |
| `done_at` | timestamptz | set/cleared automatically with `is_done` |

### 5.8 `payments` †

A payment entered by mistake is fixed by editing or deleting that payment row; the totals in `transactions_view` follow automatically.

| Column | Type | Notes |
|---|---|---|
| `transaction_id` | uuid → `transactions`, not null | **on delete restrict** |
| `amount` | numeric(12,2), not null, > 0 | in the transaction's currency |
| `paid_on` | date, not null, default current_date | |
| `method` | `payment_method` | |
| `reference` | text | UTR, invoice no., etc. |
| `notes` | text | |

### 5.9 `suppressions`

The do-not-email list. Deliberately **not** linked to `contacts`, so it survives contact anonymization or deletion.

| Column | Type | Notes |
|---|---|---|
| `email` | citext, not null, **unique** | |
| `reason` | `suppression_reason`, not null | |
| `source` | text | what added it, e.g. `trigger:bounce`, `manual` |

## 6. Automatic behaviour (triggers and functions)

| When | Then |
|---|---|
| Any † row is updated | `updated_at = now()` |
| An email column is written | surrounding spaces are trimmed |
| `emails_sent` insert with `kind` `outreach` or `follow_up` to an address in `suppressions` | insert is **rejected** with an error |
| `emails_sent` insert of any kind to an address suppressed as `bounced` | insert is **rejected** |
| `emails_sent.status` becomes `bounced` | `bounced_at` set; address added to `suppressions` (`bounced`) if not already there |
| `responses.category` changes | `classified_at = now()` |
| `responses.category` becomes `positive` and no lead exists for this response | a `leads` row is created (status `new`, priority `warm`) |
| `responses.category` becomes `unsubscribe` | the contact's email is added to `suppressions` (`unsubscribed`) |
| `responses.category` changes **away** from `positive` | the existing lead is kept (a human decides whether to mark it `lost`) |
| `milestones.is_done` changes | `done_at` set or cleared; if every milestone of the transaction is done, transaction → `completed`; if a milestone is un-done on a `completed` transaction, it → `active` |
| `transactions` insert without `primary_contact_id` | filled from the lead's contact |

Function `anonymize_contact(contact_id uuid)` — for erasure requests under India's DPDP Act:
adds the email to `suppressions` (`erased`), then replaces the contact's name, emails and phones
with placeholders, sets `is_anonymized = true`, and blanks the same personal data in that
contact's `emails_sent.to_email`, `responses.from_email` and message bodies. Rows are kept, so
counts and payment history stay correct.

## 7. Views

All views are created with `security_invoker = true` so row-level security applies to them.

| View | Shows |
|---|---|
| `responses_a` | responses in `auto_reply`, `negative`, `unsubscribe`, joined with contact name and email |
| `responses_b` | responses in `positive`, joined with contact name and email |
| `leads_view` | every lead with `serial_no`, priority, status, description, plus the contact's name, email, phone and company name |
| `transactions_view` | every transaction plus `amount_paid` (sum of payments), `amount_remaining` (total − paid), `milestones_done`, `milestones_total`, `progress_pct` (done ÷ total × 100, 0 when no milestones), `days_left` (deadline − today) and `is_overdue` (past deadline and not completed/cancelled) |

`amount_paid`, `amount_remaining` and `progress_pct` are always calculated, never typed in, so they cannot drift.

## 8. Deliberate exceptions to "store everything once"

- `emails_sent.to_email` keeps the address an email actually went to, so history stays true after a contact's email is edited.
- `suppressions.email` is not linked to `contacts`, so a do-not-email entry outlives the contact.

## 9. Security

- Row-level security **enabled on every table**.
- v1 policy: the `authenticated` role has full read/write; the `anon` role has **no** access.
  The service role (server-side code) bypasses RLS as usual.
- Public sign-ups are turned off in Supabase Auth, so only invited team members are `authenticated`.
- Finer roles (e.g. a team member who can't see payments) are out of scope until there is more than one kind of user.

## 10. Repository layout and deployment

```
supabase/
  config.toml
  migrations/
    <timestamp>_init_schema.sql      -- extensions, enums, tables, constraints
    <timestamp>_triggers.sql         -- functions and triggers from §6
    <timestamp>_views.sql            -- views from §7
    <timestamp>_rls.sql              -- policies from §9
  tests/
    *.sql                            -- pgTAP tests
  seed.sql                           -- small fake data set for local/branch testing only
docs/superpowers/specs/              -- this spec
```

**Important:** with the Supabase GitHub integration, migrations merged into the production
branch (`main`) are applied to the live database. All work happens on feature branches; merging
to `main` is the deploy step and is done only after review.

## 11. Testing

pgTAP tests in `supabase/tests/`, run with `supabase test db`, cover every rule in §6 and §7:

- duplicate contact email (different case / extra spaces) is rejected
- outreach to a suppressed address is rejected; transactional to an `unsubscribed` address is allowed; any email to a `bounced` address is rejected
- bounce adds a suppression; unsubscribe reply adds a suppression
- positive reply creates exactly one lead with the next `LT-` serial; re-saving it does not create a second
- deleting a contact with emails, a transaction with payments, or a response with a lead is rejected
- deleting a transaction with no payments deletes its milestones
- `transactions_view` paid/remaining/progress/overdue values for a sample transaction
- completing the last milestone completes the transaction; un-doing one re-activates it
- `anonymize_contact()` blanks personal data and adds the suppression
- `anon` role can read nothing

Tests need a local Postgres (Docker + `supabase start`). If Docker is not available, they run
against a Supabase preview branch instead.

## 12. Out of scope (for now)

- The email-sending engine and cold outreach (bucket list)
- Connecting the lambtech.in form, inbox, Postmark or Gmail to these tables
- AI classification of replies (the `classified_by` column is ready for it)
- An admin UI (the Supabase dashboard is the UI for v1)
- Merging duplicate contacts
- hire.lambtech.in
