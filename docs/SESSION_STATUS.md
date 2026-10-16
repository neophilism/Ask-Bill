# Ask Bill session checkpoint (live GitHub observation)

Observed: 2026-10-16T22:11:56Z UTC. Repository: `neophilism/Ask-Bill`. Default branch remains the original README-only `main` checkpoint; no implementation PR has merged. This file is a dated observation, not live CI evidence.

## Verified PR stack and tested heads

| Unit | PR | Base | Observed head | State |
|---|---|---|---|---|
| AB-001 | #1 | `main` | `3d40502f526609c24c2a9ba4da195be2eefab147` | Open |
| AB-002 | #2 | `ab-001-foundation-handoff` | `90dc8109e105e85a3812a5915a79d8e52fd31c3a` | Open, draft |
| AB-003 | #3 | `ab-002-workspace-toolchain` | `5ec524c080f5aa3ef29fd99f16437920a9d52082` | Open, draft |
| AB-004 | #4 | `ab-003-runtime-contracts` | `67a2fc094829ea0c7578d3608a356e822a3db355` | Open, draft |
| AB-005 | #5 | `ab-003-runtime-contracts` | `7bba51b6808be810ea015f05609b654d21d5393e` | Open, draft |
| AB-006 | #6 | `ab-004-reader-preview` | `1fa879e899e041f3bba86a4b3547dd31b403e9ad` | Open, draft |
| AB-007 | #7 | `ab-005-environment-adapters` | `8e34141ae190a3dd6a71070a5adcaad984f0d22d` | Open, draft |

AB-005 is a sibling from AB-003, not a dependency of AB-004 or AB-006. The active `registry/prs.json` now records these seven real PR mappings; all seven remain **in progress** rather than accepted. The original 112 IDs, 490 dependency links, release requirements and pinned source scope are unchanged.

## Actual verification and outstanding gates

- AB-001: six previously executed local foundation-only validator and negative checks were reported; current GitHub head-bound CircleCI approval still not observed.
- AB-002: pinned workspace manifests, application stubs, CircleCI job and tests committed. Full frozen pnpm install and current-head CI not verified.
- AB-003: 10 local Node 22.16.0 / TypeScript 5.8.3 tests passed for source and event validators. Exact source/test blob hashes match tested files; pinned Node 24 CI and integrated application tests remain pending.
- AB-004: 3 local preview HTTP/rendering and negative tests passed; not the complete React/Next public UI, and no browser axe/responsive screenshot test was performed.
- AB-005: 4 local configuration tests passed on a separate sibling branch. An affected MinIO container image was removed and optional PostgreSQL updated to 17.11-alpine3.24; no storage daemon was launched.
- AB-006: 4 local asset integrity tests passed on its branch. Only a test fixture exists, not the real Bill 3D model; the `--require-character` gate deliberately fails.
- All seven PRs are open. GitHub has not reported successful required CI runs for their tested heads. No merge, accepted full milestone, deployment, independent security certification or running live service is claimed.

- AB-007: PostgreSQL 17 tenant-scoped DDL/query contracts; 3 local TypeScript/structural tests passed, no live database migration, role-isolation test or data authorization evidence.
- A synthetic local worktree combination of the AB-003/004/005/006/007 code passed 24 of 24 tests under Node 22.16.0 with TypeScript 5.8.3. This is **not** a single merged PR or Node 24/CircleCI result.
- Chromium local markup/CSS/JS visual checks captured a 1280px layout without horizontal overflow, a 320px layout without horizontal overflow, answered the sample question, adjusted text size and toggled the placeholder; reduced-motion preference was also observed. The local Chromium network navigation was blocked by environment policy, so the browser used server-fetched exact HTML with separately injected repository CSS/JS. A later JavaScript-disabled browser check stalled and is **not passed**. Screenshots were saved in the local work session but are not currently committed to the repository.

## Safe follow-on work

1. Correct actual missing/failing CircleCI checks on AB-001 and AB-002; rerun on current heads. Do not mark missing checks green.
2. Once prerequisite CI gates pass, merge in dependency order with review and rebase/retarget stacked PRs, preserving the independently ready AB-005 branch. Update real PR mappings after each merge.
3. Complete AB-004 with browser-level responsive/a11y/JS-off evidence; finish AB-005 integration tests with a patched storage adapter; create actual original Blender source/assets for the later character units.
4. Begin AB-007 (PostgreSQL schema + isolation) only after AB-003 and AB-005 prerequisites gain acceptance.

**Product boundary:** Ask Bill is an independent company's website. No unrelated product API, SDK, database, code, company dependency or shared release is authorized.
