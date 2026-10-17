# AB-081 speech pronunciation and timing alignment (partial)

This is an independently owned, **non-audio** Ask Bill module. It maps exact approved legislative text Unicode-codepoint offsets to a speech-friendly rendition, preserving a reversible reference back to the original source. Only \`§\`, \`Sec.\` and \`U.S.C.\` are expanded for English. Numbers, exceptions, dates and original citations are never reinterpreted. Spanish leaves the original source wording alone; this does not claim a Spanish translator.

Provider timing can be normalized from validated speech spans and viseme labels. Every word is re-mapped to the exact source range, even when it falls inside an abbreviation expansion. Wrong text, stale spans, overlong duration, backwards timings and unknown morph labels fail. A static/browser-supplied mapping cannot masquerade as a locally generated verified mapping. No playback, voice, lip-sync, private data processing or provider is enabled.

Run \`node --test tests/speech-alignment.test.mjs\` after packages have installed. This is a partial AB-081 scoped contract, not audio QA. The approved AB-081 acoustic alignment and licensed TTS samples remain pending; keep text-only.
