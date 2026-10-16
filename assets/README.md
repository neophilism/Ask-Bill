# Versioned owned assets for Ask Bill

AB-006 chooses a manifest-governed, immutable, hash-addressed storage policy rather than pretending that the final 3D character is already committed. The **only included asset is a tiny original text fixture** to test the verification pipeline. There is no `Bill.blend` or `Bill.glb` in this repository yet.

## Manifest contract

The only active manifest is `assets/manifest.json`, with source ownership, license, exact relative output path, expected SHA-256 and length, asset kind, and whether it is release-critical. Committed test fixtures are verified from the checkout. Larger editable `.blend`, authorized textures and exported `.glb` will be supplied later through an approved versioned object store with immutable URLs and per-file digest verification. The allowed remote hosts list is empty by default: **no arbitrary external asset host is trusted**.

Run `node tools/assets/verify.mjs` or `pnpm assets:validate` to verify current owned files. Run `node tools/assets/verify.mjs --require-character` to test the **future** character release requirement; it currently fails intentionally because the real editable and exported Bill assets are missing.

## Ownership and security

Assets must be original or covered by an auditable license/attribution; record the source owner and license before retrieval. Reject symlinks, out-of-root paths, mismatched sizes, SHA-256 mismatches, duplicate IDs, unknown kinds and unapproved HTTPS hosts. Hashing is streamed rather than loading large 3D binaries entirely into memory. Clean local builds do not require credentials or a remote asset host.

No model import, performance claim or visual acceptance is made until the character production milestones supply validated source and export artifacts.
