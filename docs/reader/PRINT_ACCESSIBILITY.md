# Ask Bill verified public source reader: print and forced-colors

The printed output retains the statute text and status/metadata while suppressing interactive navigation/forms and visual decoration. The print stylesheet does not change citation positions or source contents and works without JavaScript. Forced-colors/high-contrast styles respect system colors and keep focus outlines visible.

Run the existing Chromium reader smoke test: python tests/browser/test_published_source_browser.py. The 1280px Chromium print-media test checks source text and headings are visible, navigation is hidden, and the source block has transparent print background. Unit checks also verify no active source controls are required. The print feature is source-only; original Bill animation and provider infrastructure are not changed.
