# Ask Bill — Meshy API animation acquisition (owner's actual Bill model)

**State (2026-10-17): Code, plan and offline tests prepared; no Meshy credential, API rig task, provider-generated clips or paid requests available in the development session.** This document is **not** evidence that 171 animations have been downloaded, that the owner-uploaded model has been deployed, or that a production-ready face/voice rig exists.

This pipeline is independent of the exploratory 20-character roster and its 33 locally authored demonstration clips. It does not modify another product or change the live Ask Bill reader. Use only the model selected and supplied by the owner:

- Meshy source: <https://www.meshy.ai/s/S6iLKM> (public share page, **not** an API task ID or direct GLB download URL).
- Canonical user-uploaded model: `Meshy_AI_base_basic_pbr_Wave_for_Help_1.glb`; SHA-256 `5a66e18afcc2cecef1e031dda5b14ea03a44b7c55f0fbdb39043702ff59b3fb9`.
- Binary glTF 2.0, one PBR skinned mesh, one 66-joint Mixamo-style skeleton, embedded textures, one real clip `Wave_for_Help_1`; approximately 300,000 triangles, no lip-sync morphs. Keep this source immutable and outside the public repository until optimized, source/licensing validated, and approved for runtime use.

## Provider contract verified

- Meshy **web app** allows up to 20 selected animations per export. The documented **Animation API** accepts only 1–10 different `action_ids` in each `POST /openapi/v1/animations`, returns one GLB containing all the selected clips, and requires the `rig_task_id` of a completed **API** rigging task. A web share slug is not accepted.
- The plan in `tools/meshy/bill_action_plan.json` contains **171 distinct actions**, grouped into `core` (84), `extended` (36), `dance` (35), `antics` (16): 18 sequential API tasks at 10 or fewer actions each. `GET /animations/library` validates **live** action IDs before creating the first paid animation task.
- Current API pricing: **3 credits/action = 513 credits** plus **5 credits** if a new API rigging task is required. Meshy's web-app Pro included animations do not establish that the *API* is free. Before execution, create a project-scoped API key in Meshy's Developer Platform and set its **monthly credit limit** at the provider; `--max-credits` is an estimated forecast gate, not a substitute for the provider's enforceable key-level credit limit.
- API task results have signed asset URLs with expiration (typically 3 days). The importer downloads immediately, hashes the results, and saves only task IDs, safe action metadata, and checksums. No API key, source link tokens or signed download URLs are committed.

Sources: <https://docs.meshy.ai/en/api/animation>, <https://docs.meshy.ai/en/api/rigging>, <https://docs.meshy.ai/en/api/animation-library>, <https://docs.meshy.ai/en/api/authentication>, <https://intercom.help/meshy/en/articles/16815622-how-many-credits-does-each-meshy-api-task-cost>.

## GitHub Actions: where to put the API key (and what happens next)

**Use the Ask Bill repository only:** open <https://github.com/neophilism/Ask-Bill/settings/secrets/actions>, click **New repository secret**, choose the exact name `MESHY_API_KEY`, and paste the API key in the GitHub secret value. Do **not** paste the key into chat, an Actions workflow input, GitHub issue/PR, repository variable, committed `.env`, or source file. Meshy's API `GET /balance` reports the shared monthly/permanent account credit pool and consumes no credits. A provider-level **per-key monthly credit limit** is still recommended.

After this PR is merged, open **Actions → Bill Meshy API (manual) → Run workflow**:

1. Set `operation = balance`. The workflow calls the read-only Balance API using the GitHub secret, prints only authentication success, and never discloses the actual balance or spends credits. No model file or rig ID is needed to verify the key.
2. When you have a **completed Meshy API rigging task ID for this exact Bill** (not the `S6iLKM` web-app share code), add it as the repository Actions **secret** `MESHY_RIG_TASK_ID`; choose `operation = download`, select `tier` (`core`, `extended`, `dance`, `antics`, or `all`), and provide a numeric `max_credits` (252 core; **513 all**). Check the explicit asset-visibility acknowledgement, because this public repository's Actions artifacts should not be treated as private storage.
3. The workflow reads the rig task ID from `MESHY_RIG_TASK_ID` without printing it. It checks current account balance and live catalog before any paid animation requests, runs groups of **up to 10** and saves each task checkpoint, GLB and SHA-256 into the 7-day `bill-meshy-exports` Actions artifact. This artifact can be downloaded from the completed workflow run.
4. **If a run stops**, start a new run with the *same* API rig ID and tier and set `resume_run_id` to the earlier GitHub Actions run number (numeric run **ID**, not GitHub PR number). That downloads the earlier checkpoint before any API calls, preventing resubmission of already-recorded paid tasks. If a POST response was lost before the task ID was saved, find the accepted task ID in Meshy API Request Logs and supply a one-time `recover_batch` input. Without the prior state, rerunning may repurchase the same presets; do not start a fresh run unintentionally.

**A GitHub secret alone cannot turn the web-app share URL into an API rig task.** GitHub's runner also does not have the 35 MB GLB uploaded to this ChatGPT conversation. If no API rig task exists, rig the exact locally saved owner GLB **once** with the local importer (`--rig-from-glb` below) using an API key configured privately on that machine. Re-rigging can change its skeleton; visual/compatibility checks remain mandatory. The workflow's paid branch never silently uses a different source or exposes the key to normal CI.

The manual workflow is a controlled **asset-acquisition operation**, not a production deploy. It neither publishes Bill to the public website nor auto-merges generated GLBs to the repository.

## Local offline planning and tests (no account required)

```bash
python3 tools/meshy/fetch_bill_animations.py
python3 tools/meshy/fetch_bill_animations.py --tiers core
python3 -m unittest discover -s tests/meshy -p 'test_*.py' -v
python3 tools/meshy/merge_bill_animations.py --base /your/private/Bill.glb --inspect
```

CI runs the isolated Python tests with mocked provider responses and real small GLB fixtures; CI **must never execute paid endpoints** or upload the owner's private model. Existing Ask Bill source-only functionality remains available regardless of Meshy availability.

## Real animation acquisition (opt-in, can incur charges)

**Preferred:** Reuse an existing successful API rigging task for *this same Bill*, if one exists. In a private shell, configure the API key and rig ID (the key must not be pasted into chat, GitHub, frontend JavaScript, shell history or a public repository):

```bash
export MESHY_API_KEY='<set privately>'
export MESHY_RIG_TASK_ID='<completed Meshy API rig task ID>'
python3 tools/meshy/fetch_bill_animations.py --execute --max-credits 513 \
  --output /private/ask-bill-meshy-exports
```

If the owner's existing web-app rig does not have an accessible `rig_task_id`, Meshy's API cannot operate directly on `S6iLKM`. There is an explicit **re-rig** option using the original pinned GLB (up to 100 MB, uploaded only to Meshy by the owner's authenticated API request). This creates a new Meshy rig with potentially **different bones/bind transforms**. Check the resulting visual fidelity and rig before accepting it as the production baseline:

```bash
export MESHY_API_KEY='<set privately>'
python3 tools/meshy/fetch_bill_animations.py \
  --rig-from-glb /your/private/Meshy_AI_base_basic_pbr_Wave_for_Help_1.glb \
  --execute --max-credits 518 --output /private/ask-bill-meshy-exports
```

A direct HTTPS URL ending in `.glb` may be passed as `--rig-model-url`, but that is an expert option and not pinned to the original upload. Never pass the `meshy.ai/s/...` share page as a model URL.

After execution, review `tasks.json`, `catalog.json`, `download-manifest.json` and 18 real `animation-batch-NNN.glb` files. Each API batch stores its task ID before polling and verifies that the output contains the expected number of GLB animation clips; output GLBs are never taken from untrusted third-party hosts.

**Crash and billing safety:** Before any chargeable POST, the importer durably records a `submitting` checkpoint. If the connection fails before the API responds with an ID, the next run deliberately refuses to resubmit that batch: find the accepted task ID in the Meshy Developer Platform **Request Logs** and resume with `--recover-batch 1:<API-task-id>` (or `--recover-rig-task-id <API-task-id>` for a new rigging task). Successfully submitted/pending/downloaded tasks are never re-posted on resume; unexpected file hashes fail closed. Expired task outputs need human cost review rather than automatic rebilling. Use separate output directories for different tier selections or rigs.

## Merge and preserve the wave (after real downloads)

The offline importer copies **only actual keyframed glTF animation data**, not foreign meshes/materials/images or bogus metadata clip names. It requires the same joint names, hierarchy and rest pose and fails closed on mismatches:

```bash
python3 tools/meshy/merge_bill_animations.py \
  --base /your/private/Meshy_AI_base_basic_pbr_Wave_for_Help_1.glb \
  --motions /private/ask-bill-meshy-exports/animation-batch-*.glb \
  --output /private/ask-bill-meshy-exports/Bill-Animated.glb \
  --manifest /private/ask-bill-meshy-exports/Bill-Animated.audit.json
```

This path preserves the owner's original rig, appearance, and `Wave_for_Help_1`. **If the API-created rig differs from the owner's upload, do not silently force channels onto the wrong skeleton or call the result the original Bill.** A secondary preview can merge all batches onto `Bill-API-Rig.glb`, but it is a separate candidate and will not preserve the owner's original wave unless it is retargeted after a visual quality review. Proper bone mapping/retargeting may be required. This is a real production gate, not an optional lint warning.

Before production use, add facial visemes, test voice/gesture synchronization, select grounded source positions for pointing, verify foot-planting and root motion, reduce the very large mesh for mobile, add in-place/LOD variants, and run real browser visual/a11y/device tests. The current 33-clip exploratory character library remains isolated until these gates pass.

## Secrets, safety and rollback

- Do not expose a Meshy API key to the browser or store it in the repository, client cache, commit history, logs, analytics or diagnostic JSON. Treat task IDs and signed URLs as internal; signed URLs are ephemeral and are never persisted.
- Create a limited-credit Meshy API key for this one-time offline acquisition. No indefinite scheduler or website request handler may create new chargeable Meshy tasks.
- No speculative uploads to GitHub Actions artifacts in this public repository: the user's model and purchased animation output are acquired and reviewed in a private workspace.
- Rollback is deleting the new output directory or disabling the eventual runtime animation manifest. The original GLB, source text reader, gallery and unrelated applications remain untouched.
