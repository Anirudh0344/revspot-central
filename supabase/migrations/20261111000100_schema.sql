-- Revspot CS Command Center: core schema
-- Covers every module; MVP uses profiles, clients, contacts, deal_contacts,
-- stages, deals, line_items, tasks, health_history, activity.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type user_role        as enum ('admin','intern','viewer','bot');
create type deal_category    as enum ('pilot','retention','expansion');
create type health           as enum ('red','amber','green');
create type commercial_model as enum ('per_ql','per_minute','per_record','fixed_fee','retainer','retainer_plus_performance','hybrid');
create type contact_role     as enum ('decision_maker','champion','day_to_day','finance','tech','other');
create type task_status      as enum ('open','done','cancelled');
create type request_team     as enum ('data','voice','bot','product','other');
create type request_status   as enum ('open','in_progress','blocked','done','cancelled');
create type channel          as enum ('email','whatsapp','call','meeting','note');
create type invoice_status   as enum ('draft','sent','partially_paid','paid','overdue','disputed','written_off');

-- ---------------------------------------------------------------- people
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  name         text not null,
  email        text unique,
  role         user_role not null default 'intern',
  api_key_hash text,                         -- bots only
  is_active    boolean not null default true, -- kill switch (BA-4)
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- clients
create table clients (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  legal_name       text,
  gstin            text,
  segment          text,                     -- developer, channel partner, broker
  city             text,
  intern_owner     uuid references profiles,
  whitespace_notes text,
  archived_at      timestamptz,
  created_by       uuid references profiles,
  updated_by       uuid references profiles,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- CL-1: name unique among non-archived clients, case-insensitive
create unique index clients_name_active_uniq
  on clients (lower(name)) where archived_at is null;

create table contacts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients,
  name              text not null,
  title             text,
  email             text,
  phone             text,
  whatsapp          text,
  role              contact_role not null default 'other',
  notes             text,
  last_contacted_at timestamptz,
  archived_at       timestamptz,
  created_by        uuid references profiles,
  updated_by        uuid references profiles,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index contacts_client_idx on contacts (client_id) where archived_at is null;

-- CL-8: email domain -> client mapping for Gmail sync and the bot
create table client_domains (
  client_id uuid not null references clients on delete cascade,
  domain    text not null,
  primary key (client_id, domain)
);
create index client_domains_domain_idx on client_domains (domain);

-- ---------------------------------------------------------------- pipeline config
create table stages (
  category          deal_category not null,
  key               text not null,
  label             text not null,
  position          int not null,
  max_days          int,                     -- days before the card is flagged
  is_terminal       boolean not null default false,
  exit_requirements jsonb not null default '[]'::jsonb,  -- required deal columns
  primary key (category, key)
);
create index stages_order_idx on stages (category, position);

-- ---------------------------------------------------------------- deals
create table deals (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique,          -- AU-4, e.g. GPL-PS
  client_id             uuid not null references clients,
  title                 text not null,
  product               text,
  projects              text[],
  category              deal_category not null,
  stage                 text not null,
  parent_deal_id        uuid references deals,
  health                health,
  health_reason         text,
  health_updated_at     timestamptz,
  commercial_model      commercial_model,
  term_months           int,
  monthly_value         numeric(14,2),
  contract_value        numeric(14,2),
  start_date            date,
  end_date              date,
  closed_month          date,
  -- success criteria (playbook 2.1)
  sc_business_outcome   text,
  sc_targets            text,
  sc_leading_indicators text,
  sc_judged_by          text,
  sc_failure_line       text,
  sc_decision_statement text,
  next_step             text,
  next_step_due         date,
  intern_owner          uuid references profiles,
  context_doc_url       text,
  close_reason          text,
  -- DL-14: promises and dependencies captured at handover
  handover_notes        text,
  conversion_price      numeric(14,2),
  stage_entered_at      timestamptz not null default now(),
  archived_at           timestamptz,
  created_by            uuid references profiles,
  updated_by            uuid references profiles,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (category, stage) references stages (category, key)
);
create index deals_client_idx  on deals (client_id) where archived_at is null;
create index deals_board_idx   on deals (category, stage) where archived_at is null;
create index deals_health_idx  on deals (health) where archived_at is null;
create index deals_owner_idx   on deals (intern_owner) where archived_at is null;

create table deal_contacts (
  deal_id    uuid not null references deals on delete cascade,
  contact_id uuid not null references contacts on delete cascade,
  primary key (deal_id, contact_id)
);

create table line_items (
  id                 uuid primary key default gen_random_uuid(),
  deal_id            uuid not null references deals on delete cascade,
  description        text not null,
  unit               text,
  quantity           numeric(14,2) not null,
  rate               numeric(14,2) not null,
  amount             numeric(14,2) generated always as (quantity * rate) stored,
  delivered_quantity numeric(14,2) not null default 0,
  billing_trigger    text,                   -- upfront, milestone, on_delivery, monthly
  created_by         uuid references profiles,
  updated_by         uuid references profiles,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index line_items_deal_idx on line_items (deal_id);

-- ---------------------------------------------------------------- tasks
create table tasks (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid references deals,
  client_id    uuid references clients,
  title        text not null,
  owner        uuid references profiles,
  due_date     date,
  status       task_status not null default 'open',
  created_by   uuid references profiles,
  updated_by   uuid references profiles,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_open_idx  on tasks (owner, due_date) where status = 'open';
create index tasks_deal_idx  on tasks (deal_id) where status = 'open';

-- ---------------------------------------------------------------- requests (Phase 2)
create table requests (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references deals,
  team          request_team not null,
  ask           text not null,
  assignee_name text,
  raised_by     uuid references profiles,
  raised_at     timestamptz not null default now(),
  due_at        timestamptz not null,
  status        request_status not null default 'open',
  blocker       text,
  blocking      boolean not null default false,
  resolved_at   timestamptz,
  created_by    uuid references profiles,
  updated_by    uuid references profiles
);
create index requests_open_idx on requests (status, due_at);

create table sla_config (
  team         request_team primary key,
  working_days int not null
);

-- ---------------------------------------------------------------- communication (Phase 2)
create table interactions (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid references deals,
  client_id   uuid not null references clients,
  channel     channel not null,
  occurred_at timestamptz not null,
  participants text[],
  summary     text not null,
  next_step   text,
  direction   text,                           -- inbound, outbound, internal
  source_ref  text,
  logged_by   uuid references profiles,
  created_at  timestamptz not null default now()
);
create index interactions_deal_idx   on interactions (deal_id, occurred_at desc);
create index interactions_client_idx on interactions (client_id, occurred_at desc);

-- ---------------------------------------------------------------- outcomes (Phase 3)
create table delivery_logs (
  id                      uuid primary key default gen_random_uuid(),
  deal_id                 uuid not null references deals,
  log_date                date not null,
  campaign                text not null default '',
  dials int, connects int, qualified_leads int, site_visits int,
  planned_qualified_leads int,
  notes                   text,
  logged_by               uuid references profiles,
  unique (deal_id, log_date, campaign)
);

create table qc_reviews (
  id                  uuid primary key default gen_random_uuid(),
  deal_id             uuid not null references deals,
  review_date         date not null,
  campaign            text,
  calls_reviewed      int not null,
  script_score        int, qualification_score int, tone_score int,
  data_issues         int,
  findings            text,
  reviewer            uuid references profiles
);

create table daily_notes (
  id        uuid primary key default gen_random_uuid(),
  author    uuid not null references profiles,
  note_date date not null,
  reds text, ambers text, went_live text, overdue_requests text, insight text,
  unique (author, note_date)
);

create table escalations (
  id              uuid primary key default gen_random_uuid(),
  deal_id         uuid not null references deals,
  impact          text not null,
  root_cause      text, options text,
  decision_needed text, client_message text,
  team            request_team, fix_owner text, fix_due date,
  status          text not null default 'open',
  verification_note text,
  opened_by       uuid references profiles,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz
);

-- ---------------------------------------------------------------- billing (Phase 4)
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals,
  client_id      uuid not null references clients,
  invoice_number text, po_number text,
  issue_date     date, due_date date,
  amount         numeric(14,2) not null,
  gst            numeric(14,2) not null default 0,
  status         invoice_status not null default 'draft',
  pdf_url        text, notes text,
  created_by     uuid references profiles,
  updated_by     uuid references profiles,
  created_at     timestamptz not null default now()
);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices,
  amount      numeric(14,2) not null,
  received_on date not null,
  mode        text,
  reference   text not null,                 -- IN-7: bot cannot pay without a reference
  created_by  uuid references profiles,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit
create table health_history (
  id      uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals on delete cascade,
  health  health not null,
  reason  text not null,
  set_by  uuid references profiles,
  set_at  timestamptz not null default now()
);
create index health_history_deal_idx on health_history (deal_id, set_at desc);

create table activity (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   uuid not null,
  deal_id     uuid,
  client_id   uuid,
  action      text not null,                 -- create, update, stage_change, archive, note, undo
  changes     jsonb,                         -- {field: [before, after]}
  actor       uuid references profiles,
  reason      text,
  undone_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index activity_deal_idx   on activity (deal_id, created_at desc);
create index activity_client_idx on activity (client_id, created_at desc);
create index activity_entity_idx on activity (entity_type, entity_id, created_at desc);
create index activity_actor_idx  on activity (actor, created_at desc);

create table scorecard_snapshots (
  snapshot_date date primary key,
  metrics       jsonb not null,
  created_at    timestamptz not null default now()
);
