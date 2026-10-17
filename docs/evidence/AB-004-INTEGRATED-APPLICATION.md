# AB-004 — integrated reader, publisher and provider runtime

Repository: `neophilism/Ask-Bill`. Implementation date: 2026-10-17.
Base: `6da63ea922adbd9d9d36df39dda520bdd7f00429`, which includes provider PR
[#100](https://github.com/neophilism/Ask-Bill/pull/100).
Branch: `feat/ask-bill-live-experience`. Actual integration PR:
[#101](https://github.com/neophilism/Ask-Bill/pull/101). Initial implementation head:
`94e8b49f875cbb9257f6d90c26708f51bebcee14`, tree
`bda4d241fdab315faaa29e8075d1a1874fc1bc29`. The remote tree was checked against the
staged local tree byte-for-byte, including executable script modes.

## Implemented scope and source paths

The executable application composes the existing exact-source reader with durable
sessions, optional real provider adapters, private publisher administration and a
separate ingestion worker. `docs/ops/APPLICATION_RUNTIME.md` documents configuration,
owner-only migrations/bootstrap, startup, provider activation and rollback. ADR 0002
records the deliberate semantic HTML/Node composition instead of claiming that the
target Next.js framework was implemented.

| Surface | Implemented behavior | Principal paths |
| --- | --- | --- |
| Public reader | Catalog and immutable versions, exact search and Unicode selection, source drawer, bookmarks, text preferences, guided reading, sharing, exports, standalone offline reading and no-JavaScript source access | `packages/ui/reader/`, `apps/web/source-only/reader-client.mjs` |
| Conversation | Source-only quotations or separately model-reviewed explanations, complete dependency/exception context, exact citations, safe abstention, bounded validated events and explicit session controls | `apps/web/application/`, `packages/grounding/reader-evidence.mjs`, `packages/grounding/entailment/reviewed.mjs` |
| Voice | Server-authorized source-bound segments, gesture-based playback, interruption, decoded duration limits, adult-only recording and editable transcription with no automatic submission | `packages/voice/stt/normalize.mjs`, `apps/web/application/api.mjs` |
| Persistence | PostgreSQL sessions, atomic cross-replica usage limits, encrypted accepted-answer replay, conversation epochs, immediate explicit deletion and expiry cleanup | `packages/sessions/`, `migrations/008_anonymous_sessions.sql` |
| Publisher | OIDC/PKCE/MFA, current membership checks, bill creation, private uploads and official imports, extraction status, verified original downloads, six review checks, immutable publication, corrections and withdrawal | `apps/web/admin/`, `packages/db/publisher-workflow.mjs`, `migrations/009_publisher_workflow.sql` |
| Import worker | Durable leases, heartbeat/retry/cancellation, immutable provenance, complete index generations, bounded extraction and mandatory hosted isolation probe | `apps/worker/application.mjs`, `apps/worker/source-import/`, `packages/db/publisher-source-extraction.mjs`, `infra/run-source-sandbox.sh` |
| Runtime | Strict private configuration, restricted database pool, owner-only migration history and identity bootstrap, non-root pinned container, separate web/worker blueprints and readiness | `packages/config/runtime.mjs`, `packages/db/pool.mjs`, `scripts/migrate.mjs`, `scripts/bootstrap-publisher.mjs`, `infra/` |

Public source selection, accepted-answer validation and current publication are
checked again before audio delivery. Session deletion, a newer question or service
drain cancels outstanding generation, speech and transcription. Raw questions,
recordings and transcripts are not inserted into application storage. Accepted
answers use authenticated encryption and expire with the 30-minute session.
`docs/privacy/DATA_FLOWS.json` and `RETENTION_AND_DELETION.md` distinguish these
implemented behaviors from provider retention, bucket lifecycle and backup policy.

## Toolchain and automated evidence

Local toolchain: Node 24.19.0, pnpm 10.18.1, PostgreSQL 16.15, Chromium
143.0.7499.4 through Playwright 1.57.0, FFmpeg 6.1.1 and installed Poppler/Tesseract.
CI pins the Node/pnpm/browser versions and uses PostgreSQL 17 in an isolated container.

| Check | Command or suite | Observed local result |
| --- | --- | --- |
| Complete application verification | `ASK_BILL_REQUIRE_FFMPEG=1 corepack pnpm verify` | Lint, build, types, 634 passing tests, zero failures, one explicit containment skip; six additional plan checks pass |
| Dependency audit | `corepack pnpm audit --prod --audit-level high` | No known vulnerabilities found at the observation time |
| Recording enforcement | `node --test tests/recording-normalization.test.mjs` | Ten actual FFmpeg tests pass, including forged duration, malformed inputs, overload, abort and cleanup |
| Extraction transport | `node --test tests/publisher-workflow.test.mjs` | Eight tests pass with actual text, DOCX and PDF extraction subprocesses, timeout, output bounds and credential omission |
| Worker configuration | `node --test tests/worker-application.test.mjs` | Four pass, including strict probe validation and rejection of hosted test overrides |
| Publisher HTTP | `node --test tests/publisher-http.test.mjs` | Seven pass, including authorization, MFA/CSRF, immutable corrections and verified original downloads |
| Congress XML | `node --test tests/congress-xml-prolog.test.mjs` | Eight pass, including the complete public source fixture, 28 modified-header attacks, local DTD/XSL canaries and DOCX isolation |
| Reader browser | `python tests/browser/test_interactive_reader_browser.py` | Real localhost Chromium journey passes at desktop and 320-pixel width; no-JavaScript source, selection, source cards, session controls, exports, explicit audio and transcript review exercised |
| Publisher browser | `python tests/browser/test_publisher_browser.py` | Real localhost Chromium journeys pass at 1440, 768 and 390 pixels, including keyboard, no-JavaScript forms and forced colors |
| Blueprint shape | Both YAML files validated against the official Render JSON schema | Pass; neither blueprint was applied |

The final dedicated PostgreSQL run passed **28/28 with zero skipped** against a fresh
migration journal on PostgreSQL 16.15: five session-store tests, nine role/pool tests,
eleven publisher workflow tests and three migration/bootstrap tests. They exercise
real transactions under restricted runtime roles, not mocked query results. The
authorization SQL suite also passed with `ON_ERROR_STOP=1`, checking pre-enrollment
and revocation. No migration journal was manually changed. CI reruns these on
PostgreSQL 17; exact GitHub results are recorded in the release checkpoint below.

The local operational containment test is **not passed**. This executor denies the
required namespace/proc setup. The supplied smoke command exits unsuccessfully and
hosted extraction remains disabled on such a host. The container CI job is a hard
positive gate using the built image, non-root user, no external network and explicit
namespace permission on a disposable runner; it must also parse real text and reject
hostile XML. A passing CI container does not certify the future deployment host.

## Public source and canonical hashes

The complete public Congress document
`https://www.congress.gov/119/bills/hr123/BILLS-119hr123ih.xml` was fetched without
credentials. The independent GovInfo copy matched. The fixture and retrieval record
are committed in `tests/fixtures/congress/`; no private upload is included.

- Original length: **16,073 bytes**.
- Original SHA-256: `6e28624dac5abaf462edd60e3c090291afa9280596b5dd93369f7297a54a2caf`.
- Actual worker extraction: **9,858 canonical bytes**, three reader passages.
- Canonical SHA-256: `730ab2ce49f5562df5507f1af68b7337783f20f57c5c97727d2d4672df909db0`.

The offline XML parser accepts only the exact verified inert Congress metadata pair,
replacing it with equal-length whitespace before parsing. Original hashes and offsets
remain intact. It never loads the referenced DTD or stylesheet. Modified declarations,
internal subsets, external/custom entities, unsupported directives and active PDF
objects remain rejected. A matching header gives an upload no official-source or
publication authority. The real-source smoke retained extraction warnings and did
**not** publish the document.

The reviewed-answer validator fingerprint is
`ff5ade6a8906f3eb09834a7f7750fdc6090d76de5474ad837d8cbd66a9cb9e99`.
The runtime image pins Node's verified manifest digest
`sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df`.
No new character source/export hash is claimed; final character ownership is separate.

## Security review and corrected defects

AI-assisted source review and adversarial tests covered publication authority,
cross-publisher and cross-version access, private cache headers, CSRF/origin checks,
OIDC revocation/MFA, replay encryption, quotas, cancellation, hostile source content,
provider transports, recording resources and runtime credential isolation.

Review corrected database-owner and inherited-role escape paths, unsafe URL options,
column-level/PUBLIC privilege leakage, stale identity/session acceptance, source
integrity gaps, Unicode selection handling, late audio delivery, decoder cleanup,
oversized correction input and real Congress XML incompatibility. A narrow scoped
SECURITY DEFINER membership-lock function avoids granting runtime account mutation
rights merely to use `SELECT FOR SHARE`. Its search path, publisher check and execute
permissions are restricted; the integration suite uses the same enrollment/audit
restrictions as deployment bootstrap.

Provider adapter PR #100 passed its four exact-head CI jobs before merge. This
integration adds packaged-runtime CI because source-level checks do not prove that
the production image includes working tools and parser dependencies. No independent
human audit, certification, physical-device performance result or production load
qualification is claimed.

## Acceptance boundaries and rollback

Implementation and automated evidence cover the scopes above; the 112-unit roadmap
and operational gates are preserved. The final Bill model/rig/animation, full browser
and assistive-technology matrix, production load/cost qualification, restore drills,
provider retention and real hosted acceptance remain distinct work.

No credentialed OpenAI, OIDC, S3 or Congress API smoke was performed, and no deployed
Ask Bill URL is established by this evidence. Activation needs the selected Ask Bill
workspace/domain, private service credentials, owner-run database bootstrap, the
actual host's isolation probe and a reviewed authoritative source edition. The
separate paid worker blueprint is not approved or provisioned by this code change.
Child free input remains disabled; the curated route needs no model or microphone.

Rollback disables the affected feature and restores the previous compatible
web/worker image while keeping source-only reading. Preserve additive migrations,
immutable sources, release history and audit records. Withdraw an erroneous release
or publish a reviewed corrected version; never rewrite published source bytes or
weaken the parser/authorization checks to restore availability.

## Release checkpoint

Observed 2026-10-17T16:07:32Z: PR #101 is open at the initial implementation head
above. The final local database run passed 28/28 plus publisher authorization SQL.
GitHub CI has been requested but is not yet accepted. Re-query the PR checks for the
current head after evidence or CI fixes; never reuse an earlier-head result. The
registry records this actual PR without promoting operational acceptance. No merged
or deployed acceptance is claimed by this dated checkpoint.
