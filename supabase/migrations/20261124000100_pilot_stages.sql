-- The pilot pipeline, rebuilt around how a pilot actually runs:
--
--   Handover -> CRM integration initiated (only when a CRM integration is needed)
--   -> Agent request placed -> Agent in testing -> Customer testing
--   -> Feedback round 1 .. 5, then Live (won) or Lost.
--
-- Live and Lost keep the keys 'converted' and 'stopped', so analytics, conversion
-- to retention and the revenue dates carry on unchanged.

-- ---------------------------------------------------------------- the question on every deal
alter table deals
  add column crm_required   boolean,
  add column crm_started_at timestamptz;

comment on column deals.crm_required is 'Does this pilot or deal need a CRM integration? Null until answered.';

-- ---------------------------------------------------------------- new stages
insert into stages (category, key, label, position, max_days, is_terminal, exit_requirements) values
  ('pilot', 'handover',         'Handover',                  1,  3, false, '[]'),
  ('pilot', 'crm_integration',  'CRM integration initiated', 2,  7, false, '[]'),
  ('pilot', 'agent_request',    'Agent request placed',      3,  3, false, '[]'),
  ('pilot', 'agent_testing',    'Agent in testing',          4,  5, false, '[]'),
  ('pilot', 'customer_testing', 'Customer testing',          5,  7, false, '[]'),
  ('pilot', 'feedback_1',       'Feedback round 1',          6,  5, false, '[]'),
  ('pilot', 'feedback_2',       'Feedback round 2',          7,  5, false, '[]'),
  ('pilot', 'feedback_3',       'Feedback round 3',          8,  5, false, '[]'),
  ('pilot', 'feedback_4',       'Feedback round 4',          9,  5, false, '[]'),
  ('pilot', 'feedback_5',       'Feedback round 5',         10,  5, false, '[]'),
  ('pilot', 'converted',        'Live',                     11, null, true, '["term_months", "monthly_value", "start_date", "close_reason"]'),
  ('pilot', 'stopped',          'Lost',                     12, null, true, '["close_reason"]')
on conflict (category, key) do update set
  label = excluded.label, position = excluded.position, max_days = excluded.max_days,
  is_terminal = excluded.is_terminal, exit_requirements = excluded.exit_requirements;

-- ---------------------------------------------------------------- move pilots off the old stages
-- Logged as a system change; the stage and owner rules are for people, not this move.
select set_config('app.reason', 'Pilot stages reworked: moved to the nearest new stage', false) \gset
alter table deals disable trigger deals_owner_trg;
alter table deals disable trigger deals_rules_trg;
update deals set stage = case stage
    when 'kickoff' then 'agent_request'
    when 'setup'   then 'agent_testing'
    when 'live'    then 'customer_testing'
    when 'readout' then 'feedback_1'
  end
 where category = 'pilot' and stage in ('kickoff', 'setup', 'live', 'readout');
alter table deals enable trigger deals_rules_trg;
alter table deals enable trigger deals_owner_trg;

delete from stages where category = 'pilot' and key in ('kickoff', 'setup', 'live', 'readout');

-- Customer testing is where the client judges the pilot: it needs a start date and
-- the six success criteria agreed. (These sat on Kickoff and Live before.)
update stages set exit_requirements =
  '["start_date", "sc_business_outcome", "sc_targets", "sc_leading_indicators", "sc_judged_by", "sc_failure_line", "sc_decision_statement"]'
 where category = 'pilot' and key = 'customer_testing';

-- ---------------------------------------------------------------- CRM rules
create or replace function deals_crm_rule() returns trigger
language plpgsql as $$
begin
  if new.category <> 'pilot' or not (tg_op = 'INSERT' or new.stage is distinct from old.stage) then
    return new;
  end if;
  if new.stage = 'crm_integration' then
    if new.crm_required is distinct from true then
      raise exception 'This pilot is marked as not needing a CRM integration'
        using errcode = 'check_violation';
    end if;
    new.crm_started_at := coalesce(new.crm_started_at, now());
  elsif new.stage not in ('handover', 'converted', 'stopped') then
    if new.crm_required is null then
      raise exception 'Answer whether a CRM integration is required before moving this pilot on'
        using errcode = 'check_violation', detail = 'crm_required';
    end if;
    if new.crm_required and new.crm_started_at is null then
      raise exception 'This pilot needs a CRM integration: move it to CRM integration initiated first'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;
create trigger deals_crm_trg before insert or update on deals
  for each row execute function deals_crm_rule();

-- ---------------------------------------------------------------- owners: every working pilot stage
create or replace function deals_owner_rule() returns trigger
language plpgsql as $$
begin
  if new.intern_owner is null
     and ((new.category = 'pilot' and new.stage not in ('handover', 'converted', 'stopped'))
          or (new.category = 'retention' and new.stage = 'onboarding'))
     and (tg_op = 'INSERT' or new.stage is distinct from old.stage) then
    raise exception 'Set an owner before moving this deal to %', new.stage
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------- the kickoff playbook
-- Kickoff is no longer a stage: the call happens once sales hands the pilot over.
update playbooks set trigger = 'deal_created', trigger_stage = null,
       description = 'Run on the kickoff call after handover. Pins down what the pilot must prove before the agent is requested.'
 where name = 'Pilot kickoff call';
