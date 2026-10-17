# AB-080 guarded speech admission (partial)

Ask Bill's existing streaming server currently denies \`speech.ready\`; this PR does not change that. A synthesized voice is **not** licensed, no public voice provider has been selected and there are no live TTS endpoints.

The provider-neutral \`@ask-bill/voice/tts\` module verifies version-pinned, independently reviewed **verbatim** legal-source segments against a trusted server-side published source lookup before producing a fingerprinted *speech preflight*. Its output always contains \`synthesisEnabled:false\`, \`deliveryAuthorized:false\` and a text-only fallback. Neither caller-provided flags nor model text can start synthesis.

Controls: exact structural validation, published/versioned source digest matching, Unicode spans, session/epoch pinning, cancellation, text/duration budgets, persona bounds, strict candidate-audio digests, and no direct public/private audio URL. The speech-provider and delivery methods fail closed until original voice rights, licensed selection, provider protections and separate live integration tests exist.

Test coverage: \`node --test tests/tts-gate.test.mjs\`. These are offline negative/contract tests, **not** proof of real TTS, billing settlement, tenant object storage, child consent or audio delivery. AB-080 remains partial. The public source reader continues without voice; no third-party product integration.

Rollback: remove \`packages/voice/tts/\` and its optional export. No hosted audio or secret needs cleanup.
