# Option 10 attention and text-selection playground (partial AB-070/AB-072)

**Experimental only.** This source-only preview is not production 3D navigation or an AI chat interface. It demonstrates a safe deterministic local motion controller separate from the GLB candidate and keeps all questions private to the browser.

Run from the repository root:

    python3 -m http.server 8000

Then open `http://localhost:8000/apps/web/preview/option10-playground.html`.

## Implemented locally

- Pointer attention: look immediately; start to move after a 550 ms stationary dwell; modest acceleration capped at a configured 150 CSS px/s; after prolonged stillness enter bounded seeded wandering.
- Text selection: only the local fixture DOM adapter may mark a range as `validated`, with integer offsets and exact source-version pinning. Its priority overrides pointer-follow. An outdated or unvalidated anchor is rejected, never passed to model choreography.
- Avoidance: the controller will not enter a protected rectangle (the demo uses a separate stage, not an overlapping legal-text layer). For blocked targets it docks rather than trying unsafe paths.
- User priorities: reduced motion, pause, hide and text-input focus immediately preempt travel. The experiment provides a keyboard-highlight path and an accessible text question field. It has no real microphone, camera, model provider, session persistence or legal answer generation.
- Safety tests cover dwell, selection precedence, malformed/version-stale anchors, obstacles, interruptions, clock bounds and seeded deterministic paths.

## Integration remains

AB-065/066 must securely bind source version, DOM measurement revisions, user scroll and canvas coordinates; AB-067/068 needs obstacle routing with safe-viewport geometry; AB-069 needs stride and foot locking in the actual GLB. AB-071 must fence late events and new questions. AB-075 must validate reduced-motion, full keyboard and touch behavior. Only after these may AB-072, AB-077 and the final cinematic gate be accepted. This HTML playground is intentionally not used as a production source reader.

**Privacy:** The prototype never sends text to a provider or connects to the network, and never accesses microphone, eye tracking or long-term memory. The real Ask Bill API still needs independent source-grounded generation approval.
