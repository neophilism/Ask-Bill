# Ask Bill — source-verified development checkpoint

Observed 2026-10-16T23:04:14Z UTC from GitHub. Ask Bill remains a distinct independent company/product.

## Actual PR state

| Work unit | PR | GitHub | Delivery |
|---|---|---|---|
| AB-001 | [#1](https://github.com/neophilism/Ask-Bill/pull/1) | Merged | Scoped foundation completed |
| AB-002 | [#2](https://github.com/neophilism/Ask-Bill/pull/2) | Merged | Scoped foundation completed |
| AB-003 | [#3](https://github.com/neophilism/Ask-Bill/pull/3) | Merged | Scoped foundation completed |
| AB-004 | [#4](https://github.com/neophilism/Ask-Bill/pull/4) | Merged | Partial implementation, operational acceptance outstanding |
| AB-005 | [#5](https://github.com/neophilism/Ask-Bill/pull/5) | Merged | Partial implementation, operational acceptance outstanding |
| AB-006 | [#6](https://github.com/neophilism/Ask-Bill/pull/6) | Merged | Partial implementation, operational acceptance outstanding |
| AB-007 | [#7](https://github.com/neophilism/Ask-Bill/pull/7) | Merged | Partial implementation, operational acceptance outstanding |
| AB-008 | [#8](https://github.com/neophilism/Ask-Bill/pull/8) | Merged | Partial implementation, operational acceptance outstanding |
| AB-009 | [#9](https://github.com/neophilism/Ask-Bill/pull/9) | Open draft | Work in progress |

The canonical roadmap contains 112 original units and 490 original dependencies. Exact-head GitHub Actions quality checks passed before PRs #1–#8 merged. The GHA browser job exercises real localhost reader HTTP, and the disposable PostgreSQL 17 job tests migration idempotence and two-publisher isolation. Scope from #4 and #5–#8 is only partially implemented; green CI does not mean the full milestone gate or production launch is accepted.

PR #9 adds cryptographically signed, tenant-bound quarantine ticket contracts and test-only nonce tracking. Its nine (correction: **eight**) local Node security subtests passed. This is **not** an actual storage provider, signed S3 transfer endpoint, durable replay store or deployed service. Current-head GitHub checks still need independent verification.

Undelivered: complete React/Next.js public interface, genuine publisher login/MFA and storage integration, full legislative source ingestion/publishing, AI conversations, original GLB/Blender model, voice and lip sync, production hosting and domain. Do not use unrelated company data or claim the incomplete source fixture is law.

Next: pass PR #9 head-bound CI; merge only reviewed/passing changes; complete object-storage integration and privacy inventory, then advance dependency-ready units with the genuine original Bill character and authoritative source support.
