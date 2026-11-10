-- LambTech Desk: automatic behaviour (spec §6).
--
-- Triggers on one table fire in alphabetical order of their names, so the
-- names carry a number: 00 trims, 10 fills and checks, 20 reacts, 90 stamps.

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Trims surrounding spaces from the columns named as trigger arguments.
create or replace function trim_email_columns() returns trigger
language plpgsql as $$
declare
  col text;
  val text;
  row_json jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := row_json ->> col;
    if val is not null then
      row_json := jsonb_set(row_json, array[col], to_jsonb(btrim(val)));
    end if;
  end loop;
  new := jsonb_populate_record(new, row_json);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- emails_sent
-- ---------------------------------------------------------------------------

-- Fill to_email from the contact, then refuse addresses on the do-not-email
-- list: bounced addresses block every kind; the other reasons block outreach
-- and follow-ups but still allow transactional mail (invoices, replies).
create or replace function emails_sent_before_insert() returns trigger
language plpgsql as $$
declare
  why suppression_reason;
begin
  if new.to_email is null then
    select email into new.to_email from contacts where id = new.contact_id;
  end if;

  select reason into why from suppressions where email = new.to_email;
  if why is not null and (why = 'bounced' or new.kind in ('outreach', 'follow_up')) then
    raise exception 'Address % is on the do-not-email list (%)', new.to_email, why
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function emails_sent_before_update() returns trigger
language plpgsql as $$
begin
  if new.status = 'bounced' and old.status <> 'bounced' then
    new.bounced_at := coalesce(new.bounced_at, now());
  end if;
  return new;
end $$;

create or replace function emails_sent_after_bounce() returns trigger
language plpgsql as $$
begin
  if new.status = 'bounced' and old.status <> 'bounced' then
    insert into suppressions (email, reason, source)
    values (new.to_email, 'bounced', 'trigger:bounce')
    on conflict (email) do nothing;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- responses
-- ---------------------------------------------------------------------------

create or replace function responses_before_write() returns trigger
language plpgsql as $$
declare
  email_contact uuid;
begin
  if new.email_sent_id is not null then
    select contact_id into email_contact from emails_sent where id = new.email_sent_id;
    if new.contact_id is null then
      new.contact_id := email_contact;
    elsif new.contact_id <> email_contact then
      raise exception 'Response contact does not match the contact the email was sent to'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.category <> 'unclassified' then
      new.classified_at := coalesce(new.classified_at, now());
    end if;
  elsif new.category <> old.category then
    new.classified_at := now();
  end if;
  return new;
end $$;

-- A positive reply becomes a lead exactly once; reclassifying it away from
-- positive keeps the lead (a human decides whether it is lost).
create or replace function responses_after_write() returns trigger
language plpgsql as $$
declare
  changed boolean := tg_op = 'INSERT' or new.category <> old.category;
begin
  if changed and new.category = 'positive'
     and not exists (select from leads where response_id = new.id) then
    insert into leads (contact_id, response_id) values (new.contact_id, new.id);
  end if;

  if changed and new.category = 'unsubscribe' then
    insert into suppressions (email, reason, source)
    select email, 'unsubscribed', 'trigger:unsubscribe' from contacts where id = new.contact_id
    on conflict (email) do nothing;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- milestones -> transaction status
-- ---------------------------------------------------------------------------

create or replace function milestones_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.is_done <> old.is_done then
    new.done_at := case when new.is_done then coalesce(new.done_at, now()) end;
  end if;
  return new;
end $$;

create or replace function milestones_after_write() returns trigger
language plpgsql as $$
declare
  total integer;
  done integer;
begin
  select count(*), count(*) filter (where is_done)
    into total, done
    from milestones where transaction_id = new.transaction_id;

  if total > 0 and done = total then
    update transactions set status = 'completed'
     where id = new.transaction_id and status in ('active', 'on_hold');
  elsif done < total then
    update transactions set status = 'active'
     where id = new.transaction_id and status = 'completed';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

create or replace function transactions_before_insert() returns trigger
language plpgsql as $$
begin
  if new.primary_contact_id is null then
    select contact_id into new.primary_contact_id from leads where id = new.lead_id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Erasure (DPDP Act): keep the rows, remove the person.
-- ---------------------------------------------------------------------------

create or replace function anonymize_contact(p_contact_id uuid) returns void
language plpgsql as $$
declare
  current_email extensions.citext;
  placeholder extensions.citext := 'anonymized-' || replace(p_contact_id::text, '-', '') || '@invalid.local';
begin
  select email into current_email from contacts where id = p_contact_id;
  if current_email is null then
    raise exception 'Contact % not found', p_contact_id using errcode = 'P0002';
  end if;

  insert into suppressions (email, reason, source)
  values (current_email, 'erased', 'anonymize_contact')
  on conflict (email) do update set reason = 'erased', source = 'anonymize_contact';

  update emails_sent set to_email = placeholder, body_text = null where contact_id = p_contact_id;
  update responses set from_email = null, body_text = null where contact_id = p_contact_id;
  update contacts
     set full_name = 'Anonymized contact',
         email = placeholder,
         secondary_email = null,
         phone = null,
         secondary_phone = null,
         notes = null,
         is_anonymized = true
   where id = p_contact_id;
end $$;

-- ---------------------------------------------------------------------------
-- Wiring
-- ---------------------------------------------------------------------------

create trigger companies_00_trim before insert or update on companies
  for each row execute function trim_email_columns('domain');
create trigger contacts_00_trim before insert or update on contacts
  for each row execute function trim_email_columns('email', 'secondary_email');
create trigger emails_sent_00_trim before insert or update on emails_sent
  for each row execute function trim_email_columns('to_email', 'from_email');
create trigger responses_00_trim before insert or update on responses
  for each row execute function trim_email_columns('from_email');
create trigger suppressions_00_trim before insert or update on suppressions
  for each row execute function trim_email_columns('email');

create trigger emails_sent_10_before_insert before insert on emails_sent
  for each row execute function emails_sent_before_insert();
create trigger emails_sent_10_before_update before update on emails_sent
  for each row execute function emails_sent_before_update();
create trigger emails_sent_20_after_bounce after update of status on emails_sent
  for each row execute function emails_sent_after_bounce();

create trigger responses_10_before_write before insert or update on responses
  for each row execute function responses_before_write();
create trigger responses_20_after_write after insert or update on responses
  for each row execute function responses_after_write();

create trigger milestones_10_before_write before insert or update on milestones
  for each row execute function milestones_before_write();
create trigger milestones_20_after_write after insert or update of is_done on milestones
  for each row execute function milestones_after_write();

create trigger transactions_10_before_insert before insert on transactions
  for each row execute function transactions_before_insert();

create trigger companies_90_updated_at before update on companies
  for each row execute function set_updated_at();
create trigger contacts_90_updated_at before update on contacts
  for each row execute function set_updated_at();
create trigger emails_sent_90_updated_at before update on emails_sent
  for each row execute function set_updated_at();
create trigger responses_90_updated_at before update on responses
  for each row execute function set_updated_at();
create trigger leads_90_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger transactions_90_updated_at before update on transactions
  for each row execute function set_updated_at();
create trigger milestones_90_updated_at before update on milestones
  for each row execute function set_updated_at();
create trigger payments_90_updated_at before update on payments
  for each row execute function set_updated_at();
