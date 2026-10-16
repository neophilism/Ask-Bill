# Ask Bill

A future conversational, animated guide to legislation. Bill's character, voice and performance are separate from Law Machine's source models, citations and simulation engine.

## Saved status — 2026-10-16

The owner requested an immediate repository checkpoint before usage expires. This commit preserves the agreed character delivery requirements and continuation instructions. No Ask Bill application, talking-character runtime or deployment has been implemented in this thread. Active engineering work is in [Law-Machine](https://github.com/neophilism/Law-Machine): foundation PR #1 is merged; workspace implementation is checkpointed in [PR #3](https://github.com/neophilism/Law-Machine/pull/3).

## Bill asset delivery contract

Preferred delivery: `Bill.glb` (binary glTF 2.0), with all textures embedded, plus the editable `Bill.blend` source. GLB should contain the mesh, materials, skinned skeleton, baked animation clips and named facial morph targets. A plain static mesh is insufficient for the intended performance.

- Rig the body, eyes, jaw and brows. Use a consistent neutral rest pose and document the forward direction and scale.
- Include named animation clips: `Idle`, `WalkFunny`, `Talk`, `Wave`, `Point`, `Laugh`, `Celebrate`. WalkFunny should be a seamless in-place loop so the application controls movement without fighting root motion.
- Include facial shapes for happiness/smiling, blinking, surprise, laughter and speech. An ARKit-compatible 52-blendshape set is preferred when practical; otherwise provide a named, documented viseme set and an expression mapping.
- Export baked skeletal/morph animation. Remove dependence on Blender-only modifiers, drivers, procedural shaders or external texture paths.
- Include a short preview showing the walk, gestures and expression range. A brief voice reference is useful for defining the cartoony delivery.
- Optional alternative: VRM 1.0 (`.vrm`) for a humanoid skeleton, with standardized expressions and gaze. GLB is more flexible for an unusually shaped cartoon bill.

The file supplies appearance and animation data. Speech synthesis, voice selection, timing, lip sync, navigation, expression blending and conversational behavior must still be implemented in the application. No format alone guarantees a fully working talking character. Never promise that a static uploaded asset will automatically gain the requested gait or facial rig.

Technical references: [glTF 2.0 specification](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc), [VRM 1.0](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0).

## Shared integration boundary

The planned Law Machine SDK exposes versioned releases, provisions, exact citations, glossary entries, hypothetical scenarios, trace explanations and semantic focus targets. Ask Bill must use those versioned sources; character animation must not invent legal rules or simulation outcomes. The SDK is planned, not currently delivered.

Keep this repository's character/conversation code separate from Law Machine. Do not copy Law Machine's 60-unit registry here or claim it as Ask Bill progress. Retrieve any separately approved Ask Bill architecture and plan before assigning approved work IDs; no Ask Bill denominator is invented in this checkpoint.

## Owner delivery and review policy

AI agents own implementation, security/source review, all applicable automated/integration/browser/adversarial tests and fixes. Human rechecking of critical tests is later follow-up and is not a prerequisite for development, merging or deployment. Do not wait for paid audits or certification. Fix actual failed tests and vulnerabilities; do not relabel them passed. Keep implementation, testing, independent review, certification, merge status and operational acceptance separate.

Never commit credentials, private source uploads or real legal claims. Use an explicit scoped PR, preserve concurrent work, inspect live branches before claiming a unit and checkpoint work frequently. The current user asked to continue Law Machine toward at least 15 of 60 completed units, preferably 30; this asset handoff does not count toward those units.

## Next steps

1. Recover and adopt the separately approved Ask Bill plan, if available, using the current shared `registry/prs.json` contract. Do not fabricate a prior plan.
2. Inspect the uploaded Bill asset and validate rig, clips, textures, morph names and export integrity.
3. Implement a local character preview with clip/expression controls, reduced motion and accessible text alternatives.
4. Connect dialogue and speech through explicit provider adapters; request only the concrete credential needed, through secure configuration. No API key is required for the model asset or local preview.
5. Implement timed visemes, expression/gesture blending and the funny walk. Validate the real character and voice together before claiming readiness.
