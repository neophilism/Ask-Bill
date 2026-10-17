"""Semantic publishing UI in actual Chromium; provider and persistence remain HTTP-test concerns."""
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(os.environ.get("ASK_BILL_PUBLISHER_BROWSER_ARTIFACTS", "/tmp/ask-bill-publisher-browser"))
BILL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
VERSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

def run():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, ASK_BILL_PUBLISHER_BROWSER_FIXTURE="1", NODE_ENV="test")
    server = subprocess.Popen(["node", "tests/browser/publisher_fixture_server.mjs"], cwd=ROOT, env=env,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    results = []
    try:
        base = server.stdout.readline().strip()
        assert base.startswith("http://127.0.0.1:"), base
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
            for width, height in [(1440, 1000), (768, 1024), (390, 844)]:
                context = browser.new_context(viewport={"width": width, "height": height})
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda exc: errors.append(str(exc)))
                assert page.goto(base + "/admin").status == 200
                assert page.get_by_role("heading", name="Your source library").is_visible()
                assert page.get_by_label("Bill title").is_visible()
                page.keyboard.press("Tab")
                assert page.get_by_role("link", name="Skip to content").evaluate("el => el === document.activeElement")
                assert page.goto(base + "/admin/bills/" + BILL).status == 200
                assert page.get_by_label("Source file").is_visible()
                assert page.get_by_label("Congress", exact=True).is_visible()
                assert page.goto(base + "/admin/bills/" + BILL + "/versions/" + VERSION).status == 200
                assert page.get_by_role("heading", name="Publication review", exact=True).is_visible()
                assert page.get_by_label("Exact passage to correct").is_visible()
                assert page.get_by_label("Correct replacement").is_visible()
                assert page.get_by_role("checkbox").count() == 7
                size = page.evaluate("({width: innerWidth, scroll: document.documentElement.scrollWidth})")
                assert size["scroll"] <= size["width"] + 1, (width, size)
                assert not errors, errors
                page.screenshot(path=str(ARTIFACTS / f"publisher-{width}px.png"), full_page=True)
                results.append({"viewport": width, "overflow": False, "pageErrors": 0, "formLabels": True})
                context.close()
            no_js = browser.new_context(viewport={"width": 390, "height": 844}, java_script_enabled=False)
            page = no_js.new_page()
            assert page.goto(base + "/admin/bills/" + BILL + "/versions/" + VERSION).status == 200
            assert page.get_by_role("button", name="Record completed review").is_visible()
            assert page.get_by_label("Exact passage to correct").is_visible()
            no_js.close()
            forced = browser.new_context(viewport={"width": 390, "height": 844}, forced_colors="active")
            page = forced.new_page()
            page.goto(base + "/admin")
            assert page.get_by_label("Bill title").is_visible()
            page.screenshot(path=str(ARTIFACTS / "publisher-forced-colors.png"), full_page=True)
            forced.close()
            browser.close()
        record = {"browser": "Chromium", "fixtureOnly": True, "noJavaScriptForms": True,
                  "forcedColors": True, "results": results}
        (ARTIFACTS / "publisher-browser-results.json").write_text(json.dumps(record, indent=2) + "\n")
        print(json.dumps(record))
    finally:
        server.terminate()
        try:
            server.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.communicate()

if __name__ == "__main__":
    run()
