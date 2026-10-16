# AB-011 — Ask Bill security threat model and release-gated controls

Status: **Engineering assessment / partially implemented**, 16 October 2026. Ask Bill is a separate company/product. No external product or company's platform, API, data, database, source, or release process is authorized as a dependency. This review is AI-assisted development evidence, not an independent security certification.

## Trust boundaries

**Public browser:** all input is untrusted; public read-only legislative text and source citations must remain accessible with no account, voice, graphics, cookies or AI service. Browser state and anonymous session capabilities never grant publisher privileges. **Public source packs** have immutable version/hash provenance and never expose quarantined or unpublished private uploads.

**API and identity boundary:** the API validates anonymous quotas or publisher sessions, rechecks publisher membership and MFA before privileged writes, and pins tenant identity server-side. RLS is defense in depth; the DB runtime must have no BYPASSRLS role and a client must never be allowed to choose transaction-local tenant context. The current publisher identity adapter is a test-only fixture; live administrative writes are disabled until an authenticated provider and staging tests are wired.

**Ingestion boundary:** private uploads enter quarantine, are size/type/hash bounded, and must be processed in a separate network-denied, resource-limited worker. Neither a ZIP, DOCX, PDF, XML nor embedded Markdown instruction is a command. Externally hosted attachments, XML entities and remote image URLs may not be fetched by the sandbox. Extraction is not yet enabled, including scans/OCR.

**Model/source boundary:** untrusted legislative text, uploaded briefs, search snippets and LLM output are never legal authority, tool-policy instructions or browser JS. The canonical versioned bytes and verified exact spans are authoritative sources. A model cannot choose official law status, citation IDs, DOM selectors, animation coordinates, cloud resources, privilege or cross-document version. Server validators withhold unsupported statements and expose uncertainty; the assistant is not legal representation or a government filing endpoint. Live LLM is not enabled.

**Character/voice boundary:** original Bill GLB, Blender project, licensed voice, animation manifest and player must be validated before use. A 3D asset may not embed executable scripts or arbitrary fetch URLs. TTS receives only verified, speakable answer text; STT requires a user gesture and permitted purpose. There is no installed model, live synthetic voice or active microphone integration yet.

**Worker/storage boundary:** signed upload capabilities bind tenant, object, MIME/hash/bytes and TTL. Real storage, durable replay ledger and receiver destinations are not implemented; test nonce registries and public fixture signers must never stand in for production. PostgreSQL jobs and outbox mutations use transaction-scoped tenant context, fencing and idempotency keys. External delivery is at-least-once, with receiver deduplication required. Do not publish a source on unverified worker completion.

**Provider/telemetry boundary:** credentials stay server-side, raw prompts/audio/private uploads stay out of operational logs, and outbound AI/voice/analytics/consent requests are disabled by default. Any future provider requires explicit purpose mapping, documented retention/subprocessors, rejection of provider training, contract review, spending cap, and real staging tests. All errors exposed to logs have allowlisted codes, not exception strings, content, keys or PII.

## Threat register and verification plan

| Threat | Owned boundary | Control / planned negative verification | Current release state |
|---|---|---|---|
| Malicious source directives or instructions embedded in law text | `packages/grounding/` AB-029–044 | Strict source/version span verification, typed claims/cues, reject tool-directed payloads; held-out adversarial grounding evals | **Partially controlled** (schema and citations only); live disabled |
| Fabricated, stale, missing or cross-version citation | `packages/contracts/` AB-003 | Unicode point/quote hash/version checks, wrong-version and missing-source negative tests; abstain if incomplete | Contract implemented; semantic entailment pending |
| PDF/DOCX/XML active content, zip bombs and SSRF | `apps/worker/sandbox/` AB-014–017 | Signature/zip expansion ceilings, XXE disabled, CPU/memory/time budget, no network or provider keys; malicious fixtures | Ingestion disabled |
| XSS/clickjacking/unsafe URLs in legislative text | `apps/web/preview/` AB-004 | HTML escaping, restrictive CSP, content-type nosniff; malicious markup browser test | Local preview test only; Next/React incomplete |
| Publisher impersonation, CSRF and MFA bypass | `packages/auth/` AB-008 | Opaque server sessions, fresh membership, strict origin/CSRF, MFA recency; expired/wrong-role tests | Test fixture only; production disabled |
| Cross-publisher access through IDs or tenant context | `packages/db/` AB-007 | Force RLS + tenant-bound compound FKs + least-privileged role; two-publisher ephemeral PG test | Database test passed; real deployed role pending |
| Signed-object forgery, replay and private/public mixup | `packages/storage/` AB-009 | HMAC-SHA256 ticket bound to hash/size/MIME/tenant/nonce, TTL/CORS, inaccessible quarantine/public separation | Fixture implementation; durable store pending |
| Stale worker races and duplicate publication | `packages/jobs/` AB-010 | Row-lock claims, fencing, heartbeat, atomic outbox, idempotent sink, dead-letter; kill/simulate expired worker | Migration/contract tests; production worker pending |
| Sensitive content in logs, traces, feedback or errors | `packages/privacy/` AB-011 | Structured allowlist telemetry, reject raw questions/audio/tokens/stack fields, short retention; adversarial tests | Contract only; monitoring connector pending |
| Child free text or microphone without verified consent | `packages/consent/` AB-090 | Disabled route by default; independent parent verification and provider child data protections before **each** request | Disabled |
| Usage/cost exhaustion and unauthorized large uploads | `packages/usage/` AB-038+ | Bounded source/audio payloads, rate limits, global spend kill switch, abuse quotas and circuit breaker; load tests | Mostly planned; live AI off |
| Binary model supply-chain poisoning and license violation | `tools/assets/` AB-006, AB-045–062 | Owned source/export manifests, SHA256 validation, allowlisted CDN, Blender/glTF validation, provenance review | Fixture manifest only; Bill awaited |
| Personal litigation or filing assertions misrepresented as law | `packages/grounding/` AB-035+ | Claims distinguish draft and current law, cite as-of authority, disclaim uncertain private application and no filing | Only curated text demo, live AI disabled |
| Audio capture, retained transcript, unapproved model training | `packages/voice/` AB-079–088 | Explicit push-to-talk, visible recording, short deletion, provider agreements, transcript edit | No audio integration enabled |
| Data deletion/backup persistence beyond retention | `docs/privacy/` AB-011, AB-108 | Policy inventory, active deletion scheduler, tombstones after restore, receipt of provider delete; verify restore | Inventory established; deletion automation pending |
| Deployment preview exfiltrates production data | `infra/` AB-012 | Isolated database/storage branches, no production secrets in fork PR, read-only CI scopes, readiness/drain tests | Production preview not provisioned |

## Four concrete privacy traces

1. **Visitor typed question:** visitor enters text → server checks age/capability, selected source version and quotas → only allowed evidence to grounded response adapter → validated answer/citation → session-local history with 30-minute expiry. Current state: route **disabled**, no service transmits or retains a visitor question; do not enable before provider/data retention, logging and deletion tests.
2. **Microphone request:** user-initiated push-to-talk → browser permission and visible recording → bounded audio transport to STT → editable transcript → delete audio on completion (hard cleanup bound one hour) → source-scoped answer. Current state: **disabled**, so no microphone permission requested by Ask Bill.
3. **Publisher upload:** authenticated publisher + MFA/role check → tenant/hash/MIME/byte-limited signed quarantine → durable nonce redemption → network-denied extractor → explicit source review → immutable publication pointer. Current state: auth fixture and signed tickets only, no upload endpoint/buckets or extractor.
4. **Publish:** scoped publisher + MFA recency → fully verified authoritative document/version/hash → transactional job → fenced worker complete + outbox event → idempotent public release pointer → audit metadata. Current state: first schema/fencing tests only; do not treat the incomplete electronic-filing fixture as an official bill.

## Review and release conditions

All four traces must be tested on a real isolated **Ask Bill** staging system before activating their sensitive live routes. Privacy inventory entries with `implementation: disabled` or `retention.enforcement: pending` are **blocking** for the corresponding feature. Real credentials, hosting roles and provider retention cannot be inferred from this document. No paid security audit or outside human certification is a prerequisite for continued engineering, but unfixed vulnerabilities and failing tests are blockers to the affected production feature. Maintain separate source review, automated security evidence, live operational acceptance and later independent certification.

## AB-011 security-hardening decision

Until AB-090 implements verified parental consent receipts and provider privacy contracts, `childLiveInputAllowed` returns **false even if every caller-supplied Boolean says true**. The function is not a user-settable consent grant. Structured diagnostic error codes are chosen only from a fixed allowlist, preventing a syntactically valid opaque secret from being smuggled into telemetry.
