# AB-047 — Option 10 procedural 3D blockout (development candidate)

**Status: partial, NOT character production acceptance.** This Ask Bill branch adds real, inspectable glTF 2.0 geometry and animation instead of substituting a static image for a 3D asset. Owner selected Option 10; see `assets/bill/design/OPTION_10_APPROVED.md`. AB-046 full concept/turnaround acceptance and AB-047 clean Blender acceptance remain outstanding.

## What is actually built

- Continuous front/back single parchment page mesh, **one upper-right folded curl** and swept-back lower sheet tails. Navy/gold coat-style ink is textured onto the paper; cream cravat, eyes, hands, shoes remain subordinate accessories.
- Three skinned sheet bones with inverse bind matrices; articulated shoulders and hips; two page flutter/breathe morph targets and fourteen geometry-based mouth viseme morph targets.
- In-place glTF animation clips **Idle, WalkFunny, Talk, Wave, Point, Laugh, Celebrate, Look**. The reader must plan and own on-screen travel; the model never selects a citation or DOM coordinate.
- Original embedded PNG texture, generated in Python stdlib without third-party character meshes.
- A deterministic dependency-free exporter and seven structural tests. A separate GitHub Actions job builds and uploads a **review-only** GLB artifact.

## Rebuild

From the repository root run:

    python3 tools/blender/generate_bill.py --output assets/bill/runtime/Bill-Candidate.glb
    python3 -m unittest discover -s tests -p test_candidate.py -v

With a real **Blender** installation, generate an editable **candidate** scene:

    blender --background --factory-startup --python tools/blender/import_candidate_to_blend.py -- assets/bill/runtime/Bill-Candidate.glb assets/bill/source/Bill-Candidate.blend

The Blender import/conversion step was **not verified** in the current environment. The `.blend` file is not committed and must not be declared delivered. The GLB is an early stylized blockout, **not the selected concept rendered at final quality**, not yet integrated with Three.js, and not verified by the official Khronos glTF validator. Local review loaded the GLB in Trimesh and VTK and rendered five turnaround views; the seven structural tests cover binary bounds, skins, morphs, clip channels and exact rebuild.

## Delivery separation

The GitHub CI build artifact is an experimental candidate. Do not add it to the public character manifest or enable production use until AB-048–AB-062 gates. Native-source editability, mesh deformation, glTF conformance, foot lock, polygon/texture budgets, visual approval, mobile/reduced-motion fallback, interaction security and accepted performance remain open.

**Provenance:** all candidate mesh/texture code is original to Ask Bill. Generated demonstration file is not an authoritative legislative document; no third-party copyrighted visual references are embedded.
