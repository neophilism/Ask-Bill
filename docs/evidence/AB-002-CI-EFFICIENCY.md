# Ask Bill native CI efficiency — AB-002 follow-up

The active GitHub Actions workflow runs once per **pull request** (including every synchronize/update) and again on **main** after merge. Previously every `ab-*` branch change triggered a second, redundant push workflow, consuming the same four CI jobs and delaying the dependent PR chain. Reducing push triggers to main leaves required exact-head PR checks fully active; orphaned branches without a PR intentionally do not run hosted CI until an actual PR is opened.

Chromium is installed via the pinned `playwright==1.57.0` and `python -m playwright install --with-deps chromium`, with a cache keyed by runner OS + exact Playwright version. Only `~/.cache/ms-playwright` browser binaries are cached, never provider tokens, source drafts, histories, test credentials or `node_modules`. Workflows retain `contents: read` and cancel stale runs per ref.

Regression: `node --test tests/ci-workflow.test.mjs` checks event triggers, pin-specific cache and retained quality/browser/database/PDF gates. Current-head GitHub CI must pass. No change to customer-facing runtime or unrelated company resources. Rollback: restore the prior workflow's push branch filter, remove the cache step.
