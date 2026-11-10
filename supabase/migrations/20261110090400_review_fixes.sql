-- Review fixes, before the schema reaches the live project:
--   1. an email recorded as already bounced suppresses its address
--   2. deleting a milestone recomputes the transaction's status
--   3. anonymize_contact also erases subjects and the source detail,
--      suppresses the secondary email, and is safe to call twice

-- 1 --------------------------------------------------------------------------

create or replace function emails_sent_before_update() returns trigger
language plpgsql as $$
begin
  if new.status = 'bounced' and (tg_op = 'INSERT' or old.status <> 'bounced') then
    new.bounced_at := coalesce(new.bounced_at, now());
  end if;
  return new;
end $$;

create or replace function emails_sent_after_bounce() returns trigger
language plpgsql as $$
begin
  if new.status = 'bounced' and (tg_op = 'INSERT' or old.status <> 'bounced') then
    insert into suppressions (email, reason, source)
    values (new.to_email, 'bounced', 'trigger:bounce')
    on conflict (email) do nothing;
  end if;
  return null;
end $$;

drop trigger emails_sent_10_before_update on emails_sent;
create trigger emails_sent_10_before_write before insert or update on emails_sent
  for each row execute function emails_sent_before_update();

drop trigger emails_sent_20_after_bounce on emails_sent;
create trigger emails_sent_20_after_bounce after insert or update of status on emails_sent
  for each row execute function emails_sent_after_bounce();

-- 2 --------------------------------------------------------------------------

create or replace function milestones_after_write() returns trigger
language plpgsql as $$
declare
  tx uuid := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
  total integer;
  done integer;
begin
  -- A milestone going with its transaction (cascade): nothing left to update.
  if tg_op = 'DELETE' and not exists (select from transactions where id = tx) then
    return null;
  end if;

  select count(*), count(*) filter (where is_done)
    into total, done
    from milestones where transaction_id = tx;

  if total > 0 and done = total then
    update transactions set status = 'completed'
     where id = tx and status in ('active', 'on_hold');
  elsif done < total then
    update transactions set status = 'active'
     where id = tx and status = 'completed';
  end if;
  return null;
end $$;

create trigger milestones_20_after_delete after delete on milestones
  for each row execute function milestones_after_write();

-- 3 --------------------------------------------------------------------------

create or replace function anonymize_contact(p_contact_id uuid) returns void
language plpgsql as $$
declare
  person contacts%rowtype;
  placeholder citext := 'anonymized-' || replace(p_contact_id::text, '-', '') || '@invalid.local';
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
