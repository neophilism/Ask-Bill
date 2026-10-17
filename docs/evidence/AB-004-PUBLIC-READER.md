# AB-004 follow-up: independent public-source reader

This package renders a complete, version-pinned public bill in HTML and plain text without requiring AI, speech, or an animated character. It preserves ordered Unicode source text, table of contents, source retrieval/publication timestamps, status distinctions and exact deep links. JavaScript is not necessary to read the text.

The ask-bill-reader-v1 digest checks the exact ordered sections and per-section content. **Content hashes do not prove authority.** The injected server-side lookup must independently authenticate that the version is the actively published immutable release in the correct publisher scope. Caller booleans and client-provided pack metadata are not publication approval.

Negative tests cover incomplete/private text, untrusted URLs, changed digests, duplicate provision IDs, malformed locales, HTML injection and wrong-version requests.

**Outstanding:** production public route, authenticated DB publication adapter, Next.js/React integration, comprehensive mobile/browser accessibility, complete verified authoritative sources and deployment. No code in this PR enables publication of the incomplete electronic-filing fixture, and AB-004 operational acceptance is still open.

Run: node --test tests/public-source-reader.test.mjs.
