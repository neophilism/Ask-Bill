# AB-091 print and forced-colors acceptance increment

Adds print-specific preservation of the full source text, date/version/status warning, clean 11pt legal-text typography and navigation hiding without JavaScript. Forced-colors mode restores focus outlines and readable source contrast. Exact original text stays in the DOM; no model, microphone or character model involved.

Two Node static/HTTP tests and one real Chromium print-emulation assertion are included in the existing four-job CI (browser checks print stylesheet under 1280 px). Actual physical printer, PDF page-break and screen-reader audits remain pending. AB-091 is still partial for bookmarks/history/selected text. Rollback restores prior CSS and Chromium test changes.
