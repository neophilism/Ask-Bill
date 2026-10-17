# AB-004 source-only reader real HTTP Chromium browser evidence

Adds an additional strict localhost Chromium test for the independent, read-only public bill page. The test launches a synthetic released-source fixture (never a real legal authority) behind the same HTTP server used by the published reader. Real navigation is mandatory: no injected-HTML/browser fallback is allowed.

Tests exercise complete verbatim Unicode text, safe rendering of script-like source text, semantic headings and contents navigation, pinned version/section deep links, no horizontal overflow at 1280 and 320 CSS pixels, keyboard skip link, external stylesheet loading under a script-forbidden CSP, and readable content with JavaScript disabled.

The GitHub Actions browser-reader job executes both the original offline draft-preview smoke and this new public-source smoke. The fixture server is local only, binds to 127.0.0.1 and is not a production publisher.

Outstanding: real production release data and DB authority, assistive-technology screen reader testing, 400% zoom and language-localization verification, a real Next.js/React application, deployment and domain. No Bill model or external company is involved. Operational acceptance for AB-004 remains partial.
