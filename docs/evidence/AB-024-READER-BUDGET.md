# AB-024: preflight public document size before transferring provisions

The tenant-bound, read-only source lookup now asks PostgreSQL for the number of provisions and total UTF-8 bytes **before** materializing any provision text in the Node process. The response is rejected if it contains more than 500 provisions, over 1,500,000 source bytes, zero provisions or invalid counts. After fetching bounded rows, the code rechecks the count and actual bytes; changes during the transaction or tampered hashes fail closed.

Why: the original `LIMIT 501` restricted row count but could still transfer more than 100MB of large provision strings into a single process. The additional SQL preflight reduces accidental memory exhaustion without altering source content or allowing truncated public documents.

Tests include the Node source-reader fake-pool checks for oversized, changed or inconsistent counts/bytes and a prepared PostgreSQL 17 query in the disposable CI database. This is a defensive implementation step, not a production performance certification. Future streaming/keyset reads and database role restrictions still require operational testing.

Bill's character assets and unrelated company data are not involved.
