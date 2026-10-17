# Ask Bill page landmarks — AB-065

The browser owns CSS-pixel geometry. An LLM never receives authority to select DOM elements, HTML selectors, screen coordinates, document versions, or animation targets. This registry only turns **already-rendered published provisions** into revisioned, local layout snapshots.

`packages/character/layout/registry.mjs` exports `createLayoutAnchorRegistry`. A trusted reader supplies its root and immutable document-version ID. `collect()` discovers the repository's existing `section#provision-<id>` HTML inside that root, `measure()` provides bounded page and viewport CSS-pixel rectangles and a revision, and `resolve({sourceVersionId,provisionId,expectedRevision})` rejects wrong versions, missing/detached anchors, and stale snapshots.

Scrolling, window/visual viewport resizing, font loading, and available ResizeObserver and MutationObserver events advance the layout revision. `dispose()` removes the listeners. Duplicated identifiers and unsafe geometry fail closed. Registration never scrolls, focuses, alters text, or requests any character model.

An eventual motion planner may use verified local targets only while the layout revision matches the latest snapshot. This module does not claim legal-source authority, safe movement across the page, a renderer, a model, or production acceptance.

Run `node --test tests/layout-anchor-registry.test.mjs` and `python tests/browser/test_layout_anchor_registry.py`. GitHub browser CI exercises Chromium at 320 and 1280 CSS pixels. The source-only reader remains useful with JavaScript disabled.
