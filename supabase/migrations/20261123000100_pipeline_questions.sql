-- Visibility: what a pilot or implementation is stuck on, who owns it, and
-- questions anyone can ask on a specific part of a deal.

-- ---------------------------------------------------------------- blockers
-- Who the deal is waiting on. Null means nothing is blocking it.
alter table deals
  add column blocked_on    text check (blocked_on in ('us', 'client', 'product', 'data', 'commercial')),
  add column blocker_note  text,
  add column blocked_since timestamptz;

create or replace function deals_blocker_rules() returns trigger
language plpgsql as $$
begin
  if new.blocked_on is null then
    new.blocker_note := null;
    new.blocked_since := null;
  else
    if coalesce(new.blocker_note, '') = '' then
      raise exception 'Say what the deal is stuck on'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' or old.blocked_on is null then
      new.blocked_since := now();
    end if;
  end if;
  return new;
end
$$;
create trigger deals_blocker_trg before insert or update on deals
  for each row execute function deals_blocker_rules();

-- ---------------------------------------------------------------- owners
-- A pilot past handover, and an implementation, always has one owner.
-- Checked when the stage changes, so older deals are flagged rather than refused.
create or replace function deals_owner_rule() returns trigger
language plpgsql as $$
begin
  if new.intern_owner is null
     and ((new.category = 'pilot' and new.stage in ('kickoff', 'setup', 'live', 'readout'))
          or (new.category = 'retention' and new.stage = 'onboarding'))
     and (tg_op = 'INSERT' or new.stage is distinct from old.stage) then
    raise exception 'Set an owner before moving this deal to %', new.stage
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger deals_owner_trg before insert or update on deals
  for each row execute function deals_owner_rule();

-- ---------------------------------------------------------------- questions
-- A question about one part of a deal, put to one person.
create table questions (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references deals,
  client_id    uuid not null references clients,
  anchor       text not null default 'general'
               check (anchor in ('general', 'stage', 'criteria', 'snapshot', 'billing', 'next_step',
                                 'tasks', 'contacts', 'usage', 'timeline')),
  anchor_note  text,                      -- the exact thing asked about, e.g. an email subject
  body         text not null check (length(trim(body)) > 0),
  asked_to     uuid references profiles,
  status       text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  answered_at  timestamptz,
  resolved_at  timestamptz,
  created_by   uuid references profiles,
  updated_by   uuid references profiles,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index questions_deal_idx on questions (deal_id, created_at desc);
create index questions_open_idx on questions (asked_to) where status = 'open';

create table question_replies (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references questions on delete cascade,
  deal_id      uuid not null references deals,
  body         text not null check (length(trim(body)) > 0),
  created_by   uuid references profiles,
  created_at   timestamptz not null default now()
);
create index question_replies_q_idx on question_replies (question_id, created_at);

-- A reply from anyone but the asker answers the question; the asker can resolve it.
create or replace function question_replies_effect() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update questions q
     set status = 'answered', answered_at = coalesce(q.answered_at, now())
   where q.id = new.question_id and q.status = 'open'
     and q.created_by is distinct from new.created_by;
  return null;
end
$$;
create trigger question_replies_effect_trg after insert on question_replies
  for each row execute function question_replies_effect();

create or replace function questions_stamp() returns trigger
language plpgsql as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then new.resolved_at := now(); end if;
  if new.status = 'open' and old.status <> 'open' then new.resolved_at := null; new.answered_at := null; end if;
  return new;
end
$$;
create trigger questions_stamp_trg before update on questions
  for each row execute function questions_stamp();

do $$
declare t text;
begin
  foreach t in array array['questions', 'question_replies'] loop
    execute format('create trigger %1$s_touch before insert or update on %1$s
                      for each row execute function touch_row()', t);
    execute format('create trigger %1$s_activity after insert or update on %1$s
                      for each row execute function log_activity()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true)', t);
  end loop;
end
$$;

-- Everyone signed in can ask and answer, including viewers: asking is how they get visibility.
create policy questions_insert on questions for insert to authenticated
  with check (created_by is null or created_by = app_actor());
create policy questions_update on questions for update to authenticated
  using (is_writer() or created_by = app_actor() or asked_to = app_actor())
  with check (is_writer() or created_by = app_actor() or asked_to = app_actor());
create policy question_replies_insert on question_replies for insert to authenticated
  with check (created_by is null or created_by = app_actor());

grant select, insert, update on questions to authenticated;
grant select, insert on question_replies to authenticated;

-- ---------------------------------------------------------------- email threads
-- Gmail's thread id, so messages group into conversations on a deal.
alter table interactions add column thread_ref text;
