-- Audit by trigger: no write can skip the activity log.
-- The server sets app.actor (profile id) and app.reason per request.

create or replace function app_actor() returns uuid
language sql stable as $$
  select nullif(current_setting('app.actor', true), '')::uuid
$$;

create or replace function app_reason() returns text
language sql stable as $$
  select nullif(current_setting('app.reason', true), '')
$$;

create or replace function app_actor_role() returns user_role
language sql stable as $$
  select role from profiles where id = app_actor()
$$;

-- -------------------------------------------------- created_by / updated_by / updated_at
create or replace function touch_row() returns trigger
language plpgsql as $$
declare
  actor uuid := app_actor();
  cols  jsonb := to_jsonb(new);
begin
  if actor is not null and not exists (select 1 from profiles where id = actor) then
    actor := null;
  end if;

  if tg_op = 'INSERT' then
    if cols ? 'created_by' and new.created_by is null then
      new.created_by := actor;
    end if;
  end if;

  if cols ? 'updated_by' then
    new.updated_by := coalesce(actor, case when tg_op = 'UPDATE' then old.updated_by end);
  end if;

  if cols ? 'updated_at' then
    new.updated_at := now();
  end if;

  return new;
end
$$;

-- -------------------------------------------------- the activity log
create or replace function log_activity() returns trigger
language plpgsql as $$
declare
  rec_new   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  rec_old   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  diff      jsonb := '{}'::jsonb;
  k         text;
  act       text;
  actor     uuid := app_actor();
  reason    text := app_reason();
  v_deal    uuid;
  v_client  uuid;
  entity    uuid;
  skip      text[] := array['updated_at','updated_by','created_at','created_by'];
begin
  if actor is not null and not exists (select 1 from profiles where id = actor) then
    actor := null;
  end if;

  -- BA-1: every bot write carries the reason it entered
  if app_actor_role() = 'bot' and coalesce(reason, '') = '' then
    raise exception 'A reason is required for bot writes (table %)', tg_table_name
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    act := 'create';
    for k in select jsonb_object_keys(rec_new) loop
      if not (k = any(skip)) and rec_new -> k <> 'null'::jsonb then
        diff := diff || jsonb_build_object(k, jsonb_build_array(null, rec_new -> k));
      end if;
    end loop;
  else
    act := 'update';
    for k in select jsonb_object_keys(rec_new) loop
      if not (k = any(skip)) and (rec_old -> k) is distinct from (rec_new -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(rec_old -> k, rec_new -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return null;                                  -- nothing material changed
    end if;
    if diff ? 'archived_at' and rec_new ->> 'archived_at' is not null then
      act := 'archive';
    elsif diff ? 'stage' then
      act := 'stage_change';
    elsif diff ? 'health' then
      act := 'health_change';
    end if;
  end if;

  entity := (coalesce(rec_new, rec_old) ->> 'id')::uuid;

  if tg_table_name = 'deals' then
    v_deal   := entity;
    v_client := (coalesce(rec_new, rec_old) ->> 'client_id')::uuid;
  elsif tg_table_name = 'clients' then
    v_client := entity;
  else
    if coalesce(rec_new, rec_old) ? 'deal_id' then
      v_deal := (coalesce(rec_new, rec_old) ->> 'deal_id')::uuid;
    end if;
    if coalesce(rec_new, rec_old) ? 'client_id' then
      v_client := (coalesce(rec_new, rec_old) ->> 'client_id')::uuid;
    end if;
    if v_client is null and v_deal is not null then
      select client_id into v_client from deals where id = v_deal;
    end if;
  end if;

  insert into activity (entity_type, entity_id, deal_id, client_id, action, changes, actor, reason)
  values (tg_table_name, entity, v_deal, v_client, act, diff, actor, reason);

  return null;
end
$$;

-- -------------------------------------------------- attach to the core tables
do $$
declare t text;
begin
  foreach t in array array[
    'clients','contacts','deals','line_items','tasks','requests','invoices','payments'
  ] loop
    execute format(
      'create trigger %1$s_touch before insert or update on %1$s
         for each row execute function touch_row()', t);
    execute format(
      'create trigger %1$s_activity after insert or update on %1$s
         for each row execute function log_activity()', t);
  end loop;
end
$$;

-- AC-3 / soft delete: the log itself is append-only
create or replace function block_activity_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'activity rows cannot be deleted or rewritten';
end
$$;

create trigger activity_no_delete before delete on activity
  for each row execute function block_activity_mutation();

-- Only undone_at may ever change on an activity row.
create or replace function activity_update_guard() returns trigger
language plpgsql as $$
begin
  if to_jsonb(new) - 'undone_at' is distinct from to_jsonb(old) - 'undone_at' then
    raise exception 'activity rows are append-only (only undone_at may change)';
  end if;
  return new;
end
$$;

create trigger activity_append_only before update on activity
  for each row execute function activity_update_guard();
