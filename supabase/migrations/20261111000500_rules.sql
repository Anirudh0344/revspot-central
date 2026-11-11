-- One write path: these rules hold for the UI, the API and the bot alike.

-- -------------------------------------------------- DL-1/DL-4/DL-6/DL-8/DL-9 on deals
create or replace function deals_rules() returns trigger
language plpgsql as $$
declare
  s          stages%rowtype;
  missing    text[] := '{}';
  req        text;
  row_json   jsonb;
  val        text;
begin
  select * into s from stages where category = new.category and key = new.stage;
  if not found then
    raise exception 'Unknown stage % for category %', new.stage, new.category;
  end if;

  -- DL-1: a live deal always carries a dated next step
  if not s.is_terminal and (coalesce(new.next_step, '') = '' or new.next_step_due is null) then
    raise exception 'Next step and due date are required unless the stage is terminal'
      using errcode = 'check_violation';
  end if;

  -- DL-4 / DL-6: entering a stage requires that stage's fields
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    row_json := to_jsonb(new);
    for req in select jsonb_array_elements_text(s.exit_requirements) loop
      val := row_json ->> req;
      if val is null or val = '' then
        missing := missing || req;
      end if;
    end loop;
    if array_length(missing, 1) > 0 then
      raise exception 'Cannot move to %: missing %', s.label, array_to_string(missing, ', ')
        using errcode = 'check_violation', detail = array_to_string(missing, ',');
    end if;
    new.stage_entered_at := now();
  end if;

  -- DL-9: health always carries a reason; DL-8: green needs complete criteria
  if tg_op = 'INSERT' or new.health is distinct from old.health
     or new.health_reason is distinct from old.health_reason then
    if new.health is not null then
      if coalesce(new.health_reason, '') = '' then
        raise exception 'A reason is required when setting health'
          using errcode = 'check_violation';
      end if;
      if new.health = 'green' and not (
            coalesce(new.sc_business_outcome,'')   <> '' and
            coalesce(new.sc_targets,'')            <> '' and
            coalesce(new.sc_leading_indicators,'') <> '' and
            coalesce(new.sc_judged_by,'')          <> '' and
            coalesce(new.sc_failure_line,'')       <> '' and
            coalesce(new.sc_decision_statement,'') <> '') then
        raise exception 'A deal with incomplete success criteria cannot be set to green'
          using errcode = 'check_violation';
      end if;
      new.health_updated_at := now();
    end if;
  end if;

  if tg_op = 'UPDATE' and s.is_terminal and old.stage is distinct from new.stage
     and coalesce(new.close_reason, '') = '' then
    raise exception 'A reason is required to move a deal to %', s.label
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

create trigger deals_rules_trg before insert or update on deals
  for each row execute function deals_rules();

-- DL-9: every health change lands in health_history
create or replace function deals_health_history() returns trigger
language plpgsql as $$
begin
  if new.health is not null and (tg_op = 'INSERT' or new.health is distinct from old.health
       or new.health_reason is distinct from old.health_reason) then
    insert into health_history (deal_id, health, reason, set_by)
    values (new.id, new.health, new.health_reason, app_actor());
  end if;
  return null;
end
$$;

create trigger deals_health_history_trg after insert or update on deals
  for each row execute function deals_health_history();

-- -------------------------------------------------- TK-3: next step mirrors the earliest open task
create or replace function sync_deal_next_step() returns trigger
language plpgsql as $$
declare
  d uuid := coalesce(new.deal_id, old.deal_id);
  t tasks%rowtype;
begin
  if d is null then return null; end if;
  select * into t from tasks
   where deal_id = d and status = 'open' and due_date is not null
   order by due_date, created_at limit 1;
  if found then
    update deals set next_step = t.title, next_step_due = t.due_date
     where id = d and (next_step is distinct from t.title or next_step_due is distinct from t.due_date);
  end if;
  return null;
end
$$;

create trigger tasks_sync_next_step after insert or update on tasks
  for each row execute function sync_deal_next_step();

-- -------------------------------------------------- DL-5: converting a pilot
create or replace function convert_pilot(
  p_deal_id       uuid,
  p_term_months   int,
  p_monthly_value numeric,
  p_start_date    date,
  p_reason        text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pilot      deals%rowtype;
  new_stage  text;
  new_id     uuid;
begin
  select * into pilot from deals where id = p_deal_id;
  if not found or pilot.category <> 'pilot' then
    raise exception 'Deal % is not a pilot', p_deal_id;
  end if;
  if coalesce(p_reason, '') = '' then
    raise exception 'A reason is required to convert a pilot' using errcode = 'check_violation';
  end if;

  update deals set
    stage = 'converted', term_months = p_term_months, monthly_value = p_monthly_value,
    start_date = coalesce(p_start_date, pilot.start_date),
    close_reason = p_reason, closed_month = date_trunc('month', coalesce(p_start_date, current_date))::date
  where id = p_deal_id;

  new_stage := case when coalesce(p_term_months, 1) >= 3 then 'on_term' else 'month_to_month' end;

  insert into deals (
    client_id, title, product, projects, category, stage, parent_deal_id,
    commercial_model, term_months, monthly_value, contract_value,
    start_date, end_date,
    sc_business_outcome, sc_targets, sc_leading_indicators,
    sc_judged_by, sc_failure_line, sc_decision_statement,
    next_step, next_step_due, intern_owner, context_doc_url
  ) values (
    pilot.client_id, pilot.title || ' (retention)', pilot.product, pilot.projects,
    'retention', new_stage, pilot.id,
    pilot.commercial_model, p_term_months, p_monthly_value,
    p_monthly_value * greatest(coalesce(p_term_months, 1), 1),
    coalesce(p_start_date, current_date),
    coalesce(p_start_date, current_date) + (greatest(coalesce(p_term_months,1),1) || ' months')::interval,
    pilot.sc_business_outcome, pilot.sc_targets, pilot.sc_leading_indicators,
    pilot.sc_judged_by, pilot.sc_failure_line, pilot.sc_decision_statement,
    'Run kickoff for the retention engagement', current_date + 3,
    pilot.intern_owner, pilot.context_doc_url
  ) returning id into new_id;

  insert into tasks (deal_id, client_id, title, owner, due_date)
  values (new_id, pilot.client_id, 'Kickoff: retention engagement', pilot.intern_owner, current_date + 3);

  return new_id;
end
$$;

-- -------------------------------------------------- DL-13: renewal watch (nightly)
create or replace function run_renewal_watch() returns int
language plpgsql security definer set search_path = public as $$
declare
  d      record;
  admin  uuid;
  n      int := 0;
begin
  select id into admin from profiles where role = 'admin' and is_active order by created_at limit 1;
  for d in
    select * from deals
     where category = 'retention' and archived_at is null
       and stage in ('month_to_month','on_term')
       and end_date is not null and end_date <= current_date + 30
  loop
    update deals set stage = 'renewal_due' where id = d.id;
    insert into tasks (deal_id, client_id, title, owner, due_date)
    values (d.id, d.client_id, 'Renewal conversation: ' || d.title,
            coalesce(admin, d.intern_owner), d.end_date - 14);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- -------------------------------------------------- RQ-1: SLA due date in working days
create or replace function working_days_from(p_from timestamptz, p_days int) returns timestamptz
language plpgsql immutable as $$
declare
  d    date := p_from::date;
  left_ int := p_days;
begin
  while left_ > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6 then
      left_ := left_ - 1;
    end if;
  end loop;
  return (d + time '18:00') at time zone 'Asia/Kolkata';
end
$$;

create or replace function requests_default_due() returns trigger
language plpgsql as $$
declare days int;
begin
  if new.due_at is null then
    select working_days into days from sla_config where team = new.team;
    new.due_at := working_days_from(coalesce(new.raised_at, now()), coalesce(days, 3));
  end if;
  return new;
end
$$;

alter table requests alter column due_at drop not null;
create trigger requests_default_due_trg before insert on requests
  for each row execute function requests_default_due();

-- -------------------------------------------------- BA-2 / AC-3: undo
create or replace function undo_activity(p_activity_id bigint, p_field text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a         activity%rowtype;
  allowed   text[] := array['clients','contacts','deals','line_items','tasks','requests','invoices'];
  before_js jsonb := '{}'::jsonb;
  k         text;
  cols      text[] := '{}';
  collist   text;
  rcols     text;
  merged    jsonb;
  cur       jsonb;
begin
  select * into a from activity where id = p_activity_id;
  if not found then raise exception 'No such activity row'; end if;
  if a.undone_at is not null then raise exception 'That change was already undone'; end if;
  if a.action = 'undo' then raise exception 'An undo cannot itself be undone'; end if;
  if a.created_at < now() - interval '7 days' then
    raise exception 'Changes can only be undone within 7 days';
  end if;
  if not (a.entity_type = any(allowed)) then
    raise exception 'Cannot undo changes to %', a.entity_type;
  end if;

  for k in select jsonb_object_keys(a.changes) loop
    if (p_field is null or k = p_field)
       and k not in ('id','created_at','created_by')
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = a.entity_type and column_name = k) then
      before_js := before_js || jsonb_build_object(k, a.changes -> k -> 0);
      cols := cols || k;
    end if;
  end loop;

  if array_length(cols, 1) is null then
    raise exception 'Nothing to undo on this change';
  end if;

  execute format('select to_jsonb(t) from %I t where t.id = $1', a.entity_type)
    into cur using a.entity_id;
  if cur is null then raise exception 'The record no longer exists'; end if;

  merged  := cur || before_js;
  collist := (select string_agg(quote_ident(c), ', ') from unnest(cols) c);
  rcols   := (select string_agg('r.' || quote_ident(c), ', ') from unnest(cols) c);

  perform set_config('app.reason',
    coalesce(nullif(current_setting('app.reason', true), ''), 'Undo of activity #' || p_activity_id), true);

  execute format(
    'update %I t set (%s) = (select %s from jsonb_populate_record(null::%I, $1) r) where t.id = $2',
    a.entity_type, collist, rcols, a.entity_type)
    using merged, a.entity_id;

  update activity set undone_at = now() where id = p_activity_id;

  insert into activity (entity_type, entity_id, deal_id, client_id, action, changes, actor, reason)
  values (a.entity_type, a.entity_id, a.deal_id, a.client_id, 'undo',
          jsonb_build_object('undid_activity', jsonb_build_array(null, to_jsonb(p_activity_id))),
          app_actor(), 'Undo of activity #' || p_activity_id);
end
$$;

-- -------------------------------------------------- IN-7: billing guardrails for the bot
create or replace function invoice_guardrails() returns trigger
language plpgsql as $$
begin
  if app_actor_role() = 'bot' then
    if tg_table_name = 'invoices' then
      if old.status <> 'draft' and new.amount is distinct from old.amount then
        raise exception 'The bot cannot change the amount of a sent invoice';
      end if;
      if new.status = 'written_off' and old.status <> 'written_off' then
        raise exception 'The bot cannot write off an invoice';
      end if;
      if new.status = 'paid' and old.status <> 'paid'
         and not exists (select 1 from payments where invoice_id = new.id) then
        raise exception 'An invoice cannot be marked paid without a payment record';
      end if;
    end if;
  end if;
  return new;
end
$$;

create trigger invoices_guardrails_trg before update on invoices
  for each row execute function invoice_guardrails();
