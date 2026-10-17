# AB-065 / AB-004: public reader source-bound landmark metadata

The source-only public reader now exposes the published, server-validated `versionId` and exact provision ID as escaped `data-source-version` and `data-provision-id` on each section. This is useful to the local AB-065 layout registry and prevents selectors or coordinates from being authored by a model. Only the public, complete and immutable release renderer supplies these values.

No new JavaScript is required for reading, no character is loaded, and source publication authority remains server-side. Existing anchors, links, keyboard navigation and CSS are unchanged.

Verification: `node --test tests/source-reader-landmarks.test.mjs` checks the existing publication renderer, version switch and no-script fallback. The hosted four-job CI must pass for the exact head before merge.

Rollback: revert the two read-only metadata attributes and focused test. No data migrations or provider use.
