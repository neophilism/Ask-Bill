# Ask Bill PR registry contract

`registry/prs.json` is the **only active machine-readable plan**. It uses the same v1 parser as Boardroom and Engine Room (`registry/pr-contract.mjs`). Never consume `registry/roadmap.json` as an independent plan; it is a retirement notice only.

- Keep all 112 original unit IDs `AB-001` through `AB-112`, dependencies, acceptance, scope, provenance and named gates. Add approved work under new immutable IDs, never renumber historical units.
- `prs` is an array of verified same-repository GitHub PR **numbers**, never ordinal positions. `contributingPrs` and `priorEvidencePrs` are evidence only, not a completed implementation mapping.
- `pullRequests` and `observedAt` represent a dated GitHub observation, not live authoritative status. Refresh only from actual GitHub data, including merged timestamps and outstanding follow-ups.
- Completion requires actual merged source, tests at the current head and independent operational acceptance; a PR merge alone is insufficient. Preserve separate external-review and certification statuses.
- Use exact leading IDs in PR titles (e.g. `AB-002: Toolchain workspace and CircleCI`). Before merging use `docs/GITHUB_MERGE_PREFLIGHT.md`.
- Run `npm run check` on a clean checkout; the validator checks original scope, full graph, and consumer format.
- The original detailed explanatory plan is `docs/DEVELOPMENT_PLAN.md`, not a second machine-readable registry.
