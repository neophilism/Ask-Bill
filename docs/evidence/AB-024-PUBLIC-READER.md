# AB-024 follow-up: active published-release database reader

Server-only PostgreSQL release lookup integrated with the opt-in source-only HTTP reader from PR #51. Requires an injected non-owner, non-BYPASSRLS PostgreSQL pool and a publisher ID fixed in backend configuration. It never reads documents directly from client-provided publication flags.

Within a read-only, transaction-local publisher context, the query joins release_active, immutable release_packs, bill_versions, bills, search_active, completed search_generations, and immutable source provenance. Only a complete, published and currently active release with the matching version and canonical/source hashes can pass. The returned provision text is verified again against the reader-canon-v1 digest before leaving the transaction. Missing or malformed sources, tampering and database errors fail closed without leaking private content.

Tests: four Node database/HTTP contract cases with a fake transactional pool and one PostgreSQL PREPARE/EXPLAIN smoke executed in the existing disposable PostgreSQL 17 CI job. In-memory contract tests do not prove production role isolation.

Not production accepted: real publisher identity and least-privileged connection provisioning, durable official source packs, actual verified staging publication, object-store evidence, Next.js/React integration, full accessibility and domain deployment are pending. No production DB/service has been created or modified.

Rollback: disable the source-only route or its published-source lookup. Public source-only reading remains independent of AI, speech, animation and other companies.
