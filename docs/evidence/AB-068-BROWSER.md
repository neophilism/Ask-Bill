# AB-068: real Chromium module Worker integration regression (follow-up)

Adds a read-only, localhost-only fixture server and Python Playwright test using actual Chromium at 320px and 1280px. Browser measures semantic DOM geometry, creates viewport-to-canvas coordinates, builds protected ledges from DOMRects, sends **structured clone only** graph nodes/edges to a module Worker, waits for a bounded safe route, then asserts source-version mismatch, selected-text obstruction dock, reduced motion and retained keyboard focus. The source fixture contains no real law, personal information, image assets or provider calls.

Security: fixture HTTP exposes only an explicit five-route allowlist and no executable user input; localhost only, restrictive CSP, no-store. The browser receives no AI content or credentials. This test does not claim the final GLB animation nor hardware device acceptance.

Local: syntax checks and existing navigation 32/32 Node tests passed. Local Chromium HTTP navigation is blocked by this session's browser environment; therefore the new end-to-end test must be run **for real** by exact-head hosted Chromium CI. Failures are blockers. Rollback by removing this fixture/test and its CI invocation.
