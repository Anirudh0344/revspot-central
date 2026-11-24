-- deal_view was created with d.*, which Postgres expands once, at creation. Columns
-- added to deals since then are missing from it. Append them at the end, which
-- CREATE OR REPLACE VIEW allows, so the views built on deal_view stay as they are.
do $$
declare
  def  text := pg_get_viewdef('deal_view'::regclass);
  cut  int  := strpos(def, E'\n   FROM (');
  have text[];
  add  text := '';
  col  text;
begin
  if cut = 0 then
    raise exception 'deal_view definition has an unexpected shape';
  end if;
  select array_agg(column_name::text) into have
    from information_schema.columns where table_schema = 'public' and table_name = 'deal_view';
  foreach col in array array['crm_required', 'crm_started_at', 'blocked_on', 'blocker_note', 'blocked_since'] loop
    if not col = any(have) then
      add := add || format(E',\n    d.%I', col);
    end if;
  end loop;
  if add <> '' then
    execute 'create or replace view deal_view as ' || left(def, cut - 1) || add || substr(def, cut);
  end if;
end
$$;
