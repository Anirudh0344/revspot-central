#!/usr/bin/env bash
# Local database helper. Uses the Homebrew Postgres if it is on the path.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
DB="${PGDATABASE:-cs_cc}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

migrate() {
  for f in "$HERE"/supabase/migrations/*.sql; do
    echo "  $(basename "$f")"
    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
  done
}

case "${1:-}" in
  reset)
    dropdb --if-exists "$DB"
    createdb "$DB"
    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/local-shim.sql"
    migrate
    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/seed.sql" > /dev/null
    echo "Database $DB rebuilt and seeded."
    ;;
  migrate) migrate ;;
  seed)    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/supabase/seed.sql" > /dev/null; echo "Seeded." ;;
  test)
    dropdb --if-exists "${DB}_test"
    createdb "${DB}_test"
    psql -q -v ON_ERROR_STOP=1 -d "${DB}_test" -f "$HERE/supabase/local-shim.sql"
    for f in "$HERE"/supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "${DB}_test" -f "$f"; done
    psql -q -d "${DB}_test" -f "$HERE/supabase/tests/acceptance.sql" 2>&1 | grep -E '^(ok|FAIL|---)'
    if psql -q -d "${DB}_test" -f "$HERE/supabase/tests/acceptance.sql" 2>&1 | grep -q '^FAIL'; then exit 1; fi
    ;;
  *) echo "usage: db.sh {reset|migrate|seed|test}"; exit 1 ;;
esac
