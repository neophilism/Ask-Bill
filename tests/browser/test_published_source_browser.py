"""AB-004 real HTTP Chromium coverage for the source-only published reader.
This uses a local synthetic published fixture, NOT an authentic current statute.
"""
import os
import json
import socket
import time
import subprocess
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PUBLISHER = "11111111-1111-4111-8111-111111111111"
BILL = "22222222-2222-4222-8222-222222222222"
VERSION = "33333333-3333-4333-8333-333333333333"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
BASE = f"http://127.0.0.1:{port}"
PAGE = f"{BASE}/bills/{BILL}/versions/{VERSION}"
proc = subprocess.Popen(
    ["node", "tests/browser/source_reader_fixture_server.mjs"],
    cwd=ROOT, env={**os.environ, "PORT": str(port)},
    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
)
try:
    for _ in range(80):
        try:
            with urllib.request.urlopen(PAGE, timeout=0.5) as response:
                assert response.status == 200
                assert response.headers.get("X-Robots-Tag") == "noindex, nofollow"
                assert "script-src 'none'" in response.headers.get("Content-Security-Policy", "")
                assert "Synthetic Example Bill" in response.read().decode("utf8")
            break
        except Exception:
            if proc.poll() is not None:
                raise RuntimeError("Synthetic published-source server failed")
            time.sleep(0.1)
    else:
        raise RuntimeError("Published reader never became available")
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        for width, height in [(1280, 850), (320, 760)]:
            ctx = browser.new_context(viewport={"width": width, "height": height})
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.goto(PAGE, wait_until="load", timeout=10000)
            assert page.get_by_role("heading", name="Synthetic Example Bill").is_visible()
            assert page.locator("nav[aria-label='Sections']").is_visible()
            assert page.locator("pre.statutory-text").count() == 2
            assert "SYNTHETIC PROPOSAL" in page.locator("pre.statutory-text").first.inner_text()
            assert "<script>not executable</script>" in page.locator("pre.statutory-text").last.inner_text()
            assert page.locator("script").count() == 0
            assert "not verified as currently effective law" in page.locator("p[role='status']").inner_text()
            assert page.evaluate("getComputedStyle(document.querySelector('pre.statutory-text')).whiteSpace") == "pre-wrap"
            dims = page.evaluate("({width: window.innerWidth, scroll: document.documentElement.scrollWidth})")
            assert dims["scroll"] <= dims["width"] + 1, (width, dims)
            page.keyboard.press("Tab")
            assert page.evaluate("document.activeElement?.textContent?.includes('Skip to legislation')") is True
            page.locator("nav[aria-label='Sections'] a").last.click()
            assert page.evaluate("location.hash") == "#provision-section-2"
            assert VERSION in page.url
            # A printed version preserves every legal provision and status warning,
            # while hiding navigation and retaining readable source text.
            if width == 1280:
                page.emulate_media(media="print")
                assert page.locator("nav[aria-label='Sections']").is_hidden()
                assert page.locator("pre.statutory-text").count() == 2
                assert page.locator("pre.statutory-text").first.is_visible()
                assert "SYNTHETIC PROPOSAL" in page.locator("pre.statutory-text").first.inner_text()
                print_background = page.evaluate(
                    "getComputedStyle(document.querySelector('pre.statutory-text')).backgroundColor"
                )
                assert print_background == "rgba(0, 0, 0, 0)", print_background
                assert page.get_by_role("heading", name="Synthetic Example Bill").is_visible()
                page.emulate_media(media="screen")
            page.goto(BASE + "/bills", wait_until="load", timeout=10000)
            assert page.get_by_role("heading", name="Published bills").is_visible()
            assert page.locator("nav[aria-label='Published bills'] a").count() == 1
            assert "Introduced" in page.locator("nav[aria-label='Published bills']").inner_text()
            cat_size = page.evaluate("({width: window.innerWidth, scroll: document.documentElement.scrollWidth})")
            assert cat_size["scroll"] <= cat_size["width"] + 1, (width, cat_size)
            page.locator("nav[aria-label='Published bills'] a").click()
            assert VERSION in page.url
            assert "SYNTHETIC PROPOSAL" in page.locator("pre.statutory-text").first.inner_text()
            assert not errors, errors
            results.append({"width": width, "strictHttp": True, "contentVisible": True, "overflow": False})
            ctx.close()
        no_js = browser.new_context(viewport={"width": 375, "height": 812}, java_script_enabled=False)
        no_js_page = no_js.new_page()
        no_js_page.goto(PAGE, wait_until="load", timeout=10000)
        assert no_js_page.get_by_role("heading", name="Synthetic Example Bill").is_visible()
        assert no_js_page.locator("pre.statutory-text").count() == 2
        assert no_js_page.locator("nav[aria-label='Sections'] a").count() == 2
        no_js_page.goto(BASE + "/bills", wait_until="load", timeout=10000)
        assert no_js_page.get_by_role("heading", name="Published bills").is_visible()
        assert no_js_page.locator("nav[aria-label='Published bills'] a").count() == 1
        no_js.close()
        browser.close()
    print(json.dumps({"result": "passed", "reader": "published-source-fixture",
                      "browser": "Chromium", "viewports": results,
                      "javascriptDisabled": "passed", "productionReleaseVerified": False}), flush=True)
finally:
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
