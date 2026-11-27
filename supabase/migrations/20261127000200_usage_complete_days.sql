-- The usage flag compared the last 30 days up to yesterday. When the sync falls
-- behind (Mongo unreachable, cron down), the days it has not counted yet read as zero
-- and every linked client looks like it is falling. Anchor both 30-day windows on the
-- last COMPLETE day instead: the day before the last successful usage sync (IST).
-- With the 09:00 IST daily sync running, that is yesterday, exactly as before.

create or replace function usage_through() returns date
language sql stable as $$
  select coalesce(
    (select ((max(finished_at) at time zone 'Asia/Kolkata')::date - 1)
       from job_runs where job = 'usage_sync' and ok),
    today_ist() - 1)
$$;

create or replace view client_usage as
with w as (
  select s.client_id,
         coalesce(sum(u.leads) filter (where u.day between usage_through() - 29 and usage_through()), 0)  as leads_30,
         coalesce(sum(u.leads) filter (where u.day between usage_through() - 59 and usage_through() - 30), 0) as leads_prev,
         coalesce(sum(u.calls) filter (where u.day between usage_through() - 29 and usage_through()), 0)  as calls_30,
         coalesce(sum(u.calls) filter (where u.day between usage_through() - 59 and usage_through() - 30), 0) as calls_prev,
         count(distinct s.workspace_key) as workspaces
    from client_usage_sources s
    left join usage_daily u on u.workspace_key = s.workspace_key and u.day >= usage_through() - 59
   where s.removed_at is null
   group by s.client_id
), m as (
  select w.*,
         case when leads_prev > 0 then round(100.0 * (leads_30 - leads_prev) / leads_prev) end::int as leads_change_pct,
         case when calls_prev > 0 then round(100.0 * (calls_30 - calls_prev) / calls_prev) end::int as calls_change_pct,
         -- When the data was last refreshed, not when this client last had activity.
         (select max(finished_at) from job_runs where job = 'usage_sync' and ok) as synced_at
    from w
)
select m.*,
       case
         when leads_30 + calls_30 = 0 and (leads_prev >= 100 or calls_prev >= 100) then 'stopped'
         when (leads_prev >= 100 and leads_change_pct <= -20)
           or (calls_prev >= 100 and calls_change_pct <= -20) then 'down'
         when leads_30 + calls_30 = 0 and leads_prev + calls_prev = 0 then 'none'
         when leads_prev + calls_prev = 0 then 'new'
         when (leads_prev >= 100 and leads_change_pct >= 20)
           or (calls_prev >= 100 and calls_change_pct >= 20) then 'up'
         else 'steady'
       end as trend
  from m;


grant execute on function usage_through() to anon, authenticated;
