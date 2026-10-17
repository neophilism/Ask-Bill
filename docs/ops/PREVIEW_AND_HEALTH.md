# Ask Bill preview isolation, health and safe shutdown — AB-012

Status: **implementation scaffold only**. No Render service, Neon project, hosted authentication, private object bucket, voice provider or public domain is provisioned by this unit. Ask Bill is entirely independent of other products and companies. The user's Bill asset is a later graphics milestone.

## Runtime health contract

- `GET /health/live`: safe process liveness; 200 even during drain, letting a supervisor distinguish an intentionally draining process from a crashed one. It contains product, stage and validated build/schema versions only.
- `GET /health/ready`: 200 only for a deliberately marked **local fixture-only** preview, or when all staging/production probes for database, object storage, publisher identity and job queue return successful and compatible schema version. It returns 503 when any probe is missing, invalid, throws, times out, or when the process is draining. It is not evidence of deployed authentication or source publication.
- Both endpoints are noncacheable; secrets, raw database URLs, provider keys, private source content and exception stack/message are never reflected. Only fixed dependency names/statuses are returned. HEAD is supported; mutations are rejected.
- `createHealthMonitor` accepts injected probes; do **not** use client-provided booleans or process-local counters as server proof. Production probes require real scoped server dependencies with closed-on-error behavior. The default `health-server.mjs` has deliberately missing probes and schema incompatibility and will report **not ready** on staging/production.

## Deployment isolation

`infra/render.yaml` is a **nonactive template** (there is no root auto-deploy blueprint). It declares a **health-only** service, not a public reader release. An operator must first select and confirm the correct Ask Bill Render workspace, separate staging database and storage, owner-approved spending limits, secret grants, branch/ref, rollout and rollback policy. Never reuse another company's hosting/database/accounts or production data. This template is not a substitute for functional serving, real staging identity, migration compatibility or container security tests.

Before deployment, verify immutable image/build digest, database schema version and migration ordering, release provenance, private publisher session isolation, and provider capabilities. Deny readiness on missing/invalid dependencies. Do not open a production URL to the localhost-only incomplete electronic-filing excerpt or permit unauthenticated publisher uploads. Keep the old healthy release available for rollback.

## Worker drain and rollback

A worker creates a `createWorkerDrainController()` per process, acquires a token before beginning an in-flight unit and releases it in `finally`. At SIGTERM or planned shutdown: stop accepting new work, call `beginDrain()`, await `waitForDrain({timeoutMs})`, and only then release the process. A deadline returns `false` but **does not** erase active leases or delete outbox messages. PostgreSQL fencing and reapers must let another owner eventually recover unfinished work. The current helper does not register signal handlers or start production polling by itself; it needs integration with the production host adapter before acceptance.

Rollback: stop new jobs/outbox dispatch, leave uncommitted rows durable, re-enable previous compatible worker image; do not drop tables or delete in-flight data. For health-related regressions, revert these scoped health routes without affecting the public source-reader fallback. Include staging kill/recovery and multiple-probe failure simulations before operational acceptance.

## Local validation

Use `node --test tests/health.test.mjs tests/drain.test.mjs`, then `corepack pnpm verify`. The standalone health server can be exercised with `ASK_BILL_STAGE=local PORT=4101 node apps/web/health/health-server.mjs`; this is a safe local health-only mock, not a production-ready service. Test staging readiness via `ASK_BILL_STAGE=staging` and expect 503 until real dependencies are injected.
