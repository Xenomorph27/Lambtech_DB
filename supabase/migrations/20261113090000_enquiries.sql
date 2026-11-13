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

-- ---------------------------------------------------------------------------
-- submit_enquiry: the one thing the public role may execute
-- ---------------------------------------------------------------------------

create or replace function submit_enquiry(
  p_secret  text,
  p_name    text,
  p_email   text,
  p_phone   text,
  p_topic   text  default null,
  p_page    text  default null,
  p_meta    jsonb default '{}'::jsonb,
  p_ip_hash text  default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name  text  := btrim(coalesce(p_name, ''));
  v_email text  := btrim(coalesce(p_email, ''));
  v_phone text  := btrim(coalesce(p_phone, ''));
  v_topic text  := nullif(btrim(coalesce(p_topic, '')), '');
  v_page  text  := nullif(btrim(coalesce(p_page, '')), '');
  v_meta  jsonb := coalesce(p_meta, '{}'::jsonb);
  v_digits integer;
begin
  -- Only the website's server knows the secret; the public key alone is not enough.
  if p_secret is null or not exists (
    select from enquiry_intake_keys
     where sha256 = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then
    raise exception 'intake_refused' using errcode = 'P0001';
  end if;

  if char_length(v_name) not between 1 and 200 then
    raise exception 'invalid_enquiry: name' using errcode = 'P0001';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_enquiry: email' using errcode = 'P0001';
  end if;
  v_digits := char_length(regexp_replace(v_phone, '\D', '', 'g'));
  if char_length(v_phone) > 30 or v_digits not between 7 and 15 then
    raise exception 'invalid_enquiry: phone' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_topic, '')) > 200 then
    raise exception 'invalid_enquiry: topic' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_page, '')) > 300 then
    raise exception 'invalid_enquiry: page' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_meta) <> 'object' or octet_length(v_meta::text) > 2048 then
    raise exception 'invalid_enquiry: meta' using errcode = 'P0001';
  end if;

  -- A double click or a retried request: the first row stands.
  if exists (
    select from enquiries
     where email = v_email::extensions.citext
       and topic is not distinct from v_topic
       and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  if p_ip_hash is not null and (
    select count(*) from enquiries
     where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into enquiries (name, email, phone, topic, page, meta, ip_hash)
  values (v_name, v_email, v_phone, v_topic, v_page, v_meta, p_ip_hash);
end $$;

revoke all on function submit_enquiry(text, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function submit_enquiry(text, text, text, text, text, text, jsonb, text) to anon;

-- ---------------------------------------------------------------------------
-- confirm_enquiry: enquiry -> contact (found or created) + lead, atomically
-- ---------------------------------------------------------------------------

create or replace function confirm_enquiry(
  p_enquiry_id  uuid,
  p_full_name   text,
  p_email       text,
  p_phone       text,
  p_company_id  uuid          default null,
  p_job_title   text          default null,
  p_priority    lead_priority default 'warm',
  p_description text          default null
) returns uuid
language plpgsql as $$
declare
  e       enquiries%rowtype;
  v_email extensions.citext := btrim(p_email);
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  c_id    uuid;
  l_id    uuid;
begin
  -- The row lock makes two simultaneous confirms take turns.
  select * into e from enquiries where id = p_enquiry_id for update;
  if e.id is null then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  if e.status = 'confirmed' then
    raise exception 'This enquiry is already confirmed' using errcode = 'P0001';
  end if;
  if e.status = 'spam' then
    raise exception 'This enquiry is marked as spam; change its status first' using errcode = 'P0001';
  end if;

  select id into c_id from contacts where email = v_email;
  if c_id is null then
    insert into contacts (company_id, full_name, email, phone, job_title, source, source_detail)
    values (p_company_id, btrim(p_full_name), v_email, v_phone,
            nullif(btrim(coalesce(p_job_title, '')), ''),
            'inbound_form', nullif(concat_ws(' · ', e.topic, e.page), ''))
    returning id into c_id;
  else
    -- Someone we already know: keep their record, fill only a missing phone.
    update contacts set phone = v_phone where id = c_id and phone is null and v_phone is not null;
  end if;

  insert into leads (contact_id, enquiry_id, priority, description)
  values (c_id, e.id, coalesce(p_priority, 'warm'),
          coalesce(nullif(btrim(coalesce(p_description, '')), ''), e.topic))
  returning id into l_id;

  update enquiries set status = 'confirmed', contact_id = c_id where id = e.id;
  return l_id;
end $$;

revoke all on function
  confirm_enquiry(uuid, text, text, text, uuid, text, lead_priority, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Erasure also covers enquiries
-- ---------------------------------------------------------------------------

create or replace function anonymize_contact(p_contact_id uuid) returns void
language plpgsql as $$
declare
  person contacts%rowtype;
  placeholder extensions.citext := 'anonymized-' || replace(p_contact_id::text, '-', '') || '@invalid.local';
begin
  select * into person from contacts where id = p_contact_id;
  if person.id is null then
    raise exception 'Contact % not found', p_contact_id using errcode = 'P0002';
  end if;
  if person.is_anonymized then
    return;
  end if;

  insert into suppressions (email, reason, source)
  values (person.email, 'erased', 'anonymize_contact')
  on conflict (email) do update set reason = 'erased', source = 'anonymize_contact';

  if person.secondary_email is not null then
    insert into suppressions (email, reason, source)
    values (person.secondary_email, 'erased', 'anonymize_contact')
    on conflict (email) do update set reason = 'erased', source = 'anonymize_contact';
  end if;

  update emails_sent
     set to_email = placeholder, subject = 'Erased', body_text = null
   where contact_id = p_contact_id;
  update responses
     set from_email = null, subject = null, body_text = null
   where contact_id = p_contact_id;
  update enquiries
     set name = 'Erased', email = placeholder, phone = 'erased',
         meta = '{}'::jsonb, notes = null, ip_hash = null
   where contact_id = p_contact_id
      or email = person.email
      or (person.secondary_email is not null and email = person.secondary_email);
  update contacts
     set full_name = 'Anonymized contact',
         email = placeholder,
         secondary_email = null,
         phone = null,
         secondary_phone = null,
         job_title = null,
         source_detail = null,
         notes = null,
         is_anonymized = true
   where id = p_contact_id;
end $$;

revoke all on function anonymize_contact(uuid) from public, anon, authenticated;

-- Tell Supabase's API layer about the new function straight away.
notify pgrst, 'reload schema';
