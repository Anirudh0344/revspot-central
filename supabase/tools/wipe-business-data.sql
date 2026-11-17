/*
  Clear every business record, keeping the team and the configuration.

  Removes: clients, contacts, deals and everything hanging off them, plus the
  activity log, which is otherwise append-only.
  Keeps: profiles, stages, sla_config.

  This is a maintenance tool, not something the product can do. The app has no
  hard-delete path on purpose, so this runs as the database owner and steps
  around the activity guard deliberately. Run it only against a database whose
  contents you are willing to lose.

    psql -d cs_cc -v ON_ERROR_STOP=1 -f supabase/tools/wipe-business-data.sql
*/

begin;

-- The activity log refuses deletes by trigger. Lift that for this transaction
-- only; the guard is restored before commit.
alter table activity disable trigger activity_no_delete;

-- Children first, then parents.
delete from payments;
delete from invoices;
delete from qc_reviews;
delete from delivery_logs;
delete from escalations;
delete from requests;
delete from interactions;
delete from health_history;
delete from line_items;
delete from deal_contacts;
delete from tasks;
delete from deals;
delete from client_domains;
delete from contacts;
delete from clients;
delete from daily_notes;
delete from scorecard_snapshots;

-- activity has no foreign keys to the rows above, so it goes last.
delete from activity;

alter table activity enable trigger activity_no_delete;

commit;

\echo ''
\echo 'Remaining rows:'
select 'clients' as table, count(*) from clients
union all select 'deals', count(*) from deals
union all select 'contacts', count(*) from contacts
union all select 'tasks', count(*) from tasks
union all select 'interactions', count(*) from interactions
union all select 'activity', count(*) from activity
union all select 'profiles (kept)', count(*) from profiles
union all select 'stages (kept)', count(*) from stages
order by 1;
