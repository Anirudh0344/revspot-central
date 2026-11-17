-- Pilot and retention pipelines, reworked so a column means "what needs doing".
--
-- Pilot:     Handover -> Kickoff -> Setup -> Live -> Readout, then Converted or Stopped.
--            Extended is gone: an extended pilot is a live pilot with a new end date.
-- Retention: Onboarding -> Active -> Renewal due, with Paused alongside; Churned is the exit.
--            Month to month and On term described the contract, not the work, and now
--            show as a term tag. Renewed is no longer an exit: a renewed deal goes back
--            to Active with new dates.

-- ---------------------------------------------------------------- new retention stages
insert into stages (category, key, label, position, max_days, is_terminal, exit_requirements) values
  ('retention','onboarding', 'Onboarding',  1, 14,   false, '["monthly_value"]'),
  ('retention','active',     'Active',      2, null, false, '["monthly_value"]'),
  ('retention','renewal_due','Renewal due', 3, 30,   false, '["end_date"]'),
  ('retention','paused',     'Paused',      4, 30,   false, '["close_reason"]'),
  ('retention','churned',    'Churned',     5, null, true,  '["close_reason"]')
on conflict (category, key) do update set
  label = excluded.label,
  position = excluded.position,
  max_days = excluded.max_days,
  is_terminal = excluded.is_terminal,
  exit_requirements = excluded.exit_requirements;

-- ---------------------------------------------------------------- carry deals across
-- A rename of where a card sits, not a change anyone made to the deal, so the row
-- triggers (stage rules, activity log) are stood down. Foreign keys still apply.
alter table deals disable trigger user;

update deals set stage = 'live'
 where category = 'pilot' and stage = 'extended';

-- A renewed deal was closed under the old model and is live again under this one,
-- so it needs the dated next step every live deal carries.
update deals set
    stage = 'active',
    next_step = coalesce(nullif(next_step, ''), 'Confirm renewal terms and dates'),
    next_step_due = coalesce(next_step_due, current_date + 7)
 where category = 'retention' and stage = 'renewed';

update deals set stage = 'active'
 where category = 'retention' and stage in ('month_to_month','on_term');

alter table deals enable trigger user;

delete from stages where category = 'pilot' and key = 'extended';
delete from stages where category = 'retention' and key in ('month_to_month','on_term','renewed');

update stages set position = 6 where category = 'pilot' and key = 'converted';
update stages set position = 7 where category = 'pilot' and key = 'stopped';

-- ---------------------------------------------------------------- DL-5: conversion
-- The retention deal a pilot converts into now starts in Onboarding, whatever its term.
create or replace function convert_pilot(
  p_deal_id       uuid,
  p_term_months   int,
  p_monthly_value numeric,
  p_start_date    date,
  p_reason        text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pilot  deals%rowtype;
  new_id uuid;
begin
  select * into pilot from deals where id = p_deal_id;
  if not found or pilot.category <> 'pilot' then
    raise exception 'Deal % is not a pilot', p_deal_id;
  end if;
  if coalesce(p_reason, '') = '' then
    raise exception 'A reason is required to convert a pilot' using errcode = 'check_violation';
  end if;

  update deals set
    stage = 'converted', term_months = p_term_months, monthly_value = p_monthly_value,
    start_date = coalesce(p_start_date, pilot.start_date),
    close_reason = p_reason,
    closed_month = date_trunc('month', coalesce(p_start_date, current_date))::date
  where id = p_deal_id;

  insert into deals (
    client_id, title, product, projects, category, stage, parent_deal_id,
    commercial_model, term_months, monthly_value, contract_value,
    start_date, end_date,
    sc_business_outcome, sc_targets, sc_leading_indicators,
    sc_judged_by, sc_failure_line, sc_decision_statement,
    next_step, next_step_due, intern_owner, context_doc_url
  ) values (
    pilot.client_id, pilot.title || ' (retention)', pilot.product, pilot.projects,
    'retention', 'onboarding', pilot.id,
    pilot.commercial_model, p_term_months, p_monthly_value,
    p_monthly_value * greatest(coalesce(p_term_months, 1), 1),
    coalesce(p_start_date, current_date),
    coalesce(p_start_date, current_date) + (greatest(coalesce(p_term_months,1),1) || ' months')::interval,
    pilot.sc_business_outcome, pilot.sc_targets, pilot.sc_leading_indicators,
    pilot.sc_judged_by, pilot.sc_failure_line, pilot.sc_decision_statement,
    'Run kickoff for the retention engagement', current_date + 3,
    pilot.intern_owner, pilot.context_doc_url
  ) returning id into new_id;

  insert into tasks (deal_id, client_id, title, owner, due_date)
  values (new_id, pilot.client_id, 'Kickoff: retention engagement', pilot.intern_owner, current_date + 3);

  return new_id;
end
$$;

-- ---------------------------------------------------------------- DL-13: renewal watch
-- Only deals on a term of three months or more come up for renewal. A month-to-month
-- deal ends every month, so it would otherwise sit in Renewal due permanently.
create or replace function run_renewal_watch() returns int
language plpgsql security definer set search_path = public as $$
declare
  d      record;
  admin  uuid;
  n      int := 0;
begin
  select id into admin from profiles where role = 'admin' and is_active order by created_at limit 1;
  for d in
    select * from deals
     where category = 'retention' and archived_at is null
       and stage = 'active'
       and coalesce(term_months, 1) >= 3
       and end_date is not null and end_date <= current_date + 30
  loop
    update deals set stage = 'renewal_due' where id = d.id;
    insert into tasks (deal_id, client_id, title, owner, due_date)
    values (d.id, d.client_id, 'Renewal conversation: ' || d.title,
            coalesce(admin, d.intern_owner), greatest(d.end_date - 14, current_date));
    n := n + 1;
  end loop;
  return n;
end
$$;
