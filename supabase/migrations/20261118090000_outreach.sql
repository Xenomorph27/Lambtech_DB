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
