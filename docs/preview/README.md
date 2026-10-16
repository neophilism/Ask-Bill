# Ask Bill local reader preview

The AB-004 local preview is a deliberately limited, offline demonstration, not the public Ask Bill release.

## Run

With Node 24.19.0 / pnpm 10.18.1 and the workspace installed:

```sh
pnpm preview
```

Open `http://127.0.0.1:4100/` in a browser. To change the loopback port, set `PORT` to an integer from 1 to 65535. Only loopback connections are accepted; there is no public deployment in this unit.

The source comes from `fixtures/electronic-filing-excerpt.json`, an incomplete, nonpublishable draft passage. The server refuses to display it if its incomplete/fixture-only flags are removed. All questions are prewritten local demonstrations; free-input is disabled. No service provider, identity, microphone, recording or storage is connected.

Tests: `node --test tests/preview.test.mjs`. Full browser accessibility audits, final React/Next interface and real character production remain future acceptance gates.

## Standalone offline version

Run `pnpm preview:export` to create `dist/offline-preview/` containing `index.html`, relative-path JavaScript/CSS and an explanatory text file. Open the HTML locally or distribute a ZIP of those files. No account or HTTP server is required. Only incomplete draft example answers are present and user questions cannot be sent.

## Browser verification

Run `python tests/browser/test_reader_browser.py` with Playwright 1.57.0 and Chromium available. It exercises source disclosures, user controls, keyboard navigation, 1280px and 320px layouts, reduced motion and JavaScript-disabled source content. In a locked-down container it reports `source-injected-fallback` rather than pretending browser HTTP access worked; CI sets `ASK_BILL_BROWSER_REQUIRE_HTTP=1` and requires successful real localhost browser navigation.

A passing browser smoke does not replace the eventual WCAG/axe/manual screen-reader audits or the full React/Next.js implementation.
