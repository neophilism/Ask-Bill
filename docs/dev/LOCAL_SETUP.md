# Ask Bill offline and local development

This document describes Ask Bill's local application. For database/bootstrap, publisher and live adapter configuration, use [the runtime guide](../ops/APPLICATION_RUNTIME.md).

## Tools

Node 24.19.0 and pnpm 10.18.1 are pinned in `toolchain.json`. From a clean checkout, run `corepack enable`, `corepack pnpm install --frozen-lockfile`, `corepack pnpm build` and `corepack pnpm test`.

Run `corepack pnpm dev`, then open `http://127.0.0.1:4100`. This explicit loopback-only mode serves a complete synthetic document, temporary sessions and exact-source questions without a provider. It cannot start in production. `pnpm start` requires the database-backed runtime configuration. The older `pnpm preview` remains a distinct incomplete-excerpt design demonstration.

## Optional backing services

`infra/local/compose.yaml` defines localhost-only an optional loopback-only PostgreSQL 17.11 instance. Set `ASK_BILL_DEV_DB_PASSWORD` in your private terminal environment (never in Git). Invoke `docker compose -f infra/local/compose.yaml --profile db up -d` only when database work is needed. Storage remains disabled until a supported, patched backend is selected and tested. The previously proposed MinIO community image was removed due to GHSA-xh8f-g2qw-gcm7 affecting its final OSS release; do not restore that image. This compose file is not proof of a running database.

## Provider toggles

`ASK_BILL_ALLOW_LIVE_AI`, `ASK_BILL_ALLOW_VOICE`, `ASK_BILL_ALLOW_TRANSCRIPTION`, `ASK_BILL_ALLOW_PUBLISHING` and `ASK_BILL_ALLOW_OFFICIAL_IMPORTS` default off. The application now implements the corresponding adapters; activation requires explicit private configuration and the documented operational gates. Production/staging public origins require HTTPS. Only an allowlisted capability response reaches the browser; server configuration and keys never do. The legacy fixture-settings module deliberately refuses live activation and directs callers to the real application runtime.

Never commit real credentials or personal content. Do not copy `.env.example` into a tracked file containing secrets. The real PostgreSQL tests require an explicitly supplied disposable loopback database. Source sandbox activation additionally requires a successful host isolation probe.

## Verification

Run `corepack pnpm verify`. For native audio coverage, install FFmpeg and set `ASK_BILL_REQUIRE_FFMPEG=1`. GitHub Actions separately exercises real Chromium, PostgreSQL, PDF extraction and the built application image. Its exact PR-head result is the merge gate; local fixtures do not establish credentialed production acceptance.
