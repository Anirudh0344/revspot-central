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

-- On a hosted Postgres the connecting user is not a superuser, so it must be
-- allowed to switch into the roles the app uses (`set local role authenticated`).
-- Check SET, not MEMBER: on PostgreSQL 16+ the user that created a role is its
-- admin and counts as a member, but may not SET ROLE to it (Neon, PG 18).
do $$ begin
  if not (select rolsuper from pg_roles where rolname = current_user)
     and not (pg_has_role(current_user, 'anon', 'SET') and pg_has_role(current_user, 'authenticated', 'SET')) then
    if current_setting('server_version_num')::int >= 160000 then
      execute format('grant anon, authenticated to %I with set true', current_user);
    else
      execute format('grant anon, authenticated to %I', current_user);
    end if;
  end if;
end $$;
