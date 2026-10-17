# Ask Bill — verified GitHub development checkpoint

**Observed:** 2026-10-17T03:34:25Z UTC | Repository: `neophilism/Ask-Bill` | Main commit: `37f4b422be8388663923cada4d212a06ade01934`.

## Live pull request evidence

At this observation, GitHub reported **56 pull requests, all 56 merged**. These represent scoped implementation increments across **48 distinct development units**; a merged PR is not equivalent to complete operational acceptance.

**Canonical roadmap:** 112 approved original units and 490 fixed dependencies. The registry currently marks 3 units `completed`, 45 units `in_progress`, and 64 `not_started`. Do not infer full milestone acceptance from the presence of a PR.

Most recent source-only/public website increments:

- PR #49: AB-044 fail-closed grounding evidence; a caller-submitted staging report cannot authorize live generation.
- PR #50: AB-004 complete-source, immutable-version reader and plain-text fallback.
- PR #51: AB-004 guarded read-only HTTP source routes with restrictive CSP.
- PR #53: AB-024 active release / search generation / original-source PostgreSQL lookup.
- PR #54: AB-004 strict Chromium desktop/mobile/no-JavaScript reading tests.
- PR #55: AB-004 public release catalog and bounded pagination.
- PR #56: AB-024 tenant-scoped active-catalog PostgreSQL lookup.
- PR #57: AB-004 real localhost Chromium catalog-to-reader navigation.

At each of those merged PR heads GitHub's quality, Chromium, PDF, and disposable PostgreSQL acceptance checks were observed green before merging. Source-only endpoints require explicit publication/back-end configuration and are **not deployed to a production domain**.

## Outstanding work / operational acceptance

- No verified production website, authentic complete current-law source catalog, independent review of live AI, actual publisher IAM/MFA or production DB/object-storage configuration.
- Source-only demo and synthetic browser cases are not evidence that the actual law or publication status has been verified.
- The 3D Bill character is developed separately by the owner/team; do not modify or take over the character design, mesh, Blender or animation-asset pipeline in this workstream.
- Continue Ask Bill web, content, accessibility, privacy and security work independently, with no Law Machine or unrelated-company integrations.
- Review current GitHub branch and PR status afresh at the next execution; this document is a dated snapshot, not a background-running agent.

## Immediate next steps

Verify all exact-head CI on the next PR; continue accessible publisher-backed web and source-only infrastructure without credentials, and keep new functionality fail-closed until publisher authorization, source authenticity and independent staging evidence are present.
