-- The team. Everything else is business data and lives in seed-demo.sql, so a
-- reset gives you an empty system ready for real clients and deals.
--   psql -d cs_cc -f supabase/seed.sql

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','anunay@revspot.ai'),
  ('22222222-2222-2222-2222-222222222222','intern1@revspot.ai'),
  ('33333333-3333-3333-3333-333333333333','intern2@revspot.ai'),
  ('44444444-4444-4444-4444-444444444444','grok@revspot.ai'),
  ('55555555-5555-5555-5555-555555555555','sales@revspot.ai')
on conflict (id) do nothing;

insert into profiles (id, name, email, role) values
  ('11111111-1111-1111-1111-111111111111','Anunay','anunay@revspot.ai','admin'),
  ('22222222-2222-2222-2222-222222222222','Intern One','intern1@revspot.ai','intern'),
  ('33333333-3333-3333-3333-333333333333','Intern Two','intern2@revspot.ai','intern'),
  ('44444444-4444-4444-4444-444444444444','Grok bot','grok@revspot.ai','bot'),
  ('55555555-5555-5555-5555-555555555555','Sales','sales@revspot.ai','viewer')
on conflict (id) do nothing;

select set_config('app.actor','11111111-1111-1111-1111-111111111111', false);
select set_config('app.reason','Imported from the client ledger', false);

commit;
