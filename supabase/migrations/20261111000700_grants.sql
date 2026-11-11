-- Grants for the signed-in role. Deliberately no DELETE anywhere: soft delete only.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant insert, update on tables to authenticated;

-- The audit trigger writes to a table the signed-in role may only read, and the
-- append-only guard blocks everything else. Run it as the owner so the log is
-- written no matter who made the change.
alter function log_activity()           security definer set search_path = public;
alter function deals_health_history()   security definer set search_path = public;
alter function sync_deal_next_step()    security definer set search_path = public;
alter function touch_row()              security definer set search_path = public;

revoke insert, update on activity from authenticated;
