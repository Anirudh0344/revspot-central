-- Derived, not typed: everything below is computed from deals and interactions.

create or replace view deal_view as
select
  d.*,
  c.name as client_name,
  s.label      as stage_label,
  s.position   as stage_position,
  s.max_days   as stage_max_days,
  s.is_terminal as stage_is_terminal,
  s.exit_requirements,
  p.name       as intern_owner_name,
  floor(extract(epoch from (now() - d.stage_entered_at)) / 86400)::int as days_in_stage,
  (d.sc_business_outcome   is not null and d.sc_business_outcome   <> ''
   and d.sc_targets        is not null and d.sc_targets            <> ''
   and d.sc_leading_indicators is not null and d.sc_leading_indicators <> ''
   and d.sc_judged_by      is not null and d.sc_judged_by          <> ''
   and d.sc_failure_line   is not null and d.sc_failure_line       <> ''
   and d.sc_decision_statement is not null and d.sc_decision_statement <> '') as criteria_complete,
  -- DL-10: health is stale if not set in the last 7 days
  (d.health is null or d.health_updated_at is null
     or d.health_updated_at < now() - interval '7 days') as health_stale,
  case
    when s.max_days is null then 'ok'
    when extract(epoch from (now() - d.stage_entered_at)) / 86400 > s.max_days * 2 then 'red'
    when extract(epoch from (now() - d.stage_entered_at)) / 86400 > s.max_days then 'amber'
    else 'ok'
  end as stage_flag,
  (d.next_step_due is not null and d.next_step_due < current_date
     and not s.is_terminal) as next_step_overdue,
  li.total_value,
  li.delivered_value,
  li.delivery_progress,
  ix.last_client_interaction_at,
  -- CM-4 check-in cadence: red 1 day, amber 7, green 14
  case d.health when 'red' then 1 when 'amber' then 7 when 'green' then 14 else null end
    as checkin_interval_days,
  case
    when d.health is null or s.is_terminal then null
    else (coalesce(ix.last_client_interaction_at, d.created_at)
          + (case d.health when 'red' then 1 when 'amber' then 7 else 14 end || ' days')::interval)
  end as checkin_due_at
from deals d
join clients c on c.id = d.client_id
join stages  s on s.category = d.category and s.key = d.stage
left join profiles p on p.id = d.intern_owner
left join lateral (
  select sum(amount) as total_value,
         sum(delivered_quantity * rate) as delivered_value,
         case when sum(quantity) > 0
              then round(sum(delivered_quantity) / sum(quantity) * 100, 1) end as delivery_progress
  from line_items where deal_id = d.id
) li on true
left join lateral (
  select max(occurred_at) as last_client_interaction_at
  from interactions
  where deal_id = d.id and coalesce(direction, 'outbound') in ('inbound','outbound')
) ix on true;

-- -------------------------------------------------- clients (CL-2, CL-3, CL-4, CL-7)
create or replace view client_view as
select
  c.*,
  o.name as intern_owner_name,
  d.open_deals,
  d.open_pilots,
  d.open_retention,
  d.open_expansion,
  d.monthly_value,
  d.health,
  coalesce(d.status, 'Prospect') as status,
  ct.contact_count,
  -- CL-7 single-threaded: fewer than two roled contacts, or no decision maker
  (coalesce(ct.roled_contacts, 0) < 2 or coalesce(ct.decision_makers, 0) = 0) as single_threaded,
  ix.last_interaction_at
from clients c
left join profiles o on o.id = c.intern_owner
left join lateral (
  select
    count(*) filter (where not s.is_terminal)                            as open_deals,
    count(*) filter (where not s.is_terminal and dl.category = 'pilot')     as open_pilots,
    count(*) filter (where not s.is_terminal and dl.category = 'retention') as open_retention,
    count(*) filter (where not s.is_terminal and dl.category = 'expansion') as open_expansion,
    sum(dl.monthly_value) filter (where not s.is_terminal)               as monthly_value,
    (array_remove(array[
        max(dl.health::text) filter (where not s.is_terminal and dl.health = 'red'),
        max(dl.health::text) filter (where not s.is_terminal and dl.health = 'amber'),
        max(dl.health::text) filter (where not s.is_terminal and dl.health = 'green')
      ], null))[1]::health                                               as health,
    case
      when count(*) filter (where not s.is_terminal) = 0 then
        case when count(*) filter (where dl.stage = 'churned') > 0 then 'Churned'
             when count(*) = 0 then 'Prospect'
             else 'Churned' end
      when count(*) filter (where not s.is_terminal)
           = count(*) filter (where not s.is_terminal and dl.stage = 'paused') then 'Paused'
      when count(*) filter (where not s.is_terminal and dl.category = 'retention') > 0 then 'Active'
      when count(*) filter (where not s.is_terminal)
           = count(*) filter (where not s.is_terminal and dl.category = 'pilot') then 'Pilot'
      else 'Prospect'
    end as status
  from deals dl
  join stages s on s.category = dl.category and s.key = dl.stage
  where dl.client_id = c.id and dl.archived_at is null
) d on true
left join lateral (
  select count(*) as contact_count,
         count(*) filter (where role <> 'other') as roled_contacts,
         count(*) filter (where role = 'decision_maker') as decision_makers
  from contacts where client_id = c.id and archived_at is null
) ct on true
left join lateral (
  select max(occurred_at) as last_interaction_at
  from interactions where client_id = c.id
) ix on true;

-- -------------------------------------------------- AU-7 bot work queue
create or replace view bot_work_queue as
select 'missing_criteria' as reason, d.id as deal_id, d.code, d.client_name, d.title, 1 as priority
  from deal_view d where d.archived_at is null and not d.stage_is_terminal and not d.criteria_complete
union all
select 'missing_next_step', d.id, d.code, d.client_name, d.title, 1
  from deal_view d where d.archived_at is null and not d.stage_is_terminal
    and (d.next_step is null or d.next_step = '' or d.next_step_due is null)
union all
select 'stale_health', d.id, d.code, d.client_name, d.title, 2
  from deal_view d where d.archived_at is null and not d.stage_is_terminal and d.health_stale
union all
select 'overdue_next_step', d.id, d.code, d.client_name, d.title, 2
  from deal_view d where d.archived_at is null and d.next_step_overdue
union all
select 'stale_stage', d.id, d.code, d.client_name, d.title, 3
  from deal_view d where d.archived_at is null and d.stage_flag <> 'ok'
union all
select 'checkin_overdue', d.id, d.code, d.client_name, d.title, 2
  from deal_view d where d.archived_at is null and d.checkin_due_at is not null
    and d.checkin_due_at < now();
