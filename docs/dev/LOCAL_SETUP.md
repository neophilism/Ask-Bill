# Ask Bill offline and local development

This document describes AB-005's provider-independent configuration. Ask Bill is operated independently of any unrelated company or website.

## Tools

Node 24.19.0 and pnpm 10.18.1 are pinned in `toolchain.json`. From a clean checkout, run `corepack enable`, `corepack pnpm install --frozen-lockfile`, `corepack pnpm build` and `corepack pnpm test`.

The AB-004 reader preview adds `pnpm preview`. Run it on that branch (or after its merge), then open `http://127.0.0.1:4100`. It requires no provider account, database or microphone. The fixture is explicitly incomplete and is not publishable.

## Optional backing services

`infra/local/compose.yaml` defines localhost-only PostgreSQL and S3-compatible MinIO services, each behind its own Docker Compose profile. Set `ASK_BILL_DEV_DB_PASSWORD`, `ASK_BILL_DEV_STORAGE_USER`, `ASK_BILL_DEV_STORAGE_PASSWORD` in your private terminal environment (never in Git). Invoke `docker compose -f infra/local/compose.yaml --profile db --profile storage up -d` only when those services are needed. This compose file is not proof of a running database or working storage adapter.

## Provider toggles

`ASK_BILL_ALLOW_LIVE_AI` and `ASK_BILL_ALLOW_VOICE` default to disabled. They fail closed even when a key exists, because real adapters have not yet been implemented. Production public origins require HTTPS; runtime configuration does not return raw credentials to the browser. The fixture adapter returns only explicitly labeled incomplete-source text, never an authoritative legal conclusion.

Never commit real credentials or personal content. Do not copy `.env.example` into a tracked file containing secrets. Browser API/voice, database migrations and operational integration tests are separate future PRs.

## Verification

`tsc -p packages/config/tsconfig.json` and `node --test tests/config.test.mjs` cover missing credentials, HTTPS origin rules, fake provider semantics, denial of unimplemented live adapters, and safe serialization. Full CircleCI and Docker Compose integration remain pending until observed on the live repo.
