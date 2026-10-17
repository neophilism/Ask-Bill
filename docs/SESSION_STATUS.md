# Ask Bill active engineering checkpoint

Observed 2026-10-17T00:03:28Z UTC from actual GitHub PRs and sources. Independent Ask Bill company/product; no integration with unrelated companies, products or databases.

**Merged:** PRs #1–#11, with head-bound GitHub Actions quality, browser and disposable PostgreSQL tests passing when merged. AB-010 added fenced transactional job/outbox migration with at-least-once external delivery contract. AB-011 added a privacy inventory/retention/threat model and restrictive telemetry / disabled child-live-input gate.

**Open:** PR #12, AB-012: readiness/liveness endpoints, version and schema probes, cooperative drain controller, inactive health-only Render staging template and docs. Node 22 local health/drain suite 9 passing tests; exact latest-head GitHub checks are pending. No Render workspace, database account, production service or paid resource was provisioned.

**Original plan:** 112 units, 490 dependency links. Scope-only completion and operational acceptance remain distinct. Earlier units AB-004–012 have partial aspects pending for real production delivery.

**Next:** Finish AB-012 exact-head checks, conduct source/security review, merge once green. Continue source/provenance and ingestion milestones independently of the user's forthcoming Bill GLB/Blender asset. Actual original Bill rig/morph/animation and voice integration are still pending.
