# AB-004: high-contrast, reduced-motion and print-media Chromium checks

Extends the existing **real localhost HTTP** public-source reader browser suite with accessibility-oriented media modes, without depending on Bill's animated character, AI, voice or script execution.

A 320 CSS-pixel Chromium context with forced-colors active and reduced-motion preference verifies headings, both exact statutory excerpts, no horizontal overflow, and respected browser media preferences. Print emulation verifies the table of contents is hidden while the source text remains visible and selectable. This supplements keyboard and JavaScript-disabled coverage already exercised by the suite.

These are automated browser regression checks, **not** substitutes for human screen-reader, keyboard-only usability, 400% browser zoom or formal accessibility review. No production service is configured and no synthetic fixture is represented as law.

Rollback: remove the added browser-media assertions while retaining the current reader.
