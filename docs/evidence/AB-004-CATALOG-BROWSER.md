# AB-004 catalog-to-reader browser navigation evidence

Extend the existing strict HTTP Chromium test to navigate from the public-bill catalog into the exact immutable bill version, at 1280 and 320 CSS pixels. It verifies visible document status, a single published link, correct bill version, no horizontal overflow, safe source text, and unchanged keyboard/source navigation. The JavaScript-disabled browser also loads the catalog and can see the published bill link.

The fixture server is synthetic, local-only and not an authentic legal publication. The test uses the real Ask Bill HTTP catalog and source reader routes with an explicit in-memory provider; it does not substitute injected HTML for the network. No Bill 3D model or live AI is involved.

Full acceptance still requires production published-source credentials, official-source validation, React/Next.js, assistive screen-reader evaluation and deployment. Green browser tests do not certify that synthetic text is law.
