# AB-024: real PostgreSQL public-release and withdrawal integration

Adds a transactional synthetic source/release fixture in the isolated PostgreSQL 17 CI database, proving the existing active-release SQL relationships actually return an authorized source only while it is published and the release pointer is active.

The test creates a reviewed version, matching canonical-text digest, complete search generation, provenance-linked immutable pack and an active release pointer. It then switches to a non-owner, non-BYPASSRLS role to verify missing tenant context and guessed cross-publisher/incorrect-version reads return zero rows. After withdrawal the published release is no longer readable. The entire fixture is rolled back and verified absent.

This complements the earlier PREPARE/EXPLAIN structural SQL smoke tests, but does not certify a production service or official legislative data. Real backend reader database identity, provider authentication, operational deployment and full accessibility still remain outstanding. No unrelated company resources or Bill character assets are involved.

CI: database/PostgreSQL tenancy and migrations, plus the unchanged workspace, PDF and browser checks. Failures should block merging. Rollback: remove this disposable regression test only; no production migrations.
