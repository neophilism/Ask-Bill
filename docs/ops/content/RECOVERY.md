# AB-028 Import failure recovery — partial implementation

The source-only ingestion handler reads tenant-bound quarantine objects through an explicitly injected, trusted storage adapter; it verifies exact raw bytes, MIME, source hash, parser output and an active worker lease before producing a PRIVATE idempotent outbox notification. No raw content or secrets go to job payloads or public URLs. Text, Markdown, DOCX and recognized legislative XML may be parsed in the controlled worker. PDFs are deliberately held for AB-016's isolated native/OCR sandbox rather than executed by the generic importer.

The unit tests exercise corrupted/quarantine bytes, cross-publisher sources, unavailable stored objects, stale leases, a simulated job worker crash and retry, and refusal to republish withdrawn sources. An existing PostgreSQL leased/fenced job worker handles durable reservation and atomic outbox commits; this new handler never calls the public release activation API.

**Remaining G2 operational acceptance:** real private object storage and signed retrieval, sandboxed parser isolation, complete official source fixtures, real import-to-publish staging workflow, worker crash/retry against the live PostgreSQL and CDN deployment, incomplete publication rollback, dead-letter administrative review and alerts. The local fake worker is not evidence of a live deployed ingestion pipeline.

Rollback: stop new intake/worker claims and preserve the last complete published release; keep reading accessible without exposing private upload bytes.
