# Versioned owned assets for Ask Bill

AB-006 establishes a manifest-governed, immutable-hash-addressed production asset policy. The only **release-manifest-registered** entry is the original test fixture in `assets/manifest.json`. The final owner-approved `assets/character/source/Bill.blend` and `assets/character/dist/Bill.glb` are **not delivered**. The production character release gate still deliberately fails.

## Experimental 20-character gallery assets

There are now **20 actual animated preview GLBs** at `assets/bill/characters/dist/bill-01.glb` to `bill-20.glb`, each with independent SHA-256 in `assets/bill/characters/dist/manifest.json`. Each can be rebuilt with `tools/blender/roster/generate_roster.py` from the 10 compact original-reference face textures, procedural mesh source and pinned Pillow dependency. The first 10 are interpretations of the original 10 visual options, and 11–20 are intentionally different book, scroll, origami, docket, folded-card, newsprint and digital-styled forms. Option 10 is the default for **audition only**.

**The audition collection is deliberately NOT part of `assets/manifest.json`**, is not in production runtime, and must never cause `--require-character` to pass. The user's earlier rejected Option 10 blockout remains rejected. Source art and physical rig are exploratory, not a photorealistic match to every illustration. Until the user chooses and accepts character(s), these assets are not approved mascots.

Review via `apps/web/preview/characters.html` under a localhost server. The preview intentionally uses a pinned externally hosted third-party 3D viewer module and is not authorized for production deployment without a reviewed local bundled dependency and CSP. Downloadable GLB files in the repo do **not** imply a validated production app, accepted look, or privacy/security compliance.

Full source, asset provenance, generation, testing and audition instructions: `docs/character/CHARACTER_ROSTER_20.md`.

## Active production manifest

The only active release manifest is `assets/manifest.json` with source ownership, exact output path, expected SHA-256, length, storage policy, asset kind and whether it is release-critical. Larger final editable `.blend`, authorized textures and exported `.glb` need separate accepted sources, rights and immutable packaging. Allowed remote hosts remain empty by default; no arbitrary external asset host is trusted.

Run `node tools/assets/verify.mjs` or `pnpm assets:validate` to verify existing owned fixtures. Run `node tools/assets/verify.mjs --require-character` to test the **future** production character requirement; it should still fail intentionally.

## Ownership and security

No third-party source model, commissioned voice, likeness or proprietary assets are included. The first 10 use compact derivatives of their original user-selected character-concept illustrations with exact source and crop hashes in the character-roster document. No demographic data or survey personalization is used to choose a default. Immutable hash checks, no symlinks or out-of-root paths and approved license provenance remain required for production.

No preview GLB may be registered as the final Bill merely because an automated binary test or render job succeeds.
