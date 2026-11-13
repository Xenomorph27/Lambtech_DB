-- LambTech Desk: website enquiries (spec 2026-11-13).
--
-- A visitor submits the website form -> one row here (status 'new').
-- Staff confirm it -> confirm_enquiry() creates the contact and the lead.
-- The public reaches this schema through exactly one function,
-- submit_enquiry(), which refuses callers without the intake secret.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create type enquiry_status as enum ('new', 'contacted', 'confirmed', 'rejected', 'spam');

create table enquiries (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name       text not null,
  email      extensions.citext not null,
  phone      text not null,
  topic      text,
  page       text,
  meta       jsonb not null default '{}'::jsonb,
  ip_hash    text,
  status     enquiry_status not null default 'new',
  notes      text,
  contact_id uuid references contacts (id) on delete set null,
  handled_at timestamptz
);
create index enquiries_status_created_idx on enquiries (status, created_at desc);
create index enquiries_ip_hash_created_idx on enquiries (ip_hash, created_at desc);

-- SHA-256 hashes of the secrets the website's server may present.
-- The secrets themselves are never stored.
create table enquiry_intake_keys (
  sha256     text primary key,
  label      text,
  created_at timestamptz not null default now()
);

-- A lead may come from an enquiry or from a positive reply, never both.
alter table leads
  add column enquiry_id uuid unique references enquiries (id) on delete restrict;
alter table leads
  add constraint leads_one_origin check (response_id is null or enquiry_id is null);

-- The view lists its columns when created, so it is rebuilt to pick up enquiry_id.
drop view leads_view;
create view leads_view with (security_invoker = true) as
select l.*,
       c.full_name,
       c.email,
       c.phone,
       c.company_id,
       co.name as company_name
  from leads l
  join contacts c on c.id = l.contact_id
  left join companies co on co.id = c.company_id;

-- ---------------------------------------------------------------------------
-- Status rules
-- ---------------------------------------------------------------------------

create or replace function enquiries_before_write() returns trigger
language plpgsql as $$
declare
  has_lead boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      raise exception 'An enquiry is confirmed with the Confirm action, which creates its lead'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    has_lead := exists (select from leads where enquiry_id = new.id);
    if new.status = 'confirmed' and not has_lead then
      raise exception 'An enquiry is confirmed with the Confirm action, which creates its lead'
        using errcode = 'P0001';
    end if;
    if old.status = 'confirmed' and has_lead then
      raise exception 'This enquiry has a lead; close the lead instead'
        using errcode = 'P0001';
    end if;
    if old.status = 'new' and new.handled_at is null then
      new.handled_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger enquiries_00_trim before insert or update on enquiries
  for each row execute function trim_email_columns('email');
create trigger enquiries_10_before_write before insert or update on enquiries
  for each row execute function enquiries_before_write();
create trigger enquiries_90_updated_at before update on enquiries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Security: nothing for the API roles
-- ---------------------------------------------------------------------------

alter table enquiries           enable row level security;
alter table enquiry_intake_keys enable row level security;

revoke all on table enquiries, enquiry_intake_keys, leads_view from anon, authenticated;
revoke all on function enquiries_before_write() from public, anon, authenticated;
