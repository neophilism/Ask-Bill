# AB-009 Ask Bill object capabilities — staged storage boundary

**Scope:** Self-contained, independent private upload-ticket contracts. This module is server-only; a public visitor cannot use it to obtain a source upload token. It has no live S3/bucket adapter, server endpoint, or real credentials.

The intended storage topology has strictly separate `quarantine`, `private-source` and `public-packs` areas. The current implementation issues signed tickets **only for quarantine uploads** and checks publisher UUID, tenant-prefixed object key, exact expected SHA-256/byte count/declared MIME, finite expiry (maximum five minutes) and one-time nonce redemption. Each ticket uses an HMAC-SHA256 signature under a secret that must be at least 32 bytes and must be provided securely at server startup. Verification must happen only after a trusted AB-008 publisher authorization decision.

Actual upload bytes receive preliminary PDF/DOCX/UTF-8/XML checks; file extraction, DOCX ZIP decompression, XML/ZIP bomb defense, malware scanning, quarantine workers, object storage bucket IAM, CORS settings, encrypted signed GET URLs and CDN publication are **not yet implemented**. A magic number alone is not a safe document parser. Do not route unverified files to public sources or a language model.

The `testNonceRegistry()` fixture stores redeemed nonces in process memory solely for regression tests. A production ticket verifier MUST use a transactionally atomic persistent nonce registry and bind the ticket to authenticated publisher authorization; no async Promise is accepted as proof of successful redemption. The API must not reveal signing secrets, private storage addresses, full object IDs or ticket content in logs.

`publicPackReference` is a syntax validator, not an authorization decision or public CDN URL. A published release requires a separately approved signed immutable manifest and outbox atomically marking an object as published. This work does not provision cloud storage, spend money or use resources owned by another product/company.

Run `node --test tests/storage.test.mjs` (eight offline security tests). Complete AB-009 operational acceptance only after a real patched staging storage provider is configured and tested for cross-publisher isolation, TTL, retries, replay, size limits, corrupt bytes, upload cancellation, object durability and protected reads.

Rollback: disable signing and revert the module; preserve immutable quarantined bytes and publication manifests.
