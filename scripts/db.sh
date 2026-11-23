#!/usr/bin/env bash
# Local database helper. Uses the Homebrew Postgres if it is on the path.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
DB="${PGDATABASE:-cs_cc}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

# Applies migrations not yet recorded in schema_migrations, in order.
migrate() {
  local target="${1:-$DB}"
  psql -q -v ON_ERROR_STOP=1 -d "$target" -c \
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
  for f in "$HERE"/supabase/migrations/*.sql; do
    local name; name="$(basename "$f")"
    if [ "$(psql -tA -d "$target" -c "select 1 from schema_migrations where name = '$name'")" = "1" ]; then continue; fi
    echo "  $name"
    psql -q -v ON_ERROR_STOP=1 -d "$target" -f "$f"
    psql -q -d "$target" -c "insert into schema_migrations (name) values ('$name')"
  done
}

# Marks every migration as applied, for a database built before tracking existed.
baseline() {
  local target="${1:-$DB}"
  psql -q -v ON_ERROR_STOP=1 -d "$target" -c \
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
  for f in "$HERE"/supabase/migrations/*.sql; do
    psql -q -d "$target" -c "insert into schema_migrations (name) values ('$(basename "$f")') on conflict do nothing"
  done
}

case "${1:-}" in
  reset)
    dropdb --if-exists "$DB"
    createdb "$DB"
    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/local-shim.sql"
    migrate "$DB"
    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/seed.sql" > /dev/null
    echo "Database $DB rebuilt. Team profiles only; run npm run db:demo for sample data."
    ;;
  migrate) migrate "$DB" ;;
  baseline) baseline "$DB"; echo "All migrations marked as applied on $DB." ;;
  backup)
    # A full, compressed copy of the database, kept for 30 days.
    mkdir -p "$HERE/backups"
    out="$HERE/backups/${DB##*/}-$(date +%Y%m%d-%H%M%S).dump"
    pg_dump -Fc --no-owner -d "${BACKUP_DATABASE_URL:-$DB}" -f "$out"
    find "$HERE/backups" -name '*.dump' -mtime +30 -delete
    echo "Backed up to $out"
    ;;
  restore)
    # Restores a backup into a database: db.sh restore <file> [database]
    [ -f "${2:-}" ] || { echo "usage: db.sh restore <file.dump> [database]"; exit 1; }
    pg_restore --clean --if-exists --no-owner -d "${3:-$DB}" "$2"
    ;;
  publish)
    # First deploy: copies this database, schema and data, into an empty production one.
    : "${PROD_DATABASE_URL:?Set PROD_DATABASE_URL to the production connection string}"
    if [ "$(psql -tA -d "$PROD_DATABASE_URL" -c "select to_regclass('public.deals') is not null")" = "t" ]; then
      echo "Production already has tables. Use: PROD_DATABASE_URL=... bash scripts/db.sh deploy"; exit 1
    fi
    psql -q -v ON_ERROR_STOP=1 -d "$PROD_DATABASE_URL" -f "$HERE/supabase/local-shim.sql"
    # Sign-in accounts first: profiles point at them.
    pg_dump --no-owner --data-only -t auth.users -d "$DB" | psql -q -v ON_ERROR_STOP=1 -d "$PROD_DATABASE_URL" > /dev/null
    pg_dump --no-owner --exclude-schema=auth -d "$DB" | grep -v '^ALTER DEFAULT PRIVILEGES' \
      | psql -q -v ON_ERROR_STOP=1 -d "$PROD_DATABASE_URL" > /dev/null
    # Tables added by later migrations are readable by the app, as they are locally.
    psql -q -v ON_ERROR_STOP=1 -d "$PROD_DATABASE_URL" \
      -c "alter default privileges in schema public grant select on tables to anon, authenticated" \
      -c "alter default privileges in schema public grant insert, update on tables to authenticated" \
      -c "alter default privileges in schema public grant usage, select on sequences to authenticated"
    echo "Copied $DB to production."
    ;;
  deploy)
    # Later deploys: applies new migrations to production.
    : "${PROD_DATABASE_URL:?Set PROD_DATABASE_URL to the production connection string}"
    migrate "$PROD_DATABASE_URL"
    ;;
  seed)    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/seed.sql" > /dev/null; echo "Team seeded." ;;
  demo)    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/seed-demo.sql" > /dev/null; echo "Demo clients and deals loaded." ;;
  wipe)    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/tools/wipe-business-data.sql" ;;
  test)
    dropdb --if-exists "${DB}_test"
    createdb "${DB}_test"
    psql -q -v ON_ERROR_STOP=1 -d "${DB}_test" -f "$HERE/supabase/local-shim.sql"
    migrate "${DB}_test" > /dev/null
    psql -q -d "${DB}_test" -f "$HERE/supabase/tests/acceptance.sql" 2>&1 | grep -E '^(ok|FAIL|---)'
    if psql -q -d "${DB}_test" -f "$HERE/supabase/tests/acceptance.sql" 2>&1 | grep -q '^FAIL'; then exit 1; fi
    ;;
  *) echo "usage: db.sh {reset|migrate|baseline|seed|demo|wipe|test|backup|restore|publish|deploy}"; exit 1 ;;
esac
