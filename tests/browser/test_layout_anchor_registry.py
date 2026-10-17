"""AB-065 browser-level semantic geometry checks, no third-party code or network."""
import base64
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
MODULE = (ROOT / "packages/character/layout/registry.mjs").read_bytes()
URL = "data:text/javascript;base64," + base64.b64encode(MODULE).decode("ascii")
HTML = """<!doctype html><html><head><style>
body{margin:0;padding:20px} main{max-width:800px}section{border:1px solid #ccc;padding:20px;margin:32px 0}
</style></head><body><main id="reader"><h1>Test bill</h1>
<label>Question <input id="question" value="hi" /></label>
<section id="provision-sec-1"><h2>One</h2><p>Published text.</p></section>
<section id="provision-sec-2"><h2>Two</h2><p>An exception.</p></section>
</main></body></html>"""

with sync_playwright() as playwright:
    binary = "/usr/bin/chromium" if Path("/usr/bin/chromium").exists() else None
    browser = playwright.chromium.launch(headless=True, executable_path=binary)
    for width in (320, 1280):
        page = browser.new_page(viewport={"width": width, "height": 760}, reduced_motion="reduce")
        page.set_content(HTML)
        page.locator("#question").focus()
        initial = page.evaluate("""async url => {
          const {createLayoutAnchorRegistry}=await import(url);
          window.__registry=createLayoutAnchorRegistry({root:document.querySelector('#reader'),versionId:'v1'});
          window.__registry.collect();
          const snap=window.__registry.measure();
          return {revision:snap.layoutRevision,entries:snap.anchors.length,
            focus:document.activeElement.id,viewport:document.documentElement.scrollWidth};
        }""", URL)
        assert initial["entries"] == 2
        assert initial["focus"] == "question", "registration must never steal focus"
        assert initial["viewport"] <= width, "registration must not cause horizontal overflow"
        page.evaluate("window.scrollTo(0,30)")
        page.wait_for_timeout(30)
        result = page.evaluate("""previous => {
          const reg=window.__registry;let stale=false,unknown=false;
          try{reg.measure({expectedRevision:previous});}catch(e){stale=e.code==='STALE_LAYOUT_REVISION';}
          try{reg.resolve({sourceVersionId:'v2',provisionId:'sec-1'});}catch(e){unknown=e.code==='VERSION_MISMATCH';}
          const position=reg.resolve({sourceVersionId:'v1',provisionId:'sec-1'});
          reg.dispose();
          return {stale,unknown,position,focus:document.activeElement.id};
        }""", initial["revision"])
        assert result["stale"], "scroll must invalidate geometries"
        assert result["unknown"], "cross-version citation must fail"
        assert result["position"]["visible"]
        assert result["focus"] == "question"
        page.close()
    browser.close()
print("AB-065 Chromium responsive geometry, focus and stale-version checks passed")
