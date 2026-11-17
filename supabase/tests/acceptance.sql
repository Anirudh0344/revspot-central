\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function expect_fail(sql text, want text) returns text
language plpgsql as $$
begin
  execute sql;
  return 'FAIL  (expected an error: ' || want || ')';
exception when others then
  if position(lower(want) in lower(sqlerrm)) > 0 then
    return 'ok    blocked: ' || want;
  end if;
  return 'FAIL  wrong error for "' || want || '": ' || sqlerrm;
end $$;

create or replace function expect(cond boolean, label text) returns text
language sql as $$ select case when cond then 'ok    ' || label else 'FAIL  ' || label end $$;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001','anunay@revspot.ai'),
  ('00000000-0000-0000-0000-00000000a002','intern@revspot.ai'),
  ('00000000-0000-0000-0000-00000000a003','grok@revspot.ai'),
  ('00000000-0000-0000-0000-00000000a005','sales@revspot.ai');
insert into profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-00000000a001','Anunay','anunay@revspot.ai','admin'),
  ('00000000-0000-0000-0000-00000000a002','Intern One','intern@revspot.ai','intern'),
  ('00000000-0000-0000-0000-00000000a003','Grok bot','grok@revspot.ai','bot'),
  ('00000000-0000-0000-0000-00000000a005','Sales','sales@revspot.ai','viewer');

select set_config('app.actor','00000000-0000-0000-0000-00000000a001', false);
select set_config('app.reason','test setup', false);

insert into clients (id, name, segment, city, intern_owner)
values ('00000000-0000-0000-0000-00000000c001','Godrej Properties','developer','Mumbai',
        '00000000-0000-0000-0000-00000000a002');

\echo '--- Module 1: clients and contacts'
select expect_fail(
  $$insert into clients (name) values ('godrej properties')$$,
  'duplicate');

insert into contacts (client_id, name, role) values
  ('00000000-0000-0000-0000-00000000c001','Rohit Mehta','day_to_day');
select expect((select single_threaded from client_view where id='00000000-0000-0000-0000-00000000c001'),
  'CL-7 one roled contact and no decision maker flags single-threaded');

insert into contacts (client_id, name, role) values
  ('00000000-0000-0000-0000-00000000c001','Priya Nair','decision_maker');
select expect(not (select single_threaded from client_view where id='00000000-0000-0000-0000-00000000c001'),
  'CL-7 flag clears with a decision maker and two roled contacts');

\echo '--- Module 2: deals, stages, criteria, health'
select expect_fail(
  $$insert into deals (client_id, title, category, stage)
    values ('00000000-0000-0000-0000-00000000c001','No next step','pilot','handover')$$,
  'Next step and due date are required');

insert into deals (id, code, client_id, title, product, category, stage, next_step, next_step_due, intern_owner)
values ('00000000-0000-0000-0000-00000000d001','GPL-PS','00000000-0000-0000-0000-00000000c001',
        'GPL Pre-sales agents','Voice AI','pilot','handover','Confirm kickoff date', current_date + 2,
        '00000000-0000-0000-0000-00000000a002');

select expect_fail(
  $$update deals set stage='kickoff' where id='00000000-0000-0000-0000-00000000d001'$$,
  'missing sc_business_outcome');

select expect_fail(
  $$update deals set health='green', health_reason='looks fine'
     where id='00000000-0000-0000-0000-00000000d001'$$,
  'incomplete success criteria cannot be set to green');

select expect_fail(
  $$update deals set health='amber' where id='00000000-0000-0000-0000-00000000d001'$$,
  'reason is required when setting health');

update deals set
  sc_business_outcome='30 site visits a month from pre-sales calling',
  sc_targets='500 QLs at 12% connect-to-QL',
  sc_leading_indicators='dials/day, connect rate, QL rate',
  sc_judged_by='Priya Nair, VP Sales',
  sc_failure_line='Under 300 QLs in the pilot month',
  sc_decision_statement='Convert to a 6-month retainer if QLs clear 400'
where id='00000000-0000-0000-0000-00000000d001';

update deals set stage='kickoff' where id='00000000-0000-0000-0000-00000000d001';
select expect((select stage from deals where id='00000000-0000-0000-0000-00000000d001')='kickoff',
  'DL-4 move to kickoff succeeds once criteria are complete');

update deals set health='green', health_reason='Pilot tracking at 110% of plan'
 where id='00000000-0000-0000-0000-00000000d001';
select expect((select count(*) from health_history where deal_id='00000000-0000-0000-0000-00000000d001')=1,
  'DL-9 health change writes health_history');

update deals set stage='setup' where id='00000000-0000-0000-0000-00000000d001';
update deals set stage='live', start_date=current_date - 20 where id='00000000-0000-0000-0000-00000000d001';
update deals set stage='readout', end_date=current_date + 5 where id='00000000-0000-0000-0000-00000000d001';

select expect_fail(
  $$update deals set stage='stopped' where id='00000000-0000-0000-0000-00000000d001'$$,
  'missing close_reason');

\echo '--- DL-5: converting a pilot'
select convert_pilot('00000000-0000-0000-0000-00000000d001', 6, 250000, current_date,
                     'Pilot cleared 420 QLs against a 400 line') as new_retention_deal;
select expect((select count(*) from deals
               where parent_deal_id='00000000-0000-0000-0000-00000000d001' and category='retention')=1,
  'DL-5 conversion creates exactly one retention deal');
select expect((select stage from deals where parent_deal_id='00000000-0000-0000-0000-00000000d001')='onboarding',
  'DL-5 the new retention deal starts in onboarding');
select expect((select count(*) from tasks
               where deal_id=(select id from deals where parent_deal_id='00000000-0000-0000-0000-00000000d001'))=1,
  'DL-5 conversion creates a kickoff task');
select expect((select status from client_view where id='00000000-0000-0000-0000-00000000c001')='Active',
  'CL-2 a client with an open retention deal is Active');

\echo '--- DL-13: renewal watch'
update deals set stage='active' where parent_deal_id='00000000-0000-0000-0000-00000000d001';
select expect(run_renewal_watch()=0, 'DL-13 a term deal far from its end date is left alone');

update deals set end_date = current_date + 20
 where parent_deal_id='00000000-0000-0000-0000-00000000d001';
insert into deals (client_id, title, category, stage, term_months, monthly_value, end_date,
                   next_step, next_step_due)
values ('00000000-0000-0000-0000-00000000c001','Monthly enrichment','retention','active',
        1, 50000, current_date + 10, 'Send this month''s numbers', current_date + 5);
select expect(run_renewal_watch()=1, 'DL-13 only the term deal nearing its end is picked up');
select expect((select stage from deals where parent_deal_id='00000000-0000-0000-0000-00000000d001')
              ='renewal_due', 'DL-13 the term deal moves to renewal due');
select expect((select stage from deals where title='Monthly enrichment')='active',
  'DL-13 a month-to-month deal never enters renewal due');

-- Renewing is a move back to Active with new dates, not an exit.
update deals set stage='active', end_date = current_date + 200
 where parent_deal_id='00000000-0000-0000-0000-00000000d001';
select expect((select stage from deals where parent_deal_id='00000000-0000-0000-0000-00000000d001')
              ='active', 'a renewed deal goes back to active');
select expect_fail(
  $$update deals set stage='onboarding'
     where parent_deal_id='00000000-0000-0000-0000-00000000d001'$$,
  'Onboarding is only for a new retention deal');
select expect((select count(*) from stages where key in
               ('extended','month_to_month','on_term','renewed','idea','validated','trial','won','parked'))=0,
  'the retired stages are gone from every pipeline');

\echo '--- Module 3: tasks, requests, activity'
insert into tasks (deal_id, client_id, title, owner, due_date)
values ((select id from deals where parent_deal_id='00000000-0000-0000-0000-00000000d001'),
        '00000000-0000-0000-0000-00000000c001','Share month-1 readout deck',
        '00000000-0000-0000-0000-00000000a002', current_date + 1);
select expect((select next_step from deals where parent_deal_id='00000000-0000-0000-0000-00000000d001')
              ='Share month-1 readout deck',
  'TK-3 next step mirrors the earliest open task');

insert into requests (deal_id, team, ask, raised_at)
values ('00000000-0000-0000-0000-00000000d001','data','Pull Epoque buyer list','2026-11-09 10:00+05:30');
select expect((select (due_at at time zone 'Asia/Kolkata')::date from requests
               where ask='Pull Epoque buyer list') = date '2026-11-11',
  'RQ-1 a Monday data request defaults to Wednesday');

select expect((select count(*) from activity
               where deal_id='00000000-0000-0000-0000-00000000d001' and action='stage_change') >= 4,
  'AC-1 stage moves are logged');
select expect_fail($$delete from activity where id = (select min(id) from activity)$$,
  'cannot be deleted');

\echo '--- Module 9: bot writes, reason, undo'
select set_config('app.actor','00000000-0000-0000-0000-00000000a003', false);
select set_config('app.reason','', false);
select expect_fail(
  $$update deals set next_step='Bot touched this' where id='00000000-0000-0000-0000-00000000d001'$$,
  'reason is required for bot writes');

select set_config('app.reason','Nightly hygiene: next step was stale', false);
update deals set next_step='Confirm renewal terms with Priya', next_step_due = current_date + 4
 where id='00000000-0000-0000-0000-00000000d001';
select expect((select actor from activity order by id desc limit 1)='00000000-0000-0000-0000-00000000a003',
  'BA-1 the bot is the actor on its own writes');

select undo_activity((select id from activity where actor='00000000-0000-0000-0000-00000000a003'
                      and action <> 'undo' order by id desc limit 1));
select expect((select action from activity order by id desc limit 1)='undo',
  'BA-2 the undo is logged as its own row');
select expect((select count(*) from activity where undone_at is not null)=1,
  'BA-2 the undone row is marked');

\echo '--- views'
select expect((select criteria_complete from deal_view where id='00000000-0000-0000-0000-00000000d001'),
  'deal_view reports complete criteria');
select expect((select health from client_view where id='00000000-0000-0000-0000-00000000c001') is null,
  'CL-3 client health is blank while no open deal has health');

select set_config('app.actor','00000000-0000-0000-0000-00000000a001', false);
update deals set health='green', health_reason='Month 1 delivered in full'
 where parent_deal_id='00000000-0000-0000-0000-00000000d001';
select expect((select health from client_view where id='00000000-0000-0000-0000-00000000c001')='green',
  'CL-3 one green open deal makes the client green');

insert into deals (client_id, title, category, stage, next_step, next_step_due, health, health_reason)
values ('00000000-0000-0000-0000-00000000c001','GPL Data enrichment','pilot','handover',
        'Scope the record count', current_date + 1, 'red', 'Data team has not started');
select expect((select health from client_view where id='00000000-0000-0000-0000-00000000c001')='red',
  'CL-3 client health is the worst across open deals');
select expect((select count(*) from bot_work_queue) >= 1,
  'AU-7 the bot work queue returns work');

\echo '--- RLS and grants: the app runs as `authenticated`, not as the owner'

-- Anunay (admin)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a001', false);
select set_config('app.actor','00000000-0000-0000-0000-00000000a001', false);
select set_config('app.reason','RLS check', false);
set role authenticated;

select expect((select count(*) from deal_view) > 0, 'authenticated can read deal_view');
select expect((select count(*) from client_view) > 0, 'authenticated can read client_view');
select expect((select count(*) from bot_work_queue) >= 0, 'authenticated can read bot_work_queue');

update deals set next_step = 'Confirm the readout date', next_step_due = current_date + 2
 where id = '00000000-0000-0000-0000-00000000d001';
select expect((select next_step from deals where id='00000000-0000-0000-0000-00000000d001')
              ='Confirm the readout date',
  'an admin can write as authenticated and the audit trigger still fires');
select expect((select count(*) from activity where entity_id='00000000-0000-0000-0000-00000000d001'
                 and changes ? 'next_step') >= 1,
  'the activity trigger writes even though authenticated cannot insert into activity');

select expect_fail($$delete from deals where id='00000000-0000-0000-0000-00000000d001'$$,
  'permission denied');
select expect_fail($$insert into activity (entity_type, entity_id, action)
                     values ('deals','00000000-0000-0000-0000-00000000d001','forged')$$,
  'permission denied');

reset role;

-- An intern may not touch commercial fields
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a002', false);
select set_config('app.actor','00000000-0000-0000-0000-00000000a002', false);
set role authenticated;
select expect_fail(
  $$update deals set monthly_value = 1 where id='00000000-0000-0000-0000-00000000d001'$$,
  'Only an admin can change commercial fields');
update deals set next_step = 'Intern edit is fine' where id='00000000-0000-0000-0000-00000000d001';
select expect((select next_step from deals where id='00000000-0000-0000-0000-00000000d001')
              ='Intern edit is fine', 'an intern can still edit everything else');
reset role;

-- Sales (viewer) may file a pilot handover and nothing else
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a005', false);
select set_config('app.actor','00000000-0000-0000-0000-00000000a005', false);
set role authenticated;
insert into deals (client_id, title, category, stage, next_step, next_step_due)
values ('00000000-0000-0000-0000-00000000c001','Sales handover','pilot','handover',
        'Book kickoff', current_date + 3);
select expect((select count(*) from deals where title='Sales handover')=1,
  'sales can file a pilot handover');
-- RLS filters the row out rather than raising, so the write simply does nothing.
update deals set next_step='Viewer edit' where id='00000000-0000-0000-0000-00000000d001';
select expect((select next_step from deals where id='00000000-0000-0000-0000-00000000d001')
              <> 'Viewer edit', 'a viewer cannot edit an existing deal');
select expect_fail(
  $$insert into tasks (deal_id, title) values
    ('00000000-0000-0000-0000-00000000d001','Viewer task')$$,
  'row-level security');
reset role;

\echo '--- Billing: PI, PO/RO, payment, TI'
select set_config('app.actor','00000000-0000-0000-0000-00000000a001', false);
insert into deals (id, client_id, title, category, stage, term_months, monthly_value, end_date,
                   next_step, next_step_due)
values ('00000000-0000-0000-0000-00000000d0b1','00000000-0000-0000-0000-00000000c001',
        'Billing test retainer','retention','active', 6, 100000, current_date + 120,
        'Send the monthly report', current_date + 5);
select expect((select billing_state from deal_billing where deal_id='00000000-0000-0000-0000-00000000d0b1')
              ='not_invoiced', 'BI-1 a monthly retainer with no bill this month is not invoiced');

insert into billing_accounts (id, client_id, name, to_emails, is_intermediary)
values ('00000000-0000-0000-0000-00000000ba01','00000000-0000-0000-0000-00000000c001',
        'Insomniacs (agency)', '{accounts@agency.test}', true);
update deals set billing_account_id='00000000-0000-0000-0000-00000000ba01'
 where id='00000000-0000-0000-0000-00000000d0b1';

insert into invoices (id, deal_id, amount, gst, pi_number, pi_date, pi_sent_on, due_date,
                      period_start, period_end, description)
values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000d0b1',
        100000, 18000, 'PI-T-001', current_date - 10, current_date - 10, current_date - 2,
        date_trunc('month', today_ist())::date,
        (date_trunc('month', today_ist()) + interval '1 month - 1 day')::date,
        'Monthly retainer');
select expect((select client_id from invoices where id='00000000-0000-0000-0000-00000000b001')
              ='00000000-0000-0000-0000-00000000c001', 'BI-2 a bill takes its client from the deal');
select expect((select billing_account_id from invoices where id='00000000-0000-0000-0000-00000000b001')
              ='00000000-0000-0000-0000-00000000ba01', 'BI-3 a bill takes the deal''s bill-to party');
select expect((select step from bill_view where id='00000000-0000-0000-0000-00000000b001')='pi_sent',
  'BI-4 a sent PI with no PO/RO is at PI sent');
select expect((select overdue and days_overdue = 2 from bill_view where id='00000000-0000-0000-0000-00000000b001'),
  'BI-5 past its due date and unpaid, the bill is overdue');
select expect((select billing_state from deal_billing where deal_id='00000000-0000-0000-0000-00000000d0b1')
              ='invoiced', 'BI-6 a bill covering this month makes the retainer invoiced');

select expect(queue_billing_reminders() = 1, 'BI-7 one reminder is queued for the overdue bill');
select expect(queue_billing_reminders() = 0, 'BI-8 running the queue again adds nothing');
select expect((select kind = 'overdue' and to_emails = '{accounts@agency.test}'
                      and body like '%₹1,18,000%'
                 from billing_reminders where invoice_id='00000000-0000-0000-0000-00000000b001'),
  'BI-9 the reminder is an overdue notice to the agency, in Indian rupee format');

select expect_fail(
  $$insert into invoices (deal_id, client_id, amount) values
    ('00000000-0000-0000-0000-00000000d0b1','00000000-0000-0000-0000-00000000c002', 10)$$,
  'does not match');
select expect_fail(
  $$update invoices set ti_number='TI-T-001', pi_number=null where id='00000000-0000-0000-0000-00000000b001'$$,
  'invoices_ti_after_pi');

update invoices set po_number='RO-0144', po_received_on=current_date - 8
 where id='00000000-0000-0000-0000-00000000b001';
insert into payments (invoice_id, amount, received_on, reference)
values ('00000000-0000-0000-0000-00000000b001', 50000, current_date, 'UTR-1');
select expect((select step from bill_view where id='00000000-0000-0000-0000-00000000b001')='partially_paid',
  'BI-10 a part payment leaves the bill partly paid');
select expect_fail(
  $$insert into payments (invoice_id, amount, received_on, reference)
    values ('00000000-0000-0000-0000-00000000b001', 70000, current_date, 'UTR-2')$$,
  'past its total');
insert into payments (invoice_id, amount, received_on, reference)
values ('00000000-0000-0000-0000-00000000b001', 68000, current_date, 'UTR-2');
select expect((select step from bill_view where id='00000000-0000-0000-0000-00000000b001')='paid',
  'BI-11 paid in full and no TI yet: paid, awaiting the TI');
select expect((select paid_awaiting_ti from deal_billing where deal_id='00000000-0000-0000-0000-00000000d0b1')=1,
  'BI-12 the deal flags a TI to issue');
update invoices set ti_number='TI-T-001', ti_date=current_date where id='00000000-0000-0000-0000-00000000b001';
select expect((select step from bill_view where id='00000000-0000-0000-0000-00000000b001')='ti_issued',
  'BI-13 the TI closes the bill');
select expect((select billing_state from deal_billing where deal_id='00000000-0000-0000-0000-00000000d0b1')='paid',
  'BI-14 everything collected: the deal reads paid');
select expect((select bills_raised = 1 and due_amount = 0 and collected = 118000
                 from client_billing where client_id='00000000-0000-0000-0000-00000000c001'),
  'BI-15 the client totals add up');
select expect(queue_billing_reminders() = 0, 'BI-16 a paid bill gets no reminders');

-- The signed-in role can never read mailbox tokens.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a001', false);
set role authenticated;
select expect_fail($$select * from mail_account_tokens$$, 'permission denied');
reset role;
