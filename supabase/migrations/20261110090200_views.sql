-- LambTech Desk: read views (spec §7).
--
-- security_invoker makes the views honour row-level security on the tables.
-- Money and progress figures are always calculated here, never stored.

-- Table 2a: automated and genuine negative replies.
create view responses_a with (security_invoker = true) as
select r.*, c.full_name, c.email
  from responses r
  join contacts c on c.id = r.contact_id
 where r.category in ('auto_reply', 'negative', 'unsubscribe');

-- Table 2b: genuine positive replies.
create view responses_b with (security_invoker = true) as
select r.*, c.full_name, c.email
  from responses r
  join contacts c on c.id = r.contact_id
 where r.category = 'positive';

-- Table 3: leads with the person behind them.
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

-- Table 4: ongoing work with money and progress worked out.
create view transactions_view with (security_invoker = true) as
select t.*,
       coalesce(p.amount_paid, 0)::numeric(12, 2)                    as amount_paid,
       (t.total_amount - coalesce(p.amount_paid, 0))::numeric(12, 2) as amount_remaining,
       coalesce(m.milestones_done, 0)::integer                       as milestones_done,
       coalesce(m.milestones_total, 0)::integer                      as milestones_total,
       case
         when coalesce(m.milestones_total, 0) = 0 then 0
         else round(m.milestones_done * 100.0 / m.milestones_total)::integer
       end                                                           as progress_pct,
       t.deadline - current_date                                     as days_left,
       (t.deadline is not null
        and t.deadline < current_date
        and t.status not in ('completed', 'cancelled'))              as is_overdue
  from transactions t
  left join (
    select transaction_id, sum(amount) as amount_paid
      from payments
     group by transaction_id
  ) p on p.transaction_id = t.id
  left join (
    select transaction_id,
           count(*)                        as milestones_total,
           count(*) filter (where is_done) as milestones_done
      from milestones
     group by transaction_id
  ) m on m.transaction_id = t.id;
