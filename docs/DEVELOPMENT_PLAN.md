# Ask Bill Comprehensive PR Plan

Version 1.0 | 16 October 2026 | 112 dependency ordered implementation units

Build the complete Ask Bill experience described in docs/ARCHITECTURE.md. This plan includes the character itself, its production sources, graphics runtime, grounded conversation, voice, accessible reading, publishing, security, operations and launch. The Law Machine is outside scope. Every unit is required for the full specified release; small previews can ship earlier only with accurate labels.

The IDs below are stable work-unit IDs, not GitHub PR numbers. No PR has been created by this planning package. One unit normally becomes one focused PR; split large units into several explicitly mapped PRs without dropping scope or renumbering the plan. Do not fabricate repository names, completion states, provider credentials, source versions or runtime evidence.

## Execution rules

Read ARCHITECTURE.md, this document, planning/work-units.json, spec/CONTRACTS.ts and the actual repository AGENTS.md. AB-001 binds the real repository and installs the candidate units as registry/prs.json. The included shared parser is a dated compatibility reference; compare it with the current Boardroom contract before activation. The active registry is the only machine-readable implementation plan. Keep narrative scope documents synchronized and do not create a second milestone importer.

Choose a unit only when its dependencies have accepted implementation evidence. A gate requires its operational checks, not merely merged code. Continue unrelated ready work if a specific live operation lacks credentials or a complete bill source. Never mark fake-provider testing as a real integration or a placeholder mesh as a finished character. Record current-head CI results before merge and follow the actual repository merge preflight. CircleCI is the intended pipeline.

An outside human security auditor, paid penetration test, independent human sign-off and certification are not prerequisites. Perform and document substantive AI-assisted review, fix concrete vulnerabilities and pass required tests. Do not bypass a real failing test. Existing user authorization and repository policy govern implementation and deployment; this package adds no broad permission workflow.

## Required PR contents

Lead the PR title with its exact stable ID. Explain the resulting behavior, include paths and dependencies, and list validation tied to the actual head SHA. Attach relevant source and asset hashes, deterministic screenshots or video, accessibility or grounding results, rollback instructions and remaining concrete limitations. No raw secrets, private conversation, personal microphone samples or confidential documents belong in public PRs.

Each unit below specifies scope, acceptance, verification and rollback. Add a per-unit evidence file using evidence/UNIT_TEMPLATE.md. Update real PR mappings after creation and actual observed state after retrieval. Preserve the separate fields for implementation, automated tests, operational acceptance, external review and certification. A unit is complete only when its acceptance criteria have evidence. A new follow-up defect reopens operational acceptance even when the original PR was merged.

## Standard local commands to implement

AB-002 must install actual package scripts for pnpm install --frozen-lockfile, pnpm lint, pnpm typecheck, pnpm test, pnpm build and pnpm registry:validate. Later units add pnpm content:validate, pnpm assets:validate, pnpm test:e2e, pnpm test:a11y, pnpm eval:grounding and pnpm test:live. These are target interfaces for the future repository, not claims that the application commands exist in this planning package. scripts/validate-plan.mjs validates this package now.

Character builds must be reproducible from documented pinned Blender CLI invocations without relying on an unsaved interactive scene. Publish and deployment scripts take named environment references, never command-line raw secrets. Each added command must have a help mode and an operational runbook when it can mutate data.

## Milestones and dependency lanes

| Phase | Units | Count | Acceptance gate |
|---|---|---|---|
| F1 Foundation and delivery controls | AB-001 through AB-012 | 12 | G1 |
| F2 Sources and publishing | AB-013 through AB-028 | 16 | G2 |
| F3 Grounded conversation | AB-029 through AB-044 | 16 | G3 |
| F4 Original character production | AB-045 through AB-062 | 18 | G4 |
| F5 Rendering and page performance | AB-063 through AB-078 | 16 | G5 |
| F6 Voice and conversation timing | AB-079 through AB-088 | 10 | G6 |
| F7 Complete public and publisher product | AB-089 through AB-100 | 12 | G7 |
| F8 Security operations and production release | AB-101 through AB-112 | 12 | G8 |

Foundation opens three useful lanes: content starts at AB-013, grounded conversation starts once the core source contracts are ready, and original character work starts at AB-045 after design and asset foundations. Rendering uses exported candidate assets before the finished-character gate, but final acceptance requires AB-062. Voice can begin while page movement is being refined. The exact local dependency lists control readiness; the order in this document is topological and does not require finishing an unrelated lane first.

The first useful preview combines a readable source, a source drawer and a static original character. The conversation preview adds validated bill explanations. The cinematic preview adds accepted movement and gestures. The full production release requires the complete character, voice, accessibility, child-safe learning and operational gates. No calendar promise is attached: estimate elapsed time from measured CI, graphics iteration and actual provider readiness.

## External inputs without blocking other work

The exact repository and selected domain have not been verified for Ask Bill. Live provider accounts, secrets and hosting spend must be configured for enabled live integrations. The full electronic filing draft must be supplied or found in its authoritative selected version before its complete public pack can pass. Local development, schema work, rendering, animation, curated content and fixture tests remain available. Physical-device testing requires a device or a real remote-device service; record any gap instead of relabeling emulation as hardware evidence.

The child experience starts with curated local questions and licensed pre-generated speech. The plan also builds parent-initiated verifiable consent and restricted live sessions. Under-13 free text remains disabled until the real consent adapter and provider data protections pass; no consent checkbox or fake token satisfies that gate. English plus the Spanish reference path validate the localization architecture; additional complete language packs are subsequent scoped additions. Payments, political targeting, social feeds, law simulation and automatic government filing are excluded.

## Detailed work units

## F1 Foundation and delivery controls

### AB-001 Repository binding and canonical plan

Dependencies: None. Priority: P0. Gate: G1.

Paths: AGENTS.md, registry/, docs/.

Scope: Bind the verified GitHub repository identity; install this architecture and all 112 units in the existing shared registry contract; retain evidence policy and stable IDs.

Acceptance: The canonical registry has exactly 112 unique units, no invented PR mappings, and no active alternative roadmap.

Verification: Run the shared parser, cycle and dependency checks, and compare every unit with this plan; test that a changed repository identity is rejected.

Rollback: Restore prior planning files without discarding any approved scope or real PR evidence.

### AB-002 Toolchain workspace and CircleCI

Dependencies: AB-001. Priority: P1. Gate: G1.

Paths: package.json, pnpm-workspace.yaml, .circleci/, toolchain.json.

Scope: Create the TypeScript monorepo, pinned Node and pnpm versions, lint, types, unit checks, build jobs and dependency cache.

Acceptance: A fresh checkout builds repeatably; required checks fail on an intentional defect; no accidental GitHub Actions build competes with CircleCI.

Verification: Run the cold-install pipeline and deliberate type-error negative test on a disposable branch; retain head-bound CI IDs.

Rollback: Revert workspace changes and preserve the registry plus reproducible toolchain manifest.

### AB-003 Runtime contracts and architecture decisions

Dependencies: AB-002. Priority: P0. Gate: G1.

Paths: packages/contracts/, docs/adr/, spec/.

Scope: Implement schemas for versions, spans, answer claims, events, cues, roles and asset manifests; document source and presentation trust boundaries.

Acceptance: Invalid source spans, unknown cue types and wrong-version events are rejected by server and client contract tests.

Verification: Round-trip valid fixtures and fuzz unknown fields, Unicode boundaries, oversize inputs and incompatible schema versions.

Rollback: Pin consumers to the prior contract version and reject incompatible messages.

### AB-004 Accessible product shell and design tokens

Dependencies: AB-002, AB-003. Priority: P1. Gate: G1.

Paths: apps/web/, packages/ui/.

Scope: Build bill picker, readable page, conversation panel, character dock, source drawer, mobile sheet and all loading or empty states.

Acceptance: Keyboard order and semantic structure work before graphics or live AI; 320 CSS pixel width and large text remain usable.

Verification: Run keyboard and axe checks plus responsive screenshots of every core state; test failed JavaScript hydration.

Rollback: Keep the semantic reader and disable incomplete interactive panels through a feature flag.

### AB-005 Environment adapters and local development

Dependencies: AB-002, AB-003. Priority: P1. Gate: G1.

Paths: packages/config/, infra/, scripts/dev/.

Scope: Define validated environment configuration, fake provider adapters, local database and storage, sample data and one documented startup command.

Acceptance: Missing production credentials produce named capability errors while local reading, fake AI and asset development remain usable.

Verification: Start from a clean machine profile and verify secrets never enter client bundles or committed examples.

Rollback: Disable affected live adapters and keep local fixture mode working.

### AB-006 Binary asset ownership and reproducibility

Dependencies: AB-001, AB-002. Priority: P1. Gate: G1.

Paths: assets/, tools/assets/, .gitattributes.

Scope: Select Git LFS or versioned asset storage; record editable source paths, hashes, license fields, generated outputs and fetch tooling.

Acceptance: A clean checkout can obtain exact authorized source assets; missing pointers or mismatched hashes fail the build.

Verification: Delete cached assets, re-fetch a test source, validate hashes and verify an intentionally broken pointer is detected.

Rollback: Restore the previous asset manifest and keep old immutable runtime assets available.

### AB-007 Database schema migrations and access boundaries

Dependencies: AB-003, AB-005. Priority: P0. Gate: G1.

Paths: packages/db/, migrations/.

Scope: Create bill, version, provision, publisher, session, job, outbox, usage and audit tables with scoped keys and retention indexes.

Acceptance: Foreign keys and publisher-scoped queries prevent cross-publisher reads; migrations are repeatable and backward compatible.

Verification: Migrate an empty and populated database, test authorization on guessed IDs, and exercise expand then rollback compatibility.

Rollback: Roll back application code to the compatible schema; avoid destructive down migrations.

### AB-008 Publisher authentication roles and MFA

Dependencies: AB-004, AB-005, AB-007. Priority: P1. Gate: G1.

Paths: packages/auth/, apps/web/admin/.

Scope: Implement an adapter-backed publisher login, owner/editor/viewer roles, secure sessions, MFA for publication and protected membership changes.

Acceptance: Unauthenticated and wrong-role users cannot upload, publish, withdraw or invite; public reading has no login wall.

Verification: Run CSRF, expired-session, privilege-escalation, role-change and MFA recovery tests using a real staging auth adapter when configured.

Rollback: Revoke affected sessions and disable publisher writes while retaining published read access.

### AB-009 Object storage signed access and manifests

Dependencies: AB-005, AB-007, AB-008. Priority: P1. Gate: G1.

Paths: packages/storage/, infra/storage/.

Scope: Separate private quarantine, private source and public immutable artifacts; add bounded signed uploads and downloads, checksum checks and CORS rules.

Acceptance: Private bytes cannot be fetched through public URLs; signed tokens expire and bind to the allowed object and size.

Verification: Test unauthorized object enumeration, replay, MIME spoofing, corrupt upload and expiration with the staging storage adapter.

Rollback: Revoke upload capability and restore prior published manifests; keep immutable objects unchanged.

### AB-010 Durable jobs outbox and fencing

Dependencies: AB-007, AB-009. Priority: P1. Gate: G1.

Paths: apps/worker/, packages/jobs/.

Scope: Build PostgreSQL leases, heartbeats, deduplication, retry and dead-letter states, transactional outbox delivery and fenced commits.

Acceptance: Crashed workers do not double-publish; stale lease holders cannot commit; failed jobs have actionable diagnostics.

Verification: Kill a worker mid-job, deliver duplicate outbox events and race two lease owners against the same record.

Rollback: Pause the queue and replay durable uncommitted jobs with the previous compatible worker.

### AB-011 Threat model and privacy inventory

Dependencies: AB-003, AB-007, AB-008, AB-009. Priority: P0. Gate: G1.

Paths: docs/security/, docs/privacy/.

Scope: Enumerate source injection, file parsing, publisher isolation, cost abuse, child data, model tools and all provider data flows; assign concrete mitigations.

Acceptance: Every sensitive flow has an owner module, retention rule and verification case; no outside human-audit prerequisite is introduced.

Verification: Trace a question, microphone request, upload and publish through the inventory; verify secrets and personal content are excluded from standard logs.

Rollback: Disable an uncovered data flow until its concrete controls are implemented.

### AB-012 Preview infrastructure and health signals

Dependencies: AB-002, AB-005, AB-007, AB-010, AB-011. Priority: P1. Gate: G1.

Paths: infra/render.yaml, apps/web/health/, docs/ops/.

Scope: Define isolated local, preview and staging services with secret references, migration sequencing, readiness, liveness and worker drain behavior.

Acceptance: Preview cannot reach production secrets or data; deployments expose meaningful build and schema versions.

Verification: Deploy staging when credentials exist, interrupt shutdown, and verify readiness fails for missing mandatory dependencies.

Rollback: Revert to the previous service image and version-compatible database schema.

## F2 Sources and publishing

### AB-013 Provenance and immutable source records

Dependencies: AB-003, AB-007, AB-009. Priority: P1. Gate: G2.

Paths: packages/content/provenance/.

Scope: Store original bytes, source URL, retrieval time, publisher identity, byte hash and canonicalization version; make each import immutable.

Acceptance: A source record can be traced back to exact bytes; re-import never silently overwrites a published version.

Verification: Import identical and changed bytes twice and verify deduplication, provenance links and immutable version boundaries.

Rollback: Withdraw the new import pointer and preserve prior source records.

### AB-014 Upload quarantine and extraction sandbox

Dependencies: AB-009, AB-010, AB-011, AB-013. Priority: P1. Gate: G2.

Paths: apps/worker/sandbox/, packages/content/intake/.

Scope: Implement file signature checks, archive expansion limits, malware hooks, network-denied extraction and per-job CPU, memory and time budgets.

Acceptance: Macros, XXE, zip bombs, active objects and remote-resource fetches cannot execute or escape extraction.

Verification: Run malicious PDF/DOCX/XML fixtures, oversized archives and timeouts; verify no production credential exists in the sandbox.

Rollback: Stop extraction jobs and retain isolated quarantine metadata for investigation.

### AB-015 Text Markdown and DOCX ingestion

Dependencies: AB-014. Priority: P1. Gate: G2.

Paths: packages/content/parsers/.

Scope: Extract exact text, nested headings, lists, footnotes and tables from supported text, Markdown and DOCX files without executing embedded content.

Acceptance: Canonical text preserves substantive wording and source locators; parse warnings are visible and do not auto-correct language.

Verification: Compare fixture extractions with golden source text including smart quotes, symbols, tables and tracked-change handling.

Rollback: Revert parser version and rebuild only affected unpublished derivations.

### AB-016 PDF extraction and OCR quality workflow

Dependencies: AB-014. Priority: P1. Gate: G2.

Paths: packages/content/pdf/, apps/web/admin/extraction/.

Scope: Add native PDF text, scan detection, bounded OCR, page thumbnails and confidence or missing-page warnings with correction tools.

Acceptance: An incomplete scan cannot become an authoritative published pack; source pages remain inspectable alongside extracted text.

Verification: Use multicolumn, scanned, rotated, missing-page and low-resolution fixtures; verify exact quotations against page evidence.

Rollback: Quarantine affected versions and restore a prior verified extraction generation.

### AB-017 Legislative XML parser and hierarchy

Dependencies: AB-014, AB-015. Priority: P1. Gate: G2.

Paths: packages/content/xml/.

Scope: Support the selected official federal XML dialect; normalize nested legislative units while preserving original identifiers and unknown structures.

Acceptance: Deep nesting and unusual labels retain exact text and stable hierarchy; unsupported tags produce explicit warnings.

Verification: Parse real official XML samples and hostile entities; compare reconstructed order and span boundaries against sources.

Rollback: Fall back to a labeled source-text preview and disable affected structured publication.

### AB-018 Provision anchors Unicode and source spans

Dependencies: AB-015, AB-016, AB-017. Priority: P0. Gate: G2.

Paths: packages/content/anchors/, packages/contracts/.

Scope: Generate version-specific provision anchors, code-point offsets, source locators and quote hashes; implement UTF-16 boundary conversion in browsers.

Acceptance: A citation selects identical wording in storage and DOM even with emoji, combining characters, ligatures and normalized whitespace.

Verification: Round-trip span fixtures and property-test random Unicode strings and invalid ranges.

Rollback: Reject incompatible spans and keep original-source links available.

### AB-019 Definitions cross references and exceptions

Dependencies: AB-018. Priority: P1. Gate: G2.

Paths: packages/content/references/.

Scope: Extract scoped definitions, internal and external references, exceptions, timing clauses and unresolved links into a typed relation graph.

Acceptance: Retrieval can follow controlling definitions and exceptions; ambiguous links are visible rather than guessed.

Verification: Resolve hand-labeled complex references and verify no exception is dropped in designated fixtures.

Rollback: Remove the affected graph generation and use explicit provision retrieval.

### AB-020 Official Congress source connector

Dependencies: AB-013, AB-017, AB-018. Priority: P1. Gate: G2.

Paths: packages/content/connectors/congress/.

Scope: Import bill identity, text versions and status from documented official APIs; implement rate limits, retries, ETags and provenance.

Acceptance: A selected official version can be re-imported reproducibly and has no fabricated identifier or status.

Verification: Run fixture tests plus a live staging import when an API credential is available; compare API records with published source metadata.

Rollback: Pause the connector and display the last verified refresh date.

### AB-021 Version lifecycle status and freshness

Dependencies: AB-007, AB-013, AB-018, AB-020. Priority: P1. Gate: G2.

Paths: packages/content/versions/, apps/web/bills/.

Scope: Implement draft, introduced, passed, enacted and effective status evidence; immutable versions, stale-source banners and explicit version switching.

Acceptance: Enacted and effective states remain distinct; an old conversation never silently follows a newer version.

Verification: Change a fixture's status and text independently and verify pinned answers and visible freshness behavior.

Rollback: Pin public pointers to the last verified release and disable the refresh job.

### AB-022 Amendments and computed comparison view

Dependencies: AB-018, AB-019, AB-021. Priority: P1. Gate: G2.

Paths: packages/content/amendments/.

Scope: Represent insert, strike, replace, repeal and redesignation with citations; build before/after views and conflict reporting.

Acceptance: Computed amended text is labeled; ambiguous amendments cannot produce an authoritative combined document.

Verification: Apply and reject golden amendment fixtures, including shifted numbering and conflicting edits.

Rollback: Disable computed comparisons and preserve the original texts side by side.

### AB-023 Lexical search and derived index generations

Dependencies: AB-007, AB-018, AB-019. Priority: P1. Gate: G2.

Paths: packages/content/search/, apps/worker/index/.

Scope: Build provision full-text indexes and scoped search with complete index-generation hashes and atomic activation.

Acceptance: Search returns the selected bill version only; a failed index job cannot replace a complete published index.

Verification: Query definitions, exact phrases and removed clauses across versions, then interrupt an index activation.

Rollback: Restore the previous complete index-generation pointer.

### AB-024 Publishing review and immutable release packs

Dependencies: AB-008, AB-010, AB-016, AB-018, AB-021, AB-023. Priority: P0. Gate: G2.

Paths: apps/web/admin/publish/, packages/content/releases/.

Scope: Build extraction review, source-bound QA records, evaluated release manifests, atomic publish, archive and withdraw actions.

Acceptance: Only permitted publishers publish complete verified packs; readers never see half-built files or stale related indexes.

Verification: Fail publication after object upload but before pointer activation, race concurrent publishers and verify withdrawal cache invalidation.

Rollback: Withdraw the faulty release and atomically reactivate the previous compatible manifest.

### AB-025 Electronic filing reference pack

Dependencies: AB-018, AB-019, AB-021, AB-024. Priority: P1. Gate: G2.

Paths: content/packs/electronic-filing/, tests/fixtures/.

Scope: Preserve exact supplied passages with incomplete-source metadata; ingest the full chosen draft when available; author questions about receipt, routing, correction and denials.

Acceptance: Supplied excerpts work as fixtures but cannot be labeled the full bill; final public pack requires a complete source and status review.

Verification: Verify original-receipt and wrong-agency questions against exact supplied wording; test missing definitions and omitted opening sections.

Rollback: Keep the incomplete fixture private and publish no invented reconstruction.

### AB-026 Additional bill fixtures and large document cases

Dependencies: AB-018, AB-020, AB-021, AB-024. Priority: P1. Gate: G2.

Paths: content/packs/reference/, tests/fixtures/.

Scope: Add at least two official bills of different structure plus a very long synthetic stress document clearly labeled as synthetic.

Acceptance: The platform is reusable beyond the first bill and handles nested definitions, amendments and long navigation without special hard-coded logic.

Verification: Re-run extraction, anchors, search and page navigation against all packs; verify source licenses and provenance.

Rollback: Unpublish the affected pack while retaining the functioning reference corpus.

### AB-027 Publisher source correction and audit history

Dependencies: AB-008, AB-018, AB-024. Priority: P1. Gate: G2.

Paths: apps/web/admin/corrections/, packages/content/audit/.

Scope: Provide visible extraction corrections, new-version creation, source comparison and signed-in actor audit trails without silent source replacement.

Acceptance: A correction invalidates dependent drafts and preserves prior published evidence and version URLs.

Verification: Correct one character in a cited passage and verify new hashes, invalidated answers and retained old source access.

Rollback: Withdraw the corrected version and restore its prior release pointer.

### AB-028 Content gate and ingestion failure recovery

Dependencies: AB-012, AB-024, AB-025, AB-026, AB-027. Priority: P0. Gate: G2.

Paths: tests/integration/content/, docs/ops/content/.

Scope: Complete the ingestion and publication runbook, retry tooling, dead-letter review and source-integrity gate for all supported formats.

Acceptance: The content pipeline passes exactness and isolation checks and can recover a failed job without duplicate publication.

Verification: Execute the full import-to-publish flow with a worker crash, corrupted source, unavailable API and withdrawn release.

Rollback: Disable intake independently from public reading and restore the last complete content release.

## F3 Grounded conversation

### AB-029 Question routing and source permissions

Dependencies: AB-003, AB-011, AB-018, AB-021. Priority: P1. Gate: G3.

Paths: packages/grounding/router/.

Scope: Classify question type and permitted scope; keep bill interpretation, current law, hypothetical and personal application distinct.

Acceptance: Each request has a version-pinned allowed corpus and cannot select another publisher's private sources.

Verification: Test misleading question labels, prompt injection and forged publisher or version IDs.

Rollback: Return curated source explanations and disable affected routing classes.

### AB-030 Provider adapters capability checks and cancellation

Dependencies: AB-003, AB-005, AB-029. Priority: P1. Gate: G3.

Paths: packages/providers/, packages/grounding/.

Scope: Implement structured-generation adapters, deterministic fake provider, capability discovery, timeouts, abort and normalized provider errors.

Acceptance: Provider changes do not alter the public answer schema; cancellation reaches the upstream call and old output is ignored.

Verification: Exercise a fake stream and one configured live provider with timeout, malformed JSON, cancellation and retry cases.

Rollback: Disable the failing provider and retain curated responses plus readable sources.

### AB-031 Evidence retrieval and dependency expansion

Dependencies: AB-019, AB-023, AB-029. Priority: P1. Gate: G3.

Paths: packages/grounding/retrieval/.

Scope: Combine lexical retrieval, parent/child expansion, definitions, exceptions and timing clauses; benchmark optional vector retrieval before enabling it.

Acceptance: Must-pass evidence sets include decisive exceptions and exclude wrong versions or private documents.

Verification: Measure recall on labeled questions and deliberately adversarial near-duplicate provisions; compare vector and lexical-only baselines.

Rollback: Revert to the strongest evaluated retrieval configuration and index generation.

### AB-032 Claim envelope and exact citation validation

Dependencies: AB-003, AB-018, AB-030, AB-031. Priority: P0. Gate: G3.

Paths: packages/grounding/claims/.

Scope: Implement typed claims, exact source spans, permitted evidence IDs, quote hashes and source links; reject invented citations deterministically.

Acceptance: Every accepted legal-text citation resolves to exact wording in the selected version; unsupported claim types cannot masquerade as bill text.

Verification: Mutate span offsets, quote text, source version and citation URLs and require rejection.

Rollback: Suppress invalid answer segments and show a source-only recovery response.

### AB-033 Support checks exception preservation and repair

Dependencies: AB-031, AB-032. Priority: P1. Gate: G3.

Paths: packages/grounding/validation/.

Scope: Add evidence entailment review, decisive-exception checks, bounded repair and supported partial answers with explicit uncertainty.

Acceptance: Unsupported predictions and omitted decisive exceptions cannot pass the must-pass set; repair never loops indefinitely.

Verification: Run contradictory evidence, incomplete source and misleading premise cases with held-out assessments.

Rollback: Disable the changed prompt or validator and restore its prior evaluated release.

### AB-034 Anonymous sessions quotas and usage ledger

Dependencies: AB-007, AB-011, AB-029, AB-030. Priority: P1. Gate: G3.

Paths: packages/sessions/, packages/usage/.

Scope: Implement short-lived capabilities, transactionally reserved budgets, idempotent settlement, expiry and global generation ceilings.

Acceptance: Duplicate requests charge once; concurrent calls cannot bypass limits; public reading survives a generation shutdown.

Verification: Race budget reservations, abort upstream requests, replay idempotency keys and test provider billing reconciliation.

Rollback: Stop new live generations while preserving reading and completed answers.

### AB-035 Validated answer streaming and replay

Dependencies: AB-003, AB-030, AB-032, AB-033, AB-034. Priority: P1. Gate: G3.

Paths: apps/web/api/answers/, packages/streaming/.

Scope: Emit approved segments over sequenced SSE with bounded replay, Last-Event-ID, conversation epochs and cancellation.

Acceptance: No raw model token reaches the visitor; late or wrong-version events cannot revive cancelled text, speech or cues.

Verification: Disconnect and reconnect mid-answer, replay old event IDs, reorder events and switch document versions while generation runs.

Rollback: Use whole-answer validation and nonstreaming delivery until streaming passes.

### AB-036 Citation cards source drawer and answer states

Dependencies: AB-004, AB-018, AB-032, AB-035. Priority: P1. Gate: G3.

Paths: apps/web/conversation/, packages/ui/citations/.

Scope: Render claim labels, source quotes, uncertainty, partial and correction states with reliable return navigation.

Acceptance: Visitors can inspect every claim's exact source without Bill, audio or a graphics context.

Verification: Navigate all citation types by keyboard and screen reader and test unresolved or withdrawn spans.

Rollback: Show a plain answer transcript and original-source links.

### AB-037 Current law background and as of comparisons

Dependencies: AB-020, AB-021, AB-022, AB-029, AB-033. Priority: P1. Gate: G3.

Paths: packages/grounding/background/.

Scope: Add approved primary-source imports for existing law and dated side-by-side comparisons; keep background apart from draft assertions.

Acceptance: An unsupported statement about current law is withheld; jurisdiction and retrieval dates accompany supported comparisons.

Verification: Test a draft that misdescribes existing law and source updates that invalidate an old comparison.

Rollback: Disable live comparisons and retain bill-only explanations.

### AB-038 Prompt injection and hostile question defenses

Dependencies: AB-011, AB-030, AB-031, AB-032, AB-035. Priority: P0. Gate: G3.

Paths: tests/adversarial/, packages/grounding/policy/.

Scope: Harden source delimiters, read-tool allowlists, safe component rendering and refusal of model-supplied execution or secret requests.

Acceptance: Malicious bill text cannot run code, leak a secret, change the corpus or emit active HTML.

Verification: Attack uploaded text, retrieved snippets, conversation history, markdown links and forged tool outputs.

Rollback: Disable affected tools or content packs and use source-only explanations.

### AB-039 Objections disputed readings and unknown answers

Dependencies: AB-029, AB-033, AB-036, AB-037. Priority: P1. Gate: G3.

Paths: packages/grounding/explanations/, content/cards/.

Scope: Implement attributed objections, competing interpretations, implementation limits and direct unknown states without forced certainty.

Acceptance: Sponsor arguments are labeled, important objections are discoverable and unsupported cost predictions are not invented.

Verification: Evaluate leading pro and anti questions against identical evidence and inspect material differences in treatment.

Rollback: Replace affected generated answers with curated balanced source cards.

### AB-040 Evaluation corpus scoring and held out suite

Dependencies: AB-025, AB-026, AB-032, AB-033, AB-037, AB-038, AB-039. Priority: P1. Gate: G3.

Paths: tests/evals/, tools/evals/.

Scope: Create at least 240 cases with at least 80 adversarial or ambiguous cases; label evidence, exceptions, status and unsupported conclusions.

Acceptance: Held-out cases are separated from tuning; score reports identify exact model, prompts, sources and validator hashes.

Verification: Run citation, recall, support and status scoring with spot-checked annotations and known deliberately bad answers.

Rollback: Block the regressed model configuration and retain the last passing evaluation baseline.

### AB-041 Reading levels explanations and privacy defaults

Dependencies: AB-011, AB-033, AB-036, AB-039. Priority: P1. Gate: G3.

Paths: packages/grounding/style/, apps/web/preferences/.

Scope: Add concise, standard and simple explanations that preserve legal conditions; default to ephemeral history and minimal data collection.

Acceptance: Simpler wording retains decisive exceptions; no reading preference is used as a claim about the visitor's age.

Verification: Compare all reading levels on the same exception-heavy questions and inspect retained request fields.

Rollback: Restore standard explanations and remove any persisted preference not covered by policy.

### AB-042 Public answer caching provider fallback and budgets

Dependencies: AB-021, AB-030, AB-033, AB-034, AB-040. Priority: P1. Gate: G3.

Paths: packages/grounding/cache/, packages/usage/.

Scope: Cache only approved public nonpersonal responses by complete configuration key; add circuit breakers and a readable degraded mode.

Acceptance: Version changes and validator fixes invalidate the right entries; personal or session content never enters a shared cache.

Verification: Mix personal and public questions, change corpus hashes, force provider errors and exhaust budgets during traffic.

Rollback: Purge affected cache keys and fall back to curated answers.

### AB-043 Answer feedback corrections and incident controls

Dependencies: AB-008, AB-027, AB-035, AB-036, AB-040. Priority: P1. Gate: G3.

Paths: apps/web/feedback/, apps/web/admin/answers/.

Scope: Add explicit redacted feedback submission, answer-template suppression, visible corrections and source-bound incident records.

Acceptance: A reported defect can be disabled without deleting audit evidence or exposing private user conversation.

Verification: Submit redacted feedback, suppress an answer hash, apply a correction and verify old shared references show the correction.

Rollback: Disable the affected answer or pack and keep public source access available.

### AB-044 Grounded conversation acceptance gate

Dependencies: AB-028, AB-035, AB-036, AB-037, AB-038, AB-039, AB-040, AB-041, AB-042, AB-043. Priority: P0. Gate: G3.

Paths: tests/acceptance/grounding/, evidence/.

Scope: Run live-provider staging evaluation and end-to-end question-to-source checks; fix actual unsupported claims and retain evidence.

Acceptance: All must-pass cases satisfy source integrity and status rules; broader support target is met with no unresolved serious legal misstatements.

Verification: Run the held-out suite, outages, quota exhaustion and personal-case tests against the exact release candidate.

Rollback: Pin the previous passing configuration or disable live AI while reading and curated tours continue.

## F4 Original character production

### AB-045 Original character brief and provenance

Dependencies: AB-004, AB-006, AB-011. Priority: P1. Gate: G4.

Paths: assets/bill/design/, docs/character/.

Scope: Write the Folded Folio design bible, originality constraints, personality, proportions, palette, expression vocabulary and source-provenance ledger.

Acceptance: The character is independently specified in shape, face, costume, voice and gestures; no copied seal, song or signature design is required.

Verification: Compare silhouette and expression references against the originality checklist and document distinct design decisions.

Rollback: Retain the brief and replace an overly similar design direction before production.

### AB-046 Concept candidates and selected design

Dependencies: AB-045. Priority: P1. Gate: G4.

Paths: assets/bill/design/concepts/, tools/blender/concepts/.

Scope: Produce three materially distinct original candidates, turnarounds, silhouettes and expression studies; select one through documented visual review.

Acceptance: A selected design reads clearly at mobile scale and has front, side, back and three-quarter references sufficient for modeling.

Verification: Render monochrome and 96-pixel comparisons and inspect legibility, appeal, uniqueness and facial range.

Rollback: Preserve the candidate set and switch the selected design manifest without losing provenance.

### AB-047 Parametric Blender blockout

Dependencies: AB-002, AB-006, AB-046. Priority: P1. Gate: G4.

Paths: tools/blender/blockout.py, assets/bill/source/.

Scope: Build a scriptable body, folds, layered pages, arms, hands, eyes and feet with measured proportions and scene units.

Acceptance: A clean Blender batch run recreates the selected blockout with named editable objects and stable scale.

Verification: Rebuild from a clean scene, compare turntable views with references and inspect contact-plane and origin alignment.

Rollback: Revert the blockout parameter set and keep downstream assets tied to its source hash.

### AB-048 Production topology and deformation mesh

Dependencies: AB-047. Priority: P1. Gate: G4.

Paths: assets/bill/source/mesh/, tools/blender/mesh/.

Scope: Refine face, folds, joints and limbs with deformation-ready topology, clean normals, UV seams and separate material regions.

Acceptance: Stress poses do not collapse page edges, eyelids, hands or knees; no unintended holes or nonmanifold geometry remain.

Verification: Run geometry audits and render bent-limb, compressed-body and extreme-expression pose tests.

Rollback: Restore the last clean mesh and regenerate dependent exports.

### AB-049 UV layout high detail bake and textures

Dependencies: AB-048. Priority: P1. Gate: G4.

Paths: assets/bill/source/textures/, tools/blender/bake/.

Scope: Author UV atlases and original paper, edge, roughness, normal and color detail; bake high-resolution detail to runtime meshes.

Acceptance: Textures have no visible seam or excessive shimmer and preserve readable face features at small size.

Verification: Render close and thumbnail views under varied lighting and inspect mip transitions, UV density and color spaces.

Rollback: Restore previous texture sources and rebake all derived atlases.

### AB-050 Body skeleton control rig and export bones

Dependencies: AB-048. Priority: P1. Gate: G4.

Paths: assets/bill/source/rig/, tools/blender/rig/.

Scope: Implement body and fold controls, arm IK/FK, foot IK, sockets, look targets, contact-plane origin and documented rest pose.

Acceptance: Animators can pose every required action; only expected deforming bones are exported and transforms are stable.

Verification: Run automated bone and weight checks, mirrored poses and extreme limb stress renders.

Rollback: Restore the prior rig and retain animation sources for retargeting.

### AB-051 Facial shapes expressions and correctives

Dependencies: AB-048, AB-050. Priority: P1. Gate: G4.

Paths: assets/bill/source/face/, tools/blender/face/.

Scope: Sculpt expression controls, blinks, brows, jaw and 12 to 16 speech mouth shapes with corrective combinations.

Acceptance: Curiosity, concern, thinking and uncertainty are distinguishable at 96 pixels; combined mouth and blink weights do not break the face.

Verification: Render a morph grid, phoneme extremes and random bounded combinations; inspect silhouette and intersections.

Rollback: Disable the defective morph combination and restore the last clean shape source.

### AB-052 Material look development and lighting bible

Dependencies: AB-049, AB-051. Priority: P1. Gate: G4.

Paths: assets/bill/source/lookdev/, docs/character/lighting.md.

Scope: Establish PBR materials, environment, key and fill, soft contact shadows, color management and reference renders for web parity.

Acceptance: The original character has a consistent polished appearance in light and dark interfaces without obscuring text.

Verification: Render the same poses across bright, dark and high-contrast backgrounds and inspect texture and shadow readability.

Rollback: Restore the previous look-development preset and known reference images.

### AB-053 Idle listening and thinking animation

Dependencies: AB-050, AB-051, AB-052. Priority: P1. Gate: G4.

Paths: assets/bill/source/actions/idle/.

Scope: Create restrained breathing, attentive idle, listening, acknowledgment and thinking clips with blink and gaze variants.

Acceptance: Bill appears attentive without constant distracting movement; clips loop cleanly and do not imply a political judgment.

Verification: Inspect long repeated playback and first/last-frame continuity at several playback rates.

Rollback: Return to a neutral static pose while corrected clips are rebuilt.

### AB-054 Locomotion starts stops turns and steps

Dependencies: AB-050, AB-052. Priority: P1. Gate: G4.

Paths: assets/bill/source/actions/locomotion/.

Scope: Animate in-place walking, starts, stops, left/right turns, step up/down and foot contact events with stride metadata.

Acceptance: Travel can synchronize to stride without sliding; transitions have usable contact phases and export-safe bones.

Verification: Render the golden route on flat and stepped surfaces, inspecting foot lock and start/stop blending.

Rollback: Use docked movement and the last stable locomotion set.

### AB-055 Pointing presentation reading and social gestures

Dependencies: AB-050, AB-051, AB-053. Priority: P1. Gate: G4.

Paths: assets/bill/source/actions/gestures/.

Scope: Create left/right/down points, presentation, lean-read, look-at, sit, stand, greet, farewell, emphasis and uncertainty actions.

Acceptance: Every semantic cue has a readable motion and a neutral exit; required gestures fit small screens and preserve facial visibility.

Verification: Render a gesture contact sheet and interrupted-transition sequence; inspect hands, face and contact points.

Rollback: Disable affected cues and keep neutral explanation behavior.

### AB-056 Facial and body animation layering

Dependencies: AB-051, AB-053, AB-054, AB-055. Priority: P1. Gate: G4.

Paths: tools/blender/animation/, assets/bill/source/actions/.

Scope: Define upper-body masks, facial ownership, additive blink and gaze layers, transition durations and morph normalization.

Acceptance: Speaking, walking, blinking and pointing can combine without double jaw motion, snapping or unbounded weights.

Verification: Render all designated layer combinations and random interruptions with reproducible seeds.

Rollback: Fall back to mutually exclusive safe clips until the layering defect is corrected.

### AB-057 LOD meshes atlases and compression

Dependencies: AB-048, AB-049, AB-050, AB-051, AB-056. Priority: P1. Gate: G4.

Paths: tools/blender/lod/, assets/bill/runtime/.

Scope: Produce low, medium and high meshes, reduced rigs where safe, texture atlases, KTX2 and supported mesh compression variants.

Acceptance: The initial mobile pack meets its budget and expressions remain recognizable; LOD transitions do not visibly pop.

Verification: Measure triangles, draw calls, transfer bytes and decoded memory; compare the same pose at all LODs.

Rollback: Pin to the lowest passing LOD and retain uncompressed fallback assets where needed.

### AB-058 Deterministic glTF export and asset validation

Dependencies: AB-006, AB-056, AB-057. Priority: P0. Gate: G4.

Paths: tools/blender/export.py, tools/assets/validate/.

Scope: Bake constraints, export skeletal and morph animation, enforce clip names and generate hashed manifests from clean Blender runs.

Acceptance: Every required clip and morph survives export; official glTF validation passes and repeated builds preserve semantic content.

Verification: Round-trip GLBs through loader tests, compare source/export pose samples and fail missing bones, clips or textures.

Rollback: Restore the previous manifest and immutable GLB set.

### AB-059 Poster fallback artwork and identity assets

Dependencies: AB-046, AB-052, AB-058. Priority: P1. Gate: G4.

Paths: assets/bill/fallback/, assets/brand/.

Scope: Render a transparent character poster, small avatar, optional simple 2D states, favicon and original Ask Bill wordmark assets.

Acceptance: Poster and hidden modes convey identity without animated graphics; all assets have editable sources and provenance.

Verification: Inspect at intended pixel sizes, dark/light themes and reduced-data mode; verify accessible text labels remain in DOM.

Rollback: Restore prior posters or use plain text identity while rebuilding artwork.

### AB-060 Golden performance and visual regression baseline

Dependencies: AB-053, AB-054, AB-055, AB-056, AB-058. Priority: P1. Gate: G4.

Paths: tests/visual/character/, assets/bill/review/.

Scope: Produce the 30-second greeting, walk, point, explain, uncertain, interruption and farewell sequence plus turntables and contact sheets.

Acceptance: The selected design, movement and face remain consistent across the sequence; the baseline is tied to exact source and export hashes.

Verification: Inspect the rendered sequence frame by frame at transitions and compare repeated deterministic runs.

Rollback: Reject the new baseline and restore the last visually accepted asset release.

### AB-061 Asset licenses provenance and release packaging

Dependencies: AB-045, AB-049, AB-058, AB-059, AB-060. Priority: P1. Gate: G4.

Paths: assets/bill/manifest.json, docs/character/licenses/.

Scope: Record original creation, generated references if used, external texture or voice terms, file hashes, editable sources and release compatibility.

Acceptance: No required asset has unknown ownership or missing source; a clean environment can assemble the exact package.

Verification: Audit every manifest entry and reconstruct the package without the production cache.

Rollback: Exclude the questionable asset and use original replacements or prior cleared assets.

### AB-062 Finished character acceptance gate

Dependencies: AB-058, AB-059, AB-060, AB-061. Priority: P0. Gate: G4.

Paths: tests/acceptance/character/, docs/character/.

Scope: Complete visual review and deformation, clip, source-rebuild and budget checks; fix model and animation defects rather than shipping placeholders.

Acceptance: G4 has an original finished character, all required editable sources, every required clip and passing runtime asset validation.

Verification: Run the full golden sequence and source reconstruction with documented agent inspection and a defect log.

Rollback: Keep the preview labeled unfinished and continue rendering fixes; retain the last accepted character release.

## F5 Rendering and page performance

### AB-063 Isolated Three renderer and backend parity

Dependencies: AB-003, AB-004, AB-058. Priority: P1. Gate: G5.

Paths: packages/character/renderer/.

Scope: Mount a client-only transparent stage with WebGPU, forced WebGL 2 tests, error boundaries and deterministic asset loading.

Acceptance: Both selected backends render the approved character; failure cannot take down reading or the conversation.

Verification: Test actual browser backends, intentional initialization failure and teardown/recreation with the same session.

Rollback: Switch to poster mode and preserve all DOM controls and content.

### AB-064 Animation mixer controller and layer masks

Dependencies: AB-056, AB-058, AB-063. Priority: P1. Gate: G5.

Paths: packages/character/animation/.

Scope: Implement clip playback, transitions, normalized facial weights, blink and gaze layers, locomotion phase and interruption blending.

Acceptance: Runtime matches exported golden poses and cancels actions smoothly without animation leaks.

Verification: Replay fixed pose times and randomized valid transitions; compare against source renders and bounds.

Rollback: Disable unsafe layered combinations and use the previous animation controller.

### AB-065 DOM anchors and layout revision registry

Dependencies: AB-004, AB-018. Priority: P1. Gate: G5.

Paths: packages/character/layout/, apps/web/reader/.

Scope: Register provision surfaces, source bounds, text exclusion zones, focus targets and layout revisions from measured DOM geometry.

Acceptance: Anchors survive font loading, reflow and source changes without confusing semantic IDs with visual coordinates.

Verification: Resize, change fonts, expand sections and select text while verifying revision invalidation and measured bounds.

Rollback: Use the fixed character dock and ordinary citation scrolling.

### AB-066 Coordinate conversion scroll and viewport handling

Dependencies: AB-063, AB-065. Priority: P1. Gate: G5.

Paths: packages/character/coordinates/.

Scope: Convert page CSS coordinates to canvas stage positions including scroll, visual viewport, device pixel ratio, zoom and safe insets.

Acceptance: Bill's contact point remains aligned after scroll and zoom and never follows stale screen coordinates.

Verification: Compare known DOM markers at multiple zoom, scroll and DPR values including an open mobile keyboard.

Rollback: Disable page walking and dock the character until alignment is correct.

### AB-067 Traversal graph and protected obstacle zones

Dependencies: AB-065, AB-066. Priority: P1. Gate: G5.

Paths: packages/character/navigation/.

Scope: Build bounded walkable ledges and step links; inflate obstacles for Bill's feet and body around text, controls, selection, captions and page edges.

Acceptance: A path can never cross a protected input or cover the selected passage; unreachable sources return a safe dock result.

Verification: Test dense text, popovers, sticky headers, nested scroll regions and intentionally blocked routes.

Rollback: Restrict movement to the reserved dock surface.

### AB-068 Worker path planner and stale result rejection

Dependencies: AB-003, AB-067. Priority: P1. Gate: G5.

Paths: packages/character/navigation/worker/.

Scope: Implement bounded A-star or visibility planning, cancellation, deterministic replay and layout-revision fencing.

Acceptance: Planner work stays within the agreed budget; results from old layout revisions or answer epochs are ignored.

Verification: Race resize and cancellation with planning, use worst-case obstacle graphs and test no-path termination.

Rollback: Use a direct safe dock gesture without worker planning.

### AB-069 Contact aware locomotion and foot locking

Dependencies: AB-054, AB-064, AB-066, AB-068. Priority: P1. Gate: G5.

Paths: packages/character/locomotion/.

Scope: Couple path speed to stride phases, add constrained foot contact correction, turns, step transitions and body settling.

Acceptance: Bill arrives at cited ledges without sliding or intersecting the page; contact updates cannot destabilize the reader.

Verification: Replay golden paths at differing frame rates and layouts, inspect feet and record positional error.

Rollback: Use docked explanation or a short exit/re-entry instead of a failed traversal.

### AB-070 Gaze pointer targets and source emphasis

Dependencies: AB-036, AB-055, AB-064, AB-065, AB-069. Priority: P1. Gate: G5.

Paths: packages/character/attention/.

Scope: Resolve validated citation targets to gaze and pointing offsets; coordinate text highlights with the gesture timing.

Acceptance: Bill points only to visible correct-version text and never implies an uncited source supports a claim.

Verification: Shift text during the point, withdraw a source and switch versions; verify stale target cancellation.

Rollback: Keep source highlighting and suppress the gesture when alignment is uncertain.

### AB-071 Performance director state machine

Dependencies: AB-003, AB-035, AB-064, AB-068, AB-070. Priority: P0. Gate: G5.

Paths: packages/character/director/.

Scope: Implement states, priorities, epochs and semantic-cue allowlists; map validated claims to safe local motion plans.

Acceptance: The model cannot control coordinates, selectors, scripts or arbitrary clips; hide, cancel and user interaction preempt performance.

Verification: Fuzz cue payloads and replay event races involving cancel, hide, resize, new question and late provider output.

Rollback: Disable dynamic cues and use neutral character presence with text answers.

### AB-072 Safe follow mode and off screen journeys

Dependencies: AB-036, AB-065, AB-068, AB-071. Priority: P1. Gate: G5.

Paths: apps/web/reader/follow/, packages/character/navigation/.

Scope: Implement explicit follow mode, source previews, Go there, bounded travel and exit/re-entry for long documents.

Acceptance: Manual scroll, selection and focus cancel auto-follow; no visitor waits through a multi-page walking sequence.

Verification: Navigate far-separated sections while scrolling manually and using keyboard source links.

Rollback: Disable automatic follow and use ordinary section links.

### AB-073 Mobile docking touch and keyboard geometry

Dependencies: AB-004, AB-066, AB-067, AB-071, AB-072. Priority: P1. Gate: G5.

Paths: apps/web/mobile/, packages/character/layout/.

Scope: Reserve a mobile stage, avoid safe areas and keyboards, adapt gestures and sheet controls and permit nearby walking only when it fits.

Acceptance: Typing, selection and source inspection remain unobstructed at narrow widths and large text.

Verification: Run mobile viewport, landscape, keyboard-open and dynamic-toolbar cases with touch and external keyboard.

Rollback: Force mobile poster or docked mode with the full readable interface.

### AB-074 Quality tiers memory and graphics lifecycle

Dependencies: AB-057, AB-063, AB-064, AB-069, AB-073. Priority: P1. Gate: G5.

Paths: packages/character/quality/.

Scope: Implement lazy assets, frame-time downgrade, texture and image-bitmap disposal, tab suspension, context-loss recovery and reduced-data loading.

Acceptance: Device stress lowers graphics cost without losing answer state; repeated entry and exit do not leak assets.

Verification: Run soak tests, force context loss, switch quality repeatedly and measure memory against the budget.

Rollback: Pin to the small pack or poster and disable expensive effects.

### AB-075 Pause hide reduced motion and interaction priority

Dependencies: AB-004, AB-011, AB-071, AB-073. Priority: P0. Gate: G5.

Paths: packages/character/preferences/, packages/ui/.

Scope: Implement immediately honored motion preferences, persistent local controls, keyboard shortcuts and pause/hide actions without loss of content.

Acceptance: No essential explanation requires animation; focus, selection and inputs always outrank character motion.

Verification: Start tours and answers under reduced motion, change preferences mid-action and verify keyboard and screen-reader behavior.

Rollback: Default to hidden or static Bill until interaction conflicts are resolved.

### AB-076 Performance replay recorder and choreography tools

Dependencies: AB-060, AB-071, AB-072, AB-074, AB-075. Priority: P1. Gate: G5.

Paths: tools/performance/, tests/replay/.

Scope: Add a development viewer for layouts, safe surfaces, events, clips, audio timing and deterministic replay, with private-content redaction.

Acceptance: A movement defect can be reproduced from version, layout and cue metadata without raw user conversation.

Verification: Record and replay a fixed route, alter a layout hash and verify mismatches are rejected explicitly.

Rollback: Disable recording and retain deterministic fixture replays.

### AB-077 Reader character integration and failure states

Dependencies: AB-036, AB-062, AB-070, AB-071, AB-072, AB-073, AB-074, AB-075, AB-076. Priority: P1. Gate: G5.

Paths: apps/web/experience/, tests/integration/.

Scope: Integrate grounded answers, page movement and source cards; design graphics loading, stalled movement, unavailable assets and recovery states.

Acceptance: Asking, citing and walking feel coherent while every failure leaves usable text and sources.

Verification: Execute the golden journey with failed model, asset, planner and rendering components separately.

Rollback: Disable the failing enhancement behind its feature flag and keep the reader available.

### AB-078 Integrated cinematic experience acceptance gate

Dependencies: AB-044, AB-062, AB-077. Priority: P0. Gate: G5.

Paths: tests/acceptance/performance/, evidence/.

Scope: Inspect and tune full desktop and mobile sequences for timing, appeal, source accuracy, movement comfort and input safety.

Acceptance: G5 passes both rendering backends, safe traversal, visible source alignment and the no-obstruction invariant.

Verification: Capture source-bound screen recordings, frame metrics and a documented visual review of every golden transition.

Rollback: Keep the experience in preview or docked mode until actual integration defects are fixed.

## F6 Voice and conversation timing

### AB-079 Voice direction selection and licensed identity

Dependencies: AB-011, AB-045, AB-046. Priority: P1. Gate: G6.

Paths: assets/bill/voice/, docs/character/voice.md.

Scope: Define Bill's conversational voice, pronunciation, emotional restraint and provider criteria; produce test lines and retain allowed-use terms.

Acceptance: Voice is licensed for the intended public use and does not imitate an existing actor or character.

Verification: Compare the same receipt, exception and uncertainty lines for intelligibility, warmth and pronunciation; inspect provenance.

Rollback: Use silent Bill with text and captions while a replacement voice is selected.

### AB-080 Speech synthesis adapter and safe audio delivery

Dependencies: AB-009, AB-030, AB-032, AB-034, AB-079. Priority: P1. Gate: G6.

Paths: packages/voice/tts/, apps/web/api/speech/.

Scope: Synthesize only validated segments, enforce duration and spend limits, normalize codecs and return authenticated or public-safe audio references.

Acceptance: Unvalidated model text and private audio cannot leak through public caches; cancellation stops queued synthesis and billing settlement is idempotent.

Verification: Test malformed audio, provider failure, wrong-session audio URLs, duplicate synthesis requests and budget exhaustion.

Rollback: Disable live synthesis and retain text answers plus curated licensed audio.

### AB-081 Pronunciation text mapping and timing normalization

Dependencies: AB-018, AB-032, AB-079, AB-080. Priority: P1. Gate: G6.

Paths: packages/voice/alignment/, content/pronunciation/.

Scope: Map exact displayed text to speech expansions for section numbers and abbreviations; normalize word and viseme timing formats across providers.

Acceptance: Speech transformations preserve legal meaning and maintain traceable word offsets for captions and mouth cues.

Verification: Test citations, numbers, initials, foreign names and Unicode; compare spoken output and normalized timing bounds.

Rollback: Use exact text with simple pronunciation and disable uncertain word highlighting.

### AB-082 Audio clock playback controls and autoplay

Dependencies: AB-004, AB-071, AB-080, AB-081. Priority: P1. Gate: G6.

Paths: packages/voice/playback/, packages/ui/audio/.

Scope: Implement visitor-initiated AudioContext playback, pause, resume, stop, speed, mute, replay and background-tab recovery.

Acceptance: Audio never starts unexpectedly and controls remain consistent with the visible transcript and performance state.

Verification: Deny autoplay, interrupt playback, change speed and background the tab while checking monotonic timing and controls.

Rollback: Stop audio and keep the answer readable without resetting the conversation.

### AB-083 Facial lip sync and speech gesture scheduling

Dependencies: AB-051, AB-064, AB-071, AB-081, AB-082. Priority: P1. Gate: G6.

Paths: packages/character/speech/.

Scope: Drive mouth shapes from the audio clock, coarticulate compatible visemes, mix expressions and align emphasis cues.

Acceptance: Supported timing providers meet the 100 ms target in reference lines; jaw and expression layers do not double-animate.

Verification: Compare mouth events and audio in frame captures at multiple speeds and during buffer stalls.

Rollback: Use restrained approximate mouth movement or silent gestures when timing is unavailable.

### AB-084 Captions transcript and accessible speech status

Dependencies: AB-036, AB-075, AB-081, AB-082, AB-083. Priority: P1. Gate: G6.

Paths: packages/ui/captions/, apps/web/conversation/.

Scope: Build selectable captions, readable transcript, speaker status, citation visibility and correct screen-reader announcements.

Acceptance: Muting audio or hiding Bill removes no information; captions and exact sources remain accessible.

Verification: Run caption-only and screen-reader journeys including paused, corrected, interrupted and failed audio.

Rollback: Show the complete validated text transcript and disable timed highlighting.

### AB-085 Push to talk recognition and transcript editing

Dependencies: AB-005, AB-011, AB-034, AB-041, AB-082, AB-084. Priority: P1. Gate: G6.

Paths: packages/voice/stt/, apps/web/microphone/.

Scope: Add explicit microphone permission, recording indicator, bounded input, stop/cancel, transcription preview and editable text before submission.

Acceptance: No audio is recorded before permission or sent after cancel; denied or unsupported microphones leave typed questions usable.

Verification: Test codecs and real configured STT, revoked permission, silence, network loss and edited transcription; inspect deletion timing.

Rollback: Disable microphone entry and preserve typing and output speech.

### AB-086 Barge in interruption and conversation epochs

Dependencies: AB-035, AB-071, AB-080, AB-082, AB-083, AB-084, AB-085. Priority: P0. Gate: G6.

Paths: packages/voice/interruption/, tests/integration/.

Scope: Coordinate a new question or stop action with cancellation of generation, audio, captions, lip sync and pending motion.

Acceptance: An old answer cannot resume from a late speech or SSE event; the character returns smoothly to a safe state.

Verification: Race new input, speech delivery, disconnect and source-version changes with deterministic event injection.

Rollback: Use explicit stop-before-new-answer behavior until concurrency passes.

### AB-087 Curated speech assets offline audio and voice QA

Dependencies: AB-024, AB-061, AB-079, AB-080, AB-081, AB-084, AB-086. Priority: P1. Gate: G6.

Paths: content/audio/, tools/voice/, tests/voice/.

Scope: Pre-generate licensed tour audio with captions and hashes; cache only public assets and provide a representative pronunciation and quality review set.

Acceptance: Curated learning works without a live provider and matches the exact versioned explanation text.

Verification: Disconnect providers, verify audio hashes and test an updated source invalidating its old tour audio.

Rollback: Fall back to the approved text tour and remove stale speech assets from the active manifest.

### AB-088 Voice experience acceptance gate

Dependencies: AB-078, AB-080, AB-081, AB-082, AB-083, AB-084, AB-085, AB-086, AB-087. Priority: P0. Gate: G6.

Paths: tests/acceptance/voice/, evidence/.

Scope: Run live synthesis and recognition tests, permission states, device failures, timing, cancellation and privacy retention verification.

Acceptance: G6 demonstrates optional voice on supported platforms with complete text/caption fallback and no unresolved privacy or interruption defects.

Verification: Record the exact browser/provider/device matrix and replay golden spoken questions with measured timing and cleanup evidence.

Rollback: Disable the affected voice capability independently of the complete text experience.

## F7 Complete public and publisher product

### AB-089 Curated tours and interruption return flow

Dependencies: AB-024, AB-025, AB-026, AB-036, AB-071, AB-075, AB-087. Priority: P1. Gate: G7.

Paths: packages/tours/, content/tours/.

Scope: Author short and deep tours covering purpose, affected people, main changes, limits, objections and cited text; add pause and question interruption return.

Acceptance: Tours work with no AI, graphics or audio and remain pinned to a complete source version.

Verification: Follow every tour source link, interrupt at each step and resume in text-only and reduced-motion modes.

Rollback: Disable the affected tour release while keeping the bill reader and questions available.

### AB-090 Child learning parent consent and restricted live access

Dependencies: AB-011, AB-024, AB-041, AB-059, AB-075, AB-087, AB-089. Priority: P0. Gate: G7.

Paths: apps/web/learn/, packages/consent/, docs/privacy/children.md.

Scope: Build local curated learning with no free-text or microphone transmission by default; add neutral age routing and a parent-initiated verifiable-consent adapter, scoped child sessions, current-notice acceptance, parent access, withdrawal and renewal after material changes.

Acceptance: Children can use curated learning immediately; live input requires verified current parental consent and compatible provider controls, never a checkbox or fake consent token.

Verification: Inspect network calls, storage and logs; reject forged or revoked consent, test parent access and deletion, and run a real consent-adapter integration before enabling child live input.

Rollback: Revoke affected child sessions and serve curated local learning while correcting the consent flow.

### AB-091 Search selection bookmarks and reader polish

Dependencies: AB-018, AB-023, AB-036, AB-072, AB-075, AB-089. Priority: P1. Gate: G7.

Paths: apps/web/reader/, packages/ui/.

Scope: Finish table of contents, selected-text questions, section deep links, local bookmarks, text size, history and complete print/plain-text views.

Acceptance: Selection and native find remain useful; deep links preserve exact version and passage and never expose private source tokens.

Verification: Test keyboard find, copied links, long documents, print layout, browser history and selected text during Bill movement.

Rollback: Revert to the plain full-text reader with stable section links.

### AB-092 Share links and accessible exports

Dependencies: AB-024, AB-036, AB-043, AB-091. Priority: P1. Gate: G7.

Paths: apps/web/share/, packages/export/.

Scope: Export versioned explanations and source references; provide explicit share previews and privacy-safe URLs without automatic conversation publication.

Acceptance: Shared content has a pinned source version and correction state; private chat or user details are excluded unless explicitly selected.

Verification: Attempt to share private IDs, withdrawn versions and corrected answers; inspect export text and URLs.

Rollback: Disable sharing or the affected export format while retaining local readable answers.

### AB-093 Localization and translated explanation pipeline

Dependencies: AB-018, AB-024, AB-032, AB-041, AB-081, AB-089, AB-091. Priority: P1. Gate: G7.

Paths: packages/i18n/, content/locales/.

Scope: Externalize strings, implement source-linked translation records, Spanish reference tour and bilingual source cards; prepare direction and font handling.

Acceptance: Translation is labeled and versioned; original legal wording remains visible; translated UI alone does not imply translated grounding coverage.

Verification: Run English and Spanish source journeys plus right-to-left layout fixtures and source-update invalidation.

Rollback: Fall back to the original language and clearly show unavailable translations.

### AB-094 Publisher catalog curation and maintenance UI

Dependencies: AB-008, AB-020, AB-021, AB-024, AB-027, AB-043, AB-089, AB-093. Priority: P1. Gate: G7.

Paths: apps/web/admin/catalog/.

Scope: Finish bill catalog, import status, version history, tour editing, source correction, evaluation review, publish and withdraw workflows.

Acceptance: A publisher can maintain multiple bills without direct database edits; incomplete packs and stale translations are visible.

Verification: Perform a full maintenance workflow with viewer/editor/owner roles and a failed refresh followed by correction.

Rollback: Disable publisher writes and preserve current public release pointers.

### AB-095 Privacy controls deletion and retention jobs

Dependencies: AB-007, AB-010, AB-011, AB-034, AB-043, AB-085, AB-090, AB-092. Priority: P0. Gate: G7.

Paths: packages/privacy/, apps/worker/retention/.

Scope: Implement session erase, feedback deletion, upload expiry, audio cleanup, backup tombstones and provider-deletion capability documentation.

Acceptance: App retention matches the specified windows; restoration replays deletion tombstones; unsupported provider guarantees are not claimed.

Verification: Advance a test clock through each retention class and restore a backup with deleted records.

Rollback: Stop affected collection and run corrective deletion before re-enabling it.

### AB-096 Offline reading reduced data and cache updates

Dependencies: AB-024, AB-059, AB-074, AB-087, AB-089, AB-090, AB-091. Priority: P1. Gate: G7.

Paths: apps/web/offline/, packages/cache/.

Scope: Cache explicit public packs, posters and tours with bounded storage, clear update prompts and complete exclusion of admin/private responses.

Acceptance: Downloaded public reading and curated learning work offline; a withdrawn or changed pack is marked stale on reconnect.

Verification: Test offline startup, exhausted storage, interrupted updates and private response cache exclusion.

Rollback: Unregister the faulty cache layer and use standard online reading.

### AB-097 Embed mode and content security boundaries

Dependencies: AB-003, AB-011, AB-024, AB-036, AB-075, AB-091. Priority: P1. Gate: G7.

Paths: apps/web/embed/, packages/embed/.

Scope: Provide a small read-and-ask embed with explicit origin grants, a versioned postMessage schema, constrained permissions and text fallback.

Acceptance: Embedding cannot trigger microphone access, publisher actions or arbitrary navigation through untrusted messages.

Verification: Send forged origins and message types, embed under restrictive CSP and verify readable fallback.

Rollback: Disable embed capabilities and retain ordinary public links.

### AB-098 SEO metadata error pages and release identity

Dependencies: AB-021, AB-024, AB-059, AB-091, AB-093, AB-094. Priority: P1. Gate: G7.

Paths: apps/web/metadata/, assets/brand/.

Scope: Add crawlable source pages, canonical version URLs, status-aware social cards, sitemap, robots, accessible 404/withdrawn pages and correct site identity.

Acceptance: Search previews distinguish draft and enacted status and never index private drafts or ephemeral chats.

Verification: Crawl the staged site, inspect headers and metadata, and confirm source updates do not canonicalize old versions incorrectly.

Rollback: Remove affected indexing metadata and restore known public routes.

### AB-099 Full accessibility and browser compatibility audit

Dependencies: AB-088, AB-089, AB-090, AB-091, AB-092, AB-093, AB-094, AB-096, AB-097, AB-098. Priority: P0. Gate: G7.

Paths: tests/accessibility/, docs/accessibility/.

Scope: Complete WCAG 2.2 AA testing, reduced-motion extension, keyboard and screen-reader walkthroughs, forced colors, zoom and actual browser matrix.

Acceptance: Core reading, questions, sources, tours and controls have no unresolved critical access defects; tested platforms are named honestly.

Verification: Run axe plus human-equivalent agent walkthroughs with available assistive tools and record actual physical-device gaps explicitly.

Rollback: Disable the inaccessible enhancement and preserve a tested semantic alternative.

### AB-100 Product completeness and usability acceptance gate

Dependencies: AB-044, AB-062, AB-078, AB-088, AB-089, AB-090, AB-091, AB-092, AB-093, AB-094, AB-095, AB-096, AB-097, AB-098, AB-099. Priority: P0. Gate: G7.

Paths: tests/acceptance/product/, docs/.

Scope: Run first-visit, skeptical question, exception exploration, mobile, child-safe, publisher and unavailable-provider journeys; fix dead ends and incomplete states.

Acceptance: G7 delivers the complete intended product with finished character and no hidden dependence on accounts, payment, audio or graphics for understanding.

Verification: Record walkthroughs and defect resolution tied to the release candidate; verify every user requirement maps to working evidence.

Rollback: Keep rollout at preview until product gaps are corrected; preserve the last accepted public release.

## F8 Security operations and production release

### AB-101 Security hardening dependency review and AI audit

Dependencies: AB-011, AB-028, AB-038, AB-095, AB-097, AB-100. Priority: P0. Gate: G8.

Paths: docs/security/, tests/security/, sbom/.

Scope: Complete source review, parser and auth adversarial checks, dependency and secret scans, CSP and least-privilege review; fix actual vulnerabilities.

Acceptance: No known critical/high unresolved exploitable finding remains in released scope; review evidence is accurately labeled AI-assisted.

Verification: Attack authorization, upload isolation, SSRF, XSS, quotas and private cache boundaries against the exact build.

Rollback: Disable the vulnerable capability or revert the build; no external human audit is required to proceed after actual fixes pass.

### AB-102 Performance load and cost qualification

Dependencies: AB-040, AB-074, AB-088, AB-096, AB-100. Priority: P1. Gate: G8.

Paths: tests/load/, tools/perf/, docs/capacity/.

Scope: Measure web vitals, frame times, memory, answer latency, queue depth, traffic scenario and spend ceilings using selected live providers.

Acceptance: Target budgets pass or have an explicit measured scope decision; limits stop cost overruns without breaking reading.

Verification: Run 1,000-reader/25-generation scenarios within approved spend caps and test enforced ceilings and graceful degradation.

Rollback: Reduce active generation concurrency and graphics tiers while fixing measured bottlenecks.

### AB-103 Operational telemetry alerts and diagnostics

Dependencies: AB-011, AB-012, AB-034, AB-042, AB-074, AB-095, AB-102. Priority: P1. Gate: G8.

Paths: packages/telemetry/, infra/alerts/.

Scope: Deploy privacy-minimized metrics, source freshness and budget alerts, graphics failure rates, queue age and retention backlog diagnostics.

Acceptance: Alerts identify concrete failures without raw questions, microphone bytes, secrets or political profiling.

Verification: Inject provider outage, stale source, dead-letter job and quota ceiling and verify actual alert delivery in staging.

Rollback: Disable the problematic telemetry field and retain essential aggregate health signals.

### AB-104 Backup restore disaster recovery and incident drills

Dependencies: AB-007, AB-009, AB-010, AB-024, AB-095, AB-101, AB-103. Priority: P0. Gate: G8.

Paths: docs/ops/, scripts/recovery/.

Scope: Configure encrypted backups and restore procedures, source and asset reconstruction, key rotation and deletion replay; run incident drills.

Acceptance: The demonstrated restore meets the initial RPO/RTO objectives and preserves source hashes and publisher access boundaries.

Verification: Restore to isolated staging, simulate a lost asset pointer and revoke a compromised credential; retain drill timings.

Rollback: Stop writes and restore the last known good compatible release and database snapshot.

### AB-105 Production service configuration and secret readiness

Dependencies: AB-012, AB-095, AB-101, AB-102, AB-103, AB-104. Priority: P1. Gate: G8.

Paths: infra/, docs/ops/deployment.md.

Scope: Finalize Render service and worker configuration, Neon connection limits, private buckets, provider keys, migrations, health checks and graceful rollout.

Acceptance: Configuration names each required secret and has no embedded value; staging mirrors production boundaries and limits.

Verification: Validate configuration and deploy the exact release candidate to staging, including worker drain and migration failure recovery.

Rollback: Redeploy the prior service image and restore its release manifest.

### AB-106 Domain TLS identity and public policies

Dependencies: AB-045, AB-061, AB-090, AB-095, AB-098, AB-105. Priority: P1. Gate: G8.

Paths: infra/domains/, apps/web/policies/.

Scope: Check the selected name and domain when implementing; configure DNS/TLS, publisher identity, privacy, accessibility, terms and correction-contact pages.

Acceptance: A verified chosen domain serves the correct release with valid TLS; policies match actual data flows and do not imply government affiliation.

Verification: Verify redirect/certificate paths, security headers and each policy against network and retention evidence.

Rollback: Use the existing verified staging hostname and remove unverified identity or domain claims.

### AB-107 Live provider storage and deployment integration checks

Dependencies: AB-044, AB-062, AB-078, AB-088, AB-100, AB-101, AB-102, AB-103, AB-104, AB-105, AB-106. Priority: P0. Gate: G8.

Paths: tests/live/, evidence/integrations/.

Scope: Verify real auth, LLM, TTS, STT, database, storage, CDN and hosting adapters with minimal authorized calls and exact build metadata.

Acceptance: Mock-only capabilities are clearly distinguished; every enabled production capability has a successful live evidence record.

Verification: Run credentialed smoke tests, expired-key and quota errors, signed access and real file/audio round trips; redact secrets.

Rollback: Disable the unverified adapter and keep a truthful degraded mode while other ready work continues.

### AB-108 Operator documentation and agent continuation kit

Dependencies: AB-100, AB-101, AB-102, AB-103, AB-104, AB-105, AB-107. Priority: P1. Gate: G8.

Paths: docs/ops/, docs/HANDOFF.md, registry/.

Scope: Write runbooks, troubleshooting, source updates, character rebuild, provider replacement, release commands and evidence requirements; reconcile registry mappings.

Acceptance: A fresh agent can identify the exact build, reproduce checks, locate editable assets and select ready work without reading this conversation.

Verification: Perform a clean-room continuation walkthrough from the documentation and verify every linked path and command exists.

Rollback: Correct the documentation and keep the previous operational instructions available.

### AB-109 Feature flags canary rollout and rollback rehearsal

Dependencies: AB-100, AB-101, AB-102, AB-103, AB-104, AB-105, AB-107, AB-108. Priority: P1. Gate: G8.

Paths: packages/flags/, infra/rollout/.

Scope: Add independent disable switches for live AI, voice, walking, uploads and publishing; rehearse canary and rollback on staging.

Acceptance: A bad model, source or graphics release can be removed without taking down readable bills; changes are observable and reversible.

Verification: Trigger each switch under traffic and roll back a deliberately bad asset and answer configuration.

Rollback: Revert to the prior manifest and disable the affected enhancement.

### AB-110 Content asset and release evidence reconciliation

Dependencies: AB-025, AB-026, AB-044, AB-062, AB-078, AB-088, AB-099, AB-100, AB-101, AB-102, AB-104, AB-107, AB-108, AB-109. Priority: P0. Gate: G8.

Paths: evidence/releases/, registry/prs.json.

Scope: Audit all 112 unit records, actual PR mappings, source completeness, license files, content hashes and operational acceptance; fix discrepancies.

Acceptance: No placeholder, mock, stale CI result or missing source is counted as finished; unresolved inputs have exact names and affected capabilities.

Verification: Run requirement coverage and evidence-link checks and compare the built manifests with the accepted source and asset sets.

Rollback: Mark affected units incomplete and keep release pointers on the previous accepted build.

### AB-111 Full release candidate soak and acceptance

Dependencies: AB-110. Priority: P0. Gate: G8.

Paths: tests/acceptance/release/, evidence/releases/.

Scope: Run complete golden journeys, load/retention soak, cross-browser checks, restore confidence and an incident-response rehearsal on the exact candidate.

Acceptance: G8 has no unresolved required test failure, actual vulnerability, serious unsupported answer or missing enabled live integration evidence.

Verification: Re-run only affected suites after fixes, record head/source/asset hashes and verify no stale events or growing resource leaks in the soak.

Rollback: Reject the candidate, preserve findings and return to the last stable staging release.

### AB-112 Production launch verification and final handoff

Dependencies: AB-111. Priority: P0. Gate: G8.

Paths: docs/RELEASE.md, evidence/releases/, registry/prs.json.

Scope: Deploy within existing authorization, verify real public reading, citations, character, optional speech and privacy modes; reconcile actual PR state and acceptance separately.

Acceptance: Production serves the accepted build; smoke tests pass; all prior units have evidence and any disabled optional capability is stated explicitly.

Verification: Check live routes, version hashes, TLS, source navigation, quota behavior and telemetry, then record rollback and continuation details.

Rollback: Execute the rehearsed rollback immediately on failed smoke checks and keep the prior public release available.

## Requirements coverage

| Requirement | Primary implementation units | Final verification |
|---|---|---|
| Reusable legislative source model | AB-013 through AB-028 | AB-028 and AB-110 |
| Source-grounded questions and objections | AB-029 through AB-044 | AB-044 and AB-111 |
| Original appealing character and editable production files | AB-045 through AB-062 | AB-062 and AB-110 |
| Walking across the bill and pointing at passages | AB-063 through AB-078 | AB-078 and AB-111 |
| Natural optional speech and synchronized face | AB-079 through AB-088 | AB-088 and AB-111 |
| Low intimidation and easy first use | AB-004, AB-036, AB-041, AB-089, AB-091 | AB-100 |
| Child-appropriate learning without unsafe collection | AB-011, AB-090, AB-095 | AB-099 and AB-101 |
| Accessibility without graphics or audio | AB-004, AB-075, AB-084, AB-099 | AB-100 and AB-111 |
| Publisher maintenance and exact versions | AB-008, AB-021, AB-024, AB-027, AB-094 | AB-028 and AB-110 |
| Mobile performance and fallbacks | AB-057, AB-073, AB-074, AB-096 | AB-102 and AB-111 |
| Privacy security and independent provider changes | AB-011, AB-030, AB-038, AB-095, AB-101 | AB-107 and AB-111 |
| Operations deployment and recovery | AB-101 through AB-109 | AB-111 and AB-112 |
| Another agent can continue without this chat | AB-001, AB-003, AB-006, AB-076, AB-108 | AB-110 and AB-112 |

## Final completion record

Record the live URL, real repository identity, deployed commit, database migration, content-release hash, character manifest, model and voice configuration hashes, source completeness, required-check URLs, live integration results, privacy mode and rollback command. State disabled capabilities and exact pending inputs. Reconcile every work unit against actual PR metadata; retain raw merged PR counts separately from accepted planned work. Never claim a successful launch from a green build alone.

After launch, schedule only explicitly authorized recurring work. Maintain dependencies, source freshness, model evaluation, asset compatibility and privacy rules through new scoped units. This plan neither creates future automation nor claims continuous background activity. Preserve the final complete production sources and handoff records so future agents can extend the product without recreating Bill or guessing how the legal content was validated.
