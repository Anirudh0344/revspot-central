-- Email to deal linking.
--
-- Gmail sync puts an email on a deal when the client's people on it are linked to
-- exactly one live deal, or the client has only one live deal. Nothing could link a
-- contact to a deal, so for clients with two or more live deals every email landed
-- on the client and on no deal. This adds:
--   - contacts linked to deals (from the deal page), soft-removed and audited
--   - email domains managed on the client page, so sync works before any contact
--     with a work address exists
--   - an index for following an email thread onto the deal it already sits on

-- ---------------------------------------------------------------- deal contacts
-- The activity log needs an id per row; unlinking is a soft remove (no DELETE grants).
alter table deal_contacts
  add column id         uuid not null default gen_random_uuid() unique,
  add column created_by uuid references profiles default app_actor(),
  add column created_at timestamptz not null default now(),
  add column removed_at timestamptz,
  add column removed_by uuid references profiles;

create trigger deal_contacts_activity after insert or update on deal_contacts
  for each row execute function log_activity();

-- ---------------------------------------------------------------- client domains
alter table client_domains
  add column id         uuid not null default gen_random_uuid() unique,
  add column created_by uuid references profiles default app_actor(),
  add column created_at timestamptz not null default now(),
  add column removed_at timestamptz,
  add column removed_by uuid references profiles;

-- New rows are stored the way Gmail sync compares them: lower case, a bare domain.
-- NOT VALID: existing rows (taken from typed contact emails) are left as they are.
alter table client_domains
  add constraint client_domains_domain_shape
  check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
  not valid;

create trigger client_domains_activity after insert or update on client_domains
  for each row execute function log_activity();

-- ---------------------------------------------------------------- threads
create index interactions_thread_idx on interactions (thread_ref) where thread_ref is not null;
