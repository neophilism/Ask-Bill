# Ask Bill: operational agent handoff

**Repository:** `neophilism/Ask-Bill` — <https://github.com/neophilism/Ask-Bill>  
**Handoff generated:** 2026-10-16T21:07:51Z  
**Scope:** Independent Ask Bill product, operated separately from unrelated websites and companies. No external-product integrations.  
**Plan:** All 112 original work units with 490 explicit local dependency links, phases F1-F8 and release gates G1-G8.  
**Source of truth:** `registry/prs.json`. The approved narrative is `docs/DEVELOPMENT_PLAN.md` and design contract is `docs/ARCHITECTURE.md`.  
**Current implementation:** PRs #1–#8 merged after verified GitHub Actions checks, including source contracts, local/offline reader, protected configuration, owned-asset validation and live ephemeral PostgreSQL migration/tenant tests. PR #8 merged a test-only publisher session/authorization boundary; PR #9 implements partial private-upload capability contracts, without any live object store. The true production React interface, original animated character, live provider integrations, publisher login, deployed service and domain remain incomplete.

## Immediate next action (refreshed 2026-10-16T23:00:20Z)

1. Read current main branch, active PRs, `registry/prs.json` and the exact-head GHA checks; do not use stale checkpoint statements as live evidence.
2. Execute Node 24 / pnpm frozen install and `pnpm verify`; public reader browser checks and isolated PostgreSQL tests now run as separate GitHub jobs. CircleCI YAML remains an unconnected preference, not an active acceptance source.
3. Complete and review AB-008 only as a **partial non-production auth module** until a real provider/MFA, recovery, persistence, staging login and browser/API authorization tests pass. Never enable a mock login in production.
4. Continue source publishing, object storage, security/privacy inventory, full Next.js/React reader and independent Blender character production in the specified dependency order.
5. The local reader preview and offline zip are demonstrations with incomplete text. No provider credentials, domain or live authoritative bill source is currently verified.

## Required inputs and known boundaries

- No Bill `.glb` or `.blend` has been received or built yet. Create/validate the original production asset in AB-045–AB-062. For manual asset handoff, require embedded textured binary glTF 2.0 `Bill.glb` and editable `Bill.blend`, clips `Idle`, `WalkFunny`, `Talk`, `Wave`, `Point`, `Laugh`, `Celebrate`, and tested visemes/expressions.
- No selected public URL/domain, credentials, hosted resources, or paid capacity are currently verified in this repository. Provider-agnostic fixture development continues without them; live features require scoped environment configuration and credential validation.
- The supplied electronic-filing excerpt is **not** a complete or authoritative bill. Do not publish the complete reference bill until exact authoritative text/version/source verification exists.
- Live U.S. legislative adapters should use source version and provenance. Congress.gov or GovInfo API keys may be needed for rate limits but do not block offline fixtures.
- Non-credentialed flows, animation, accessibility and publishing schema use Ask Bill's own independent content and provider adapters. No compulsory payment or campaign feature belongs here.

## CI and acceptance mechanics

- Foundation: `npm run check`; it checks canonical format, all units/graph, negative cases and incomplete fixture.
- AB-002: implement pinned pnpm lockfile, TypeScript workspaces, UI/API/worker scaffolds, actual CI application checks and negative import/type tests. Later units add grounding, accessibility, model assets, real voice, cross-browser, security and live release tests.
- Keep implementation/tests/merge/operational acceptance/external review/certification separate. The owner explicitly rejects waiting for a paid or human auditor as a development prerequisite; serious security defects still block affected releases.
- Complete all gates G1-G8 with real evidence before calling the product launched. A merge is never the same as a working deployment.

## Engineering target invariants

An immutable source and cited provision span drives explanations and deterministic animation. Visually moving Bill must not mutate legal text or produce phantom citations. An explanation without grounded supporting span must say that it is uncertain or unavailable. Motion-reduced/audio-free/graphics-free routes remain full reading experiences. Child live free input waits for real consent and provider safeguards. Privacy-sensitive drafts never enter public uploads, prompts or logs by default.
