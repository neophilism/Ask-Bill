# Ask Bill

Ask Bill is an independent public product for exploring legislation through a **source-grounded conversation with Bill**, an original animated character who can walk across a displayed bill, point to passages, gesture, and explain them in accessible spoken or written language. Its content, services, architecture, ownership and release lifecycle are wholly independent of unrelated products.

**Current state (foundation checkpoint, 16 October 2026):** Complete technical specification, original-character delivery contract, 112 dependency-ordered work units, canonical PR registry, handoff, fixture, and foundation validation are committed. **The web application, 3D character, live AI, voice, data ingestion, deployment and domain are not yet built or configured.** No preview or production release should be represented as complete.

## New agent: start here

1. Read [AGENTS.md](AGENTS.md), [handoff](docs/HANDOFF.md), [architecture](docs/ARCHITECTURE.md), and [development plan](docs/DEVELOPMENT_PLAN.md).
2. Read [registry/prs.json](registry/prs.json), the one active plan, and [registry/PR_FORMAT.md](registry/PR_FORMAT.md).
3. Run `npm run check` on Node 24.19.0 (the foundation checks have no install, vendor credentials, account or database requirement).
4. Check **actual** GitHub branch, PR and CI state before taking the next ready unit. Do not infer progress from the registry snapshot or ID sequence. Run `npm run ready` for graph-only candidates, then verify accepted evidence.
5. Implement `AB-002` (TypeScript/pnpm workspace and CircleCI application toolchain), then work on any independently dependency-ready units. Checkpoint often and include test evidence.

## What is specified

- [Architecture and deployment boundaries](docs/ARCHITECTURE.md) — official source versions, verifiable citations, streaming explanations, editor/publishing flow, consent, privacy, operations, and accessibility.
- [All 112 PR units with dependencies and acceptance](docs/DEVELOPMENT_PLAN.md) — eight phases, gates G1–G8, verification and rollback for each unit, including **character modeling, rigging, source `.blend` files, export `.glb`, expressions, animation, navigation and synchronized speech**.
- [Character source and asset contract](docs/CHARACTER_PRODUCTION.md) — original expressive Bill design, GLB/Blender formats, named animations, licensing, validation and performance integration.
- [Canonical progress and PR registry](registry/prs.json) — exact shared v1 schema, not a separate proprietary plan.
- [TypeScript design contracts](spec/CONTRACTS.ts) and [system diagram](spec/SYSTEM.mmd) — design specifications, not implemented validators.
- [Limited fixture](fixtures/electronic-filing-excerpt.json) — incomplete source; **never publish as the complete bill**.

## Foundation validation

```sh
node --version        # Target: v24.19.0
npm run check         # registry and source scope, negative tests, agent handoff
npm run ready         # next dependency-ready candidate, not an acceptance claim
```

`npm run check` verifies planning artifacts only; it does not assert application build, live AI, public publishing, or finished character functionality. Future application scripts and real provider tests are owned by their planned units.

**Never commit provider keys, private submissions, source documents not intended for publication, recordings, or personal histories.** No human-auditor or paid certification gate is required for continued engineering, but actual security defects and failed tests must be corrected.
