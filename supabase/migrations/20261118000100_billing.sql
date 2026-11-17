-- Billing: PI -> PO/RO -> payment -> TI, the reminder queue, and mailbox connections.
--
-- One row in `invoices` is one bill: it is born as a PI, collects the client's
-- PO/RO, takes payments, and ends when the TI is issued. Zoho Billing stays the
-- system that produces the documents; this records their numbers and dates so
-- the deal, the client and finance can see where every rupee is.
--
-- The bill-to party is not always the client: L&T is billed through its agency,
-- HoABL through an intermediary. That is a billing account.

alter type invoice_status add value if not exists 'cancelled';

-- ---------------------------------------------------------------- bill-to parties
create table billing_accounts (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients,
  name             text not null,
  legal_name       text,
  gstin            text,
  to_emails        text[] not null default '{}',
  cc_emails        text[] not null default '{}',
  is_intermediary  boolean not null default false,  -- an agency or reseller billed on the client's behalf
  zoho_customer_id text,
  notes            text,
  archived_at      timestamptz,
  created_by       uuid references profiles,
  updated_by       uuid references profiles,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index billing_accounts_client_idx on billing_accounts (client_id) where archived_at is null;

alter table deals add column billing_account_id uuid references billing_accounts;

-- ---------------------------------------------------------------- bills
alter table invoices rename column invoice_number to ti_number;
alter table invoices rename column issue_date to ti_date;
alter table invoices
  add column billing_account_id uuid references billing_accounts,
  add column description        text,
  add column period_start       date,           -- the month or span this bill covers
  add column period_end         date,
  add column pi_number          text,
  add column pi_date            date,
  add column pi_sent_on         date,
  add column po_received_on     date,
  add column po_url             text,
  add column zoho_pi_id         text,
  add column zoho_ti_id         text,
  add column gmail_thread_id    text,           -- the PI email; reminders reply on it
  add column updated_at         timestamptz not null default now();

alter table invoices add constraint invoices_period_order
  check (period_end is null or period_start is null or period_end >= period_start);
alter table invoices add constraint invoices_amount_positive check (amount > 0);
alter table invoices add constraint invoices_ti_after_pi
  check (ti_number is null or pi_number is not null);

create index invoices_deal_idx   on invoices (deal_id);
create index invoices_client_idx on invoices (client_id);
create unique index invoices_pi_number_uniq on invoices (lower(pi_number)) where pi_number is not null;
create unique index invoices_ti_number_uniq on invoices (lower(ti_number)) where ti_number is not null;
create index payments_invoice_idx on payments (invoice_id);

alter table payments add constraint payments_amount_positive check (amount > 0);

-- A bill belongs to its deal's client.
create or replace function invoices_client_matches_deal() returns trigger
language plpgsql as $$
begin
  if new.client_id is null then
    select client_id into new.client_id from deals where id = new.deal_id;
  elsif not exists (select 1 from deals where id = new.deal_id and client_id = new.client_id) then
    raise exception 'This bill''s client does not match its deal''s client';
  end if;
  if new.billing_account_id is null then
    select billing_account_id into new.billing_account_id from deals where id = new.deal_id;
  end if;
  return new;
end
$$;
create trigger invoices_client_match before insert or update on invoices
  for each row execute function invoices_client_matches_deal();

-- No paying more than the bill.
create or replace function payments_within_balance() returns trigger
language plpgsql as $$
declare
  v_total numeric;
  v_paid  numeric;
begin
  select amount + gst into v_total from invoices where id = new.invoice_id;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = new.invoice_id;
  if v_paid + new.amount > v_total then
    raise exception 'This payment would take the bill past its total of %', v_total;
  end if;
  return new;
end
$$;
create trigger payments_within_balance_trg before insert on payments
  for each row execute function payments_within_balance();

-- ---------------------------------------------------------------- helpers
create or replace function today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- 1234567.5 -> '12,34,568' (Indian grouping, whole rupees)
create or replace function inr_text(v numeric) returns text
language plpgsql immutable as $$
declare
  s    text := round(abs(coalesce(v, 0)))::bigint::text;
  head text;
  tail text;
begin
  if length(s) <= 3 then
    return case when v < 0 then '-' else '' end || '₹' || s;
  end if;
  tail := right(s, 3);
  head := left(s, length(s) - 3);
  head := regexp_replace(reverse(regexp_replace(reverse(head), '(\d{2})(?=\d)', '\1,', 'g')), '^,', '');
  return case when v < 0 then '-' else '' end || '₹' || head || ',' || tail;
end
$$;

-- ---------------------------------------------------------------- views
create or replace view bill_view as
with paid as (
  select invoice_id, sum(amount) as paid, max(received_on) as last_paid_on
    from payments group by invoice_id
)
select
  i.*,
  i.amount + i.gst                                   as total,
  coalesce(p.paid, 0)                                as paid,
  i.amount + i.gst - coalesce(p.paid, 0)             as balance,
  p.last_paid_on,
  case
    when i.status in ('cancelled', 'written_off')                 then i.status::text
    when i.amount + i.gst - coalesce(p.paid, 0) <= 0
         and i.ti_number is not null                              then 'ti_issued'
    when i.amount + i.gst - coalesce(p.paid, 0) <= 0              then 'paid'
    when coalesce(p.paid, 0) > 0                                  then 'partially_paid'
    when i.po_number is not null                                  then 'po_received'
    when i.pi_sent_on is not null                                 then 'pi_sent'
    else 'draft'
  end                                                as step,
  (i.status not in ('cancelled', 'written_off')
     and i.pi_sent_on is not null
     and i.amount + i.gst - coalesce(p.paid, 0) > 0
     and i.due_date < today_ist())                   as overdue,
  case when i.due_date < today_ist() then today_ist() - i.due_date else 0 end as days_overdue,
  d.title                                            as deal_title,
  d.code                                             as deal_code,
  d.category                                         as deal_category,
  c.name                                             as client_name,
  ba.name                                            as bill_to_name,
  ba.is_intermediary                                 as bill_to_is_intermediary,
  coalesce(nullif(ba.to_emails, '{}'), fin.emails, '{}') as to_emails,
  coalesce(ba.cc_emails, '{}')                       as cc_emails
from invoices i
join deals d   on d.id = i.deal_id
join clients c on c.id = i.client_id
left join billing_accounts ba on ba.id = i.billing_account_id
left join paid p on p.invoice_id = i.id
left join lateral (
  -- No billing account email: fall back to the client's finance contacts.
  select array_agg(ct.email order by ct.name) as emails
    from contacts ct
   where ct.client_id = i.client_id and ct.role = 'finance'
     and ct.email is not null and ct.archived_at is null
) fin on true;

-- Per deal: is it invoiced? A monthly retention deal must be invoiced for the
-- current month; anything else needs one bill. Expansion is not billable before
-- it is closed.
create or replace view deal_billing as
with m as (
  select date_trunc('month', today_ist())::date as month_start,
         (date_trunc('month', today_ist()) + interval '1 month')::date as next_month
),
b as (
  select bv.deal_id,
         count(*)::int                                    as bills,
         coalesce(sum(bv.total), 0)                       as billed,
         coalesce(sum(bv.paid), 0)                        as paid,
         coalesce(sum(bv.balance) filter (where bv.step <> 'draft'), 0) as outstanding,
         coalesce(sum(bv.balance) filter (where bv.overdue), 0)         as overdue_amount,
         count(*) filter (where bv.overdue)::int          as overdue_bills,
         count(*) filter (where bv.step = 'paid')::int    as paid_awaiting_ti,
         bool_or(bv.period_start < m.next_month
                 and coalesce(bv.period_end, bv.period_start) >= m.month_start) as covers_this_month,
         max(bv.pi_date)                                  as last_pi_date
    from bill_view bv, m
   where bv.step not in ('cancelled', 'written_off')
   group by bv.deal_id
)
select
  d.id as deal_id,
  coalesce(b.bills, 0)::int     as bills,
  coalesce(b.billed, 0)         as billed,
  coalesce(b.paid, 0)           as paid,
  coalesce(b.outstanding, 0)    as outstanding,
  coalesce(b.overdue_amount, 0) as overdue_amount,
  coalesce(b.overdue_bills, 0)::int as overdue_bills,
  coalesce(b.paid_awaiting_ti, 0)::int as paid_awaiting_ti,
  b.last_pi_date,
  (d.category = 'retention' and coalesce(d.monthly_value, 0) > 0) as bills_monthly,
  case
    when coalesce(d.monthly_value, 0) = 0 and coalesce(d.contract_value, 0) = 0 then 'no_value'
    when d.category = 'expansion' and d.stage in ('conversation_started', 'proposal_sent', 'lost') then 'not_yet'
    when d.category = 'retention' and coalesce(d.monthly_value, 0) > 0
         and not coalesce(b.covers_this_month, false)            then 'not_invoiced'
    when coalesce(b.bills, 0) = 0                                then 'not_invoiced'
    when coalesce(b.outstanding, 0) = 0 and coalesce(b.billed, 0) > 0 then 'paid'
    else 'invoiced'
  end as billing_state
from deals d
left join b on b.deal_id = d.id;

create or replace view client_billing as
select
  c.id as client_id,
  count(bv.id) filter (where bv.step not in ('draft', 'cancelled'))::int      as bills_raised,
  count(bv.id) filter (where bv.balance > 0 and bv.step not in ('draft', 'cancelled', 'written_off'))::int as bills_due,
  coalesce(sum(bv.balance) filter (where bv.step not in ('draft', 'cancelled', 'written_off')), 0) as due_amount,
  count(bv.id) filter (where bv.overdue)::int                                 as bills_overdue,
  coalesce(sum(bv.balance) filter (where bv.overdue), 0)                      as overdue_amount,
  coalesce(sum(bv.paid), 0)                                                   as collected,
  (select count(*) from deals d join deal_billing db on db.deal_id = d.id join stages s
           on s.category = d.category and s.key = d.stage
    where d.client_id = c.id and d.archived_at is null and not s.is_terminal
      and db.billing_state in ('invoiced', 'paid'))::int                      as deals_invoiced,
  (select count(*) from deals d join deal_billing db on db.deal_id = d.id join stages s
           on s.category = d.category and s.key = d.stage
    where d.client_id = c.id and d.archived_at is null and not s.is_terminal
      and db.billing_state = 'not_invoiced')::int                             as deals_not_invoiced
from clients c
left join bill_view bv on bv.client_id = c.id
group by c.id;

-- ---------------------------------------------------------------- reminders
create table billing_reminders (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references invoices,
  kind             text not null check (kind in ('po_chase', 'pre_due', 'due', 'overdue', 'manual')),
  scheduled_for    date not null,
  status           text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  to_emails        text[] not null default '{}',
  cc_emails        text[] not null default '{}',
  subject          text not null,
  body             text not null,
  sent_at          timestamptz,
  sent_from        text,
  gmail_message_id text,
  gmail_thread_id  text,
  error            text,
  created_by       uuid references profiles,
  updated_by       uuid references profiles,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (invoice_id, kind, scheduled_for)
);
create index billing_reminders_queue_idx on billing_reminders (status, scheduled_for);

-- Writes the day's reminders. Safe to run any number of times a day.
--   PI sent, no PO/RO after 3 days   -> chase the PO, then weekly
--   3 days before the due date       -> heads-up
--   on the due date                  -> due today
--   past due                         -> weekly until paid
-- A bill that already has an unsent reminder gets no second one.
create or replace function queue_billing_reminders() returns integer
language plpgsql as $$
declare
  t      date := today_ist();
  r      record;
  v_kind text;
  v_subj text;
  v_body text;
  n      integer := 0;
  ref    text;
  hi     text;
begin
  for r in
    select bv.* from bill_view bv
     where bv.step in ('pi_sent', 'po_received', 'partially_paid')
       and bv.status <> 'disputed'
       and bv.balance > 0
       and not exists (select 1 from billing_reminders q where q.invoice_id = bv.id and q.status = 'queued')
  loop
    v_kind := null;
    if r.due_date is not null and r.due_date < t then
      if not exists (select 1 from billing_reminders q
                      where q.invoice_id = r.id and q.kind = 'overdue' and q.scheduled_for > t - 7) then
        v_kind := 'overdue';
      end if;
    elsif r.due_date = t then
      if not exists (select 1 from billing_reminders q where q.invoice_id = r.id and q.kind = 'due') then
        v_kind := 'due';
      end if;
    elsif r.due_date is not null and r.due_date - t between 1 and 3 then
      if not exists (select 1 from billing_reminders q where q.invoice_id = r.id and q.kind = 'pre_due') then
        v_kind := 'pre_due';
      end if;
    end if;

    if v_kind is null and r.step = 'pi_sent' and r.pi_sent_on <= t - 3 then
      if not exists (select 1 from billing_reminders q
                      where q.invoice_id = r.id and q.kind = 'po_chase' and q.scheduled_for > t - 7) then
        v_kind := 'po_chase';
      end if;
    end if;

    continue when v_kind is null;

    ref := coalesce(r.pi_number, 'our proforma invoice');
    hi  := 'Hi ' || coalesce(r.bill_to_name, r.client_name) || ' team,';

    v_subj := case v_kind
      when 'po_chase' then 'PO/RO for ' || ref || ' · ' || r.client_name
      when 'pre_due'  then 'Payment due ' || to_char(r.due_date, 'FMDD Mon') || ' · ' || ref
      when 'due'      then 'Payment due today · ' || ref
      when 'overdue'  then 'Payment overdue by ' || (t - r.due_date) || ' days · ' || ref
    end;

    v_body := hi || E'\n\n' || case v_kind
      when 'po_chase' then
        'Following up on ' || ref
        || coalesce(' dated ' || to_char(r.pi_date, 'FMDD Mon YYYY'), '')
        || coalesce(' for ' || r.description, '')
        || ' (' || inr_text(r.total) || ' including GST). Could you share the PO/RO so we can proceed?'
      when 'pre_due' then
        'A reminder that ' || inr_text(r.balance) || ' against ' || ref
        || coalesce(' (PO/RO ' || r.po_number || ')', '')
        || ' is due on ' || to_char(r.due_date, 'FMDD Mon YYYY') || '.'
      when 'due' then
        inr_text(r.balance) || ' against ' || ref
        || coalesce(' (PO/RO ' || r.po_number || ')', '')
        || ' is due today. Please share the payment reference once it is done.'
      when 'overdue' then
        inr_text(r.balance) || ' against ' || ref
        || coalesce(' (PO/RO ' || r.po_number || ')', '')
        || ' was due on ' || to_char(r.due_date, 'FMDD Mon YYYY')
        || '. Could you let us know when we can expect the payment?'
    end
    || E'\n\nWe will send the tax invoice as soon as the payment is received.'
    || E'\n\nThanks,\nRevspot Finance';

    insert into billing_reminders (invoice_id, kind, scheduled_for, to_emails, cc_emails, subject, body)
    values (r.id, v_kind, t, r.to_emails, r.cc_emails, v_subj, v_body)
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------- mailboxes
-- Accounts connected through Google sign-in. Tokens live in a table the
-- signed-in role cannot read at all, encrypted by the server.
create table mail_accounts (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  can_send       boolean not null default false,
  can_read       boolean not null default false,
  status         text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  last_error     text,
  last_synced_at timestamptz,
  connected_by   uuid references profiles,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table mail_account_tokens (
  account_id        uuid primary key references mail_accounts on delete cascade,
  refresh_token_enc text not null,
  access_token_enc  text,
  expires_at        timestamptz,
  scopes            text
);

-- ---------------------------------------------------------------- audit, RLS, grants
do $$
declare t text;
begin
  foreach t in array array['billing_accounts', 'billing_reminders'] loop
    execute format('create trigger %1$s_touch before insert or update on %1$s
                      for each row execute function touch_row()', t);
    execute format('create trigger %1$s_activity after insert or update on %1$s
                      for each row execute function log_activity()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true)', t);
    execute format('create policy %1$s_insert on %1$s for insert to authenticated with check (is_writer())', t);
    execute format('create policy %1$s_update on %1$s for update to authenticated using (is_writer()) with check (is_writer())', t);
  end loop;
end
$$;

alter table mail_accounts enable row level security;
create policy mail_accounts_read on mail_accounts for select to authenticated using (true);
revoke insert, update on mail_accounts from authenticated;

alter table mail_account_tokens enable row level security;
revoke all on mail_account_tokens from anon, authenticated;

grant select on bill_view, deal_billing, client_billing to anon, authenticated;
grant select, insert, update on billing_accounts, billing_reminders to authenticated;
alter function queue_billing_reminders() security definer set search_path = public;
grant execute on function queue_billing_reminders() to authenticated;
