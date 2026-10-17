# Ask Bill — 20 walking characters

This contains **all twenty actual animated .glb files**, three-character walking comparison, single-character audition, an optional seven-character shortlist, and a local-only launcher. Extract the ZIP fully before running it; don't open index.html directly from the ZIP.

**Mac:** Unzip, then open START-MAC.command (or open Terminal in this folder and run `python3 start_audition.py`).
**Windows:** Unzip, then run START-WINDOWS.bat (or run `py -3 start_audition.py`).
**Linux:** Open a terminal in this folder and run `python3 start_audition.py`.

Your browser will open the comparison. Move the pointer around each stage to watch Bill follow, or let the three wander. Choose any of the twenty, change animation clips, orbit the 3D models, shortlist up to seven and select your preferred Bill. For the one-character audition, use the link at the top of the page. Browser choice and shortlist are saved locally, and a JSON export is optional. There is **no demographic profiling, telemetry, account sign-in or AI service** in the evaluation kit.

**Requirements:** Python 3.10+ and an internet connection to load the pinned external Google model-viewer browser library from jsDelivr. The GLB models themselves and the entire application are included locally. The server binds to 127.0.0.1 only. Close the command window or press Ctrl+C to stop it.

**Animation audition:** All twenty characters now carry 33 baked glTF animation clips, including eight in-place dances: Waltz, Swing, Shuffle, Twist, Disco, Jig, Robot and Salsa. Use the animation dropdown to inspect each, or the **Surprise dance** button to start one immediately. If auto-idle is enabled, Bill may dance occasionally after the pointer/keyboard has been idle for a while; mouse movement, typing, selection, pause and reduced-motion preferences interrupt it. Dances are silent and do not play music. The new motion set is still an art-review candidate.

**Art warning:** These are animation-ready 3D *candidates*, not finished approved production sculptures. The first ten match the original concept's face textures but do not yet replicate all wardrobe, page folds and proportional details. In particular Option 10 must still be judged against the approved concept. Neither the gallery nor the shortlist means art approval.

**Source of truth:** https://github.com/neophilism/Ask-Bill (scripts/package-character-audition.py and assets/bill/characters/dist). The attached bundle manifest includes exact SHA-256 for the twenty binaries and all exported resources. Do not trust loose GLBs from unverified sources.
