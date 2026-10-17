# Ask Bill — optional voice direction (AB-079)

The owner-selected visual direction for Bill is a parchment gentleman with restrained courtly charm. Audio identity has **not** been selected, licensed, or connected. The initial website must work with text, keyboard and source citations alone.

Three provisional **text-only presentation styles** are recorded in `assets/bill/voice/direction.json`: Classic Bill (default warm, courtly), Plainspoken Bill (calm and concise), Curious Bill (lighthearted while exact about exceptions). These are not cloned voices, not third-party voice recordings, not a verified voice license, and not an approved external voice provider. User choice may eventually select a style independently of 3D character appearance; textual presentation must never modify the underlying verified claims/citations.

The `@ask-bill/voice/direction` module has a closed schema, one default profile, exact identifiers, bounds for delivery speed, an original-character identity requirement, and source-safety invariants. It deliberately **cannot** turn on TTS: `speechCapability` always returns disabled with the exact-text fallback until a separate live adapter, authorized identity/license evidence and provider data protections are implemented in AB-080–AB-088.

Reference lines test greetings, source numbers, decisive exceptions and responsible uncertainty. Later quality acceptance must compare a licensed voice's real pronunciation, warmth, restraint and performance with those text lines; model-only assumptions are insufficient.

No microphone, live synthesis, user tracking, biometric replication or published audio file is part of this PR. This project must not imitate any copyrighted/trademarked character's distinctive voice or a recognizable living person. Never promise the final 3D Bill has voice or mouth synchronization until those assets and browser/provider tests genuinely pass.

Rollback: default to text-only, which already works without a voice.
