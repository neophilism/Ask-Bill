# Bill mesh topology source (AB-048)

The editable procedural source is `tools/blender/generate_bill.py`. Its GLB can
be imported into Blender with `tools/blender/import_candidate_to_blend.py` and
saved as `assets/bill/source/Bill-Candidate.blend`. These outputs are **candidate
review assets**, not the approved production `Bill.blend` or release manifest
entry. The build does not register a production character.

## Rebuild and inspect

```sh
python3 tools/blender/generate_bill.py --output assets/bill/runtime/Bill-Candidate.glb
python3 tools/blender/mesh/audit_glb.py assets/bill/runtime/Bill-Candidate.glb
python3 tools/blender/mesh/stress_glb.py assets/bill/runtime/Bill-Candidate.glb
python3 -m unittest discover -s tests -p test_candidate.py -v
python3 -m unittest discover -s tests -p test_mesh_topology.py -v
blender --background --factory-startup --python tools/blender/import_candidate_to_blend.py -- assets/bill/runtime/Bill-Candidate.glb assets/bill/source/Bill-Candidate.blend
blender --background assets/bill/source/Bill-Candidate.blend --python tools/blender/render_candidate_in_blender.py -- assets/bill/review/blender
```

The native CI job publishes the editable `.blend` as a short-lived review
artifact; the turnaround job publishes six views, three stress-pose views and
`render-evidence.json`. The audit rejects open solid surfaces, degenerate or
inverted faces, bad normals, invalid UVs and weights, and unexpected topology.
The mouth is intentionally a single open expression surface. Numerical morph
checks and stress renders are separate: neither proves final silhouette,
joint clearance, material finish, or owner art acceptance.

## Geometry in this candidate

The parchment is one capped front/back sheet with a continuous upper-right
fold, rather than a separate strip attached to a capped edge. Eye details,
upper eyelids, articulated arm and leg segments, elbow and knee covers, gloves,
and shoes are separate material and control regions. Stress views bend elbows
and knees, compress the sheet, and exercise eyelid and mouth expressions.

Remaining production work includes refined connected limb deformation loops,
final UV seams and art-directed materials, corrective poses, visual review of
all stress renders, an accepted native source file with provenance and hash,
and a final export bound to `assets/manifest.json`. Keep the AB-048 PR draft
until these are evidenced. Restore the prior generator and regenerate derived
GLB/Blender artifacts if a topology change regresses the visual candidate.
