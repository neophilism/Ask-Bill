# AB-004: bounded concurrent public reader and catalog lookups

The opt-in source-only HTTP server now limits outstanding dynamic source/catalog reads to a configured `maxInflight` integer (default 64, maximum 256). Extra requests receive a no-store HTTP 503 with Retry-After: 2 seconds. The limit is shared by exact-version reads, plain-text exports and the public bill catalog, and is not lifted by clients disconnecting while a backend lookup is still running. Static CSS remains available.

Transport timeouts also restrict slow header/body requests and long-lived sockets. Authorization and public-source integrity checks remain mandatory, and backend errors still produce indistinguishable safe 404s.

Tests cover saturation and recovery after a completed lookup, shared catalog/source capacity, safe recovery following private backend errors, valid configuration, and fixed socket timeouts. CI must exercise the exact commit including the real HTTP browser, PDF and PostgreSQL jobs. These tests use synthetic public fixtures and do not represent a deployed production load test.

Future operational work: per-host rate limiting, upstream cancellation with `AbortSignal`, distributed quotas, metrics without personal content, and real throughput testing with a least-privileged database role. No Bill character assets or unrelated-company infrastructure are involved.
