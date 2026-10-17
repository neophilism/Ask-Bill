# Ask Bill — verified development checkpoint

GitHub observation: **2026-10-17T15:48:52Z**, repository `neophilism/Ask-Bill`, main `6da63ea922adbd9d9d36df39dda520bdd7f00429`.

## Observed source and PR state

The verified registry snapshot contains **99 actual pull requests: 98 merged, none open, one closed without merge**. Stable AB work-unit IDs are not PR numbers. The active plan retains all 112 original units and 490 dependencies; scope, operational acceptance and independent review are not inferred from merge counts.

PR #100 delivered real OpenAI generation/review/audio adapters, OIDC persistence and MFA, S3-compatible private storage, and the pinned PostgreSQL driver. Its exact head `aef2cd985cb3bcb93503db746804512bb73b1c35` passed GitHub Actions run `39045511208` (quality, browser, PostgreSQL and PDF) before merge.

The next application change composes those adapters with the reader, session API and publisher workflow. Its final head and merge status must be read from GitHub; this dated observation predates that PR. Source paths, test evidence and acceptance boundaries are in `docs/evidence/AB-004-INTEGRATED-APPLICATION.md` and `docs/ops/APPLICATION_RUNTIME.md`.

## Implemented integration

- Progressive source reader, exact search/selection, source drawer, bookmarks/preferences, guided reading, sharing and exports, standalone offline reading, and explicit session controls.
- Source-only quotations or separately reviewed AI explanations; source/version/exception validation precedes every displayed segment.
- Server-authorized speech, bounded decoded recordings and transcript review; interruption/deletion fence all work by session and conversation epoch.
- PostgreSQL sessions, atomic quotas across replicas, encrypted accepted answers, enforced access expiry and explicit session erasure. Expired-row cleanup can lag access expiry; private source archival and backup retention remain separate policies.
- Real OIDC/PKCE/MFA publisher interface, private verified originals, upload/import, extracted-source review, immutable publication, corrections and withdrawal.
- Executable web/worker startup, owner-only migration/bootstrap commands, pinned container and separate web/worker configuration.

## Remaining operational inputs

No selected public domain, deployed Ask Bill environment, credentialed AI/voice/identity/storage result or reviewed authoritative public corpus is established by this checkpoint. The worker requires its real host to pass the supplied isolation probe. Local namespace denial is an explicit failed operational check, not successful containment. The optional worker plan is paid and has not been provisioned.

The final approved Bill character is separately owned. Preserve candidate assets and integrate only a validated approved model/rig/clip interface. Child free input remains disabled; guided learning uses no model or microphone. Ask Bill remains independent of unrelated projects and data services.

## Continue from evidence

Re-query live main, open PRs and exact-head CI. Run the installed application via `pnpm dev` or the configured production entrypoint, not the old incomplete-excerpt preview. Complete pending operational gates using private deployment settings and public synthetic smoke content before publishing reviewed official sources. Never enable a fixture login, uncontained hosted parser or unreviewed answer to make a test pass.

This is a dated snapshot; it makes no claim of unattended continued work.
