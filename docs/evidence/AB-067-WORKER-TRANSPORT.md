# AB-067/068: structured-clone-only browser Worker traversal (follow-up)

The measured graph includes a `reachable` method, so posting it directly to a Worker throws DataCloneError. `buildWorkerTraversalGraph` constructs a graph **inside** AB-067's bounded, source-version-checked builder, then emits only JSON-style frozen metadata (version, revision, safe nodes, edges). This API never accepts a forged model-supplied graph object. The Chromium acceptance test from PR #85 now uses this explicit transport contract.

Local Node 22.16.0: four transport/negative tests designed to reject selectors, cross-version sources, unsupported obstacles and method-bearing graphs; existing 32 navigation regression tests remain required. Exact-head hosted Chromium and full CI must pass. No user character GLB edits, provider calls or real legal questions. Rollback to dock until safe transport is available.
