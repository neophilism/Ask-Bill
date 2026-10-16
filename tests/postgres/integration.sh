#!/usr/bin/env bash
set -euo pipefail
# Ephemeral PostgreSQL 17 integration test for AB-007. No external DB is touched.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
image="postgres:17.11-alpine3.24"
container="ask-bill-rls-test-$$"
cleanup() { docker rm --force "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[Ask Bill AB-007] Starting isolated test PostgreSQL container: $image"
docker run --detach --rm --name "$container" \
  --env POSTGRES_USER=askbill_test_owner \
  --env POSTGRES_PASSWORD=temporary_ci_test_only \
  --env POSTGRES_DB=askbill_fixture "$image" >/dev/null
ready=0
for attempt in $(seq 1 45); do
  if docker exec "$container" pg_isready --username=askbill_test_owner --dbname=askbill_fixture >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then echo 'PostgreSQL failed to become healthy' >&2; exit 1; fi
psql_container() { docker exec --interactive "$container" psql --username=askbill_test_owner --dbname=askbill_fixture --set=ON_ERROR_STOP=1 --no-psqlrc; }
echo '[Ask Bill AB-007] Applying migration (first pass)'
psql_container < migrations/001_initial.sql > /dev/null
echo '[Ask Bill AB-007] Reapplying migration (idempotence pass)'
psql_container < migrations/001_initial.sql > /dev/null
echo '[Ask Bill AB-007] Testing independent publishers and FORCE RLS with non-owner role'
psql_container < tests/postgres/isolation.sql
printf '[Ask Bill AB-007] PostgreSQL migration and two-tenant isolation checks passed.\n'
