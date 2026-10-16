# Ask Bill: mandatory instructions for all agents

Read `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_PLAN.md`, `registry/PR_FORMAT.md` and the active `registry/prs.json` before changing code. Verify the exact live GitHub repository, default-branch head, open and merged PRs, checks, and current source state; preserve concurrent work.

## Architecture and ownership

- This repository is **Ask Bill only**: a distinct product operated separately from unrelated websites and companies, including projects under the same GitHub account. Never integrate, import, call or depend on external product code, SDKs, services, APIs, databases, schemas, assets, work-unit plans or release processes without a newly approved, explicit Ask Bill integration agreement. Build Ask Bill's own legislative ingestion, evidence, citations and explanations.
- Bill is an original, non-infringing, friendly animated character, inspired by a personified bill on Capitol Hill, not a paper clip or a copied existing character. Build editable source and actual production-ready 3D asset, not a mock described as complete.
- The canonical public truth is the exact versioned source text with stable anchors and provenance. Distinguish proposed text, enacted law, different versions, attributed advocacy, interpretation and uncertainty.
- The LLM must not choose authoritative legal citations, character navigation coordinates, DOM elements, security policy or source version. A validated deterministic controller maps grounded spans to animations, focus targets and inspectable evidence.
- Public reading needs no account, microphone, payment, headset or graphics support. Text reading and citations must work if character/AI/voice providers are off. Keep anonymous visitor history session-local by default.
- Under-13 free input/live conversation is off unless verified parental consent and provider data protections pass. Child-safe curated demos can be provided separately.
- Keep private publisher drafts out of public caches, logs, provider prompts unless authorized, and analytics. The app is not an attorney, government filing portal, government receipt authority or legal advice product.

## Security, audit and delivery

AI agents implement, review, test, fix issues, and document results using relevant unit/integration/e2e/browser/visual/a11y/adversarial checks. **Never** stop engineering solely because no outside human auditor, paid pen test or E2EESA certificate is available. That does not waive substantive review, failed CI, legal-risk gates or real security vulnerabilities. Human reruns can follow separately later. Never misrepresent a mock or a skipped test as a passed live check.

E2EESA applicability must be assessed by component and actual threat model. Do not claim server-processed public conversations have end-to-end confidentiality from the service. Keep independent human review and certification fields distinct from automated security acceptance.

Do not commit secrets, private legislative uploads, personal questions, personal audio, unpublished provider responses or licenses not granted. Do not provision paid infrastructure, change another product, or publish claims without the required live evidence. Use feature-flagged provider-free fixtures so unrelated work continues if a key is absent.

## One plan, one source of truth

- `registry/prs.json` is the **sole active machine-readable plan**, in Boardroom/Engine Room v1 format. It contains all 112 original AB IDs. `registry/roadmap.json` is only a redirect notice; do not create an alternative live `planning/work-units.json`.
- IDs are stable plan work units, **not GitHub PR numbers**. Use `AB-002: ...` in PR titles. Only map genuine observed PR numbers; distinguish implementation, tests, merge, operational acceptance, independent review and certification. Never increment completeness merely because a branch or PR exists.
- If scope changes are approved, preserve existing work and dependencies and add immutable new IDs where appropriate. Cross-repo work must be an explicitly modeled external dependency with a valid provenance record.
- Check `docs/GITHUB_MERGE_PREFLIGHT.md` and actual current-head CI before merging. Do not bypass a failing real test or deploy credentials unverified.
- Record path, scope, tests, screenshots/assets, hashes, rollback, actual PR and SHA in `docs/evidence/AB-XXX.md`; follow `docs/evidence/UNIT_TEMPLATE.md`.
- Checkpoint work early, stay on scoped branches, and merge after required checks. When blocked on one live dependency, continue other safe, dependency-ready tasks rather than stopping.

## Next work

AB-001 is planning/registry foundation. AB-002 owns pnpm/TypeScript workspace, application scaffolding, actual CircleCI gates, lockfile and cold-install builds. The foundation's Node-only `npm run check` is **not** equivalent to future app CI. Check current AB-001 acceptance on GitHub before starting dependent units.
