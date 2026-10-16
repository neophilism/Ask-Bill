# Ask Bill — verified repository development checkpoint

Checked 2026-10-16T22:55:30Z UTC. Repository: `neophilism/Ask-Bill`. Ask Bill is an independent product; no external unrelated company/product dependencies exist.

## Live GitHub work items

| Unit | GitHub PR | State | Acceptance |
|---|---|---|---|
| AB-001 | #1 | merged | scoped implementation accepted |
| AB-002 | #2 | merged | scoped implementation accepted |
| AB-003 | #3 | merged | scoped implementation accepted |
| AB-004 | #4 | merged | partial / not operationally accepted |
| AB-005 | #5 | merged | partial / not operationally accepted |
| AB-006 | #6 | open draft | partial / not operationally accepted |
| AB-007 | #7 | merged | partial / not operationally accepted |

The canonical registry contains the exact approved **112 original units**, **490 dependencies** and observed PR references. PR state is not equivalent to full product completion.

PRs #1, #2 and #3 merged after exact-head GitHub Actions foundation/workspace validation; PR #4 additionally passed the real localhost Chromium reader smoke at both desktop and 320px with disabled-JavaScript and reduced-motion checks; PR #5 passed strict configuration tests; PR #7 passed actual ephemeral PostgreSQL 17 migration replay and two-tenant row isolation tests, and the PostgreSQL startup race was fixed and retested before merge. PR #6 remains unmerged pending head-bound quality, browser and database checks for its rebased asset-manifest changes.

No finished original `Bill.blend`/`Bill.glb`, complete public React/Next.js website, live AI/TTS/STT, fully sourced public bills, deployed domain or production database exists yet; these remain scheduled units and release gates. Current reader is a legitimate offline/local demo with an incomplete source fixture and static placeholder. Real provider credentials and live staging resources are not verified. Do not claim launch readiness.

Next: run latest PR #6 CI and merge if passing, continue the explicitly approved phase plan in dependency order, and keep production acceptance separate from passing local/unit tests.
