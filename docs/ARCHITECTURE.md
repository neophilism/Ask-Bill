# Ask Bill Technical Architecture

Version 1.0 | 16 October 2026 | Implementation specification

Ask Bill is a reusable public website for understanding legislation by talking to an original animated character. Bill lives beside and across a readable bill, moves to the provisions he explains, and answers ordinary questions with inspectable sources. The complete release includes a finished original character and its editable production files, grounded text and spoken conversation, guided tours, mobile and accessible experiences, publishing tools, operations, and launch evidence. Ask Bill independently owns its legislative ingestion, versioning, citations, conversational services, character runtime and deployment. No other product or company's infrastructure is a provider, integration, prerequisite or shared release.

This package defines future implementation. No application, model, voice account, domain, deployment, or GitHub pull request is represented as already created. The PR plan contains 112 stable work units. Work IDs such as AB-045 are planning IDs, never assumed GitHub PR numbers. Numeric budgets below are engineering targets to validate, not measured results or vendor promises.

## 1 Product contract

The initial screen offers a small selection of example questions, an ordinary question box, and a readable view of the selected bill. A visitor can ask, select a phrase, choose a guided introduction, or open the full text. Bill walks toward the relevant passage, waits until it is visible, points to it, and explains it. A source card exposes the exact wording, document version, and link. Asking about an exception moves to the exception rather than repeating a simplified summary.

The site must distinguish what a draft says, what current law says, an interpretation, an illustrative example, a disputed reading, and an unknown answer. Bill can explain objections, implementation burdens, and limitations without silently choosing a sponsor's preferred interpretation. Sponsor arguments are attributed. A proposed bill is never presented as enacted law. Understanding a bill requires no account, payment, headset, installation, microphone, or disclosure of personal circumstances.

The complete release supports a catalog of bills, immutable versions, publisher uploads and official imports, exact citations, search, highlighted passages, general and simpler explanations, guided tours, optional voice, optional session-local history, explicit sharing, and exports. Administrative publishing and live AI are separate from reading. Public social feeds, automatic legal filings, campaign donations, individual legal representation, a law simulator, headset VR, unrestricted web browsing by the model, public anonymous document uploads, and model training are outside this release. The model can explain an uploaded publisher document but cannot enact, amend, or submit anything.

## 2 Technology decisions

Use a TypeScript monorepo with pnpm, React and Next.js for server-rendered content and public routes, a Node API layer for streaming conversation, and a separate Node worker for ingestion and offline production jobs. Use direct Three.js integration behind a client-only adapter instead of coupling the entire reader to a React graphics renderer. An ordinary semantic HTML reader owns all text, controls, search, citations, and navigation.

Author Bill in Blender using version-controlled Python scripts and editable .blend scenes. Export runtime models as glTF 2.0 GLB, with standard PBR materials, skeletal clips and facial morph targets. The Three.js WebGPURenderer supports WebGPU with a WebGL 2 backend fallback [S1]. Explicitly test both; automatic backend selection does not prove that every material or effect has equal support. GLTFLoader supplies the model loading and compression integration [S2]. WebXR is unnecessary for this product.

Use Neon PostgreSQL as the initial relational store, with full-text retrieval and an optional vector index after retrieval evaluation. Use Drizzle for typed migrations and data access. Store private source files in an S3-compatible object store and public immutable published packs and character assets behind a CDN. Keep storage, LLM, speech synthesis, speech recognition, authentication, parental consent, email and monitoring behind adapters. Start with one Render web service and one worker, with separate staging resources; provider credentials and costs are deployment inputs, not a reason to defer local implementation.

Use a PostgreSQL job queue with leases and an outbox rather than requiring Redis at launch. Browser work uses a Web Worker for path planning and expensive text indexing where measurements justify it. Use Playwright, Vitest, axe-core, load tests, a glTF validator, Blender batch validation and visual comparisons. CI uses CircleCI. No Stripe integration or payment dependency belongs in this release. Pin exact package, browser and Blender versions at bootstrap and record them in a toolchain manifest; do not invent future version numbers here.

## 3 System boundaries and deployment

The browser receives published packs and an answer stream. Only the API holds service credentials. The API authenticates publishers, resolves the permitted corpus, reserves usage budgets, retrieves evidence, requests a structured response, validates it, and emits approved segments. The worker imports documents, creates derived indexes, runs evaluations, builds curated audio and publishes immutable packs. PostgreSQL holds private operational metadata. Object storage holds binary bytes. A transactional outbox connects durable changes to background work.

Run public reads from cache whenever possible. Keep administration on separately authorized routes with no public caching. A separate worker process handles untrusted file extraction with CPU, memory, time and network restrictions. The parsing sandbox has no production secrets, no arbitrary outbound access, and no access to other uploads. Preview deployments use isolated database branches or disposable databases and test buckets; never production data or production AI keys in untrusted PR builds.

The initial deployment is a modular monolith plus worker, not a fleet of microservices. Separate ingestion or speech services only when profiling, isolation or scale requires it. Horizontally scaled APIs coordinate quotas and session epochs through the database; process-local state is never sufficient authorization. GPU rendering is on the visitor's device; production servers do not need graphics GPUs to serve the site.

## 4 Repository ownership

Use apps/web for the public and publisher interface, apps/worker for jobs, packages/content for document parsing and provenance, packages/grounding for retrieval and answer validation, packages/character for rendering and performance, packages/contracts for runtime schemas, packages/voice for speech adapters, packages/db for migrations and authorization queries, and packages/ui for accessible controls. Use assets/bill/source for editable Blender sources, assets/bill/runtime for generated manifests, tools/blender for production scripts, content/packs for small curated fixtures, tests/evals for evaluation cases, infra for deployment definitions, docs for decisions and runbooks, and registry/prs.json for the sole active implementation plan after repository binding.

Large binary sources belong in Git LFS or a versioned asset store with committed hashes and fetch instructions. Select one location for each asset class at AB-006. Every release manifest must resolve to durable production source files. Generated GLBs, textures, previews and captions are reproducible outputs, not substitutes for editable sources. CI must detect missing asset pointers and fail if a required model is merely a placeholder.

## 5 Domain data and identity

Bill has an internal UUID and a publisher identity. External identifiers include jurisdiction, legislative body, congress or session, bill number if one exists, language and official URL. A private draft has an explicit draft label and no invented congressional number. BillVersion stores an immutable version ID, raw byte hash, canonical text hash, canonicalization version, effective or publication date when known, retrieval date, provenance and publication status. Source blobs and normalized text are both retained.

Provision stores its version ID, hierarchical path, heading, exact canonical text, character offsets, source page or XML locator, and a version-specific anchor. A separate lineage table suggests correspondence between versions with exact, moved, edited or uncertain mapping; it never silently treats a matching section number as identical content. SourceSpan stores a version ID, provision ID, start and end offsets, quote hash and citation label. Offsets use Unicode code points in the canonical text; the JavaScript boundary adapter must convert UTF-16 indices explicitly. DOM line numbers are display metadata, never citation authority.

Related tables include source_documents, provenance_events, references, amendment_operations, annotations, explanation_cards, tours, tour_steps, evidence_claims, publish_releases, index_generations, publisher_users, memberships, roles, sessions, usage_reservations, provider_requests, jobs, outbox_events, feedback, deletion_tombstones and audit_events. Full indexes bind to a content hash and pipeline version. Deleting a private upload removes its derivatives. Public published versions are archived or withdrawn with explicit reasons and access rules; corrections create new versions.

## 6 Intake and publishing

Publishers authenticate and upload text, Markdown, DOCX, PDF or supported legislative XML. Quarantine checks actual MIME type, file signatures, compressed size, expansion ratio, embedded objects and malicious payloads. Disable macros, external entities, remote includes, scripts and embedded links as executable content. Bound default intake to 25 MiB and 300 pages, with explicit configurable administrative overrides and audit records.

The worker stores original bytes, extracts content, identifies structure, resolves references, and produces a preview. OCR is a separate bounded job for scans, with page and confidence records. Low-confidence extraction or a missing page is flagged and blocks authoritative publication of that material until corrected; it may remain a clearly incomplete private preview. Never repair statutory language with silent AI paraphrase. Compare extracted text against source pages and preserve tables, lists, footnotes and definitions.

Official imports start with Congress.gov [S6] and approved source adapters. Fetchers obey source limits, store ETags or source version markers, retry with backoff and record retrieval dates. SSRF protection includes host allowlists, redirect revalidation, private-network rejection and response limits. Existing-law material is independently sourced and dated. The platform does not assume that a bill's description of current law is accurate current law.

Publication follows quarantine, extracted, structured, reviewed, evaluated, published or withdrawn states. AI-assisted source comparison, deterministic checks and retained evidence satisfy the initial review workflow. No outside human auditor is a software release prerequisite. Concrete unresolved extraction errors, incorrect citations or vulnerabilities do block the affected publication. Publisher permission is checked on every state transition. Publish database pointers and CDN manifests atomically through an outbox; a partial index never becomes public.

## 7 Legal document semantics

Preserve headings and nested units without imposing one legislature's structure on all documents. Definitions link to their scope and effective version. References identify internal, external, unresolved and ambiguous targets. Amendment operations describe insert, strike, replace, repeal and redesignate actions with source spans. A reconstructed amended view is labeled a computed aid; the source bill remains authoritative. If an amendment cannot be applied unambiguously, show the conflict and suppress unsupported combined claims.

Store an explicit status vocabulary covering private draft, published draft, introduced, amended, passed one chamber, enacted, effective, repealed and unknown, with evidence and dates. Enactment and effective date are distinct. Version switches invalidate incompatible citations, answers, tours, derived audio and cached comparisons. A conversation stays pinned to its selected version until the visitor explicitly changes it. Show stale-status warnings when a connector has not refreshed within its published freshness window.

The electronic filing draft is the first reference pack. Its supplied transcript is incomplete and must not be represented as the complete authenticated bill. Ingestion can use the exact supplied passages as fixtures. Production publication requires the complete selected source version, including its opening provisions and definitions. This is a content input needed for that pack, not a blocker on developing the platform or character.

## 8 Grounded answer pipeline

Each request carries the selected bill version, question, optional selected source span, reading preference, language and short conversation context. Validate size and rate limits, authenticate the anonymous session or publisher, and acquire a quota reservation. Classify the question into bill explanation, definition, current-law comparison, implementation prediction, factual background, personal application or unsupported scope. A deterministic router selects only authorized sources and allowed tools.

Retrieve by lexical search plus structure and, if evaluation supports it, semantic similarity. Always expand retrieved provisions to relevant parent clauses, definitions, exceptions, effective dates and cross-references. Rerank to a bounded evidence bundle. Record included and omitted sources so retrieval failures can be diagnosed. A whole short bill may fit the evidence budget, but context inclusion is still version-pinned and explicit.

The model produces an AnswerEnvelope containing typed claims, source spans, qualifiers, cited provisions, suggested follow-up questions and semantic presentation cues. Validators check schema, permitted sources, exact quote ranges, version matches, claim types, links, answer length and prohibited tool effects. A separate entailment check tests whether evidence supports each material claim. A model reviewer is useful but not a proof of legal correctness. Deterministic citation checks plus evaluated claim support and adversarial cases are required.

Reject, repair once, or return a grounded partial answer when validation fails. Unsupported factual predictions become explicit unknowns or attributed estimates, not bill text. Questions about personal litigation receive an explanation of relevant text and uncertainty without inventing a deadline calculation or a case-specific legal conclusion. The application is an explainer; it performs no filing and offers no representation.

Stream only complete validated answer segments, never unvalidated model token deltas. While validation runs, show a neutral thinking state. Segment validation sees sufficient surrounding evidence to avoid dropping an exception into a later correction. Whole-answer consistency validation can stop later segments, but cannot erase an already spoken error: issue a visible correction linked to the old segment and count the defect in evaluations. Prefer validating the full short answer before segment streaming at launch; sentence streaming is an optimization gated by AB-035.

## 9 Claims citations and uncertainty

Claim types are bill_text, current_law, interpretation, hypothetical, prediction, attributed_position and unknown. A legal claim must cite exact supporting spans; current_law also requires independently sourced jurisdiction and as-of metadata. A hypothetical is labeled when it begins. Quantitative predictions require a method and sourced inputs or are withheld. Explain both supporting and opposing interpretations when the evidence is materially disputed, with attribution rather than forced false balance.

Do not show a fabricated numerical confidence percentage. Use supported, qualified, disputed, incomplete source and unavailable states with concrete reasons. Every answer includes the pinned document version and source drawer. Citation activation scrolls or opens the exact passage, marks its bounds and exposes original-source access. Source cards remain usable when graphics, speech, JavaScript or an AI provider fails; server-rendered source pages and precomputed cards provide the baseline.

## 10 Provider independence and costs

Define generateStructured, streamValidatedSegments, synthesizeSpeech and transcribe interfaces with capability discovery. The LLM adapter receives no database credential and can request only narrowly defined read tools. A fake provider supports local development, but every live capability needs a real staging test before release. Provider selection follows benchmarked grounding, latency, privacy, retention, terms and cost; no unverified model name or price is hard-coded into this plan.

Reserve estimated tokens and audio duration before a request, settle against actual usage idempotently, and expire abandoned reservations. Set per-session, network-abuse, publisher, model and global limits. A global spending ceiling disables new live generations before overspending; reading, curated questions and completed answers keep working. Provider timeouts have bounded retries with jitter. Preserve request IDs and billing counters without logging raw questions. Cache only public, non-personal questions and approved answers with corpus, prompt, model, locale and validator versions in the key. Never share personal conversation context through a public cache.

## 11 API and event contract

Public endpoints include GET /api/bills, GET /api/bills/{id}/versions, GET /api/versions/{versionId}/manifest, GET /api/versions/{versionId}/provisions/{id}, POST /api/sessions, POST /api/answers, GET /api/answers/{id}/events, DELETE /api/sessions/{id}, POST /api/speech and POST /api/feedback. Publisher endpoints manage uploads, extraction previews, corrections, evaluations, publish, withdraw and access membership. OpenAPI plus runtime schemas are the contract; client types alone are insufficient.

POST /api/answers uses an idempotency key and returns an answer ID plus an authorized event stream endpoint. SSE supports sequence numbers, Last-Event-ID and bounded replay. Event types are answer.started, segment.validated, citation.ready, performance.cue, speech.ready, correction, answer.completed, answer.cancelled and answer.failed. Each carries schemaVersion, answerId, sequence, conversationEpoch, documentVersion and createdAt. Cancellation increments an epoch and aborts generation and audio; late events cannot revive old speech or gestures.

Cookies use Secure, HttpOnly and SameSite controls; mutation endpoints validate origin and CSRF protections as appropriate. Cross-origin embedding uses explicit origin grants and a small postMessage protocol. Never transmit provider tokens to clients. Normalize errors to stable codes such as SOURCE_INCOMPLETE, CITATION_INVALID, QUOTA_EXCEEDED, PROVIDER_UNAVAILABLE and VERSION_CHANGED with readable recovery actions. Debug traces contain IDs and timing, not secrets or raw user content.

## 12 Bill character direction

Create an original friendly legislative guide with the working internal design name Folded Folio. The body is a compact asymmetric folded folio with layered page edges, a shallow rounded spine, an offset upper fold, expressive inset eyes and a flexible lower face. Short articulated arms and feet support readable walking and pointing. A restrained ivory, deep teal and warm copper palette differentiates the character. Test the design in silhouette, monochrome and tiny mobile scale before detailing it.

The emotional brief is curious, capable, patient and occasionally amused. Bill listens, notices confusion and admits uncertainty. He is neither a judge nor a government official. Avoid official seals, a copied costume, the familiar rolled-scroll silhouette, copied facial proportions, recognizable songs, or signature gestures from existing bill characters. Use the broad idea of an approachable document character while independently designing shape, proportions, materials, face, voice and movement. Similarity review and provenance reduce risk; they are not a guarantee of legal clearance or trademark availability.

Deliver a design bible, silhouette studies, front/side/back/three-quarter turnarounds, expression sheet, material palette, proportion measurements, gesture poses, mouth chart, voice direction and a recognizable thumbnail. The plan includes producing and selecting design candidates through automated renders and documented review; do not leave a permanent task saying hire an artist. Any generated raster reference is a reference only. Final geometry, rig, animation and exports must be editable and reproducible through Blender and code.

## 13 Model materials and rig

Build the master mesh with clean deformation topology, separate controllable eyelids, eyes, face surface, page layers, arms, hands and feet. Use UV maps and baked base color, normal, roughness and ambient-occlusion maps. Create subtle paper fibers and beveled edges through controlled detail, not a noise field that shimmers at thumbnail size. Avoid costly translucent paper and cloth simulation in the baseline runtime. Bake attractive high-resolution details from the source sculpt to the mobile mesh.

The rig includes root, body, spine and fold controls, neck or upper-body look control, separate eye targets, eyelids, jaw, arm IK/FK and foot IK with pole targets. Page flex uses a small bone chain or morphs rather than a live cloth solve. Export only deforming bones and bake constraints; Blender-only drivers are not expected to execute in glTF. Provide a documented rest pose, scale of one meter per scene unit, glTF Y-up conversion, origin at the contact plane, predictable forward direction and hand/foot socket names.

Facial controls include neutral, smile, concern, curiosity, thinking, uncertainty, emphasis, blink, left/right wink and brows. Use approximately 12 to 16 speech mouth shapes with an explicit mapping to the chosen speech provider's phoneme or viseme labels; do not imply one universal provider mapping. Correctives protect eyes and page edges during combined expressions. Clamp and normalize compatible morph weights. Blend speech with expression and blink layers without duplicating jaw movement.

## 14 Animation library and asset acceptance

Create separately named idle_breathe, idle_attentive, idle_think, listen, acknowledge, speak_neutral, speak_emphasis, uncertainty, walk_start, walk_loop, walk_stop, turn_left, turn_right, step_up, step_down, point_left, point_right, point_down, present, lean_read, look_at, sit_edge, stand_from_sit, greet and farewell clips. Include restrained variants to avoid obvious looping. A cancelled answer returns smoothly to neutral rather than finishing its speech performance. No expression should imply approval or disapproval of a political position.

Author locomotion in place and drive travel from the planner; keep root-motion metadata only for tests and export comparison. Record nominal stride length, foot contact events, clip duration, allowed transitions, minimum blend time and upper-body masks in an animation manifest. Foot locking and a small deterministic inverse-kinematics correction handle contact with approved page surfaces. Turns blend with gaze and body orientation rather than sliding a rigid figure sideways.

Deliver master .blend, production Python scripts, textures, rig specification, clip sources, runtime GLBs for three levels of detail, KTX2 textures, a static poster, optional 2D sprite fallback, turntable renders, animation contact sheets, a 30-second golden performance and a machine-readable asset manifest with hashes and licenses. The exporter validates missing clips, morph names, bone bounds, material features and texture sizes; the official glTF validator and browser tests catch interoperability failures [S2, S3]. AnimationMixer and AnimationAction provide runtime clip playback and blending [S9, S10].

Visual acceptance checks likeness to the selected original design, readable expressions at 96, 160 and 240 CSS pixels, convincing feet, no mesh intersections in stress poses, no foot sliding in the golden walk, no popping at LOD changes, consistent material response in both render backends, and an understandable uncertainty gesture. Automated image checks catch regressions; an agent also inspects the rendered sequence and records findings. A polished result depends on iteration, not the mere existence of an exported mesh.

## 15 Renderer and presentation layers

Mount one transparent fixed canvas over the reader, with pointer-events disabled except for small explicitly interactive character controls provided as ordinary DOM controls. The canvas is aria-hidden and never replaces textual meaning. A client adapter initializes the renderer lazily, preloads the smallest asset, compiles needed shaders and disposes textures, buffers, mixers, image bitmaps and event listeners on teardown. A context-loss handler restores assets or falls back to a poster without resetting the conversation.

Use an orthographic stage for page walking so the character's feet and cited text stay aligned while zooming. A separate optional close-up camera can provide conversational framing in a reserved panel. Use soft environment lighting, a key and fill, restrained contact shadows and consistent color management. Real-time cinematic effects are quality-tier options. Avoid excessive bloom, depth-of-field over reading text and physically expensive effects that add little at small scale. Shadow compositing follows the page plane and must not darken source text enough to harm contrast.

Select quality tiers from measured frame time, graphics capability and visitor choice. Low tier uses the small model, one atlas, baked lighting and restrained animation; medium adds richer shadows; high adds improved lighting and smoothness. Honor reduced-data and reduced-motion preferences. Graphics mode may be full, reduced, poster or hidden. A crashed graphics adapter cannot crash the reader or text conversation. Do not require a graphics benchmark or fingerprint for reading.

## 16 The bill as a landscape

The authoritative text remains DOM content. A LayoutAnchorRegistry reads DOMRects for provision boundaries, headings and explicitly registered noninteractive ledges. It builds a 2.5D traversal graph in CSS-pixel page coordinates, separate from document offsets. Each surface contains a stable provision ID, layout revision, bounds, normal, contact height and allowed movement. The character walks on paragraph margins, section dividers and generous whitespace, with occasional approved step transitions. Letters are not collision geometry.

Convert page coordinates to canvas coordinates using scroll offset, visualViewport offsets and scale, canvas bounds and device-pixel-ratio handling. ResizeObserver, font loading events, reader column changes and controlled MutationObserver updates invalidate the geometry. Increment layoutRevision whenever the measured page changes. The planner ignores stale results and replans from a safe contact point. Measure layout in a scheduled read phase and apply transforms in a write phase to avoid repeated forced reflow.

The path planner uses a bounded visibility graph or A-star over registered ledges with inflated obstacles. Obstacles include text reading zones, current selection, links, inputs, focused controls, popovers, caption area, sticky headers, screen edges and safe-area insets. Plan foot and body envelopes, not only a point at the character's center. Keep performance plans deterministic and seed idle variation for replay tests. A maximum planning time and movement duration prevent wandering or long waits.

For an off-screen citation, show a source preview and a Go there action. Only user-enabled follow mode scrolls automatically; any manual scroll, keyboard navigation or selection cancels it. A long journey may use a brief exit and re-entry at the destination; never make someone wait while Bill walks across 40 pages. If no safe path exists, Bill remains in his reserved dock and points toward the source card. On narrow phones, virtual keyboards and large text zoom, default to docked or reduced movement while keeping optional nearby walking where it fits.

Bill never blocks typing, selecting, copying, links or browser text search. The visitor can pause, hide or reposition him through accessible controls. Native scroll and keyboard focus always take priority. No page animation steals focus. Virtualize very large documents only when required; preserve stable anchors and load the cited section before computing a path. Browser find and print need a complete-text alternative.

## 17 Performance director

Use a typed deterministic state machine with booting, docked, idle, listening, thinking, preparing, navigating, explaining, paused, recovering and hidden states. Keep separate orthogonal states for audio, renderer health and conversation epoch. A priority arbiter resolves commands in this order: hide or accessibility preference, cancellation, navigation safety, manual user interaction, validated answer performance, then idle animation. A new question cancels old speech, cues and pending paths together.

The model emits semantic cues only: reference a validated citation, emphasize an approved segment, acknowledge a question, or express uncertainty. It cannot supply CSS selectors, coordinates, arbitrary URLs, script, asset names or motion speeds. The server maps claims to eligible cues and the client maps cues to approved animation names and current measured geometry. Unrecognized cues are dropped. Each cue is scoped to a segment, answer epoch and document version, with a layout revision added by the client planner.

The local director schedules movement, gaze, gesture, captions and audio against a monotonic performance clock. It waits for source visibility before pointing, prefetches the next asset and caps gratuitous motion. If audio arrives late, continue readable text and a neutral expression; do not replay the whole answer unexpectedly. Tour mode has an explicit sequencer and pause or resume controls. Local replay mode reuses validated text and cues without invoking a language model.

## 18 Voice and conversation interaction

Text is the default entry point. Speech recognition is optional push-to-talk after explicit permission, with clear recording indication, cancel and transcript correction. Feature-detect codecs, microphone APIs and platform limitations. Prefer a server adapter with bounded audio duration and retention settings; browser recognition may use an external service and must not be described as offline unless verified. Never listen continuously. A denied microphone permission leaves typed interaction available.

For output, choose a licensed synthetic voice with a warm conversational style that does not imitate a recognizable actor or existing character. Keep voice ID, license, terms snapshot and allowed uses in the asset provenance record. Generate speech only from approved text. Normalize speech-friendly expansions of section numbers and abbreviations through a pronunciation dictionary while preserving the exact visible citation. A text-to-speech transformation cannot alter legal meaning or introduce new words of substance.

The speech adapter returns audio, sample rate, duration, normalized text mapping and optional word and viseme timings. AudioContext is the playback clock after a visitor gesture satisfies autoplay rules. Schedule face morphs against the decoded or streaming audio timeline, with smooth coarticulation and a target lip-sync error no worse than 100 ms for supported timing providers. If timings are unavailable, use conservative approximate mouth movement labeled internally as approximate and test it; text and captions remain authoritative. A device with no audio uses silent performance.

Stop, pause, resume, mute, speed and replay controls affect audio and animation consistently. Interruption invalidates buffered audio and schedules a short morph return to neutral. Handle output-device changes, background-tab suspension, stalled streams and playback failures. Spoken citations can be shortened conversationally; exact citations are always visible. Captions are selectable text, include speaker identification where useful, and do not advance so quickly that the visitor loses the explanation.

## 19 Reading experience tours and languages

The reader provides a table of contents, source search, selected-text Ask Bill, section URLs, history within the session and text size controls. Desktop can use side-by-side reader and conversation. Mobile uses a reader plus collapsible conversation sheet with a reserved character area. Source references open a compact drawer with a clear return action. Empty, loading, partial, withdrawn, unavailable, stale and error states have designed recovery paths.

Reading preferences include concise, standard and explain simply. Explain simply changes vocabulary, sentence length and examples while preserving exceptions and legal scope. It is not an age assertion. Guided tours use curated, version-pinned cards and cues, so the introduction works without live AI. Tours cover the purpose, who is affected, main changes, limitations, objections and exact source passages. Questions can interrupt a tour and return to its previous step.

All interface strings use locale keys. Preserve the original legislative language as authoritative. Translation records identify translator or model, source version, date and review status. Machine translations are labeled. Test an initial English release and one Spanish reference tour and source-card path to validate the architecture; do not claim broad language coverage from translated menus alone. Translate answer evidence consistently and show original wording alongside translations. Font metrics, right-to-left direction and reflow tests belong in the infrastructure even if a right-to-left release is later.

## 20 Accessibility and children

Target WCAG 2.2 AA across the whole product and voluntarily implement the ability to disable nonessential interaction animation. W3C provides the normative accessibility standard and specific motion guidance [S4, S7, S8]. Every information path works through semantic HTML, keyboard controls, captions and a transcript. Provide visible focus, readable contrast, reflow at 400 percent, no hover-only information, adequate targets and correct screen-reader announcements. Announce complete answer segments once; never stream every token into a live region.

Respect prefers-reduced-motion immediately and expose Pause Bill, Hide Bill, Stop voice and Follow source controls. A hidden character still has all explanation and citation functions. No flashing effects or arbitrary animation dependency is essential to learning. Automated checks are supplemented with keyboard-only and screen-reader walkthroughs, low-vision zoom, touch, forced colors and reduced-motion tests. Record exact platforms actually tested and do not claim a certification.

Because the intended audience includes children and the character may appeal to children, design for the current children's privacy rules rather than assuming an animated site or anonymous chat is exempt [S5]. Ship an explicitly child-safe route with locally served curated questions, tours, character performance and pre-generated speech, with no free-text or microphone transmission, persistent profile, ads, third-party analytics or political targeting. Infrastructure still sees requests, so use only necessary security processing and minimize retention; calling the route anonymous is not a legal exemption.

For the live free-text route, use a neutral coarse age-band step before collecting chat or voice content and document the audience classification and data flow. An under-13 selection goes to the curated child route. AB-090 also builds a parent-initiated verifiable-consent adapter and restricted live sessions. A parent opens a separate notice and verification flow, then links a child session through a short-lived one-time code. Store only the proof reference, policy version, permitted purposes and renewal or withdrawal state needed to enforce consent. A checkbox or email acknowledgment alone is not represented as verified parental consent. The API rechecks consent and permitted providers before every child live request. Parents can inspect and delete associated information or withdraw consent; material changes require renewed notice and consent. Do not silently expose children to general chat by labeling a reading setting simple. Curated learning launches without a consent vendor; child live input is enabled only after actual consent-adapter and provider-retention checks pass. Reassess classification and rules against current sources before launch.

## 21 Privacy and authorization

Public reading is unauthenticated. Store preferences locally only when useful and disclose them. Adult anonymous chat uses a random short-lived session capability in a secure cookie, rotates it, and avoids cross-site identifiers. Keep ordinary conversation state in browser memory, with encrypted server replay data expiring after 30 minutes. Default raw question logs are off. Optional diagnostic submissions require a clear action and redaction preview. Feedback submits only selected text and the necessary IDs.

Set explicit retention classes: private quarantine and failed extracts seven days by default; ephemeral chat and replay 30 minutes; voice input deleted immediately after transcription with a maximum operational cleanup bound of one hour; minimal security logs seven days; opt-in feedback 90 days; publisher audit metadata one year; publication provenance for the lifetime of the published archive. Verify provider-side settings and contracts match the policy; application deletion cannot erase an undisclosed provider retention policy. Backups expire within a documented window, targeted at 30 days, and deletion tombstones are replayed after restore.

Publisher roles are owner, editor and viewer with least-privilege access. Require MFA for publishing and membership changes using the selected auth adapter. Every query checks publisher scope; object IDs alone never authorize access. Signed private download URLs are short-lived and never put in logs. Audit content state transitions and privileged access without storing passwords, keys, raw chat, microphone bytes or unnecessary personal information. The product has no public messaging feature.

## 22 Security and abuse controls

Threat-model malicious source documents, model prompt injection, forged citations, cross-publisher access, SSRF, XSS, malicious URLs, cost exhaustion, replayed API events, stolen admin sessions, unsafe binary assets and dependency compromise. Treat retrieved source text as untrusted data, not instructions. Never execute model-produced code, HTML, shell or network requests. Allow only a narrow answer schema and source-read functions. Validate markdown into safe components and block dangerous URLs and embedded active content.

Use CSP, HSTS, secure cookies, origin checks, scoped upload tokens, least-privilege database users, bounded job resources, dependency pinning, secret scanning, vulnerability review and an SBOM. Asset decoders and WASM binaries are pinned, served from trusted origins and bounded in work. Rate limiting uses short-lived privacy-minimized abuse keys and adaptive controls with an accessible fallback; do not force all readers through a CAPTCHA. Active vulnerabilities and failing security tests block affected deployment until fixed.

The owner's existing policy applies: perform substantive AI-assisted review and adversarial tests; an outside auditor, independent human sign-off, paid penetration test or E2EESA certification is not a required launch gate. Keep any later outside review accurately pending. Never label the agent's review an independent human audit. No broad future-approval request is part of this plan.

## 23 Reliability observability and maintenance

Jobs use unique deduplication keys, leases with heartbeats, retry limits, dead-letter status and transactional state changes. Workers check lease ownership before committing outputs. Publish uses immutable object names and a single versioned release pointer. Database migrations follow expand, migrate and contract; rollback preserves old readers and never silently deletes source records. Keep web, worker, schema and asset compatibility ranges in each release manifest.

Track uptime, error rate, p50 and p95 answer latency, citation validation failures, source freshness, index lag, queue age, provider errors, cost, audio startup, graphics context loss, frame-time tier and fallback use. Collect only coarse operational metrics; do not profile political interests, store raw questions by default or combine a child's activity across sessions. Correlate server events through request IDs and source hashes. Alert on quota ceilings, failed publications, unexpected retention backlog, credential expiry and stale official imports.

Runbooks cover provider outage, bad answer, leaked secret, malicious upload, incorrect publication, graphics regression, deletion request, database restore and rollback. A bad answer can be disabled by answer-template hash, a source release can be withdrawn and an affected provider can be disabled without taking down reading. Restore staging from backup and verify hashes, source manifests, deletion tombstones and access controls before accepting a backup as usable.

## 24 Performance and capacity targets

Targets are measured on an agreed midrange laptop and an Android phone with constrained network, alongside current Chromium, Firefox, Safari and iOS Safari. Record exact OS, browser, GPU and device versions in evidence. Software CI covers regressions; physical-device evidence remains pending when no such device or remote device service is available. A deterministic fake device is not evidence of real mobile graphics performance.

| Measure | Initial release target |
|---|---|
| Public reading | p75 LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1 on the agreed profile |
| Baseline reader JavaScript | at most 250 KiB compressed, excluding lazy character and speech bundles |
| Initial small character pack | at most 3 MiB transferred; full high tier at most 10 MiB on demand |
| Model complexity | low at most 12k triangles, medium at most 35k, high at most 70k; measure final skin and morph costs |
| Materials and textures | baseline at most 6 draw calls for Bill, one or two atlases, 1024 mobile and 2048 high-tier textures |
| Runtime motion | desktop target 60 fps, mobile target 30 fps; automatic downgrade on sustained misses |
| Graphics memory | target at most 96 MiB incremental on mobile; account for decoded textures and render targets |
| Answer service | p95 first validated segment at most 6 s and short answer completion at most 20 s with selected live provider |
| Speech | target first audio at most 1.5 s after a validated speakable segment; no promise before provider testing |
| Navigation | planner at most 16 ms worker budget for ordinary viewport; no input-blocking main-thread path search |
| Capacity scenario | 1,000 simultaneous readers and 25 active generations; load model and quota caps documented |
| Availability | 99.9 percent monthly public reading target; live-generation degradation reported separately |
| Recovery | initial operational objective RPO at most 24 h and RTO at most 4 h, demonstrated by restore drill |

Change a target only with a recorded measured tradeoff and linked work-unit update. Do not silently lower a budget to make a failed check pass. Limit GPU effects and long explanations before adding expensive infrastructure. The capacity target is a test scenario, not a forecast of actual traffic or a claim that a free service tier can support it.

## 25 Evaluation and acceptance

Build at least 240 version-pinned cases spanning literal questions, definitions, exceptions, effective dates, cross-references, missing text, changed versions, misleading questions, objections, current-law comparisons, unsupported predictions and personal-case requests. At least 80 cases must be adversarial or ambiguous. Keep a held-out set separate from prompt tuning. Evaluate retrieval recall, citation integrity, claim support, exception preservation, status accuracy, appropriate uncertainty, readability and response cost.

All displayed citations must resolve to the correct version and exact quote. Require zero invented sources, zero draft-as-enacted mistakes, zero cross-publisher disclosures and zero missing decisive exceptions in the designated must-pass set. Set a target of at least 95 percent supported material claims on the broader assessed corpus, with all detected serious legal misstatements corrected before release. Sample-based evaluation is evidence of tested behavior, not a guarantee for every future answer. Use independent checking methods, not only the generator judging itself.

The cinematic golden journey asks about misdirected filings, navigates to the cited provision, explores an exception, switches versions, interrupts speech, resizes the viewport and recovers from lost graphics context. Test manual scroll, text selection, 400 percent zoom, reduced motion, no GPU, no audio, provider failure, stale SSE replay, offline curated mode and a denied microphone. Assert that Bill never blocks a focused control or points to stale content. Store source-bound video, screenshots, logs and metrics with the tested commit and asset hashes.

## 26 Delivery and launch gates

G1 is a reproducible foundation with a validated candidate plan and a reading shell. G2 is an exact, versioned content pack and safe publishing. G3 is grounded conversation with source-bound evaluations. G4 is an original finished character with editable sources and validated exports. G5 is integrated page walking with deterministic replay and fallbacks. G6 is speech, captions and interruption. G7 is a complete accessible product with child-safe learning, tours, localization and publishing. G8 is a production candidate with passing security, load, restore and rollout checks. Earlier previews are useful but are not the full finished release.

The last release unit requires all previous work units to have source-bound acceptance evidence. A mock provider or placeholder mesh may pass development tests but cannot satisfy live AI or finished-character acceptance. Missing deployment credentials block only the corresponding live operation, while all available local and fixture work continues. Record missing inputs by exact purpose and continue other ready tasks. The only recurring external operational inputs are actual domain selection, provider accounts and secrets, hosting budget and the complete reference bill; name ownership and domain availability have not been established.

## 27 Agent handoff and PR registry

Read this document, docs/DEVELOPMENT_PLAN.md, planning/work-units.json and spec/CONTRACTS.ts before implementation. The handoff is repository-neutral because no Ask Bill repository has been verified. Bootstrap binds the real GitHub owner/name from live metadata, materializes registry/prs.json and validates it against the existing shared contract. Thereafter that file is the sole active machine-readable plan. Narrative documents explain scope; they are not competing milestone arrays. Do not create a new alternative importer format for Boardroom or Engine Room.

The checked shared contract is Boardroom registry/PR_FORMAT.md and registry/pr-contract.mjs as retrieved on 16 October 2026 [R1]. The envelope requires schemaVersion 1, exact repository, positive roadmapVersion, planVerified, plannedPrCount equal to units.length, observedAt, units and pullRequests. Unit IDs are AB-001 through AB-112, with explicit dependencies, scope, acceptance and verification. GitHub PR arrays start empty. The source snapshot included here is a planning compatibility reference; compare it with the current contract when implementation starts.

Use exact leading IDs in PR titles and record actual mappings only after GitHub creates each PR. GitHub owns observed PR state. A merged PR is not proof that live acceptance passed. Keep implementation, automated testing, operational acceptance, external review and certification distinct. Preserve stable units when a task is split: multiple real PRs may implement one unit; new scope receives a new explicit unit rather than shifting old IDs. Keep current-head CI checks mandatory and chain dependency-ready work under existing authorization. Do not modify another active repository to report Ask Bill progress.

Each handoff entry records branch, base and head SHA, changed paths, unit ID, exact tests and results, source and asset hashes, preview URL if one actually exists, real PR mapping, unresolved concrete blockers, rollback and next ready task. No secrets go into evidence. Evidence templates and validation scripts are included in the package. This plan creates no running automation and makes no claim that an agent remains active after a session ends.

## 28 Source notes and decisions

Sources were checked on 16 October 2026. They substantiate the specified platform capabilities or rules; project-specific choices and budgets are design decisions. Recheck provider limits, privacy rules and package compatibility at bootstrap. No source is being used to promise automatic legal correctness or cinematic quality.

- [S1] Three.js WebGPURenderer documentation: https://threejs.org/docs/pages/WebGPURenderer.html
- [S2] Three.js GLTFLoader documentation: https://threejs.org/docs/pages/GLTFLoader.html
- [S3] Khronos Blender glTF exporter and importer: https://github.com/KhronosGroup/glTF-Blender-IO
- [S4] W3C Web Content Accessibility Guidelines 2.2: https://www.w3.org/TR/WCAG22/
- [S5] Current children's privacy rule, 16 CFR Part 312: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312
- [S6] Library of Congress Congress.gov API repository: https://github.com/LibraryOfCongress/api.congress.gov
- [S7] W3C guidance for interaction animation: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- [S8] W3C guidance for pause stop and hide: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- [S9] Three.js AnimationMixer: https://threejs.org/docs/pages/AnimationMixer.html
- [S10] Three.js AnimationAction: https://threejs.org/docs/pages/AnimationAction.html
- [R1] Shared project registry contract: https://github.com/neophilism/Boardroom/blob/main/registry/PR_FORMAT.md
- [R2] Boardroom agent and review policy: https://github.com/neophilism/Boardroom/blob/main/AGENTS.md
- [R3] Engine Room registry ownership rules: https://github.com/neophilism/Engine-Room/blob/main/AGENTS.md
