-- Access model: admins edit, everyone else views.
--
--   owner        (is_super_admin) one person, Anunay. An admin who alone can make, change or
--                remove admins, and who can't be demoted or switched off here.
--   admin        edits everything, connects their Gmail (its client email syncs
--                for everyone to see), adds and manages view-only people.
--   user         (role viewer) sees everything, changes nothing.
--   bot          the Grok bot (unchanged).
--
-- "intern" stays in the enum for old rows but no longer edits; existing interns
-- become viewers.

alter table profiles add column is_super_admin boolean not null default false;
create unique index profiles_one_super_admin on profiles (is_super_admin) where is_super_admin;

-- Editing is for admins (and the bot) only.
create or replace function is_writer() returns boolean
language sql stable as $$
  select current_role_of() in ('admin','bot')
$$;

update profiles set role = 'viewer' where role = 'intern';
update profiles set is_super_admin = true where lower(email) = 'anunay@revspot.ai';

-- ---------------------------------------------------------------- guard
-- Enforced in the database, so no screen or API can get around it. Maintenance
-- run directly as the database owner (no app actor) is not restricted.
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := app_actor();
  actor_is_super boolean;
begin
  if actor is null then
    return new;
  end if;
  select coalesce(bool_or(is_super_admin and is_active and role = 'admin'), false) into actor_is_super
    from profiles where id = actor;

  if tg_op = 'UPDATE' and new.is_super_admin is distinct from old.is_super_admin
     or tg_op = 'INSERT' and new.is_super_admin then
    raise exception 'The owner can only be changed in the database.' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' and old.is_super_admin
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'The owner cannot be demoted or switched off.' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' and new.id = actor
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'You cannot change your own role or switch yourself off.' using errcode = 'insufficient_privilege';
  end if;

  if not actor_is_super and (
       new.role = 'admin'
       or (tg_op = 'UPDATE' and old.role = 'admin'
           and (new.role is distinct from old.role or new.is_active is distinct from old.is_active))
     ) then
    raise exception 'Only the owner can add, change or remove admins.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$$;

create trigger profiles_guard before insert or update on profiles
  for each row execute function profiles_guard();

-- ---------------------------------------------------------------- adding people
-- Signing in matches a profile by email, so adding someone ahead of their first
-- sign-in decides their role. Needs a sign-in identity row too (auth.users), which
-- the signed-in role can't write directly; this function does both, as an admin.
create or replace function add_person(p_email text, p_name text, p_role user_role)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Only admins can add people.' using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('admin', 'viewer') then
    raise exception 'A person is either an admin or a user.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That is not an email address.';
  end if;
  if exists (select 1 from profiles where lower(email) = v_email) then
    raise exception 'That person is already here.';
  end if;

  insert into auth.users (email) values (v_email)
  on conflict (email) do update set email = excluded.email
  returning id into v_id;
  insert into profiles (id, name, email, role)
  values (v_id, coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), v_email, p_role);
  return v_id;
end
$$;

grant execute on function add_person(text, text, user_role) to authenticated;

-- Changes to people show up in the activity log.
create trigger profiles_activity after insert or update on profiles
  for each row execute function log_activity();
