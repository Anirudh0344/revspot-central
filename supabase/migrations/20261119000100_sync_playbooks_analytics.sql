-- Gmail sync, playbooks, revenue dates and a log of scheduled jobs.

-- ---------------------------------------------------------------- Gmail sync
-- One interaction per Gmail message, whichever mailbox saw it first.
create unique index interactions_source_ref_uniq on interactions (source_ref) where source_ref is not null;
alter table interactions add column subject text;
alter table interactions add column mailbox text;           -- which connected mailbox it came from

alter table mail_accounts add column sync_from date;        -- first sync looks back to here
alter table mail_accounts add column last_sync_count integer;

-- A client's reply on a reminder thread, so collections sees it.
alter table billing_reminders add column replied_at timestamptz;
alter table billing_reminders add column reply_snippet text;
alter table billing_reminders add column reply_seen_at timestamptz;

-- ---------------------------------------------------------------- revenue dates
-- closed_at: when a deal reached a terminal stage. won_at: when an expansion
-- deal reached Closed. Both feed the analytics.
alter table deals add column closed_at timestamptz;
alter table deals add column won_at timestamptz;

-- Backfill quietly: these are facts recovered from the log, not edits.
alter table deals disable trigger user;
update deals d set closed_at = coalesce((
  select max(a.created_at) from activity a
   where a.entity_id = d.id and a.action = 'stage_change' and a.changes -> 'stage' ->> 1 = d.stage
), d.updated_at)
 where exists (select 1 from stages s where s.category = d.category and s.key = d.stage and s.is_terminal);

update deals d set won_at = coalesce((
  select min(a.created_at) from activity a
   where a.entity_id = d.id and a.action = 'stage_change' and a.changes -> 'stage' ->> 1 = 'closed'
), d.updated_at)
 where d.category = 'expansion' and d.stage in ('closed', 'invoiced', 'paid');
alter table deals enable trigger user;

create or replace function deals_stamp_dates() returns trigger
language plpgsql as $$
declare
  terminal boolean;
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    select is_terminal into terminal from stages where category = new.category and key = new.stage;
    new.closed_at := case when terminal then coalesce(new.closed_at, now()) end;
    if new.category = 'expansion' and new.stage in ('closed', 'invoiced', 'paid') then
      new.won_at := coalesce(new.won_at, now());
    elsif new.category = 'expansion' then
      new.won_at := null;
    end if;
  end if;
  return new;
end
$$;
create trigger deals_stamp_dates_trg before insert or update on deals
  for each row execute function deals_stamp_dates();

-- ---------------------------------------------------------------- playbooks
-- Like HubSpot playbooks: a guide a person works through on a deal, with
-- questions whose answers are saved, plus tasks it creates. A playbook can also
-- start itself when a deal enters a stage, turns red, or is created.
create table playbooks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  category      deal_category,                  -- null: any deal
  trigger       text not null default 'manual'
                check (trigger in ('manual', 'stage_entered', 'health_red', 'deal_created')),
  trigger_stage text,
  steps         jsonb not null default '[]',
  is_active     boolean not null default true,
  created_by    uuid references profiles,
  updated_by    uuid references profiles,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (trigger <> 'stage_entered' or trigger_stage is not null),
  check (jsonb_typeof(steps) = 'array')
);

create table playbook_runs (
  id           uuid primary key default gen_random_uuid(),
  playbook_id  uuid not null references playbooks,
  deal_id      uuid not null references deals,
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed', 'dismissed')),
  started_via  text not null default 'manual' check (started_via in ('manual', 'trigger')),
  answers      jsonb not null default '{}',
  started_by   uuid references profiles,
  completed_by uuid references profiles,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  created_by   uuid references profiles,
  updated_by   uuid references profiles,
  updated_at   timestamptz not null default now()
);
create index playbook_runs_deal_idx on playbook_runs (deal_id, started_at desc);
create unique index playbook_runs_one_open on playbook_runs (playbook_id, deal_id) where status = 'in_progress';

alter table tasks add column playbook_run_id uuid references playbook_runs;

-- Starts a playbook on a deal and creates its tasks. Returns the run, or the
-- run already open for that playbook on that deal.
create or replace function start_playbook(p_playbook uuid, p_deal uuid, p_via text default 'manual')
returns uuid
language plpgsql as $$
declare
  v_run   uuid;
  v_owner uuid;
  v_step  jsonb;
begin
  select id into v_run from playbook_runs
   where playbook_id = p_playbook and deal_id = p_deal and status = 'in_progress';
  if v_run is not null then return v_run; end if;

  insert into playbook_runs (playbook_id, deal_id, started_via, started_by)
  values (p_playbook, p_deal, p_via, app_actor())
  returning id into v_run;

  select intern_owner into v_owner from deals where id = p_deal;
  for v_step in select * from jsonb_array_elements((select steps from playbooks where id = p_playbook)) loop
    if v_step ->> 'kind' = 'task' then
      insert into tasks (deal_id, client_id, title, owner, due_date, playbook_run_id)
      select p_deal, d.client_id, v_step ->> 'title', coalesce(v_owner, app_actor()),
             today_ist() + coalesce((v_step ->> 'due_days')::int, 3), v_run
        from deals d where d.id = p_deal;
    end if;
  end loop;
  return v_run;
end
$$;

-- Fires playbooks that start themselves.
create or replace function deals_fire_playbooks() returns trigger
language plpgsql as $$
declare
  pb record;
begin
  for pb in
    select p.id from playbooks p
     where p.is_active
       and (p.category is null or p.category = new.category)
       and (
         (p.trigger = 'deal_created' and tg_op = 'INSERT')
         or (p.trigger = 'stage_entered' and p.trigger_stage = new.stage
             and (tg_op = 'INSERT' or new.stage is distinct from old.stage))
         or (p.trigger = 'health_red' and new.health = 'red'
             and (tg_op = 'INSERT' or old.health is distinct from 'red'))
       )
  loop
    perform start_playbook(pb.id, new.id, 'trigger');
  end loop;
  return null;
end
$$;
create trigger deals_fire_playbooks_trg after insert or update on deals
  for each row execute function deals_fire_playbooks();

-- ---------------------------------------------------------------- job log
create table job_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  summary     jsonb
);
create index job_runs_job_idx on job_runs (job, started_at desc);

-- ---------------------------------------------------------------- audit, RLS, grants
do $$
declare t text;
begin
  foreach t in array array['playbooks', 'playbook_runs'] loop
    execute format('create trigger %1$s_touch before insert or update on %1$s
                      for each row execute function touch_row()', t);
    execute format('create trigger %1$s_activity after insert or update on %1$s
                      for each row execute function log_activity()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true)', t);
  end loop;
end
$$;
-- Anyone who can write deals can run a playbook; only admins change the library.
create policy playbook_runs_insert on playbook_runs for insert to authenticated with check (is_writer());
create policy playbook_runs_update on playbook_runs for update to authenticated using (is_writer()) with check (is_writer());
create policy playbooks_insert on playbooks for insert to authenticated with check (is_admin());
create policy playbooks_update on playbooks for update to authenticated using (is_admin()) with check (is_admin());

alter table job_runs enable row level security;
create policy job_runs_read on job_runs for select to authenticated using (true);
revoke insert, update on job_runs from authenticated;

grant select, insert, update on playbooks, playbook_runs to authenticated;
alter function start_playbook(uuid, uuid, text) security definer set search_path = public;
alter function deals_fire_playbooks() security definer set search_path = public;
grant execute on function start_playbook(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- starter playbooks
insert into playbooks (name, description, category, trigger, trigger_stage, steps) values
(
  'Pilot kickoff call',
  'Run on the kickoff call. Pins down what the pilot must prove before anything is set up.',
  'pilot', 'stage_entered', 'kickoff',
  '[
    {"id":"q1","kind":"question","title":"What business outcome are they buying?","body":"In their words. Not leads: what changes for the business."},
    {"id":"q2","kind":"question","title":"Which number decides the pilot, and what is the target?"},
    {"id":"q3","kind":"question","title":"Who decides whether it converts? Name and title."},
    {"id":"q4","kind":"question","title":"Below what result is the pilot a failure?"},
    {"id":"q5","kind":"question","title":"How do leads reach their team today, and who calls them?","options":["CRM","Sheets","WhatsApp","Call centre","Other"]},
    {"id":"g1","kind":"guide","title":"Close the call","body":"Read back the target and the decision date. Agree the weekly check-in slot."},
    {"id":"t1","kind":"task","title":"Fill the six success criteria on the deal","due_days":1},
    {"id":"t2","kind":"task","title":"Send the kickoff summary email","due_days":1},
    {"id":"t3","kind":"task","title":"Book the weekly check-in","due_days":2}
  ]'
),
(
  'Recovery: health turned red',
  'Starts by itself when a deal turns red. Find out why within two days and agree a way back.',
  null, 'health_red', null,
  '[
    {"id":"q1","kind":"question","title":"What changed?","options":["Results below target","Champion left or went quiet","Delivery or quality issue","Budget or priorities","Payment dispute","Other"]},
    {"id":"q2","kind":"question","title":"What does the client say would fix it?"},
    {"id":"q3","kind":"question","title":"Revenue at risk if it is lost (per month)?"},
    {"id":"t1","kind":"task","title":"Call the champion and hear the problem first-hand","due_days":1},
    {"id":"t2","kind":"task","title":"Write a recovery plan with dates and share it with the client","due_days":3},
    {"id":"t3","kind":"task","title":"Brief Anunay on the account","due_days":1}
  ]'
),
(
  'Renewal conversation',
  'Starts when a term deal reaches Renewal due.',
  'retention', 'stage_entered', 'renewal_due',
  '[
    {"id":"q1","kind":"question","title":"Did we hit the targets this term?","options":["Beat them","Hit them","Missed them"]},
    {"id":"q2","kind":"question","title":"What do they want changed next term?"},
    {"id":"q3","kind":"question","title":"Is there room to grow: more projects, products or volume?"},
    {"id":"q4","kind":"question","title":"Renewal decision","options":["Renewing as is","Renewing with changes","Undecided","Not renewing"]},
    {"id":"t1","kind":"task","title":"Prepare the term review: results against targets","due_days":3},
    {"id":"t2","kind":"task","title":"Send the renewal proposal","due_days":7}
  ]'
),
(
  'Discovery call',
  'For any first conversation about something new. Start it from the deal.',
  null, 'manual', null,
  '[
    {"id":"q1","kind":"question","title":"What are they trying to achieve this quarter?"},
    {"id":"q2","kind":"question","title":"What are they using today, and what does it cost them?"},
    {"id":"q3","kind":"question","title":"Who else is involved in the decision?"},
    {"id":"q4","kind":"question","title":"Budget","options":["Allocated","Can be found","No budget","Unknown"]},
    {"id":"q5","kind":"question","title":"Timeline to decide?"},
    {"id":"t1","kind":"task","title":"Send the follow-up with next steps","due_days":1}
  ]'
);
