# Ask Bill — live scoped development checkpoint

Observed: 2026-10-16T23:58:48Z UTC. GitHub repository `neophilism/Ask-Bill`. This project is independent; no other company's infrastructure is integrated.

## Source and PR evidence

- Merged PRs #1–#10. PR #10 contains AB-010's PostgreSQL fenced-lease, retries, dead-letter and transactional outbox migration + worker adapters, with head-bound browser/quality/disposable PostgreSQL CI success before merge. It does **not** mean a production worker/service is deployed or that an external sink has at-most-once delivery.
- Open draft PR #11, AB-011: a sensitive data-flow inventory, retention/deletion policy, threat model, fail-closed telemetry schema and disabled child-live-input policy. Node-local tests ran on initial implementation; exact latest-head CI is required.
- Approved active plan: 112 units, original 490 dependency edges, one machine registry. Work units AB-004–011 with partial implementation remain **in progress** pending their full acceptance, despite some contributing PRs already merged. Operational acceptance is separately `not_run`.

## Product readiness

Currently: source/citation validation, an isolated localhost reader demonstration of an incomplete draft, test-only publisher auth, tenant-safe database schema, signed-object contract, job/outbox engine. Not currently delivered: production publisher login/MFA, authoritative complete bill corpus with imports, live conversation and voice providers, verified parental consent, full 3D Bill rig/animation, fully hosted public website, production object store and end-to-end operational validation.

## Next execution

Finish independent AB-011 current-head checks and merge after security review. Then AB-012 preview infrastructure/health endpoints can proceed against Ask Bill-only disposable resources. The user will provide Bill's actual model shortly; do not represent the temporary document illustration as final art or hold independent work for that asset.
