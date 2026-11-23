-- What makes a live deal "stuck", in one place, for the pipeline view.
create or replace view deal_signals as
select
  d.id as deal_id,
  d.blocked_on,
  d.blocker_note,
  d.blocked_since,
  greatest(ix.last_interaction_at, ac.last_change_at, qs.last_question_at) as last_touch_at,
  coalesce(qs.open_questions, 0)::int as open_questions,
  qs.oldest_open_question_at
from deals d
left join lateral (
  select max(occurred_at) as last_interaction_at from interactions
   where deal_id = d.id and occurred_at <= now()
) ix on true
left join lateral (
  select max(created_at) as last_change_at from activity
   where deal_id = d.id and entity_type in ('deals', 'tasks', 'invoices', 'payments', 'playbook_runs')
     and coalesce(reason, '') not like 'Gmail sync%'
) ac on true
left join lateral (
  select count(*) filter (where q.status = 'open') as open_questions,
         min(q.created_at) filter (where q.status = 'open') as oldest_open_question_at,
         greatest(max(q.created_at), max(r.created_at)) as last_question_at
    from questions q left join question_replies r on r.question_id = q.id
   where q.deal_id = d.id
) qs on true;

grant select on deal_signals to authenticated;
