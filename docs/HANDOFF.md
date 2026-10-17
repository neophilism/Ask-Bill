# Ask Bill: operational agent handoff

**Repository:** `neophilism/Ask-Bill` — <https://github.com/neophilism/Ask-Bill>  
**Handoff refreshed:** 2026-10-17; verify the dated snapshot and live GitHub state before continuing.
**Scope:** Independent Ask Bill product, operated separately from unrelated websites and companies. No external-product integrations.  
**Plan:** All 112 original work units with 490 explicit local dependency links, phases F1-F8 and release gates G1-G8.  
**Source of truth:** `registry/prs.json`. The approved narrative is `docs/DEVELOPMENT_PLAN.md` and design contract is `docs/ARCHITECTURE.md`.  
**Current implementation:** Provider adapters landed in PR #100, merge `6da63ea922adbd9d9d36df39dda520bdd7f00429`, after all four current-head CI jobs passed. The application integration adds the progressive reader, cited source/model-reviewed conversation, optional speech/transcription, durable encrypted sessions, OIDC publisher forms, private originals and a full review/publishing/correction workflow. See `docs/ops/APPLICATION_RUNTIME.md` and `docs/evidence/AB-004-INTEGRATED-APPLICATION.md`. Implementation, exact-head CI and live operational acceptance remain separate. Final character design/mesh/rig/animation ownership is separate; preserve that work.

## Immediate next action

1. Read current main branch, active PRs, `registry/prs.json` and the exact-head GHA checks; do not use stale checkpoint statements as live evidence.
2. Execute Node 24 / pnpm frozen install and `pnpm verify`; public reader browser checks and isolated PostgreSQL tests now run as separate GitHub jobs. CircleCI YAML remains an unconnected preference, not an active acceptance source.
3. Use `pnpm dev` for the explicit complete synthetic-document application demo. Use `pnpm start` with a bootstrapped non-owner database role for the published-source application. Provider flags default off. The older `pnpm preview` uses the incomplete excerpt.
4. Verify the selected deployment workspace, private credentials, real identity login/MFA, S3 read/write/denial, provider behavior and host sandbox probe before enabling hosted features. `infra/render.yaml` and `infra/render-worker.yaml` are reviewed configuration artifacts, not deployed services.
5. Continue operational, load, accessibility/browser matrix and release gates from actual evidence. The semantic HTML/Node composition is documented in ADR 0002; it does not claim a Next.js implementation. No credentials, selected public domain or authoritative release corpus is verified by the local tests.

## Required inputs and known boundaries

- Candidate Bill assets exist in separately owned work. The final approved production character is not bound to this application. For manual asset handoff, require embedded textured binary glTF 2.0 `Bill.glb` and editable `Bill.blend`, clips `Idle`, `WalkFunny`, `Talk`, `Wave`, `Point`, `Laugh`, `Celebrate`, and tested visemes/expressions.
- No selected public URL/domain, credentials, hosted resources, or paid capacity are currently verified in this repository. Provider-agnostic fixture development continues without them; live features require scoped environment configuration and credential validation.
- The supplied electronic-filing excerpt is **not** a complete or authoritative bill. Do not publish the complete reference bill until exact authoritative text/version/source verification exists.
- The implemented Congress.gov import preserves source version and provenance and requires `ASK_BILL_CONGRESS_API_KEY` in both web and worker configuration. Offline fixtures do not need a key.
- Non-credentialed flows, animation, accessibility and publishing schema use Ask Bill's own independent content and provider adapters. No compulsory payment or campaign feature belongs here.

## CI and acceptance mechanics

- Foundation: `npm run check`; it checks canonical format, all units/graph, negative cases and incomplete fixture.
- AB-002: implement pinned pnpm lockfile, TypeScript workspaces, UI/API/worker scaffolds, actual CI application checks and negative import/type tests. Later units add grounding, accessibility, model assets, real voice, cross-browser, security and live release tests.
- Keep implementation/tests/merge/operational acceptance/external review/certification separate. The owner explicitly rejects waiting for a paid or human auditor as a development prerequisite; serious security defects still block affected releases.
- Complete all gates G1-G8 with real evidence before calling the product launched. A merge is never the same as a working deployment.

## Engineering target invariants

An immutable source and cited provision span drives explanations and deterministic animation. Visually moving Bill must not mutate legal text or produce phantom citations. An explanation without grounded supporting span must say that it is uncertain or unavailable. Motion-reduced/audio-free/graphics-free routes remain full reading experiences. Child live free input waits for real consent and provider safeguards. Privacy-sensitive drafts never enter public uploads, prompts or logs by default.
