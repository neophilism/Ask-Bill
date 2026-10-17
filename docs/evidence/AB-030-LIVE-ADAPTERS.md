# AB-008/009/030/080/085 — provider adapter implementation

Repository: `neophilism/Ask-Bill`. Base: `d10d458fdee3bd11b2b642935f19d33422a04168`.
Branch: `feat/ask-bill-provider-adapters`. The pull request records its exact tested head.

## Implemented

- OpenAI Responses generation with strict source-claim schema, separate model review,
  bounded HTTPS transport, cancellation, timeout, safe errors, no tools and `store:false`.
- OpenAI WAV speech from independently authorized, source-reverified segments; optional
  multipart transcription with editable text and no automatic question submission.
- OIDC discovery/JWKS and signed ID-token verification, authorization code PKCE,
  browser-bound single-use login state, nonce, audience, issuer, authentication time,
  configured MFA, current pre-enrolled membership, secure sessions and CSRF checks.
- Durable PostgreSQL publisher auth persistence, including revocation of disabled
  identities and previous sessions. The migration is additive and tenant-scoped.
- S3-compatible SigV4 private storage with immutable conditional writes, checksum and
  read-back verification, scoped object keys, short-lived signed access and no redirects.
- Pinned `pg` driver for subsequent application database composition.

## Validation and review

Node 24.19.0 / pnpm 10.18.1. Local provider tests exercise schema tampering, incorrect
source hashes, redirects, broken credentials, oversized/stalled replies, caller abort,
unsupported speech text, WAV structure and cross-version requests. OIDC tests use
real generated RSA signatures and deliberately wrong claims. S3 signing is checked
against the published AWS SigV4 vector and immutable round-trip behavior.

Commands: `node --test tests/providers.test.mjs tests/openai-provider-integrations.test.mjs
tests/openai-audio-integrations.test.mjs tests/oidc-provider.test.mjs tests/s3-provider.test.mjs`.
The repository-wide `pnpm verify` also passed during composition; required GitHub CI
must pass on this scoped PR's exact head before merge.

AI-assisted source/security review found and corrected raw draft leakage, weak claim
shape checks, non-aborting fake transports, ambiguous OIDC token claims, stale identity
sessions, OAuth Basic encoding, and unchecked remote storage writes. No independent
human review or certification is claimed.

## Acceptance boundaries

Implementation and local automated adapter checks are complete for this scope.
Credentialed operational acceptance is **not run**: no real Ask Bill model, voice,
OIDC, S3 or production PostgreSQL credentials were available in the session. These
tests are injected-provider tests, not successful live-provider evidence. Compressed
STT media needs the application-level duration enforcement before public activation.
Production child free input remains disabled. This does not approve a finished
character, a production launch, or the remaining work in the original 112-unit plan.

Rollback: disable the affected provider through application configuration, restore
the prior adapter build, and retain source-only reading. Do not roll back by dropping
publisher session/provenance tables or weakening source validation.
