# Ask Bill immutable source and provenance — AB-013

This module records **metadata only**, not source bytes. It is independent from the user's forthcoming 3D Bill asset. Public legal understanding must trace claims to the exact source version; no model may invent citation authority. The incomplete electronic-filing excerpt stays fixture-only.

## Sources and ownership

`createSourceCandidate(...)` requires a tenant/publisher, bill and version UUID, original bytes, source type, MIME, exact retrieval time and canonicalization-version identifier. It hashes the *original bytes* with SHA-256; it never retains/returns raw input bytes. Official network source URLs are restricted to HTTPS Congress.gov or GovInfo URLs, with no embedded credentials/fragment. Publisher private uploads must omit a public URL. This is metadata validation, **not** a URL fetcher, antivirus scan, completed ingestion job, an official government attestation or legal publication authority.

`privateSourceObjectKey(candidate)` assigns a stable tenant/hash-addressed private object key. Source bytes may be persisted only by a future authorized quarantined object adapter that independently verifies the declared hash, byte length and MIME, and that enforces publisher authorization. A public URL for a private upload is forbidden. `recordSourceObjectQuery` and `recordSourceEventQuery` return parameterized SQL boundaries; no database connection is made when importing these modules.

`migrations/003_provenance.sql` introduces tenant-isolated source-object metadata and immutable provenance events, including composite publisher/source-version foreign keys. Stored raw-object metadata and source events cannot be UPDATEd in place. Changed bytes create a different hash/object; replayed identical bytes may reuse the identical object and create a new version event. Retention/correctable metadata and private deletion must be handled with new records and publisher-authorized removal workflows, not illicit mutation of source text. The migration does not modify the authoritative original text of existing published versions.

## Acceptance boundaries

Local tests verify byte hashing, tampered/or malformed URL rejection, restricted MIME/UUID/date/size and collision metadata checks. Disposable PostgreSQL tests (CI) must verify migration idempotence, immutable metadata on UPDATE, tenant isolation and wrong-tenant insertion rejection. Later units must add actual object storage/scan/download integration, official source fetching, source canonicalization, version lineage, publish review and full source-object deletion/tombstone policy.

This is a **partial AB-013 deliverable**, not a completed public bill import/publishing service. No provider accounts, paid infrastructure, production credentials or unrelated company systems are used.
