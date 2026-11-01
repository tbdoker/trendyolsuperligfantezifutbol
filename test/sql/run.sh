#!/usr/bin/env bash
# Applies the migrations to a fresh database and runs the schema checks.
# Needs a local Postgres 15+; pass connection settings the usual way (PGHOST, PGPORT, PGUSER).
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="tribun_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f test/sql/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f test/sql/schema.test.sql
