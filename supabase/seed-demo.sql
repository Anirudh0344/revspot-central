-- Demo business data: five clients and seven deals, including GPL's three.
-- Useful for looking at a populated screen; never load it into a real database.
--   npm run db:demo
begin;

select set_config('app.actor','11111111-1111-1111-1111-111111111111', false);
select set_config('app.reason','Demo data', false);

insert into clients (id, name, legal_name, segment, city, intern_owner, whitespace_notes) values
  ('aaaaaaa1-0000-4000-8000-000000000001','Godrej Properties','Godrej Properties Ltd','developer','Mumbai',
   '22222222-2222-2222-2222-222222222222',
   'No WhatsApp product yet. Two launches in Pune next quarter.'),
  ('aaaaaaa1-0000-4000-8000-000000000002','Lodha Group','Macrotech Developers Ltd','developer','Mumbai',
   '33333333-3333-3333-3333-333333333333',
   'Data enrichment only. Voice AI never pitched.'),
  ('aaaaaaa1-0000-4000-8000-000000000003','Prestige Estates','Prestige Estates Projects Ltd','developer','Bengaluru',
   '22222222-2222-2222-2222-222222222222', 'Interested in agentic qualification after the pilot.'),
  ('aaaaaaa1-0000-4000-8000-000000000004','Square Yards','Square Yards Consulting','channel partner','Gurugram',
   '33333333-3333-3333-3333-333333333333', 'Channel partner. Low ticket, high volume.'),
  ('aaaaaaa1-0000-4000-8000-000000000005','Hiranandani','Hiranandani Developers','developer','Thane',
   '22222222-2222-2222-2222-222222222222', 'Cold since the last readout.')
on conflict do nothing;

insert into contacts (client_id, name, title, email, phone, role) values
  ('aaaaaaa1-0000-4000-8000-000000000001','Priya Nair','VP Sales','priya.nair@godrejproperties.com','+91 98200 11111','decision_maker'),
  ('aaaaaaa1-0000-4000-8000-000000000001','Rohit Mehta','Pre-sales Lead','rohit.mehta@godrejproperties.com','+91 98200 22222','day_to_day'),
  ('aaaaaaa1-0000-4000-8000-000000000001','Sneha Iyer','Finance','sneha.iyer@godrejproperties.com',null,'finance'),
  ('aaaaaaa1-0000-4000-8000-000000000002','Karan Shah','Head of Digital','karan.shah@lodhagroup.com',null,'decision_maker'),
  ('aaaaaaa1-0000-4000-8000-000000000002','Meera Joshi','CRM Manager','meera.joshi@lodhagroup.com',null,'day_to_day'),
  ('aaaaaaa1-0000-4000-8000-000000000003','Arjun Rao','GM Sales','arjun.rao@prestigeconstructions.com',null,'decision_maker'),
  ('aaaaaaa1-0000-4000-8000-000000000004','Nikhil Bansal','Regional Head','nikhil.bansal@squareyards.com',null,'day_to_day'),
  ('aaaaaaa1-0000-4000-8000-000000000005','Deepak Rane','AVP Marketing','deepak.rane@hiranandani.com',null,'other');

-- GPL's three deals: a live retention engagement, a pilot and an expansion.
-- Demo pilots start mid-pipeline, so skip the CRM rule for the load and answer it after.
alter table deals disable trigger deals_crm_trg;
insert into deals (id, code, client_id, title, product, projects, category, stage,
                   commercial_model, term_months, monthly_value, contract_value,
                   start_date, end_date, health, health_reason,
                   sc_business_outcome, sc_targets, sc_leading_indicators,
                   sc_judged_by, sc_failure_line, sc_decision_statement,
                   next_step, next_step_due, intern_owner) values
  ('bbbbbbb1-0000-4000-8000-000000000001','GPL-PS','aaaaaaa1-0000-4000-8000-000000000001',
   'GPL Pre-sales agents','Voice AI','{Epoque,Majesty}','retention','active',
   'retainer_plus_performance',6,250000,1500000,
   current_date - 70, current_date + 110,'green','Month 2 delivered 118% of the QL plan',
   '30 extra site visits a month from pre-sales calling',
   '500 qualified leads a month at a 12% connect-to-QL rate',
   'Dials per day, connect rate, QL rate, site-visit conversion',
   'Priya Nair, VP Sales','Under 300 QLs in any month',
   'Renew for 12 months if months 4 to 6 each clear 450 QLs',
   'Send the month-2 readout deck', current_date + 2,'22222222-2222-2222-2222-222222222222'),

  ('bbbbbbb1-0000-4000-8000-000000000002','GPL-DATA','aaaaaaa1-0000-4000-8000-000000000001',
   'GPL Data enrichment','Data','{Epoque}','pilot','customer_testing',
   'per_record',1,120000,120000,
   current_date - 18, current_date + 9,'amber','Match rate at 61% against a 70% line',
   'A buyer list the pre-sales team can actually call',
   '20,000 records at 70% phone-match',
   'Records processed per day, match rate, bounce rate',
   'Rohit Mehta, Pre-sales Lead','Match rate under 55%',
   'Convert to a monthly enrichment retainer if match rate clears 70%',
   'Get the data team to re-run the failed batch', current_date - 1,
   '22222222-2222-2222-2222-222222222222'),

  ('bbbbbbb1-0000-4000-8000-000000000003','GPL-WA','aaaaaaa1-0000-4000-8000-000000000001',
   'GPL WhatsApp nurture','WhatsApp','{Majesty}','expansion','proposal_sent',
   'fixed_fee',3,90000,270000, null, null,'green','Priya asked for the proposal unprompted',
   'Keep cold leads warm between site visits',
   '15% reply rate on the nurture sequence','Reply rate, opt-out rate, re-engaged leads',
   'Priya Nair, VP Sales','Reply rate under 6%',
   'Sign a 3-month engagement if the first sequence clears 12%',
   'Chase Priya on the proposal', current_date + 1,'22222222-2222-2222-2222-222222222222');

update deals set parent_deal_id = 'bbbbbbb1-0000-4000-8000-000000000001'
 where id = 'bbbbbbb1-0000-4000-8000-000000000003';

insert into deals (code, client_id, title, product, projects, category, stage,
                   commercial_model, term_months, monthly_value,
                   start_date, end_date, health, health_reason,
                   sc_business_outcome, sc_targets, sc_leading_indicators,
                   sc_judged_by, sc_failure_line, sc_decision_statement,
                   next_step, next_step_due, intern_owner) values
  ('LOD-ENR','aaaaaaa1-0000-4000-8000-000000000002','Lodha Enrichment','Enrichment','{Palava}',
   'retention','active','per_record',1,80000,
   current_date - 40, current_date + 12,'red','Two months of invoices unpaid and the CRM feed broke',
   'A clean, callable database for the Palava CRM',
   '10,000 records a month at 65% match','Daily records, match rate, CRM sync errors',
   'Karan Shah, Head of Digital','Sync broken for more than 2 days',
   'Keep month to month until the sync is stable for 30 days',
   'Escalate the CRM sync with the data team', current_date - 2,
   '33333333-3333-3333-3333-333333333333'),

  ('PRE-AQ','aaaaaaa1-0000-4000-8000-000000000003','Prestige Agentic Qualification',
   'Agentic Qualification','{Falcon City}','pilot','feedback_1',
   'per_ql',1,180000, current_date - 32, current_date + 4,'green',
   'Pilot closed at 112% of the QL target',
   'Replace the first-call qualification team',
   '400 qualified leads in the pilot month',
   'QLs per day, qualification accuracy, handoff rate',
   'Arjun Rao, GM Sales','Under 250 QLs or accuracy under 80%',
   'Convert to a 6-month retainer at ₹2.2L a month if QLs clear 350',
   'Run the readout call with Arjun', current_date + 3,
   '22222222-2222-2222-2222-222222222222'),

  ('SQY-VOICE','aaaaaaa1-0000-4000-8000-000000000004','Square Yards Voice pilot','Voice AI','{Gurugram}',
   'pilot','agent_testing','per_minute',1,60000, current_date - 6, current_date + 24, null, null,
   'Qualify inbound portal leads within 5 minutes',
   '2,000 minutes, 300 qualified leads',null,
   'Nikhil Bansal, Regional Head',null,null,
   'Get the dialler numbers approved', current_date + 1,
   '33333333-3333-3333-3333-333333333333'),

  ('HIR-PS','aaaaaaa1-0000-4000-8000-000000000005','Hiranandani Pre-sales','Voice AI','{Estate}',
   'pilot','handover','per_ql',1,100000, null, null, null, null,
   'Cover the pre-sales gap on the Estate launch',null,null,null,null,null,
   'Book kickoff with Deepak', current_date - 3,
   '22222222-2222-2222-2222-222222222222');

insert into line_items (deal_id, description, unit, quantity, rate, delivered_quantity, billing_trigger) values
  ('bbbbbbb1-0000-4000-8000-000000000001','Qualified leads, Epoque','leads',500,800,412,'monthly'),
  ('bbbbbbb1-0000-4000-8000-000000000001','Qualified leads, Majesty','leads',300,800,266,'monthly'),
  ('bbbbbbb1-0000-4000-8000-000000000002','Records enriched','records',20000,6,11800,'on_delivery');

insert into tasks (deal_id, client_id, title, owner, due_date) values
  ('bbbbbbb1-0000-4000-8000-000000000002','aaaaaaa1-0000-4000-8000-000000000001',
   'Chase the data team on the failed batch','22222222-2222-2222-2222-222222222222', current_date - 1),
  ('bbbbbbb1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000001',
   'Send the month-2 readout deck','11111111-1111-1111-1111-111111111111', current_date),
  ('bbbbbbb1-0000-4000-8000-000000000003','aaaaaaa1-0000-4000-8000-000000000001',
   'Chase Priya on the WhatsApp proposal','11111111-1111-1111-1111-111111111111', current_date + 1);

insert into interactions (deal_id, client_id, channel, occurred_at, participants, summary, next_step, direction, logged_by) values
  ('bbbbbbb1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000001','call',
   now() - interval '2 days', '{Priya Nair}',
   'Month-2 numbers walked through. Priya happy with QL volume, wants site-visit conversion in the next deck.',
   'Send the month-2 readout deck','outbound','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbb1-0000-4000-8000-000000000002','aaaaaaa1-0000-4000-8000-000000000001','whatsapp',
   now() - interval '5 days', '{Rohit Mehta}',
   'Rohit flagged that a third of the enriched numbers in the last batch were unreachable.',
   'Re-run the failed batch','inbound','22222222-2222-2222-2222-222222222222'),
  (null,'aaaaaaa1-0000-4000-8000-000000000002','email',
   now() - interval '9 days', '{Karan Shah}',
   'Karan asked for a credit note before the next invoice is paid.',
   'Agree the credit note with finance','inbound','33333333-3333-3333-3333-333333333333');

commit;

alter table deals enable trigger deals_crm_trg;
update deals set crm_required = false where category = 'pilot' and crm_required is null;
