-- Expansion pipeline, reworked around how upsells actually run:
--   Conversation started -> Proposal sent -> Closed -> Invoiced -> Paid, or Lost.
--
-- Ideas no longer get a deal: they live in the client's whitespace notes until
-- there is a real conversation. Trials are pilots and use the pilot pipeline.
-- Invoiced and Paid sit on the board until the invoicing module tracks them;
-- for a deal billed in parts they mean the first invoice sent and paid.

insert into stages (category, key, label, position, max_days, is_terminal, exit_requirements) values
  ('expansion','conversation_started','Conversation started', 1, 14,   false, '[]'),
  ('expansion','proposal_sent',       'Proposal sent',        2, 10,   false, '["contract_value"]'),
  ('expansion','closed',              'Closed',               3, 7,    false, '["contract_value"]'),
  ('expansion','invoiced',            'Invoiced',             4, 30,   false, '["contract_value"]'),
  ('expansion','paid',                'Paid',                 5, null, true,  '["contract_value","close_reason"]'),
  ('expansion','lost',                'Lost',                 6, null, true,  '["close_reason"]')
on conflict (category, key) do update set
  label = excluded.label,
  position = excluded.position,
  max_days = excluded.max_days,
  is_terminal = excluded.is_terminal,
  exit_requirements = excluded.exit_requirements;

-- Carry any existing expansion deals across. This is a rename of where a card
-- sits, not a change anyone made to the deal, so the row triggers (stage rules,
-- activity log) are stood down for it. Foreign keys still apply.
alter table deals disable trigger user;

update deals set stage = case stage
    when 'idea'      then 'conversation_started'
    when 'validated' then 'conversation_started'
    when 'trial'     then 'proposal_sent'
    when 'won'       then 'closed'      -- won, but whether it was billed is unknown
    when 'parked'    then 'lost'
    else stage
  end
where category = 'expansion'
  and stage in ('idea','validated','trial','won','parked');

alter table deals enable trigger user;

delete from stages
 where category = 'expansion'
   and key in ('idea','validated','trial','won','parked');
