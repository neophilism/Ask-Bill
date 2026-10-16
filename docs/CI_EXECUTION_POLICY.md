# CI execution policy — explicit bootstrapping decision

**16 October 2026.** The Ask Bill repository was created without an installed GitHub Actions workflow. The existing CircleCI YAML is a **configuration file**, not evidence that any CircleCI project/webhook is connected. On inspection of PRs #1–#7, GitHub reported no status checks or workflow runs. The owner has directed continued development with verified tests before merging.

To prevent additional unverified PR accumulation, `.github/workflows/ci.yml` is deliberately introduced as the **active, native GitHub evidence source** for foundation and workspace checks until an authenticated CircleCI project actually reports checks. The CircleCI YAML is retained as migration/reference configuration, not claimed operational. This deliberate fallback is a recorded deviation from the originally preferred CircleCI gate, not an accidental competing build.

The workflow uses Node from `.node-version`, no service secrets, minimal read-only GitHub permissions, guarded one-branch-per-PR concurrency, and validates `npm run check` unconditionally. Only on branches containing a pnpm lockfile does it also perform a frozen dependency install, source lint, strict type checks, application tests, compilation, registry checks and optional asset verification. A check passing on a branch **does not** substitute for staging/browser/DB tests or independent operational acceptance.

All PRs must be checked against their **exact** current head, and a failed, missing, or cancelled check remains blocking. Do not invent GitHub status contexts or bypass unrelated branch policy. If CircleCI becomes operational, explicitly select one canonical required gate to avoid duplicated checks and update this note after verifying the live integration; do not silently suppress checks.

No third-party product, company, data store or infrastructure is a dependency of Ask Bill.
