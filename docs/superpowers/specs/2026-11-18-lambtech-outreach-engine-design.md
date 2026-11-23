# LambTech outreach engine: the bot, hosted and logging to the desk

Date: 2026-11-18. Status: approved in conversation, awaiting review of this document.
Supersedes the Instantly-based outreach design of 2026-11-11 (local branch
`docs/outreach-design`, never merged).

## 1. What we are building and why

LambTech finds clients by cold email. The outreach bot (`jonathan-jaladi/emailauto-LT`,
copied privately to `Xenomorph27/emailauto-LT` on 2026-11-18) emails prospects;
interested people reply or book through the website; the desk turns them into leads,
then transactions.

Today the bot runs on one desktop PC with its own SQLite file. Nothing it does reaches
the desk: the desk's Emails sent and Responses screens are typed by hand, and the bot
keeps its own do-not-email list.

**What the user asked for (2026-11-18):** copy the repo to their GitHub, apply the
review's fixes, run it always-on (Render for the backend, Vercel for screens),
connect it to the desk database so that **every email sent is logged and every email
received is noted with its type**.

**Success looks like:**

- Every email the engine sends appears in the desk's **Emails sent**, with sender,
  recipient, subject, body, step and time.
- Every reply appears in **Responses**, linked to the email it answers, with a type:
  negative, unsubscribe, auto-reply, or unclassified (for a human to mark positive).
- Bounces mark the email **Bounced** and put the address on the do-not-email list.
- One do-not-email list, the desk's, governs both the desk and the engine.
- The engine runs with the PC switched off, survives restarts without double-sending,
  and nobody who opted out from the PC copy is emailed again.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Where records live | The desk's existing tables (`contacts`, `companies`, `emails_sent`, `responses`, `suppressions`) | One source of truth; the desk's triggers already enforce the do-not-email guard, bounce → suppression, unsubscribe → suppression, positive → lead |
| Engine's working data | New schema `outreach` in the same database | The bot's own table names (`leads`, `emails`) collide with or duplicate the desk's |
| Where the engine runs | **Fly.io** worker, one shared-cpu-1x 256 MB machine, region `bom` (Mumbai), no web service (changed from Render on 2026-11-23: Render's free hours are taken by the desk API; Fly is ~$2/month and next to the database) | Always on; no public surface; one machine plus the advisory lock means one sender |
| Where the screens live | The desk (Vercel), behind its staff login | The bot's dashboard is server-rendered with no login; online it would let anyone send email as LambTech. The desk already has login, Emails sent, Responses and the do-not-email list |
| Who serves the screens' data | The desk API (Render, existing) | It already has staff auth, CORS, error mapping and tests. The engine needs no HTTP API |
| How screens and engine talk | Through the database only | The desk writes campaigns, drafts, caps and the pause switch; the engine reads them and writes back results and status |
| Message content after sending | **Kept** in `emails_sent` | The CRM must show what was said. Erasure requests are already handled by Anonymize |
| AI drafting (Gemini) | Removed | Already disabled in the bot; drafts are the user's own text with merge tags |
| Who marks a reply positive | Always a person | Positive creates a lead and uses a serial number |
| Starting state | **Paused** | Nothing sends until a person unpauses on the Mailboxes screen |

## 3. Architecture

```
 Staff browser ──JWT──▶ Desk API (Render, free)  ──┐
 lambtechdb.vercel.app   campaigns, CSV upload,    │
 Campaigns · Mailboxes   drafts, queue, caps,      ▼
 Emails sent · Responses pause switch       Supabase Postgres (Mumbai)
                                             public: contacts, companies,
 Outreach engine (Fly.io worker, bom)        emails_sent, responses,
 every 5 min:  read inboxes ─────────────▶   suppressions, leads …
               send what is due ─────────▶   outreach: campaigns, steps,
   │  SMTP / IMAP                            recipients, messages,
   ▼                                         mailboxes, engine_state,
 Titan (or the future sending domain)        inbox_seen, events
```

- **Repositories.** The schema (migrations, RLS, tests) stays in the desk repo, the
  single source of truth. The engine's code lives in `Xenomorph27/emailauto-LT`,
  rebuilt as a worker: SMTP/IMAP, scheduling, classification, the one-off import. The
  bot's dashboard, desktop launcher, SQLite code and Gemini code are removed.
- **Secrets.** Mailbox addresses and app passwords live only in the engine's Fly secrets
  environment (`MAILBOX_1_EMAIL` / `MAILBOX_1_PASSWORD` … up to 3), with
  `SMTP_HOST/PORT` and `IMAP_HOST/PORT`. Never in the database.
- **Database access.** The engine connects like the desk API does: the session-pooler
  `DATABASE_URL`. The `outreach` schema gets RLS on every table and no grants to
  `anon` or `authenticated`; `test_rls` covers it.
- **Time.** All schedule logic runs in `Asia/Kolkata`, set explicitly (`TZ` and
  `zoneinfo`), never the server's local time.

## 4. Data model

### 4.1 Desk tables, as the engine uses them

- **contacts.** One per recipient, by email (citext, unique). New contacts get
  `source = 'apollo'` when the CSV has Apollo columns, else `'import'`, and
  `source_detail = <campaign name>`. An existing contact is reused, and only its empty
  fields are filled (name, job title, company). An address that is suppressed as
  `erased`, or a contact with `is_anonymized`, is **skipped at upload**, never
  re-created.
- **companies.** Matched by email domain (`companies.domain`, citext unique) unless the
  domain is a free-mail domain (gmail.com etc.); created with the CSV's company name
  when missing.
- **emails_sent.** One row per send attempt:
  - `kind` is `outreach` for step 1 and `follow_up` for steps 2–3.
  - `provider` is `'smtp:' || <smtp host>` and `provider_message_id` is the Message-ID.
  - `thread_id` is step 1's Message-ID, so a sequence groups together.
  - `from_email` is the sending mailbox; `subject` and `body_text` hold the full text,
    footer included.
  - Lifecycle: inserted `queued` just before SMTP (so the do-not-email trigger can
    refuse it), then `sent` with `sent_at`, or `failed`; later `bounced` when a bounce
    notice arrives.
- **responses.**
  - Every row has `channel = 'email_reply'`, `email_sent_id` set, `received_at`,
    `from_email`, `subject`, and `body_text` (the whole plain-text part, quoted
    history included). `provider_message_id` is the reply's Message-ID.
    `classified_by = 'engine'` when the engine sets a category.
  - Categories:
    - `unsubscribe`: explicit opt-out wording. The desk trigger suppresses the address.
    - `negative`: "not interested", "no thanks", a bare "no".
    - `auto_reply`: out-of-office or auto-responder (`Auto-Submitted`,
      `X-Autoreply`, common OOO subjects).
    - `unclassified`: everything else, for a person to mark.
  - The engine never writes `positive`.
- **suppressions.** Written by the desk triggers (bounce, unsubscribe), by the engine
  for `negative` replies (`reason = 'manual'`, `source = 'engine:not_interested'`),
  and by the import. The engine reads it before every send; the trigger is the final
  guard.

### 4.2 New `outreach` schema

| Table | Holds |
|---|---|
| `campaigns` | name, created_by (staff email), created_at, archived_at |
| `steps` | campaign_id, step 1–3, subject template, body template, wait_days (step 2 default 3, step 3 default 4), unique (campaign_id, step) |
| `recipients` | campaign_id, contact_id, merge fields (jsonb, from the CSV row), status (`pending`, `active`, `replied`, `stopped`, `completed`, `bounced`), stop_reason, current_step, unique (campaign_id, contact_id) |
| `messages` | recipient_id, step, subject, body (rendered draft, editable), status (`draft`, `approved`, `sending`, `sent`, `failed`, `skipped`, `needs_review`), due_at, email_sent_id → `emails_sent`, error, mailbox |
| `mailboxes` | email (unique), daily_cap (default 15), is_active, sent_today, counter_date — rows upserted by the engine from its environment; caps and on/off edited on the Mailboxes screen |
| `engine_state` | one row: paused (default **true**), paused_reason, paused_at, last_cycle_at, last_inbox_check_at, inbox_status (`ok` / `error` + detail), engine_version |
| `inbox_seen` | mailbox, message_id (or a hash when missing), seen_at, outcome — so each inbound message is processed once |
| `events` | time, kind, detail — the engine's log, shown on the Mailboxes screen |

Rules enforced in the database, with tests:

- A recipient whose address is suppressed cannot be `active`.
- `messages.status = 'sent'` requires `email_sent_id`.
- Only one `engine_state` row exists.

## 5. The engine's cycle

The engine runs one cycle at start-up and every 5 minutes. A cycle runs only while it
holds a Postgres advisory lock. A second copy, such as an old machine during a
deploy, does nothing.

1. **Mailboxes.** Upsert `outreach.mailboxes` from the environment. Reset `sent_today`
   when the India date changes.
2. **Inbox pass,** per mailbox, over IMAP read-only. It reads INBOX messages from the
   last 14 days that are not in `inbox_seen`.
   - **Bounce notices:** `multipart/report; report-type=delivery-status`, or sender
     `mailer-daemon@` / `postmaster@`. The engine finds the original Message-ID (from
     the attached headers) or the failed recipient, and marks that `emails_sent` row
     `bounced`. The trigger suppresses the address, and the recipient becomes
     `bounced`.
   - **Replies:** the engine links a message by `In-Reply-To` / `References` to an
     `emails_sent.provider_message_id` the engine sent. As a fallback, it uses the
     sender's latest engine-sent email from **this mailbox** in the last 30 days.
     Mail that matches neither is not a reply. This matters because the mailbox also
     carries ordinary client mail, and clients are contacts too. It inserts the `responses` row with its
     category. **Any reply other than an auto-reply** stops that recipient's remaining messages (an auto-reply is logged and the sequence continues) (`replied`;
     unsent messages become `skipped`).
   - **Everything else** (unknown senders, newsletters) is recorded in `inbox_seen` as
     ignored and not stored.
   - If any mailbox check fails, the cycle **does not send**, and `inbox_status`
     records the error.
3. **Gate.** The cycle stops here when:
   - it is paused;
   - it is outside the weekday 10:00–17:00 India window; or
   - today's bounces are at least 5% of today's sends, with at least 10 sends. The
     engine then pauses itself, persisted with the reason, and it stays paused after a
     restart until a person unpauses.
4. **Send.** Up to 5 messages per cycle: due follow-ups first, then approved step-1
   messages oldest first. Each one goes through these steps:
   1. Claim it (`approved` → `sending`, atomically).
   2. Pick a mailbox with cap left.
   3. Re-check suppression.
   4. Insert `emails_sent` as `queued`. A refusal by the trigger makes the message
      `skipped`.
   5. Send it over SMTP.
   6. Update the row to `sent`, or `failed` with the error.
   7. Save a copy to the mailbox's Sent folder; a failure here is only logged.
   8. Schedule the next step at `sent_at + wait_days`, moved into the send window.
   9. Wait 8–18 s before the next message.

   Over-cap messages simply wait for tomorrow; they are never marked failed.
5. **Stuck sends.** A message left in `sending` by a crash becomes `needs_review` on the
   next start. It is shown on the Mailboxes screen and never resent automatically.

**Content (stage 2):**

- Plain text.
- Footer: sender name, LambTech, the postal address (`SENDER_POSTAL_ADDRESS`, required
  before unpausing), and "reply 'unsubscribe' to opt out".
- Headers: `List-Unsubscribe` with a `mailto:` address and an HTTPS one-click link.
- The one-click link goes to a public desk API endpoint with a signed per-recipient
  token. It suppresses the address with reason `unsubscribed` and source
  `one-click`, then shows a plain confirmation page. It also supports
  `List-Unsubscribe-Post`.

## 6. Desk screens and API

- **Campaigns** (new):
  - **Campaign list:** name, recipients, sent, replies, status.
  - **New campaign:**
    1. Name.
    2. CSV upload. Show the detected columns as merge tags. Validate syntax, check the
       domain's MX record, then optionally run Hunter verification when
       `HUNTER_API_KEY` is set (stage 2). Skip suppressed, erased and
       already-contacted addresses, with counts shown.
    3. Write steps 1–3 with tags and wait days.
    4. Review the rendered drafts and edit any of them.
    5. **Queue**: drafts become `approved`. The engine sends them when the window,
       caps and the pause switch allow.
  - **Unsent work:** an unsent campaign can be deleted, and a recipient can be stopped.
- **Mailboxes** (new):
  - One card per mailbox: address, sent today / cap (editable), on/off.
  - The **pause switch**, with its reason, and today's bounce rate.
  - The last inbox check, with its status.
  - Messages needing review.
  - The last 50 engine events.
- **Emails sent / Responses** (existing):
  - Rows from the engine appear with no change to these screens.
  - Add a Campaign column/filter and the step number, read via `outreach.messages`.
- **Overview:** an "Outreach" tile showing paused or active, and sent today.
- **API:** new routes under `/outreach/...`, staff-only. CSV parsing and MX checks run
  in the desk API, using code moved from the bot.

## 7. Switch-over from the PC copy (bot has already emailed real people)

1. The person running the bot on the PC stops it and sends a copy of `outreach.db`.
   The PC copy is **never started again**. Two copies would double-email people.
2. `scripts/import_sqlite.py` (engine repo) runs against that copy. Its default mode is
   a **dry run** that only reports counts. The real run imports:
   - **Suppression list, bounced and unsubscribed leads** go to `suppressions`.
     `not_interested` maps to `manual` with source `import:not_interested`.
   - **Leads** go to contacts and companies (same rules as §4.1), with one imported
     campaign per bot campaign.
   - **Sent emails** go to `emails_sent`. The bot deleted their subject and body, so
     the import fetches them from the sending mailbox's Sent folder by Message-ID.
     When none is found, the subject is `(not recorded by the old bot)`, the body is
     empty, and the import report counts them.
   - **Replies** go to `responses`, with categories mapped as in §4.1.
   - **Sequences still running** become `active` recipients. Their remaining approved
     messages are imported with their stored content, and their due dates are
     recomputed.
   - The engine's mailbox `sent_today` counters start at zero.
3. A person checks the import in the desk, then unpauses.

## 8. Stages and rollout

**Stage 1. Hosted, logging, still paused:**

- the `outreach` migration (pushed before the desk merge, as with enquiries);
- the desk API routes and the Campaigns and Mailboxes screens;
- the engine as a worker with the cycle in §5 (inbox pass for replies; sends gated by
  the persisted pause switch, the window, India time, the advisory lock, and the
  queue-only Send button);
- the import;
- deploy, import, and the user checks the records.

**Stage 2. Safe to unpause:**

- bounce notices read and applied;
- the List-Unsubscribe headers and the one-click endpoint;
- the postal-address footer;
- the optional Hunter verifier at upload;
- then **the user** unpauses.

**User tasks:**

- create the Fly.io app from the engine's `fly.toml` and deploy it (DEPLOY.md §8);
- set the mailbox passwords, `DATABASE_URL` and `SENDER_POSTAL_ADDRESS` as Fly secrets;
- get the `outreach.db` copy;
- strongly recommended before unpausing: a separate sending domain with SPF, DKIM and
  DMARC, warmed up for 2–3 weeks, and a DMARC record on lambtech.in.

## 9. Testing

- **Desk (pytest, local Postgres 18):**
  - migration rules in §4.2;
  - RLS and grants on every `outreach` table;
  - the erased-contact skip;
  - API routes: upload counts, queue, pause, caps, staff-only, public unsubscribe
    endpoint token checks.
- **Engine (pytest, the same local Postgres with the desk's migrations applied):**
  - SMTP and IMAP replaced by in-process fakes;
  - fixture emails for real bounce notices (Titan, Gmail, Outlook) and replies;
  - classification, the send cycle (claim, trigger refusal, cap wait, window, pause,
    bounce threshold), scheduling in India time across weekends, the advisory lock,
    stuck-send recovery;
  - the import against a fixture SQLite built from the bot's models.
- **End to end before unpausing:**
  - a campaign to the user's own test addresses on a mailbox they control, sent by
    unpausing for one cycle;
  - check the reply, the auto-reply, the bounce (to a non-existent address on a real
    domain) and the one-click unsubscribe in the desk.

## 10. Out of scope

- AI-written drafts.
- Open or click tracking.
- Mailbox warmup (a separate service on the sending mailboxes).
- Buying the sending domain; DNS changes.
- Apollo and Hunter lead search.
- More than 3 mailboxes.
- HTML email.
- Notifications on new replies.
- Changes to Jonathan's original repository.

## 11. Risks

- **Titan's acceptable-use policy** may forbid cold sending. The user checks it, or
  moves to the separate sending domain (§8).
- **The one-time import** depends on the PC copy being stopped for good. The import
  report and the paused start are the safety net.
- **Data-centre logins:** Fly logging in to Titan from Mumbai may trigger
  Titan's suspicious-login checks. App passwords, and a first login confirmed by the
  user, mitigate this.
- **Fly.io pricing:** a shared-cpu-1x 256 MB machine is listed at about $2.19/month
  (fly.io pricing update, effective 2026-10-01). Fly has no standing free tier for new
  accounts; an older account's legacy free machines would cover it.
