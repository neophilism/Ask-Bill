# AB-092: privacy-safe public source share and text export (partial)

This feature shares only a single provision from a **published, source-complete, active** Ask Bill version, with status, canonical source hash, an exact-version link, retrieval/publication dates and explicit legal-effect disclaimer. The HTML preview is escaped with strict no-script CSP, noindex and no-store. A plain text endpoint exports the same legal wording without markup or personal data.

No private conversation, annotations, user identity, tracking ID, AI output or microphone recording is included. Cross-publisher and wrong-version lookups fail closed; only a previously validated official-source URL is linked. All data originates from the same trusted release lookup as the reader.

This is partial AB-092: explanation sharing, correction propagation and additional export formats need later implementation. No production domain or legal-status claim. Test with `node --test tests/source-share.test.mjs`; preserve text-only reading in rollback.
