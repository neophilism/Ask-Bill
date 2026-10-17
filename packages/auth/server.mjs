/**
 * Ask Bill server-only publisher authorization boundary.
 * FixtureSessionStore is TEST-ONLY and refuses to initialize in production.
 * Real publisher login is implemented separately in oidc.mjs with pg-store.mjs.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const ROLES = new Set(['owner', 'editor', 'viewer']);
const ACTIONS = new Set(['view', 'upload', 'publish', 'withdraw', 'invite', 'manage-members']);
const COOKIE = '__Host-ask_bill_session';
const MAX_SESSION_MS = 30 * 60 * 1000;
const MFA_MAX_AGE_MS = 10 * 60 * 1000;

export class AuthError extends Error {
  constructor(code) { super(code); this.name = 'AuthError'; this.code = code; }
}
const fail = code => { throw new AuthError(code); };
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const safeEq = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};
function uuid(value) { if (typeof value !== 'string' || !uuidPattern.test(value)) fail('INVALID_ID'); return value.toLowerCase(); }
function origin(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) fail('INVALID_ORIGIN');
    return u.origin;
  } catch { fail('INVALID_ORIGIN'); }
}
function parseCookie(header) {
  if (typeof header !== 'string' || header.length > 4096 || /[\r\n\0]/.test(header)) fail('SESSION_INVALID');
  const matching = header.split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
  if (matching.length !== 1) fail('SESSION_INVALID');
  const value = matching[0].slice(COOKIE.length + 1);
  if (!tokenPattern.test(value)) fail('SESSION_INVALID');
  return value;
}
const token = () => randomBytes(32).toString('base64url');

export function publisherActionAllowed(role, action, recentMfa) {
  if (!ROLES.has(role) || !ACTIONS.has(action) || typeof recentMfa !== 'boolean') fail('INVALID_AUTHORIZATION');
  if (action === 'view') return true;
  if (role === 'viewer') return false;
  if (action === 'upload') return true;
  if (action === 'publish') return recentMfa;
  return role === 'owner' && recentMfa;
}
export function secureSessionCookie(value) {
  if (!tokenPattern.test(value)) fail('SESSION_INVALID');
  return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=1800`;
}
export function clearSessionCookie() { return `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`; }

/** This is a deterministic integration-test boundary, NOT a provider adapter for live identities. */
export class FixtureSessionStore {
  #entries = new Map();
  #now;
  #expectedOrigin;
  constructor({ mode, expectedOrigin, now = () => Date.now() } = {}) {
    if (mode !== 'test-fixture') fail('LIVE_AUTH_NOT_CONFIGURED');
    if (typeof now !== 'function') fail('INVALID_CLOCK');
    this.#now = now;
    this.#expectedOrigin = origin(expectedOrigin);
  }
  issueForTrustedFixture({ userId, publisherId, role }) {
    const user = uuid(userId); const publisher = uuid(publisherId);
    if (!ROLES.has(role)) fail('ROLE_INVALID');
    const issuedAt = this.#now();
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) fail('INVALID_CLOCK');
    const sid = token(); const csrf = token();
    this.#entries.set(digest(sid), {
      userId: user, publisherId: publisher, role, csrfHash: digest(csrf),
      issuedAt, expiresAt: issuedAt + MAX_SESSION_MS, mfaVerifiedAt: null
    });
    return Object.freeze({ setCookie: secureSessionCookie(sid), csrfToken: csrf });
  }
  /** Represents trusted MFA adapter acknowledgment in *fixture tests only*. */
  fixtureVerifyMfa({ cookieHeader }) {
    const sid = parseCookie(cookieHeader);
    const session = this.#entries.get(digest(sid));
    if (!session || this.#now() >= session.expiresAt) fail('SESSION_EXPIRED');
    session.mfaVerifiedAt = this.#now();
  }
  revoke({ cookieHeader }) {
    const sid = parseCookie(cookieHeader);
    this.#entries.delete(digest(sid));
    return clearSessionCookie();
  }
  /** Membership is supplied by a trusted, *server-side* fresh database lookup. */
  authorize({ cookieHeader, csrfToken, requestOrigin, method, action, publisherId, resolveMembership }) {
    if (!ACTIONS.has(action)) fail('ACTION_INVALID');
    if (typeof method !== 'string' || !/^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(method)) fail('METHOD_INVALID');
    const sid = parseCookie(cookieHeader);
    const session = this.#entries.get(digest(sid));
    if (!session) fail('SESSION_INVALID');
    const now = this.#now();
    if (!Number.isSafeInteger(now) || now < 0 || now >= session.expiresAt) fail('SESSION_EXPIRED');
    if (uuid(publisherId) !== session.publisherId) fail('PUBLISHER_FORBIDDEN');
    if (typeof resolveMembership !== 'function') fail('MEMBERSHIP_LOOKUP_REQUIRED');
    const current = resolveMembership(session.userId, session.publisherId);
    if (!ROLES.has(current)) fail('MEMBERSHIP_REVOKED');
    const mutation = !['GET','HEAD'].includes(method);
    if (mutation) {
      if (requestOrigin !== this.#expectedOrigin) fail('ORIGIN_FORBIDDEN');
      if (!tokenPattern.test(csrfToken) || !safeEq(digest(csrfToken), session.csrfHash)) fail('CSRF_FORBIDDEN');
    } else if (action !== 'view') {
      fail('METHOD_NOT_ALLOWED');
    }
    const recentMfa = session.mfaVerifiedAt !== null && now >= session.mfaVerifiedAt && now - session.mfaVerifiedAt <= MFA_MAX_AGE_MS;
    if (!publisherActionAllowed(current, action, recentMfa)) fail('ACTION_FORBIDDEN');
    return Object.freeze({ userId:session.userId, publisherId:session.publisherId, role:current, action });
  }
}

/** Public reading is deliberately independent of publisher sessions and authentication. */
export const isPublicReadingRoute = (method, pathname) => method === 'GET' && /^\/(?:api\/bills(?:\/[a-z0-9-]+)?|preview|)$/.test(pathname);
