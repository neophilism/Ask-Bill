# AB-004 follow-up: public read-only HTTP adapter

The source-only HTTP application requires a trusted, explicitly injected published-version lookup and server-configured publisher UUID before it can start. It is not wired to production and never runs by default. It does not use Bill's animation, voice or an AI provider.

Routes: GET/HEAD /bills/:billId/versions/:versionId, GET/HEAD the same URI with .txt for plain text, and /public-reader.css for a static stylesheet. Other methods and all encoded/query routes fail. No source is served if any public-release validation or tenant/version binding fails; backend failures return a generic 404.

Security response headers include CSP with scripts forbidden, same-origin styles only, referrer suppression, no-store, noindex and nosniff. HTML is escaped and works with JavaScript disabled. No user questions, secrets or private source data are collected.

Tests: node --test tests/public-source-http.test.mjs. Actual production DB authority checks, domain/service wiring, extended browser/screen reader tests and React/Next.js integration are still necessary. Do not promote incomplete or reviewed-only sources. AB-004 acceptance remains incomplete.
