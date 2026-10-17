# AB-020: exact official text-version metadata validation (incremental)

Tightens the independent, server-only Congress.gov adapter: canonical dates must have valid Gregorian calendar days and exact UTC times; official version descriptions and format labels are bounded, control-free plain text; pagination metadata is an integer 0..4000. Existing same-bill, HTTPS source, no-redirect, rate-limit, ETag and bounded-response safeguards remain in effect. No live API key or real bill is committed, and no fictional current-law status is inferred.

Node 22.16.0: `node --test tests/congress-metadata.test.mjs` passed four adversarial unit tests for leap/calendar rollover, malformed publication times, dangerous label content and pagination. GitHub exact-head CI and live official-source smoke remain required. Rollback: revert validator import and restore previous adapter, not previously published source versions.
