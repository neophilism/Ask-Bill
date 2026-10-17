# AB-024 follow-up: tenant-bound active-release catalog lookup

Adds a server-only PostgreSQL query for the optional source-only catalog. The query joins the publisher's active release pointer, immutable release pack, complete published version, bill identity, approved search generation and original-source provenance. A backend-configured publisher UUID is set in a read-only transaction and every SQL argument is parameter bound.

The catalog returns no personal or unpublished data. Rows are limited to a 21-record window for bounded 20-record pages and a next-page indicator. Wrong publishers, invalid page numbers, malformed records, database errors and stale permissions fail closed. A missing release pointer results in an empty catalog rather than a fake public document.

Tests: four Node database and HTTP tests, plus a PostgreSQL PREPARE/EXPLAIN smoke in the existing disposable PostgreSQL CI job. Tests with a fake pool are not evidence of a real authenticated production database connection.

Operational work outstanding: dedicated least-privileged database role and grants, genuine reviewed release records, actual provider credentials and deployment, scalable keyset pagination and mobile/screen-reader signoff. Does not depend on the separately developed Bill character, voice or any unrelated company.

Rollback: omit the catalog callback; published source links remain available.
