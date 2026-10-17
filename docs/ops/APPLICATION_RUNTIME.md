# Ask Bill application and provider activation

This guide describes implemented application wiring. It does not certify a deployed service or a credentialed live-provider result. Ask Bill uses its own repository, publisher identity, database, storage and service accounts.

## Processes and local startup

Use Node 24.19.0 and pnpm 10.18.1. Run `corepack enable`, `corepack pnpm install --frozen-lockfile`, and `corepack pnpm build`.

| Command | Behavior |
| --- | --- |
| `corepack pnpm dev` | Loopback-only synthetic complete-document demo; no external providers or database |
| `corepack pnpm start` | Published-source application with a configured non-owner PostgreSQL role |
| `corepack pnpm worker` | Separate lease-fenced source import/extraction worker |
| `corepack pnpm db:migrate` | Explicit owner connection, additive migrations and SHA-256 history |
| `corepack pnpm db:check` | Check that the current migration hashes are applied |
| `corepack pnpm db:bootstrap` | Pre-enroll the exact publisher identity and grant a restricted runtime role |
| `corepack pnpm preview` | Older incomplete-excerpt design preview; never enables live adapters |

The web entrypoint is `apps/web/application/start.mjs`. It combines catalog/version reading, same-origin session APIs, optional provider adapters and publisher routes. `NODE_ENV=production` cannot start the local demo. In hosted mode all public origins use HTTPS, anonymous cookies are Secure/HttpOnly/SameSite, and sessions are stored in PostgreSQL. Readiness checks the database; graceful shutdown rejects new work and cancels active generation/audio.

Public routes include `/bills`, exact bill/version pages, `/learn`, `/privacy`, `/accessibility`, and `/about`. The progressive reader adds exact text search, selection, source cards/drawer, bookmarks and text size, guided tours, explicit sharing, source downloads, standalone offline HTML and conversation export. Source text remains usable without JavaScript, AI, sound or graphics. Spanish routes label the original source rather than presenting an unverified translation.

## Database and identity setup

Use a dedicated empty Ask Bill database or a deliberately isolated preview branch. Keep the owner URL in `ASK_BILL_MIGRATION_DATABASE_URL` only for maintenance commands. Do not attach it to either running service. Migrations apply `migrations/001…009` followed by `packages/auth/migrations/001…002`, under a session advisory lock. Each file owns a transaction and is repeatable. A changed or unknown recorded hash fails the check instead of silently editing history.

Run `db:migrate` with the owner connection. For bootstrap, set `ASK_BILL_PUBLISHER_ID`, `ASK_BILL_PUBLISHER_SLUG`, `ASK_BILL_PUBLISHER_NAME`, `ASK_BILL_OWNER_USER_ID`, `ASK_BILL_OIDC_ISSUER`, `ASK_BILL_OWNER_OIDC_SUBJECT`, `ASK_BILL_RUNTIME_DB_ROLE`, and a private `ASK_BILL_RUNTIME_DB_PASSWORD` of at least 32 characters. UUIDs identify the publisher and its owner membership. Obtain the exact issuer and subject from the intended identity provider; email matching never enrolls an account.

Run `db:bootstrap`. An existing publisher, membership or identity must match exactly. The command never replaces an identity, promotes an existing non-owner membership or resets an existing role password. It rejects roles with owner, CREATE, elevated or inherited privileged access. Runtime roles can read membership/enrollment records but cannot change them, and cannot edit/delete audit history or access migration metadata. Re-run bootstrap after an additive schema deployment to grant new runtime tables; its identity checks remain idempotent.

Set `ASK_BILL_DATABASE_URL` to the resulting restricted role. Hosted pools use certificate-verified TLS, an explicit catalog search path and bounded connections/timeouts. URL options cannot override those settings. Use `ASK_BILL_SESSION_ENCRYPTION_KEY` containing exactly 32 random bytes encoded as standard base64. Generate and store the value through the private deployment environment. It encrypts short-lived accepted answers with AES-GCM and binds them to publisher/session/answer IDs. Rotation invalidates existing replay; do not reuse the key across environments.

For a hosted deployment, set `ASK_BILL_STAGE=staging` or `production` and `ASK_BILL_PUBLIC_ORIGIN` to the exact HTTPS origin, without a path or trailing slash. `NODE_ENV=production` also selects production by default and rejects an explicit development/test stage. The configured publisher UUID and session encryption key are required for the database-backed web application even when all provider features are off.

## Provider controls

All external features default off. A key alone enables none of them. See `.env.example` and `packages/config/runtime.mjs` for the complete allowlist.

| Feature | Required private configuration and behavior |
| --- | --- |
| AI answers | `ASK_BILL_ALLOW_LIVE_AI=true`, LLM key, generation model, different review model, and verified provider data protection |
| Speech | `ASK_BILL_ALLOW_VOICE=true`, TTS key, configured or default model/voice, verified voice rights and provider data protection |
| Transcription | `ASK_BILL_ALLOW_TRANSCRIPTION=true`, STT key, configured or default model, verified provider data protection and executable FFmpeg |
| Publisher interface | `ASK_BILL_ALLOW_PUBLISHING=true`, HTTPS origin, durable DB/encryption, OIDC settings, private S3 settings |
| Congress import | Web publishing plus `ASK_BILL_ALLOW_OFFICIAL_IMPORTS=true` and a Congress API key in both web and worker; the worker does not read the web publishing flag |

AI generation returns a held structured draft. Exact source quotes, offsets, hashes, version/status, complete material text and dependency context are checked before release. A separately configured model reviews support and exceptions. Its approval is fallible and labeled accordingly; it is not legal or independent human certification. Unsupported types, unreviewed caveats, missing context, personal legal advice and malformed output produce a safe abstention. No raw provider token stream reaches the browser. With AI off, eligible questions can retrieve exact source quotations without a provider.

Speech accepts only an answer/segment identifier already stored by the server. The API verifies the accepted segment, session epoch and publication before synthesis, and verifies session/publication again before delivery. The provider returns measured WAV audio with hashes; the client requires an explicit playback gesture. Clearing, replacing a question or draining the service aborts generation, speech and transcription.

Microphone input is adult-only. It is never automatically submitted as a question. The server decodes each supported recording through bounded FFmpeg pipes, accepts at most 30 seconds of real decoded audio, caps concurrent decoders and strips container metadata before transcription. Client-reported duration is not trusted. Local input buffers are cleared after use; application storage receives neither the recording nor its transcript. Provider-side retention must be separately verified. `ASK_BILL_PROVIDER_DATA_PROTECTION=verified` records an operator decision; it does not perform that verification.

Anonymous usage limits live in PostgreSQL, including across replicas and session deletion/recreation. Defaults are 60 requests/session and 1,000 requests/publisher/day. These count conversation, speech and transcription requests; they are not a dollar ledger or a production load qualification. Accepted answers become inaccessible at the 30-minute session expiry, at most ten are retained per session, and explicit deletion cascades immediately in the active database. Cleanup attempts run every minute in batches of at most 100 expired sessions; a backlog, stopped process or backup policy can delay physical removal. User exports are deliberately saved by the user and cannot be remotely erased. See [retention and deletion](../privacy/RETENTION_AND_DELETION.md) for the separate record and object lifetimes.

## Publisher workflow and private sources

The `/admin` interface uses OIDC authorization code with PKCE, verified ID tokens, pre-enrollment and role checks. Configure `ASK_BILL_OIDC_ISSUER`, `ASK_BILL_OIDC_CLIENT_ID` and the exact callback `{ASK_BILL_PUBLIC_ORIGIN}/admin/auth/callback`. The provider must support PKCE S256, RS256 ID tokens with RSA keys of at least 2048 bits, and the requested `auth_time` claim with authentication no older than ten minutes. Set `ASK_BILL_OIDC_TOKEN_ENDPOINT_AUTH_METHOD` to `client_secret_basic`, `client_secret_post` or public-client `none`; the first two require `ASK_BILL_OIDC_CLIENT_SECRET`.

Map verified provider MFA claims through the comma-separated `ASK_BILL_OIDC_MFA_AMR` and/or `ASK_BILL_OIDC_MFA_ACR` settings. The default accepted AMR is `mfa`; no ACR is accepted by default. Authorization, token and JWKS endpoints must remain within the issuer's HTTPS origin unless their origins are explicitly listed in `ASK_BILL_OIDC_ALLOWED_ENDPOINT_ORIGINS`. Review, correction, publication and withdrawal require MFA within ten minutes; old, revoked and identity-mismatched sessions fail closed. All publisher pages and original downloads are private/no-store. [The auth integration guide](../../packages/auth/README.md) describes enrollment, rotation and provider acceptance checks.

Create a bill, upload a supported document or choose an official source, then wait for extraction. Original bytes enter private quarantine and are independently verified before private-source promotion. The worker verifies them again, stores immutable provenance and extracted provisions, and builds a version-bound search index. The interface displays warnings and the extracted text. Complete every review check against the original before publishing. Publication compares the expected prior release and activates a reviewed immutable source/index pair atomically. Corrections create a new private version and require a new review. Withdrawal removes public reading and prevents subsequent speech delivery.

S3 settings include HTTPS endpoint, region, bucket, optional separate quarantine/source buckets, access key/secret and optional session token. Use publisher-scoped private credentials. The adapter uses SigV4, immutable writes and independent read-back verification. The publisher's original-download route checks current membership and the exact bill/version digest, then returns verified bytes as a fixed-name attachment with `private, no-store` and `nosniff`; it does not expose a signed storage URL. The adapter's optional scoped signed-download API is separate from this route.

Original source bytes remain stored privately after extraction, correction and withdrawal. The seven-day quarantine lifetime is an operator target, and archival retention and backups require a separate approved policy. Abandoned quarantine objects and private originals have no automatic application deletion job; no external bucket lifecycle policy is applied or verified by this code. Withdrawal blocks public access while preserving provenance and does not erase originals or recall downloaded files.

## Worker isolation and deployment

The worker reads `component:'worker'` configuration: database, publisher, storage and optional Congress key. It needs no OIDC, session-encryption, AI or speech secrets. One job runs at a time per process; database leases/fences support replicas. Successful processing emits a durable outbox event. Without an explicit external sink, events stay pending; the worker does not claim delivery to an absent service.

Set `ASK_BILL_SOURCE_SANDBOX_COMMAND=/opt/ask-bill/infra/run-source-sandbox.sh` and `ASK_BILL_SOURCE_SANDBOX_VERIFIED=verified` only after the host isolation probe passes. The supplied wrapper uses bubblewrap namespaces, restricted read-only code/tool mounts, fresh temporary storage, no network, minimal environment and process/resource/time bounds. A host that denies required namespaces cannot activate extraction. The explicit uncontained test option is rejected in hosted mode. This development executor could not demonstrate hosted containment; its rejection is recorded, not treated as a successful sandbox test.

`infra/Dockerfile` pins the verified Node image digest, builds the workspace, installs FFmpeg/Poppler/Tesseract/bubblewrap and runs as the unprivileged node user. `infra/render.yaml` describes a web service with providers off and an explicit free plan. The separate worker blueprint describes paid capacity and must not be applied until the workspace and that spend are approved. Neither file provisions a database, chooses an unrelated workspace, attaches owner credentials or deploys unreviewed PRs.

Before activation, verify the image CI, selected workspace/domain, private credentials, database bootstrap, S3 write/read/denial, OIDC login/MFA/revocation, sandbox probe, official-source import, real AI review/abstention, real speech/cancellation and cost ceilings using public synthetic content first. Then publish only an actually reviewed authoritative edition. Final character assets and live acceptance records remain separate inputs.

Rollback disables the affected feature flag and restores the previous compatible web/worker image. Preserve additive tables, immutable source versions and audit records. Withdraw an erroneous active release or activate a separately reviewed replacement through the publisher workflow; never edit published canonical text in place.
