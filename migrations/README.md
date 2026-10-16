# Ask Bill PostgreSQL migrations — AB-007 checkpoint

The SQL in `001_initial.sql` is a **draft, non-destructive first migration**, not proof of a running database. No Neon or Render resource has been selected or modified. Ask Bill operates independently from unrelated products and companies.

## Applying to an isolated staging database

Use only an explicitly selected **Ask Bill** PostgreSQL 17 staging project with a dedicated migration role. Obtain the connection through your secure environment. Never paste credentials into GitHub, CI logs, chat, source-control files or shell history. A rollout operator must check the exact project identity, backup point and current schema before running anything.

Expected procedure: create a disposable database; use PostgreSQL's `psql` `ON_ERROR_STOP=1` and a transaction-safe migration runner under a migration role; execute `001_initial.sql`; execute it again to test schema idempotence; check permissions, all 10 tables, indexes, foreign keys, tenant policies and publication constraints; seed two unrelated publishers with distinct IDs; run tenant reads/updates/inserts/deletes under a **non-owner, non-BYPASSRLS app role** using authenticated transaction-local `ask_bill.publisher_id`; verify missing context denies rows and attempting a cross-tenant UUID never returns data; test previous code against populated data before deployment. These staging tests have **not yet been executed**.

## Threat boundary

RLS is defense in depth, not a substitute for server authentication. The transaction-local publisher context must be set only by trusted API code **after** validating authenticated publisher membership and action permissions. The client must never choose an arbitrary publisher context or receive SQL access. Publisher bootstrap needs a separately authorized administrative pathway (not yet implemented). Direct database credentials must never reach public browsers. Table ownership, grants and role provisioning are postponed until approved deployment design; do not grant `BYPASSRLS` to the runtime identity.

For now all migrations are expand-only; they do not drop existing data. Future migrations need a recorded version journal, backward-compatible application rollout and tested restoration. The static parser/contract tests only verify migration structure and query binding, not PostgreSQL execution or isolation.
