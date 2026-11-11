-- Pipeline configuration. exit_requirements lists the deal columns that must be
-- filled before a card may move INTO this stage (DL-4, DL-6).

insert into stages (category, key, label, position, max_days, is_terminal, exit_requirements) values
  ('pilot','handover','Handover',          1,  3, false, '[]'),
  ('pilot','kickoff','Kickoff',            2,  2, false,
     '["sc_business_outcome","sc_targets","sc_leading_indicators","sc_judged_by","sc_failure_line","sc_decision_statement"]'),
  ('pilot','setup','Setup',                3,  5, false, '[]'),
  ('pilot','live','Live',                  4, 30, false, '["start_date"]'),
  ('pilot','readout','Readout',            5,  3, false, '["end_date"]'),
  ('pilot','converted','Converted',        6, null, true,
     '["term_months","monthly_value","start_date","close_reason"]'),
  ('pilot','extended','Extended',          7, 30, false, '["end_date"]'),
  ('pilot','stopped','Stopped',            8, null, true,  '["close_reason"]'),

  ('retention','month_to_month','Month to month', 1, 30, false, '["monthly_value"]'),
  ('retention','on_term','On term',               2, null, false, '["term_months","monthly_value"]'),
  ('retention','renewal_due','Renewal due',       3, 30, false, '["end_date"]'),
  ('retention','renewed','Renewed',               4, null, true, '["term_months","monthly_value","close_reason"]'),
  ('retention','paused','Paused',                 5, 30, false, '["close_reason"]'),
  ('retention','churned','Churned',               6, null, true, '["close_reason"]'),

  ('expansion','idea','Idea',                 1, 30, false, '[]'),
  ('expansion','validated','Validated',       2, 14, false, '["sc_business_outcome"]'),
  ('expansion','proposal_sent','Proposal sent',3, 10, false, '["contract_value"]'),
  ('expansion','trial','Trial',               4, 30, false, '["start_date"]'),
  ('expansion','won','Won',                   5, null, true, '["contract_value","close_reason"]'),
  ('expansion','parked','Parked',             6, null, true, '["close_reason"]');

-- RQ-1 SLA defaults, in working days
insert into sla_config (team, working_days) values
  ('data',2), ('voice',3), ('bot',3), ('product',5), ('other',5);
