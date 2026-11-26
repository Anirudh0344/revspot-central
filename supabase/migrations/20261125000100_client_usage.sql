-- Client usage: how much each client actually uses Revspot, pulled daily from the
-- Revspot admin data (Mongo `revv`), so a falling client shows up before renewal.
--
-- Usage = leads processed (revv.lead) + AI voice-bot calls (revv.call_log, demo
-- calls excluded), counted per Revspot WORKSPACE per IST day.
--
-- Usage lives on workspaces (revv.client, keyed by company_name; it is the `client`
-- on every lead and call), not on orgs (revv.accounts). An org often owns many
-- brands' workspaces: Propstar owns sumadhura, sobha, prestige, godrej-mmr... So a
-- Central client links to the workspaces it runs on, never to a whole org.

-- ---------------------------------------------------------------- Revspot workspaces
-- Mirror of revv.client (+ the owning org's name), refreshed by the sync. Only here
-- so people can find a workspace by name or owner when linking it to a client.
create table revspot_workspaces (
  workspace_key   text primary key,     -- revv client.company_name, e.g. 'godrej-mmr'
  name            text,                 -- client.display_name, e.g. 'Godrej MMR'
  parent_org_key  text,                 -- client.parent_account_id, e.g. 'propstar-38cabcb6'
  parent_org_name text,                 -- that org's accounts.display_name, e.g. 'Propstar'
  is_active       boolean,
  synced_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- client ↔ workspace
create table client_usage_sources (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients,
  workspace_key  text not null,
  created_by     uuid references profiles default app_actor(),
  created_at     timestamptz not null default now(),
  -- Unlinking is a soft remove, so the activity log records who removed it and why
  -- (log_activity logs inserts and updates, never deletes).
  removed_at     timestamptz,
  removed_by     uuid references profiles
);
-- A workspace counts towards one client at a time.
create unique index client_usage_sources_live_uniq
  on client_usage_sources (workspace_key) where removed_at is null;
create index client_usage_sources_client_idx on client_usage_sources (client_id) where removed_at is null;

create trigger client_usage_sources_activity after insert or update on client_usage_sources
  for each row execute function log_activity();

-- ---------------------------------------------------------------- daily counts
create table usage_daily (
  workspace_key  text not null,
  day            date not null,          -- IST calendar day
  leads          int not null default 0,
  calls          int not null default 0,
  synced_at      timestamptz not null default now(),
  primary key (workspace_key, day)
);
create index usage_daily_day_idx on usage_daily (day);

-- ---------------------------------------------------------------- the comparison
-- Last 30 complete IST days against the 30 before. Volume under 100 the month
-- before is noise, so it never drives a flag.
--   down    a metric with a base of 100+ fell 20% or more (to zero included)
--   stopped nothing at all in the last 30 days, after 100+ of either before
--   up      a metric with a base of 100+ rose 20% or more, and none fell
create or replace view client_usage as
with w as (
  select s.client_id,
         coalesce(sum(u.leads) filter (where u.day between today_ist() - 30 and today_ist() - 1), 0)  as leads_30,
         coalesce(sum(u.leads) filter (where u.day between today_ist() - 60 and today_ist() - 31), 0) as leads_prev,
         coalesce(sum(u.calls) filter (where u.day between today_ist() - 30 and today_ist() - 1), 0)  as calls_30,
         coalesce(sum(u.calls) filter (where u.day between today_ist() - 60 and today_ist() - 31), 0) as calls_prev,
         count(distinct s.workspace_key) as workspaces
    from client_usage_sources s
    left join usage_daily u on u.workspace_key = s.workspace_key and u.day >= today_ist() - 60
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

-- ---------------------------------------------------------------- access
alter table revspot_workspaces enable row level security;
alter table client_usage_sources enable row level security;
alter table usage_daily enable row level security;
create policy revspot_workspaces_read on revspot_workspaces for select to authenticated using (true);
create policy usage_daily_read on usage_daily for select to authenticated using (true);
create policy client_usage_sources_read on client_usage_sources for select to authenticated using (true);
create policy client_usage_sources_insert on client_usage_sources for insert to authenticated with check (is_writer());
create policy client_usage_sources_update on client_usage_sources for update to authenticated
  using (is_writer()) with check (is_writer());

grant select on revspot_workspaces, usage_daily, client_usage to anon, authenticated;
grant select, insert, update on client_usage_sources to authenticated;
