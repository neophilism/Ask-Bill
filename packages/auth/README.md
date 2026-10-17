# Publisher OIDC integration

`oidc.mjs` implements a server-side OpenID Connect authorization-code flow with
PKCE S256. `pg-store.mjs` persists one-use login transactions, enrolled identity
mapping and opaque sessions. `server.mjs` retains the isolated fixture role
matrix; it must not be used as a production sign-in provider.

## Configure and enroll

Create the OIDC client with an exact HTTPS redirect URI ending in
`/admin/auth/callback`. Pass `issuer`, `clientId`, `clientSecret` when needed,
`redirectUri`, `expectedOrigin`, `publisherId` and a
`createPostgresAuthStore({pool, publisherId})` instance to
`createOidcPublisherAuth`. Token endpoint authentication supports
`client_secret_basic`, `client_secret_post` and PKCE public-client `none`.
Credentials stay in server configuration; only the authorization redirect and
opaque cookies are returned to the browser.

Discovery and JWKS endpoints must be HTTPS. They default to the issuer's exact
origin; providers using separate endpoint hosts require an explicit
`allowedEndpointOrigins` list in trusted server configuration. Redirects from
discovery, key and token requests are rejected. Tokens require RSA signatures
with RS256 and at least 2048-bit keys. Issuer, subject, audience, authorized
party, nonce, token time, original authentication time and any supplied token
hash claims are checked. Other token algorithms are not enabled implicitly.

Apply `migrations/001_publisher_auth.sql` and
`migrations/002_identity_binding.sql` after the foundational repository
migration. The runtime role must have the needed grants and must not be a
database owner or `BYPASSRLS` role. All auth tables enforce publisher RLS. The
second migration binds a session to both its identity hash and enrolled user.

Enrollment is explicit. Add the publisher's UUID, user's UUID and role to
`ask_bill.publisher_memberships`, then add an identity mapping to
`ask_bill.publisher_auth_identities`. Generate `identity_sha256` with the exported
`publisherIdentityHash({issuer, subject})` using the exact issuer and provider
subject. An email address, arbitrary provider login or client-supplied role
never enrolls a publisher. Provider account recovery remains with the selected
identity provider. A recovered account with a new subject needs a deliberate
new enrollment; the application does not match it by email.

## MFA, revocation and state

The default accepted `amr` value is the registered `mfa` method. Map any
provider-specific assurance levels explicitly with `acceptedMfaAcr`; arbitrary
`acr` strings and password-only authentication do not prove MFA. The client
requests `auth_time` and `max_age=600`, and its recent MFA timestamp comes from
the validated original authentication time rather than the time it received
the token. Review, corrections, publishing and withdrawal recheck this
ten-minute window.

Login transactions expire in five minutes and bind a cryptographically random
state to a separate HttpOnly, Secure, Lax browser cookie. Redemption is an
atomic delete-and-return under RLS. A publisher-wide bound caps pending
transactions at 512. Session and CSRF secrets are separately random; PostgreSQL
stores their hashes. Sessions use Secure, HttpOnly, Strict `__Host-` cookies and
expire after thirty minutes. Every mutation needs the CSRF value from its
rendered form and the exact configured Origin.

Every sign-in rotates the session. The pending transaction retains the hash of
the previous session so MFA callbacks can revoke it even when the browser
correctly omits Strict cookies on the provider's cross-site redirect. Logging
out deletes the durable session. Role changes are reloaded for every request.
Disabling one identity immediately invalidates its sessions even if that user
has another enabled identity. No ID token, access token or refresh token is
persisted.

## Verification evidence

`tests/oidc-provider.test.mjs` uses real generated RSA signatures and injectable
local provider responses. It checks PKCE, nonce/state/replay, issuer and audience
substitution, time claims, MFA, explicit enrollment, role/CSRF controls and
session rotation. `tests/postgres/publisher_auth.sql` verifies the corresponding
RLS, expiry, one-use state, identity binding and revocation with real PostgreSQL.
These are local integration checks. A deployment must separately demonstrate
credentialed login, recent MFA, provider account recovery, expiry and logout.

Protocol references checked on 2026-10-17:

- [OpenID Connect Core 1.0, second errata](https://openid.net/specs/openid-connect-core-1_0.html), especially ID token validation and authentication context claims.
- [RFC 7636: Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html), S256 verifier and challenge rules.
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html), exact redirect, PKCE and issuer protections.
