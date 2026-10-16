# Ask Bill publisher authorization boundary (AB-008)

This module is deliberately **server-only**, and contains **no production identity provider, login endpoint, or authenticated admin UI**. Public legislative reading requires no account. Ask Bill is an independent website and company; unrelated apps and their accounts/credentials are not involved.

## Trusted identity and session boundaries

The trusted login provider is responsible for proving user identity and MFA using a real chosen/authenticated adapter, configured outside the repository. The `FixtureSessionStore` is only for regression tests; its constructor requires `mode: 'test-fixture'`, and it cannot be enabled in production.

Fixture sessions use 256-bit unpredictable opaque cookie tokens stored as SHA-256 digests, an explicit server-side 30-minute expiry, a separate 256-bit CSRF token stored hashed, a `__Host-` Secure/HttpOnly/SameSite=Strict cookie, origin equality on every mutation, duplicate-cookie denial, revocation and a short 10-minute MFA freshness window. No client-supplied role, tenant ID or MFA boolean grants privileges. Privileges use a **fresh trusted server membership lookup for each authorized request**; removing a user or downgrading their role applies without waiting for cookie expiration.

Roles: viewers may read; editors may upload and publish only after fresh MFA for publication; owners can additionally withdraw and manage membership with fresh MFA. All mutation methods require same-origin CSRF. The independent public reader has no sign-in wall.

## Remaining critical integration work

The mock/test session service is intentionally **not a deployable authentication system**. A real staging auth provider must support login, verified MFA, trusted session issuance/rotation, refresh, logout, recovery, durable revocation, membership state, rate limits, anti-enumeration and audit trails. Its API routes must use secure cookies and fail closed when the provider is down. Database roles must enforce RLS and the authenticated server must select publisher context. Until this exists, *do not enable any real publisher write, upload or publish route*. Publisher login, identity lifecycle and MFA recovery remain unaccepted.

## Regression verification

Run `node --test tests/auth.test.mjs`: nine local tests exercise impersonation, role downgrade, cross-tenant guessed IDs, spoofed origins and CSRF, missing MFA, expired MFA, replay/duplicate cookies, session expiration and public-reading independence. These are local fixture tests, not a claim of staging authentication or security certification.
