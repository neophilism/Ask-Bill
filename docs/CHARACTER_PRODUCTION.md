# Bill: original 3D character production and delivery

The complete character work is specified by `docs/ARCHITECTURE.md` and units **AB-045–AB-062**, with performance/voice integration **AB-063–AB-088**. This is a production **contract**, not proof that a character asset has been made.

Bill should be an original friendly cartoon personification of a legislative bill: lively, goofy walking gait, happy/skeptical/curious expressions, gesturing near clauses and visually engaging for children without copying Clippy, Schoolhouse Rock's Bill or third-party protected designs. Define original silhouette, expression poses and owned textures, with evidence of license chain and editable creation source.

## Required sources and runtime package

- `assets/character/source/Bill.blend`: native editable Blender scene with labeled rigs/geometry/materials/texture sources and deterministic reproduction/export recipe.
- `assets/character/dist/Bill.glb`: tested binary glTF 2.0 export with embedded textures/materials, skinned mesh, baked clips, expression/mouth morphs and documented axes, scale, origin and neutral rest pose. Do not assert that uploading an arbitrary mesh makes it speak or walk.
- Named animation clips: **Idle, WalkFunny, Talk, Wave, Point, Laugh, Celebrate**. `WalkFunny` is an in-place seamless loop with application-owned root position; point direction and head/eye gaze have explicit anchors and limits.
- Face rig: body, eye, jaw and brows; blink/smile/joy/surprise/laughter plus visemes. ARKit-style 52 shapes preferred where practical, otherwise stable documented visemes and mapping table.
- A hashed asset manifest with source/export versions, clip durations, morph names, bounding volumes, permissions/license proof, texture hashes and GLB validation results.
- Offline proof video/preview and accessibility alternative. Production runtime still needs TTS, viseme alignment, cue director, motion/reduced-motion policy, collision/hit test and controls.

## Acceptance tests

Export from a **clean** Blender run using pinned scripts; use glTF validation, rig/morph/clip inspection, in-place walking checks, browser hardware tiers, deterministic seeded interactions, lip-sync jitter, text selection and focus stability, collision avoidance, caption parity, reduced-motion controls, and degraded/static bill illustration. Record real output artifact hashes and supported devices.

Optional VRM 1.0 export may be offered when sensible; GLB remains the requested main delivery. No provider key is required for offline model/animation creation. The final visual design is an original art decision subject to visual acceptance, not an imported trademarked icon.
