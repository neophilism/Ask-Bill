# AB-010 — durable queue and transactional outbox operations

This work belongs **only to Ask Bill**. It does not use an external company's code, keys, data, or services. The feature is a database-backed foundation and a provider-injected worker runner, not an active production deployment.

## Architecture and trust

- `migrations/002_jobs.sql` **expands** the existing Ask Bill PostgreSQL 17 schema. It retains the AB-007 ten-table design, adds indexed availability/backoff/diagnostic and outbox lease/fence fields, and creates narrowly scoped `SECURITY INVOKER` functions. No destructive down migration is provided.
- Jobs are identified by a stable `(publisher_id, kind, dedupe_key)` pair. `enqueue_job` returns the same job ID for a repeat. `claim_job` takes the earliest ready row with `FOR UPDATE SKIP LOCKED`, assigns a unique worker, increments the fencing token, sets a bounded lease, and increments attempt count. Expired attempts can be reclaimed by a different worker; a stale fence can **never** complete or renew a job.
- `heartbeat_job` must run **before** lease expiry. `complete_job_and_enqueue` performs the fenced job transition and insertion into the outbox **in one PostgreSQL transaction**. An outbox insert error rolls back the job completion.
- `fail_job` records only an uppercase bounded diagnostic code (no transcripts, personal information, stack traces or secrets), then moves into bounded exponential retry or durable dead-letter. `reap_expired_jobs` handles interrupted/exhausted workers. No manual retry is triggered from an untrusted public request.
- `claim_outbox`/`ack_outbox`/`fail_outbox` and `reap_expired_outbox` provide separately fenced, bounded at-least-once delivery. A receiver **must** implement idempotency by the unchanged event key; a crash after external success but before database acknowledgment can cause a replay. Do not promise exactly-once delivery across a network.
- `packages/jobs` exposes `createJobWorker`, `createOutboxWorker`, and a PostgreSQL adapter accepting an injected trusted, least-privileged connection pool. The adapter pins one publisher identity server-side, runs each SQL operation inside a transaction with `SET LOCAL`-equivalent tenant state, and uses parameterized queries. **The browser cannot choose a tenant ID, fetch jobs, claim queues, or trigger private delivery.**
- The worker callback must return an approved, bounded event specification and must not directly publish a bill or perform another irreversible external action. The outbox consumer performs external delivery using a destination configured by the application—not sourced from untrusted statutory text or an LLM tool output.

## Running isolated tests

Run `node --test tests/jobs.test.mjs tests/jobs-store.test.mjs` to check orchestration, replay, diagnostics and tenant-safe SQL parameters. The standard GitHub Actions `database / PostgreSQL tenancy and migrations` job launches a fresh PostgreSQL 17 Docker container, applies migration 001 twice, checks tenant isolation, applies migration 002 twice, and executes `tests/postgres/jobs.sql` under the non-owner test role. This includes simulated worker crashes, stale fencing, wrong-tenant claims, enqueue idempotency, timeout/retry and outbox replay.

Do **not** run the integration script against a real Neon or Render database. Production/staging provisioning, publisher identity service, storage provider, data migration rollout, queue scheduling, live load and crash-testing of two simultaneous external processes remain separate acceptance steps. This change deliberately does not select or modify a paid account.

## Deployment and recovery

Before enabling a worker: select an isolated Ask Bill project and source version, record a backup/restore point, run both migrations under a migration-only role, provision non-`BYPASSRLS` app roles with **explicit** function grants, wire real authentication to server-owned publisher context, and validate two-tenant isolation. Do not use the migration owner as a runtime connection identity. Scope connection pools to appropriate services and exclude production credentials from CI. Freeze processing by stopping worker polling; retain queued and outbox rows. Restart workers with new UUID identities; expired leases will be reclaimed and stale completions rejected. Inspect `status`, `attempt`, `last_error_code`, and lease age without logging payloads. Monitor queue age, retries, dead-letter rates, outbox lag, unusual cost and repeated failures. Audit event subscriptions and ensure the receiving side enforces idempotency keys.

Rollback: keep the additive schema, stop new workers and restore the previously compatible application image; never automatically drop queue history or withdraw published release pointers. Schema-altering follow-ups require staged expand/contract and populated-database compatibility evidence.
