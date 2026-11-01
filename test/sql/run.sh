#!/usr/bin/env bash
# For each test/sql/*.test.sql: create a fresh database, apply the migrations, run the test.
# Needs a local Postgres 15+; pass connection settings the usual way (PGHOST, PGPORT, PGUSER).
set -euo pipefail
cd "$(dirname "$0")/../.."

for test in test/sql/*.test.sql; do
  db="tribun_test_$$_$(basename "$test" .test.sql)"
  createdb "$db"
  echo "== $test"
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f test/sql/supabase-stub.sql >/dev/null
  for migration in supabase/migrations/*.sql; do
    psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$migration" >/dev/null
  done
  set +e
  out=$(psql -q -X -v ON_ERROR_STOP=1 -d "$db" -f test/sql/helpers.sql -f "$test" 2>&1)
  status=$?
  set -e
  printf '%s\n' "$out" | sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERROR: /p'
  dropdb --if-exists "$db"
  if [ "$status" != 0 ]; then exit 1; fi
done
echo "All database checks passed."
