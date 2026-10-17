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
  if docker exec "$container" psql --username=askbill_test_owner --dbname=askbill_fixture --tuples-only --no-align --command "SELECT 1" 2>/dev/null | grep -qx 1; then
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
echo '[Ask Bill AB-010] Apply fenced queue/outbox expansion twice'
psql_container < migrations/002_jobs.sql > /dev/null
psql_container < migrations/002_jobs.sql > /dev/null
echo '[Ask Bill AB-010] Verify tenant-scoped leases, crashes, retries and idempotent outbox'
psql_container < tests/postgres/jobs.sql
echo '[Ask Bill AB-013] Apply immutable source-provenance metadata schema twice'
psql_container < migrations/003_provenance.sql > /dev/null
psql_container < migrations/003_provenance.sql > /dev/null
echo '[Ask Bill AB-013] Verify tenant provenance, immutability and cross-tenant rejection'
psql_container < tests/postgres/provenance.sql
echo '[Ask Bill AB-023] Apply versioned lexical search schema twice'
psql_container < migrations/004_search.sql > /dev/null
psql_container < migrations/004_search.sql > /dev/null
echo '[Ask Bill AB-023] Test source-tethered tenant-safe index activation and rollback'
psql_container < tests/postgres/search.sql
echo '[Ask Bill AB-034] Apply locked usage reservation migration twice'
psql_container < migrations/005_usage.sql > /dev/null
psql_container < migrations/005_usage.sql > /dev/null
echo '[Ask Bill AB-034] Check tenants, default-off, idempotency, budgets and settlement'
psql_container < tests/postgres/usage.sql
echo '[Ask Bill AB-034] Run concurrent reservation race against same publisher ceiling'
race_dir=$(mktemp -d)
race_sql() {
  local key=$1
  cat <<SQL
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
SELECT ask_bill.reserve_generation('11111111-1111-4111-8111-111111111111','eeeeeeee-1111-4111-8111-111111111111','$key',20,now()+interval '5 minutes');
SELECT pg_sleep(1);
COMMIT;
SQL
}
(race_sql 'parallel-request-one' | psql_container >"$race_dir/a.log" 2>&1 && echo success >"$race_dir/a.status" || echo failure >"$race_dir/a.status") &
worker_a=$!
sleep 0.2
(race_sql 'parallel-request-two' | psql_container >"$race_dir/b.log" 2>&1 && echo success >"$race_dir/b.status" || echo failure >"$race_dir/b.status") &
worker_b=$!
wait "$worker_a"
wait "$worker_b"
wins=$(grep -l '^success$' "$race_dir"/*.status | wc -l)
if [ "$wins" -ne 1 ]; then
  echo 'Expected exactly one concurrent reservation; both or neither succeeded' >&2
  cat "$race_dir"/*.log >&2
  rm -rf "$race_dir"
  exit 1
fi
rm -rf "$race_dir"
count=$(docker exec "$container" psql --username=askbill_test_owner --dbname=askbill_fixture --tuples-only --no-align --command "SELECT count(*) FROM ask_bill.usage_reservations WHERE reservation_key IN ('parallel-request-one','parallel-request-two')")
if [ "$count" != 1 ]; then
  echo "Expected one committed concurrent reservation; found $count" >&2
  exit 1
fi
echo '[Ask Bill AB-034] Database usage and concurrency acceptance checks passed'
echo '[Ask Bill AB-024] Apply reviewed publishing schema twice, test activation and withdrawal under RLS'
psql_container < migrations/006_release.sql > /dev/null
psql_container < migrations/006_release.sql > /dev/null
psql_container < tests/postgres/releases.sql
echo '[Ask Bill AB-004/024] Verify active release reader SQL against PostgreSQL schema'
psql_container < tests/postgres/public_reader.sql
echo '[Ask Bill AB-004/024] Verify active published catalog query against PostgreSQL schema'
psql_container < tests/postgres/public_catalog.sql
echo '[Ask Bill AB-024] Prove authorized active release and revoked source isolation under PostgreSQL FORCE RLS'
psql_container < tests/postgres/public_reader_policy.sql
echo '[Ask Bill AB-024] Validate source size preflight SQL in ephemeral PostgreSQL'
psql_container < tests/postgres/public_size_budget.sql
printf '[Ask Bill AB-007/010/013/023] PostgreSQL migrations, isolation, jobs, source provenance and atomic search indexing passed.\n'
