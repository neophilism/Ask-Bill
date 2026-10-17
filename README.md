# Ask Bill

Ask Bill is an independent public product for exploring legislation through a **source-grounded conversation with Bill**, an original animated character who can walk across a displayed bill, point to passages, gesture, and explain them in accessible spoken or written language. Its content, services, architecture, ownership and release lifecycle are wholly independent of unrelated products.

**Engineering status (16 October 2026):** PRs #1–#12 are merged after scoped GitHub CI, including Ask Bill's fenced queue/outbox, privacy/consent safeguards, preview readiness and cooperative shutdown. These foundations do **not** constitute production operational acceptance. [PR #13](https://github.com/neophilism/Ask-Bill/pull/13) adds hash-bound immutable source-document provenance and tenant-isolation tests. The reader is still a localhost-only draft fixture; **no hosted production website, authoritative complete bill import, live AI/voice, provider-backed publisher identity or completed animated 3D Bill asset is available.**

## New agent: start here

1. Read [AGENTS.md](AGENTS.md), [handoff](docs/HANDOFF.md), [architecture](docs/ARCHITECTURE.md), and [development plan](docs/DEVELOPMENT_PLAN.md).
2. Read [registry/prs.json](registry/prs.json), the one active plan, and [registry/PR_FORMAT.md](registry/PR_FORMAT.md).
3. Run Node 24.19.0, activate Corepack, then `corepack pnpm install --frozen-lockfile` and `corepack pnpm verify`. GitHub Actions provides quality, real-browser HTTP and ephemeral PostgreSQL checks.
4. Check **actual** GitHub branch, PR and CI state before taking the next ready unit. Do not infer progress from the registry snapshot or ID sequence. Run `npm run ready` for graph-only candidates, then verify accepted evidence.
5. Continue dependency-ready units beyond AB-007 and finish the remaining acceptance gates for the reader, publisher authentication, original 3D Bill, grounding, voice and publishing. Checkpoint often and include head-bound test evidence.

## What is specified

- [Architecture and deployment boundaries](docs/ARCHITECTURE.md) — official source versions, verifiable citations, streaming explanations, editor/publishing flow, consent, privacy, operations, and accessibility.
- [All 112 PR units with dependencies and acceptance](docs/DEVELOPMENT_PLAN.md) — eight phases, gates G1–G8, verification and rollback for each unit, including **character modeling, rigging, source `.blend` files, export `.glb`, expressions, animation, navigation and synchronized speech**.
- [Character source and asset contract](docs/CHARACTER_PRODUCTION.md) — original expressive Bill design, GLB/Blender formats, named animations, licensing, validation and performance integration.
- [Canonical progress and PR registry](registry/prs.json) — exact shared v1 schema, not a separate proprietary plan.
- [TypeScript design contracts](spec/CONTRACTS.ts) and [system diagram](spec/SYSTEM.mmd) — design specifications, not implemented validators.
- [Limited fixture](fixtures/electronic-filing-excerpt.json) — incomplete source; **never publish as the complete bill**.

## Development validation

```sh
node --version        # Target: v24.19.0
npm run check         # registry and source scope, negative tests, agent handoff
npm run ready         # next dependency-ready candidate, not an acceptance claim
```

`npm run check` verifies planning artifacts only; `corepack pnpm verify` also builds and tests implementation packages. Browser/PostgreSQL GitHub jobs validate some local integrations, but **none** certifies a production launch, a working third-party auth provider, live AI, or finished character.

**Never commit provider keys, private submissions, source documents not intended for publication, recordings, or personal histories.** No human-auditor or paid certification gate is required for continued engineering, but actual security defects and failed tests must be corrected.
