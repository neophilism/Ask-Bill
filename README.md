# Ask Bill

Ask Bill is an independent public product for exploring legislation through a **source-grounded conversation with Bill**, an original animated character who can walk across a displayed bill, point to passages, gesture, and explain them in accessible spoken or written language. Its content, services, architecture, ownership and release lifecycle are wholly independent of unrelated products.

**Engineering checkpoint (2026-10-17):** The repository now composes the public reader, cited conversation API, optional OpenAI generation/review/speech/transcription, encrypted anonymous sessions, real OIDC publisher authentication, private S3 storage, and PostgreSQL publishing workflow. The reader supports exact search, selection, bookmarks, citations, source tours, offline downloads and accessible exports. Publisher forms cover creation, upload, source review, publication, correction and withdrawal. Read [the runtime guide](docs/ops/APPLICATION_RUNTIME.md) for startup and provider configuration, and [the dated evidence](docs/evidence/AB-004-INTEGRATED-APPLICATION.md) for tests and limits.

**Live activation remains separate:** no production URL, live provider credentials, reviewed authoritative release corpus or hosted parser isolation is verified by these code changes. The 3D Bill character remains separately owned and will be integrated through the approved asset interface when provided. The 112-unit roadmap and launch gates are not marked complete by a merge.

## Run the application locally

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm dev
```

Open `http://127.0.0.1:4100`. This explicit local mode contains an entire **synthetic demonstration document**, disables external providers and uses temporary in-memory sessions. `corepack pnpm start` runs the database-backed application; `corepack pnpm worker` runs its separate ingestion worker. The older `pnpm preview` remains an incomplete-excerpt design preview.

## New agent: start here

1. Read [AGENTS.md](AGENTS.md), [handoff](docs/HANDOFF.md), [architecture](docs/ARCHITECTURE.md), and [development plan](docs/DEVELOPMENT_PLAN.md).
2. Read [registry/prs.json](registry/prs.json), the one active plan, and [registry/PR_FORMAT.md](registry/PR_FORMAT.md).
3. Run Node 24.19.0, activate Corepack, then `corepack pnpm install --frozen-lockfile` and `corepack pnpm verify`. GitHub Actions provides quality, real-browser HTTP and ephemeral PostgreSQL checks.
4. Check **actual** GitHub branch, PR and CI state before taking the next ready unit. Do not infer progress from the registry snapshot or ID sequence. Run `npm run ready` for graph-only candidates, then verify accepted evidence.
5. Use the current [session status](docs/SESSION_STATUS.md) and runtime guide to continue the remaining operational gates, final character integration and verified live checks. Checkpoint often and include head-bound test evidence.

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
