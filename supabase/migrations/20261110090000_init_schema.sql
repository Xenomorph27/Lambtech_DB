-- LambTech Desk: types and tables (spec §4–§5).
--
-- Every table has a uuid primary key and created_at; tables that people edit
-- also carry updated_at (kept current by a trigger in the next migration).
-- Email columns are extensions.citext so 'Ravi@Acme.com' and 'ravi@acme.com' are the
-- same address.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type contact_source as enum (
  'inbound_form', 'apollo', 'linkedin', 'referral', 'event', 'import', 'manual', 'other'
);
create type email_kind as enum ('outreach', 'follow_up', 'transactional');
create type email_status as enum ('queued', 'sent', 'delivered', 'bounced', 'failed');
create type response_channel as enum ('email_reply', 'inbound_form', 'phone', 'whatsapp', 'other');
create type response_category as enum ('unclassified', 'auto_reply', 'negative', 'unsubscribe', 'positive');
create type lead_priority as enum ('hot', 'warm', 'cold');
create type lead_status as enum ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost');
create type transaction_status as enum ('active', 'on_hold', 'completed', 'cancelled');
create type payment_method as enum ('bank_transfer', 'upi', 'card', 'cash', 'other');
create type suppression_reason as enum ('unsubscribed', 'bounced', 'complained', 'manual', 'erased');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table companies (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null,
  domain      extensions.citext unique,
  industry    text,
  city        text,
  country     text default 'India',
  website     text,
  notes       text
);

create table contacts (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  company_id          uuid references companies (id) on delete set null,
  full_name           text not null,
  email               extensions.citext not null unique,
  secondary_email     extensions.citext,
  phone               text,
  secondary_phone     text,
  job_title           text,
  source              contact_source not null,
  source_detail       text,
  previous_contact_id uuid references contacts (id) on delete set null,
  is_anonymized       boolean not null default false,
  notes               text
);
create index contacts_company_id_idx on contacts (company_id);

create table emails_sent (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  contact_id          uuid not null references contacts (id) on delete restrict,
  to_email            extensions.citext not null,
  from_email          extensions.citext not null,
  kind                email_kind not null,
  subject             text not null,
  body_text           text,
  provider            text,
  provider_message_id text unique,
  thread_id           text,
  status              email_status not null default 'sent',
  sent_at             timestamptz,
  bounced_at          timestamptz
);
create index emails_sent_contact_id_idx on emails_sent (contact_id);
create index emails_sent_created_at_idx on emails_sent (created_at desc);

create table responses (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  contact_id          uuid not null references contacts (id) on delete restrict,
  email_sent_id       uuid references emails_sent (id) on delete restrict,
  channel             response_channel not null default 'email_reply',
  received_at         timestamptz not null default now(),
  from_email          extensions.citext,
  subject             text,
  body_text           text,
  category            response_category not null default 'unclassified',
  classified_by       text,
  classified_at       timestamptz,
  provider_message_id text unique,
  constraint responses_email_reply_needs_email
    check (channel <> 'email_reply' or email_sent_id is not null)
);
create index responses_contact_id_idx on responses (contact_id);
create index responses_email_sent_id_idx on responses (email_sent_id);
create index responses_category_idx on responses (category);

-- Lead serial numbers: LT-0001, LT-0002, ... never reused.
create sequence lead_serial_seq;

create table leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  serial_no   text not null unique
                default 'LT-' || lpad(nextval('lead_serial_seq')::text, 4, '0'),
  contact_id  uuid not null references contacts (id) on delete restrict,
  response_id uuid unique references responses (id) on delete restrict,
  priority    lead_priority not null default 'warm',
  status      lead_status not null default 'new',
  description text
);
create index leads_contact_id_idx on leads (contact_id);

create table transactions (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  lead_id            uuid not null references leads (id) on delete restrict,
  company_id         uuid references companies (id) on delete restrict,
  primary_contact_id uuid references contacts (id) on delete set null,
  title              text not null,
  scope              text,
  start_date         date,
  deadline           date,
  total_amount       numeric(12, 2) not null check (total_amount >= 0),
  currency           char(3) not null default 'INR',
  status             transaction_status not null default 'active',
  constraint transactions_deadline_after_start
    check (start_date is null or deadline is null or deadline >= start_date)
);
create index transactions_lead_id_idx on transactions (lead_id);
create index transactions_company_id_idx on transactions (company_id);

create table milestones (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  title          text not null,
  position       integer not null,
  due_date       date,
  is_done        boolean not null default false,
  done_at        timestamptz
);
create index milestones_transaction_id_idx on milestones (transaction_id, position);

create table payments (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  transaction_id uuid not null references transactions (id) on delete restrict,
  amount         numeric(12, 2) not null check (amount > 0),
  paid_on        date not null default current_date,
  method         payment_method,
  reference      text,
  notes          text
);
create index payments_transaction_id_idx on payments (transaction_id);

-- The do-not-email list. Not linked to contacts on purpose: it must survive
-- a contact being anonymized or deleted.
create table suppressions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email      extensions.citext not null unique,
  reason     suppression_reason not null,
  source     text
);
