# GitHub merge preflight

1. Inspect current GitHub PR head SHA and base branch, conflicts and branch protections. Compare with source SHA in every attached test/evidence record.
2. Verify actual required named checks for **that exact head SHA**. Missing, pending, failed, skipped, cancelled, stale, or unchecked required checks are **not passed**. Fix or rerun; continue other work safely. A green plan-only check never certifies a runtime feature.
3. Perform AI source/security review of changed surfaces, dependency and secrets checks, relevant app/unit/integration/a11y/adversarial/browser tests, and document defects and fixes. No independent human/paid audit sign-off prerequisite.
4. Keep provider credentials secret; do not merge unpublished private source content into a public repo. Require changed DB migrations and release data to have staged rollback/compatibility evidence.
5. Preserve one canonical active registry, exact work IDs, approved scope and unrelated changes. Verify PR mapping is a genuine GitHub PR number.
6. Merge only after requirements pass and no material unresolved defect. Then inspect the **merged default branch** and refresh real PR evidence. Record separate operational acceptance later when live behavior is verified.
