# Ask Bill publisher administration

`server/index.mjs` exports `createPublisherHandler({auth, repository, storage,
expectedOrigin, publisherId, officialImportsEnabled})`. The returned asynchronous
Node handler returns `true` for `/admin` routes and `false` for unrelated routes.
The application composes it alongside public reading. `views/index.mjs` renders
semantic HTML; `client/publisher.css` provides responsive layouts. Publishing
forms, source reading and version navigation work without JavaScript.

## Available workflows

| Workflow | Route | Permission |
| --- | --- | --- |
| Publisher library | `GET /admin` | Enrolled viewer, editor or owner |
| Bill and version history | `GET /admin/bills/:billId` | Enrolled viewer, editor or owner |
| Exact source and review | `GET /admin/bills/:billId/versions/:versionId` | Enrolled viewer, editor or owner |
| Immutable original download | `GET /admin/bills/:billId/versions/:versionId/original` | Enrolled viewer, editor or owner |
| Create private bill | `POST /admin/bills` | Editor or owner |
| Original source upload | `POST /admin/bills/:billId/uploads` | Editor or owner |
| Official Congress import | `POST /admin/bills/:billId/imports` | Editor or owner |
| Extraction correction | `POST /admin/bills/:billId/versions/:versionId/corrections` | Editor or owner with current MFA |
| Private source-only tour draft | `POST /admin/bills/:billId/versions/:versionId/tour` | Editor or owner with current MFA |
| Record publication review | `POST /admin/bills/:billId/versions/:versionId/review` | Editor or owner with current MFA |
| Activate reviewed release | `POST /admin/bills/:billId/versions/:versionId/publish` | Editor or owner with current MFA |
| Withdraw active release | `POST /admin/bills/:billId/withdraw` | Owner with current MFA |

Authentication routes are `/admin/auth/start` (POST), `/admin/auth/callback`
(GET) and `/admin/auth/logout` (POST). Sign-in uses the configured OIDC provider;
there is no production test-login endpoint. Source upload controls show their
actual configured availability. The interface does not claim that an official
import is enacted legislation, nor does an upload or import automatically publish.

## Input and publication boundaries

Every write checks the same-origin request, a session-bound CSRF token, fresh
publisher membership and its action permission. Source corrections, reviews and
release changes require provider-verified MFA within ten minutes. Routes never
take publisher IDs, actor IDs, roles, MFA assertions or storage credentials from
form fields. Every response is private/no-store and disallows indexing, framing
and inline scripts.

Uploads are capped at 25 MiB, checked by Ask Bill's quarantine scanner, stored in
private quarantine and promoted to a verified private original object before
the durable workflow records them. Unknown bill IDs fail before a storage write.
The workflow must independently validate the receipt and maintain transaction
and role boundaries in PostgreSQL.

Version review displays extraction warnings and links to the exact original
file. Download checks current membership, bill/version identity, length and raw
SHA-256 before returning an attachment with a server-generated filename,
`private, no-store` and `nosniff`. Corrected versions still download the unchanged
original. The private file is never exposed through a public bearer URL.

Corrections select a provision and one exact, unique quoted passage. The server
converts that match into Unicode codepoint offsets against the verified
canonical text. It uses `prepareExtractionCorrection`, creates a new private
revision, and retains the original source bytes. The six source review checks
are explicit publisher attestations; source storage, current hashes and search
readiness must also pass the durable publishing service. Activation carries the
expected previous release ID so concurrent publisher changes fail as conflicts.

Tour curation saves one private, source-hash-pinned ordered selection of up to 12
existing provision IDs per version. The server and PostgreSQL workflow both
verify current membership, MFA, source hash and provision membership. This draft
does not publish or change the public source-only tour. A correction creates a
new source version and requires a new tour selection. Catalog pack warnings and
stale translation source hashes are informational and never authorize publish.
Failed official imports can be retried by an editor or owner using the same
validated Congress identity; each retry is a new audited request.

## Verification and configuration

- `node tests/publisher-http.test.mjs` exercises actual HTTP, cryptographic OIDC
  and signed S3 adapters against local provider/store fixtures. It covers the
  maintenance workflow, role/MFA/CSRF failures, markup escaping, stale versions,
  codepoint corrections, unknown-bill storage isolation, private original
  downloads and corruption rejection.
- `python tests/browser/test_publisher_browser.py` exercises actual Chromium at
  1440, 768 and 390 pixels, keyboard entry, accessible form names, no-JavaScript
  forms, forced colors and layout overflow. Its server is a read-only local UI
  fixture which requires `ASK_BILL_PUBLISHER_BROWSER_FIXTURE=1` and refuses
  `NODE_ENV=production`.
- Authentication and object storage setup are documented in
  `packages/auth/README.md` and `packages/storage/S3.md`.

Live activation still requires a configured identity provider, explicit
publisher enrollment, private object store, durable database and validated
credentialed round trips. Local adapter or browser tests do not constitute
evidence that those external services are connected.

