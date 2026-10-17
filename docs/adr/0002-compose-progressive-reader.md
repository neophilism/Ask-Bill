# ADR 0002: compose the existing semantic reader into the application

Date: 2026-10-17. Scope: the current public and publisher application.

The architecture targets React/Next.js for server-rendered routes. The implemented repository already has independently tested semantic HTML readers, exact source rendering, accessible source tools and Node HTTP adapters. This integration reuses those implementations in `apps/web/application` and progressively adds browser modules for conversation and speech.

The choice delivers real reader and publisher journeys without changing the trusted source renderer or making source access depend on client hydration. It is a deliberate implementation difference from the framework target, not a claim that a Next.js application was built. The runtime contracts, content/storage boundaries and separate ingestion worker remain applicable. A later framework migration can host the same modules without rewriting authoritative source text or citation validation.

The public application serves only explicitly allowlisted browser modules. Server provider adapters, database drivers, encryption keys, identity code and private storage code cannot enter that module map. Publisher forms work without JavaScript. Reader enhancements fail back to server-rendered source text. All assets and character integrations remain under their existing ownership and acceptance gates.

The tradeoff is maintaining a small HTTP/router and DOM-controller surface directly. HTTP integration tests, actual Chromium journeys, strict request schemas, CSP, same-origin session APIs and source hash checks cover that surface. The old incomplete-excerpt preview remains separately runnable and cannot activate live providers.
