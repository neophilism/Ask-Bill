# Ask Bill OpenAI provider adapters

Implemented 17 October 2026. These are real HTTP transports tested with injected responses; no credentialed request, selected account policy, voice audition, provider latency, or production deployment is represented as verified by these tests. Configuration and operational acceptance remain separate.

## Server interfaces

Import adapters from `@ask-bill/providers`. The API key exists only in each server-side closure. Capability methods contain no credential, prompt, source content, question, or recording. Do not import this package in a browser bundle.

| Constructor | Mandatory configuration | Method |
|---|---|---|
| `createOpenAIResponsesProvider` | `apiKey`, `model`, `enabled: true`, `dataProtectionVerified: true` | `generate({route, question, bundle, signal?})` |
| `createOpenAIEntailmentReviewer` | The same configuration, with independently selected `reviewModel` or `model` | `review({route, bundle, draft, signal?})` |
| `createOpenAISpeechProvider` | `apiKey`, `enabled: true`, `dataProtectionVerified: true`, `voiceRightsVerified: true`, `lookupSource` | `synthesize({segment, versionId, sessionId, conversationEpoch, signal?, locale?})` |
| `createOpenAITranscriptionProvider` | `apiKey`, `enabled: true`, `dataProtectionVerified: true` | `transcribe({audio, mimeType, versionId, conversationEpoch, signal?, language?, durationSeconds?})` |

`fetchImpl` is injectable for isolated tests. All adapters use fixed HTTPS OpenAI endpoints and reject redirects. They bound the response before parsing, apply a deadline to both response headers and every body chunk, forward caller cancellation, discard late output, and return fixed content-free error codes. They make one request per call and never automatically retry a potentially billable request. The application must reserve and settle usage, check age eligibility and origin/session authorization, limit concurrency, and independently recheck conversation epochs. No constructor proves the account's policy simply because an operator passes a boolean.

The older `createResponsesProvider` remains a compatibility adapter for pre-existing untrusted drafts. New application composition uses `createOpenAIResponsesProvider`, whose runtime source/claim checks are stricter. Fixture output is still explicitly `ask-bill-fixture` and never reported as live integration evidence.

## Grounded generation and independent model review

Both model calls use Responses with `store: false`, no tools and strict JSON-schema output. A completed response must contain exactly one assistant JSON object; refusals, unexpected tools, incomplete answers and malformed schemas fail closed. Strict schemas do not by themselves verify truth. OpenAI documents required fields, nullable optional values and `additionalProperties: false` for structured output.[1]

`bundle` contains server-resolved `publisherId`, `versionId`, `isPublished: true`, and `sources` with `provisionId`, `versionId`, `text` and `sha256`. `sourceStatus` is the verified legislative status, defaulting to `unknown`; `exceptionSourceIds` identifies retrieved provisions with decisive exceptions. The strict adapters reject a route without complete published source authorization, mismatched source digests, duplicate source IDs, unresolved references and truncated evidence. They send only those public sources and the selected question as quoted data. No conversation history or private draft is implicitly authorized.

Generator output remains an `untrusted_draft`. Candidate claims use the existing claim contract: `kind`, `claimText`, and, for sourced claims, `sourceId`, `quote`, optional zero-based `occurrence`, and optional `attribution`. `text` must exactly equal the claim texts joined with two newline characters. Authoritative anchors, offsets, hashes and citation labels are constructed by Ask Bill's deterministic source verifier. A source quote can support a false paraphrase, so quote matching does not authorize display.

The review call reads all draft text, all claims and all evidence through a separately configured model request. It returns one indexed judgment per claim plus `allMaterialTextSupported`, `exceptionsPreserved`, `statusAccurate`, and bounded `reasonCodes`. Missing or duplicate judgments, unsupported schema fields and contradictory approvals fail closed. The response is marked `model_review`; this is fallible model judgment, not a human audit or a correctness guarantee.

`hashProviderDraft(draft)` and `hashProviderEvidence(bundle)` compute SHA-256 of `JSON.stringify` for the complete supplied object. The reviewer snapshots inputs before awaiting HTTP and returns these hashes as `draftSha256` and `evidenceSha256`. The application must compare both hashes and the selected version, reverify exact source spans, enforce its exception and claim-kind policy, and issue a private server grant before streaming approved text. An approval for one draft cannot be attached to edited text or a different evidence bundle.

## Speech output

The initial configurable defaults are `gpt-4o-mini-tts` and the built-in `alloy` voice. Only configured built-in voices are supported by this adapter. No custom cloning, celebrity identity, completed voice audition, licensed curated recording, word timing, or viseme support is claimed. The current Audio speech API supports these model/voice fields, WAV output and delivery instructions.[2]

TTS accepts a validated segment, never arbitrary raw text. It rechecks every quote against `lookupSource({versionId, provisionId})`, which must return the exact complete published source, its SHA-256 and matching scope. Source-only verbatim text must match its cited quotation. Reviewed paraphrases additionally require the optional constructor callback `authorizeSegment({segment, versionId, sessionId, conversationEpoch})` to return exactly `true`. That callback must validate a private server-issued grant for the original object, not a client-provided field. It is invoked with the original segment so a server `WeakSet` grant is usable.

The adapter asks for WAV and verifies actual RIFF chunks, PCM format, sample rate, alignment, byte rate and duration. Streaming WAV size sentinels are accepted only with complete bounded actual PCM data. Returned metadata contains exact text and audio hashes, session/version/epoch scope and the AI voice disclosure. No public audio URL is created. The application delivers the bytes only after a fresh scope check using private `no-store` HTTP, stops playback on interruption, and retains readable text as the fallback. Word timing and visemes are `null`, so the application must not claim precise lip synchronization.

## Speech input

The initial configurable model is `gpt-4o-mini-transcribe`. Requests use multipart file upload with a fixed extension-bearing filename, correct audio MIME type, the selected language and JSON output. The official transcription API documents this request shape and supported audio containers.[3]

Inputs can be a `Uint8Array`, `Blob`, or bounded array of those chunks, matching the existing push-to-talk driver's chunk contract. Supported inputs include WAV, WebM/Opus, Ogg/Opus, MP4/AAC and MP3. File signatures must match the declared container. Limits apply to actual bytes; WAV duration is also derived from its PCM frames. Compressed input signature checks do not independently decode its duration. The application must enforce recording limits at capture, byte and request budgets on the server, and avoid treating caller-supplied duration as a verified decoder measurement.

Transcription returns bounded non-empty text with `editable: true`, `automaticallySubmitted: false`, and `questionSubmissionAuthorized: false`. The visitor reviews/edits that text before a separate question submission. The adapter clears its mutable audio copy after use and writes no audio to disk, database, logs or object storage. Runtime Blob/fetch buffers are transient allocations subject to garbage collection, not a claim of forensic memory erasure. Provider-side retention is an account/data-policy issue independent of local disposal.

## Data protection and operational checks

`store: false` disables Responses application storage; it is not a promise of zero provider retention or end-to-end confidentiality. Check the selected OpenAI organization's actual data controls and all enabled endpoints before enabling the corresponding server feature.[4] The application can read questions and audio while processing them. Child free-input remains unavailable without the separate verified consent and provider controls required by the product's policy.

Run `node tests/openai-provider-integrations.test.mjs` and `node tests/openai-audio-integrations.test.mjs` for explicit subtest results. The tests cover request schemas, source and version tampering, source withdrawal, missing/contradictory model judgments, mutable review inputs, content-free failures, refusal/tool output, redirect rejection, size and duration limits, hung fetches, stalled-body cancellation, unauthorized paraphrase synthesis, malformed WAV, multipart upload, empty transcripts and no automatic submission. `tests/providers.test.mjs` retains the compatibility cases.

Before claiming live readiness, make minimal authorized credentialed calls for generation, independently configured review, synthesis and transcription; record the tested model IDs, build and source hashes, real cancellation behavior, audio playback, recognition quality, account policy and browser matrix. Never record secrets, personal questions, microphone bytes or unpublished provider text in that evidence. Disable individual unavailable capabilities while retaining public reading.

## Official references checked

1. [OpenAI structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs), checked 17 October 2026.
2. [OpenAI Audio: create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create), checked 17 October 2026.
3. [OpenAI Audio: create transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create), checked 17 October 2026.
4. [OpenAI platform data controls](https://developers.openai.com/api/docs/guides/your-data), checked 17 October 2026.
