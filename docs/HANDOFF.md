# Ask Bill: operational agent handoff

**Repository:** `neophilism/Ask-Bill` — <https://github.com/neophilism/Ask-Bill>  
**Handoff generated:** 2026-10-16T21:07:51Z  
**Scope:** Independent Ask Bill product only. Law Machine stays in its own repository.  
**Plan:** All 112 original work units with 490 explicit local dependency links, phases F1-F8 and release gates G1-G8.  
**Source of truth:** `registry/prs.json`. The approved narrative is `docs/DEVELOPMENT_PLAN.md` and design contract is `docs/ARCHITECTURE.md`.  
**Implemented by this foundation:** repository-bound specifications, active registry, source/design contracts, fixture, agent/process policy, and foundation-only validation; **no application runtime, finished Bill asset, deployed service, providers, accounts or domain**.

## Immediate next action

1. Check GitHub's actual HEAD, PR list and CI. Read `AGENTS.md`; do not trust dated snapshots as live state.
2. Execute `npm run check` using `.node-version`. Resolve real vulnerabilities or failing tests rather than relabeling them passed.
3. Read current acceptance and evidence for AB-001. When merged and accepted, start `AB-002: Toolchain workspace and CircleCI` and write its app/workspace code and test harness. Parallel graph-ready paths may be pursued when inputs exist.
4. Implement from `docs/DEVELOPMENT_PLAN.md` without omitting any unit. `npm run ready` calculates graph candidates **only**; true readiness also requires confirmed accepted prerequisite evidence, no live conflicts and actual platform capacity.
5. Make small focused PRs with stable leading IDs, actual source-bound test results, feature flags and rollback. Update `registry/prs.json` PR numbers and observations only after GitHub verifies them. Checkpoint commits often and preserve concurrent edits.
6. After each work session update the real branch, merged PR number, last tested SHA/checks, real deployment status, exact blockers, secrets needed by name only, and next ready unit in `docs/SESSION_STATUS.md`.

## Required inputs and known boundaries

- No Bill `.glb` or `.blend` has been received or built yet. Create/validate the original production asset in AB-045–AB-062. For manual asset handoff, require embedded textured binary glTF 2.0 `Bill.glb` and editable `Bill.blend`, clips `Idle`, `WalkFunny`, `Talk`, `Wave`, `Point`, `Laugh`, `Celebrate`, and tested visemes/expressions.
- No selected public URL/domain, credentials, hosted resources, or paid capacity are currently verified in this repository. Provider-agnostic fixture development continues without them; live features require scoped environment configuration and credential validation.
- The supplied electronic-filing excerpt is **not** a complete or authoritative bill. Do not publish the complete reference bill until exact authoritative text/version/source verification exists.
- Live U.S. legislative adapters should use source version and provenance. Congress.gov or GovInfo API keys may be needed for rate limits but do not block offline fixtures.
- Non-credentialed flows, animation, accessibility and publishing schema can proceed independent of future Law Machine. No compulsory payment or campaign feature belongs here.

## CI and acceptance mechanics

- Foundation: `npm run check`; it checks canonical format, all units/graph, negative cases and incomplete fixture.
- AB-002: implement pinned pnpm lockfile, TypeScript workspaces, UI/API/worker scaffolds, actual CI application checks and negative import/type tests. Later units add grounding, accessibility, model assets, real voice, cross-browser, security and live release tests.
- Keep implementation/tests/merge/operational acceptance/external review/certification separate. The owner explicitly rejects waiting for a paid or human auditor as a development prerequisite; serious security defects still block affected releases.
- Complete all gates G1-G8 with real evidence before calling the product launched. A merge is never the same as a working deployment.

## Engineering target invariants

An immutable source and cited provision span drives explanations and deterministic animation. Visually moving Bill must not mutate legal text or produce phantom citations. An explanation without grounded supporting span must say that it is uncertain or unavailable. Motion-reduced/audio-free/graphics-free routes remain full reading experiences. Child live free input waits for real consent and provider safeguards. Privacy-sensitive drafts never enter public uploads, prompts or logs by default.
