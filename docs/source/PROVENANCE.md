# Original approved source provenance

On 16 October 2026 the owner directed the full independent Ask Bill architecture and comprehensive PR plan. The original downloadable handoff (`Ask_Bill_Agent_Handoff.zip`) included editable Markdown versions of the 14-page technical architecture and 32-page plan, a 112-unit candidate JSON specification, TS design contracts, fixture, template and a parser obtained from Boardroom. This repository incorporates those **full Markdown documents** and migrates the exact stable units into its single active `registry/prs.json`.

Source files preserved without scope edits: `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_PLAN.md`, `spec/CONTRACTS.ts`, `spec/SYSTEM.mmd`, and `fixtures/electronic-filing-excerpt.json`. Candidate JSON was intentionally **not** kept as a second machine-readable roadmap; its full work-unit fields are installed on `registry/prs.json` together with schema-v1 source and acceptance metadata. `registry/roadmap.json` is a retirement notice, never another plan.

The source manifest `docs/source/SHA256SUMS.json` verifies the original narrative and design files. Baseline pinned scope digest protects the 112 immutable approved units; legitimate future revisions require explicit scope/provenance updates and validators. Live PR and CI state must always be retrieved rather than inferred from these initial snapshots.

The original Word documents and ZIP remain available to the owner in their Library; the repository source is text-native for ordinary agent workflows.

Contract provenance: the v1 `registry/pr-contract.mjs` was adapted on 16 October 2026 from an existing machine-readable work registry format. Ask Bill owns this local implementation, with no cross-product service, approval or release dependency.

Owner correction recorded 16 October 2026: Ask Bill is a separate company and independent website. The architecture and narrative plan now explicitly disallow integration with unrelated products; only this correction was made to those source documents. Their integrity hashes were refreshed, while all 112 approved work-unit IDs, scopes, dependencies and baseline scope digest remain unchanged.
