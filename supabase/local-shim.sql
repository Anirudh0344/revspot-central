-- Local-only stand-in for the pieces Supabase provides (auth schema, roles).
-- Never applied to a Supabase project; used so the migrations can be run and
-- tested against a plain Postgres instance.
create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- On a hosted Postgres the connecting user is not a superuser, so it must be a
-- member of the roles the app switches into (`set local role authenticated`).
do $$ begin
  if not (select rolsuper from pg_roles where rolname = current_user)
     and not (pg_has_role(current_user, 'anon', 'MEMBER') and pg_has_role(current_user, 'authenticated', 'MEMBER')) then
    execute format('grant anon, authenticated to %I', current_user);
  end if;
end $$;
