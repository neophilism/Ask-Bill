# Bill — approved Option 10 character direction

**Decision:** Owner selected **Option 10** from ten original Bill concepts on 16 October 2026. This is the selected visual direction for Ask Bill, superseding prior visual sketches. This document is an art and implementation handoff, **not** a claim that the production 3D character or AB-045/AB-046 acceptance is complete.

## Reference and provenance

- Original selected concept: the *Option 10* illustration generated in the Ask Bill design conversation on 16 October 2026; originally exported as `parchment_butler_character_concept.png`.
- Reference PNG: **1086 x 1448 pixels**, SHA-256 **`90c8726a42547eb3eb4408417fcef78e5e28fbd2aead7c889815ae332f310596`**. This conversation asset is **not yet checked into the repo or the character asset manifest**. Preserve the master and source permissions before producing reproducible derivatives. The text below deliberately stands on its own if the image becomes unavailable.
- Owner expressly approved Option 10 as a design direction, **not** any third-party likeness, third-party copyright material, final Blender model, or claim of legal clearance.
- This product is **Ask Bill** only. No source/asset/engine/service dependency on other products or companies is authorized.

## Nonnegotiable silhouette

1. **A single living sheet of parchment is the main body and face.** The readable front shows a paper border, faint legislative lines, and a friendly expressive face. At any angle he reads as one flat, flexible page, rather than an upright cylindrical scroll, a candle, or a human with paper headwear.
2. **Exactly one prominent upper-right forward curl**, made by folding/rolling the top edge of that *same* page. No symmetric pair of hair curls, double spirals, candlestick arms, flame-like crown or separate haircut.
3. The lower corners of the sheet fold and sweep **backward into long, animated paper tails** reminiscent of a gentleman's tailcoat. These are continuous extensions/folds of the same sheet, **not a separately attached cloth coat or two unrelated scrolls**. Rear and three-quarter views must clearly prove continuity of the paper.
4. The front paper body stays visibly open and legible. Printed bill-text cues and page edges remain observable even with accessories. Do not wrap him tightly into a cylinder, build an opaque humanoid torso, or cover the page with a jacket.
5. Small distinct hands/arms and legs/shoes may provide animation, but must not overpower the page silhouette. The character remains convincingly made primarily from **one page**, not a naked scroll with a full human outfit.

## Tailoring from the bill, not clothes over the bill

- **Navy-and-gold butler styling** comes from *printed navy ink panels, gold linework and folded paper lapel shapes along the page edges*. Any separate navy sleeve/trim must visually originate from these paper folds. Do not put a full conventional navy cloth coat over the parchment torso.
- A modest **cream ribbon/cravat** sits at the neck; it is the one obviously separate decorative garment-like accessory. Gold buttons are subtle surface appliques or printed motifs, not a heavy waistcoat hiding the bill.
- The flowing paper coattails are the character's most recognizable formalwear cue. They flutter with steps, settle on stops, and curl naturally behind him. No fabric cape.
- Polished dark shoes, simple pale arms/gloves and small gold accent details suit the courtly personality. They remain subordinate to the sheet of legislation.
- Palette target: ivory/parchment `#F1DEB8`, shaded fold `#D2B280`, midnight navy `#23314D`, restrained gold `#D1A354`, cream ribbon `#F6E9D6`, dark warm eyes `#3A2B2B`. These are art-direction starting points, not measured color-management acceptance.
- His face is bright, warm and expressive, with asymmetric soft brows, large eyes, a simple smile and no flame-shaped or wax-like anatomy. The body can bow, tilt and flex like paper without becoming rubbery.

## Originality constraints

Do **not** emulate the Schoolhouse Rock / “I'm Just a Bill” character silhouette, facial arrangement, printed-title placement, voice, catchphrases, costume details, poses, animated sequences or theme music. Do not copy the talking candlestick from *Beauty and the Beast* (no flame, candle shaft, candleholders, wax drips or multi-curl candle silhouette). Avoid the paperclip-assistant look. Originality is demonstrated through this broad sheet silhouette, one asymmetric forward curl, integrated ink-tailoring and continuous parchment tails; a legal clearance claim would require separate review.

## Modeling and animation acceptance direction (AB-045—AB-088)

- Produce **front, rear, left/right profile, 3/4 and neutral silhouette** studies and one close-up of the top curl joined to the page. Include a wireframe/UV continuity proof of the main sheet. At **96 px** height Bill must still look like a bill, not a suited child.
- Provide an **editable, reproducible Blender** source (`Bill.blend` plus build scripts) and tested binary glTF 2.0 `Bill.glb` with source/asset license ledger, materials, mesh provenance, rig, expressions and named animation clips per `docs/CHARACTER_PRODUCTION.md`. No concept PNG, placeholder illustration, proprietary third-party rig or mock animation counts as delivery.
- Animation vocabulary: `Idle`, `WalkFunny`, `Talk`, `Wave`, `Point`, `Laugh`, `Celebrate`, plus short attention glance, polite bow, thinking tilt, soft start/stop, turn, approach-to-highlight and gentle idle wander. Name/alias clips explicitly rather than assuming engine names map automatically.
- Animation layering should allow independent eye gaze, blink, eyebrows, expression, locomotion and paper-tail settling. Shoes meet the page-stage ground plane; tails flex without intersecting source text, answer controls or the cursor.
- Test clear front/side/rear sheet continuity, single top curl, coat styling integrated with paper, mobile legibility, dynamic silhouette, reduced-motion/static alternative, lower-tier device performance and deterministic interruption.

## Character personality and active attention

Bill is an **attentive, slightly whimsical gentleman**, not a sales mascot, roving pop-up or demanding assistant:

1. On **mouse movement**, he briefly looks toward the pointer without lurching. He may take a few unobtrusive steps when the pointer dwells nearby. His pace may gently build with longer dwell, with a firm upper bound and dead zone; he never chases every pointer twitch.
2. After a long stationary/inactive period, he can relax, glance around or take a small **idle wander** in designated nonblocking page-stage space. Fresh user interaction preempts it immediately.
3. **Selecting highlighted text takes priority over cursor-following.** He walks to a safe, visible position beside that source selection and offers a few relevant likely questions, then a text input. If the selection is offscreen, inaccessible, version-stale or no safe path exists, he stays in his dock and offers an accessible focus/scroll action. Never stand on the selection, keyboard target or citation.
4. **Text is the default.** Voice is optional, permission-based and explicitly activated. Questions go through Ask Bill's source-version-grounded retrieval and answer validation; character choreography never decides source truth.
5. For the optional **question read-back** behavior, allow the user to review/edit/cancel before an answer is delivered; occasionally read back initially, then offer a simple persistent preference after several questions. Keep user controls accessible and never secretly transmit microphone audio.
6. OpenAI, Anthropic Claude and xAI Grok adapters may be compared through **explicit model selection** when credentials, privacy terms and source-validation gates are satisfied. The same Ask Bill-controlled **session context and consent-bound memory** must work regardless of model. Anonymous history stays local/session-only by default; persistent memory requires clear opt-in, inspection, deletion and no cross-tenant leakage.
7. **Future gaze/eye tracking** is an optional explicitly permissioned input to the same local attention controller; it is neither necessary nor enabled in the initial release. No covert camera collection or storage of raw gaze without specific informed consent.
8. Always support hiding, pausing, reduced motion, keyboard-only/touch use, and graphics-free source reading. Motion never obstructs a passage or blocks an answer.

## Implementation and evidence boundaries

This **locks the visual design choice** only. It does **not** finish AB-045 originality/provenance verification, AB-046 turnarounds, AB-047+ 3D modeling, production source/export, animation, cursor-follow implementation, voice, memory, third-party model adapters or deployment. All remain subject to their original plan dependencies and acceptance checks. Keep source truth and user-input accessibility independent of visual animation.
