# Ask Bill — observed development checkpoint

Observed 2026-10-16T23:00:20Z UTC in repository `neophilism/Ask-Bill`. Ask Bill is a separate company/product without cross-product integrations.

## Actual GitHub PRs

| Unit | PR | State | Scope acceptance |
|---|---|---|---|
| AB-001 | [#1](https://github.com/neophilism/Ask-Bill/pull/1) | Merged | Scoped implementation accepted |
| AB-002 | [#2](https://github.com/neophilism/Ask-Bill/pull/2) | Merged | Scoped implementation accepted |
| AB-003 | [#3](https://github.com/neophilism/Ask-Bill/pull/3) | Merged | Scoped implementation accepted |
| AB-004 | [#4](https://github.com/neophilism/Ask-Bill/pull/4) | Merged | Merged partial unit; operational acceptance pending |
| AB-005 | [#5](https://github.com/neophilism/Ask-Bill/pull/5) | Merged | Merged partial unit; operational acceptance pending |
| AB-006 | [#6](https://github.com/neophilism/Ask-Bill/pull/6) | Merged | Merged partial unit; operational acceptance pending |
| AB-007 | [#7](https://github.com/neophilism/Ask-Bill/pull/7) | Merged | Merged partial unit; operational acceptance pending |
| AB-008 | [#8](https://github.com/neophilism/Ask-Bill/pull/8) | Open draft | Work in progress |

Exact approved plan: 112 units, 490 dependencies. PRs #1–#7 are merged and their branch-head GitHub Actions checks passed. Browser preview has live localhost Chromium checks at desktop and 320px, including keyboard/reduced-motion/JS-disabled reading. AB-007 migrations and two-publisher RLS checks passed against disposable PostgreSQL 17. AB-006 ships only an original fixture and integrity tooling; no final Bill GLB/Blender asset exists. PR #8 has nine local passing tests for the fixture-only auth boundary; exact-head GitHub CI is not yet accepted at this observation.

## Undelivered and required gates

No production website, full React/Next.js app, real publisher auth/MFA/recovery, complete authoritative published bill pack, live grounded conversational AI, licensed voice/lip-sync, finished 3D character, cloud deployment or production acceptance. Private live provider connections remain unconfigured; test-only auth is explicitly impossible to enable as production login. Continue implementation without conflating a green unit test or PR merge with an operational milestone.

## Next dependency-ready work

Review PR #8's CI, fix failures, merge only after passes and review. Implement real staging authorization adapters, isolate private object storage, source ingestion and security inventory, and finish original-character production in the approved plan.
