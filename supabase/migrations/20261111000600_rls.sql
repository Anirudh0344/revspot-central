-- Row Level Security. Interns edit everything; only admins change commercial
-- fields; nobody deletes. Bots get admin rights minus the guardrails above.

create or replace function current_role_of() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function is_writer() returns boolean
language sql stable as $$
  select current_role_of() in ('admin','intern','bot')
$$;

create or replace function is_admin() returns boolean
language sql stable as $$
  select current_role_of() in ('admin','bot')
$$;

-- commercial fields are admin-only (DL/CL commercial decisions)
create or replace function deals_commercial_guard() returns trigger
language plpgsql as $$
begin
  if current_role_of() = 'intern' and (
       new.commercial_model is distinct from old.commercial_model or
       new.term_months      is distinct from old.term_months      or
       new.monthly_value    is distinct from old.monthly_value    or
       new.contract_value   is distinct from old.contract_value) then
    raise exception 'Only an admin can change commercial fields on a deal'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger deals_commercial_guard_trg before update on deals
  for each row execute function deals_commercial_guard();

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','clients','contacts','client_domains','stages','deals','deal_contacts',
    'line_items','tasks','requests','sla_config','interactions','delivery_logs',
    'qc_reviews','daily_notes','escalations','invoices','payments','health_history',
    'activity','scorecard_snapshots'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true)', t);
  end loop;

  -- writable by admin, intern and bot
  foreach t in array array[
    'clients','contacts','client_domains','deals','deal_contacts','line_items','tasks',
    'requests','interactions','delivery_logs','qc_reviews','daily_notes','escalations',
    'invoices','payments','health_history'
  ] loop
    execute format('create policy %1$s_insert on %1$s for insert to authenticated with check (is_writer())', t);
    execute format('create policy %1$s_update on %1$s for update to authenticated using (is_writer()) with check (is_writer())', t);
  end loop;

  -- config tables: admins only
  foreach t in array array['stages','sla_config','scorecard_snapshots'] loop
    execute format('create policy %1$s_insert on %1$s for insert to authenticated with check (is_admin())', t);
    execute format('create policy %1$s_update on %1$s for update to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end
$$;

-- profiles: anyone signed in reads; admins manage; you may edit your own name
create policy profiles_insert on profiles for insert to authenticated with check (is_admin());
create policy profiles_update on profiles for update to authenticated
  using (is_admin() or id = auth.uid()) with check (is_admin() or id = auth.uid());

-- Sales (viewer role) may file a pilot handover, nothing else (DL-14)
create policy deals_handover_insert on deals for insert to authenticated
  with check (current_role_of() = 'viewer' and category = 'pilot' and stage = 'handover');

-- No delete policy exists on any table: soft delete only.
