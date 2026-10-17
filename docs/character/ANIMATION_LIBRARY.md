# Bill's 33-clip animation library (development candidate)

**Scope:** all twenty selectable Ask Bill characters. This is a source-owned reusable animation vocabulary; original 10 visual likeness and finished animation polish still need the owner's approval. It does not authorize replacing the selected Option 10 visual direction.

## Inventory

The canonical machine-readable clip contract is `assets/bill/characters/animation-library.json`. Every exported `bill-01.glb` ... `bill-20.glb` must contain the following true glTF 2.0 animation channels, not placeholder labels.

- Eight backwards-compatible clips: `Idle`, `WalkFunny`, `Talk`, `Wave`, `Point`, `Laugh`, `Celebrate`, `Look`.
- Six atmospheric, low-intensity idle clips: `IdleLookAround`, `IdlePaperFlutter`, `IdleFootTap`, `IdleStretch`, `IdleInspect`, `IdleYawn`.
- Eleven explanation, attention and emotion clips: `Think`, `Read`, `Nod`, `ShakeHead`, `Shrug`, `Bow`, `Greet`, `Curious`, `Explain`, `Surprised`, `Cheer`.
- Eight **different in-place choreographies**: `DanceWaltz` (swaying three-beat steps), `DanceSwing` (kicks), `DanceShuffle` (heel-toe and lateral steps), `DanceTwist` (torso yaw), `DanceDisco` (alternating arm points), `DanceJig` (hops), `DanceRobot` (angular isolations), and `DanceSalsa` (syncopated lateral stepping).

Dances are keyframed as different joint and root-space trajectories and loop with matching first and final poses. They contain no licensed music, trademarks or prerecorded audio. Their movement is scaled down for rigid book/docket/tablet body forms, and live 3D root travel is owned by the reader renderer rather than the GLB clip.

## Safe automatic idling

The *runtime*, not the glTF file, owns when to play a clip. If all motion is permitted, the user is present, no text is selected and no question, answer, speech or input is active, Bill can play a short boredom performance **after a randomized 45–75 second dwell**. Return to a nonintrusive idle after the short performance; repeat only after a **105–195 second cooldown**, rather than dance constantly. Prefer subtle idle gestures; dances occur about 28% of eligible events. Performances are seeded for testability and avoid immediately repeating the prior action.

**Interrupt immediately** on pointer, keyboard, touch, source text selection, text entry, a question or spoken input/output, pause, hidden tab, scene reset or reduced-motion preference. No model-generated string/selector controls animations and no camera/eye tracking is enabled. Optional user actions can explicitly audition dances without waiting for boredom. Normal content reading, accessibility and accurate legal answers always take precedence. The controller cannot cross protected text regions.

## Build/verify and release boundary

```sh
python3 tools/blender/roster/generate_roster.py --references assets/bill/characters/reference --output assets/bill/characters/dist
python3 -m unittest discover -s tests/character-roster -p 'test_*.py' -v
python3 scripts/package-character-audition.py --output dist/AskBill-20-Walking-Lab.zip
```

The roster PR workflow commits the **actual regenerated binary GLBs and updated SHA-256 manifest** back to the PR branch after positive tests. Tests parse real binary sampler buffers, check loop seams, joint motion diversity, animation metadata, rig presence and reproducibility. The kit-packing workflow verifies clips before uploading downloadable artifacts. This **engineering verification does not replace hand-reviewed animated visual quality, real-world speed/device benchmarks, semantic expression QA or the final production animation gate**.
