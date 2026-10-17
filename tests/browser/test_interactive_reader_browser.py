"""Real application API + synthetic sources/providers, tested in an actual Chromium browser."""
import asyncio
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import urllib.request

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
BILL = "22222222-2222-4222-8222-222222222222"
VERSION = "33333333-3333-4333-8333-333333333333"


async def run():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    url = f"{base}/bills/{BILL}/versions/{VERSION}"
    proc = subprocess.Popen(
        ["node", "tests/browser/interactive_reader_fixture_server.mjs"],
        cwd=ROOT, env={**os.environ, "PORT": str(port)},
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen(url, timeout=0.3) as response:
                    assert response.status == 200
                    assert "script-src 'self'" in response.headers["Content-Security-Policy"]
                break
            except Exception:
                if proc.poll() is not None:
                    raise RuntimeError(proc.stderr.read())
                await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Interactive fixture did not start")
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True, args=[
                "--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            ])
            report = []
            with tempfile.TemporaryDirectory(prefix="ask-bill-reader-downloads-") as downloads:
                for width, height in [(1280, 900), (320, 760)]:
                    context = await browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True)
                    page = await context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    await page.route("**/api/capabilities", lambda route: route.abort())
                    await page.goto(url)
                    await page.keyboard.press("Tab")
                    assert "Skip to legislation" in await page.evaluate("document.activeElement.textContent")
                    await expect(page.locator("#refresh-capabilities")).to_be_visible()
                    await page.unroute("**/api/capabilities")
                    await page.locator("#refresh-capabilities").click()
                    await expect(page.locator("#start-session")).to_be_enabled()
                    await expect(page.get_by_role("heading", name="Synthetic Example Bill")).to_be_visible()
                    assert await page.locator("pre.statutory-text").count() == 2
                    assert "<script>not executable</script>" in await page.locator("pre.statutory-text").last.inner_text()
                    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                    await page.locator("[data-bookmark='section-1']").click()
                    await expect(page.locator("#bookmark-count")).to_have_text("(1)")
                    await page.locator("#text-size").select_option("largest")
                    await page.reload()
                    await expect(page.locator("#bookmark-count")).to_have_text("(1)")
                    await expect(page.locator("#text-size")).to_have_value("largest")
                    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                    await page.locator("#text-size").select_option("standard")
                    await page.locator("[data-tour-start]").click()
                    await expect(page.locator("#tour-progress")).to_contain_text("Step 1 of 2")
                    await page.locator("#tour-next").click()
                    await expect(page.locator("#tour-progress")).to_contain_text("Step 2 of 2")
                    await page.locator("#tour-end").click()
                    await page.locator("#age-band").select_option("under-13")
                    await page.locator("#start-session").click()
                    await expect(page.locator("#child-session")).to_be_visible()
                    await expect(page.locator("#question-form")).to_be_hidden()
                    assert not await context.cookies()
                    await page.locator("#age-band").select_option("adult")
                    await page.locator("#start-session").click()
                    await expect(page.locator("#question")).to_be_visible()
                    await page.locator("[data-ask-section='section-1']").click()
                    await expect(page.locator("#selection-context")).to_be_visible()
                    await page.evaluate("""() => {
                        const node = document.querySelector('#provision-section-1 pre').firstChild;
                        const start = node.textContent.indexOf('😃');
                        const range = document.createRange(); range.setStart(node, start);
                        range.setEnd(node, start + '😃 requires'.length);
                        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
                    }""")
                    await expect(page.locator("#selection-quote")).to_have_text("😃 requires")
                    await page.locator("#reading-level").select_option("simple")
                    await page.locator("#question").fill("What does the receipt rule say?")
                    async with page.expect_request("**/api/conversation") as submitted:
                        await page.locator("#ask-submit").click()
                    body = (await submitted.value).post_data_json
                    assert body["selectedSpan"]["provisionId"] == "section-1"
                    assert body["selectedSpan"]["quote"] == "😃 requires"
                    assert body["selectedSpan"]["end"] - body["selectedSpan"]["start"] == len("😃 requires")
                    assert body["readingLevel"] == "simple"
                    await expect(page.locator("#answer-status")).to_contain_text("Answer complete", timeout=15000)
                    await expect(page.locator(".answer-label").first).to_have_text("Exact source quotation")
                    assert await page.locator(".citation-button").count() >= 2
                    assert "excludes diplomatic applications" in await page.locator(".answer-text").inner_text()
                    await page.locator(".citation-button").first.click()
                    await expect(page.locator("#source-drawer")).to_be_visible()
                    await expect(page.locator("#source-drawer-version")).to_contain_text(VERSION)
                    await expect(page.locator("#source-drawer-quote")).to_contain_text("receipt")
                    await page.keyboard.press("Escape")
                    await expect(page.locator("#source-drawer")).to_be_hidden()
                    assert await page.evaluate("document.activeElement.classList.contains('citation-button')")
                    async with page.expect_download() as result:
                        await page.locator("#export-conversation").click()
                    download = await result.value
                    exported = Path(downloads) / f"conversation-{width}.txt"
                    await download.save_as(exported)
                    saved = exported.read_text()
                    assert "What does the receipt rule say?" in saved and VERSION in saved
                    async with page.expect_download() as result:
                        await page.locator("#download-offline").click()
                    download = await result.value
                    offline = Path(downloads) / f"offline-{width}.html"
                    await download.save_as(offline)
                    saved_html = offline.read_text()
                    assert "Offline snapshot" in saved_html and "<script" not in saved_html
                    assert "What does the receipt rule say?" not in saved_html
                    offline_page = await context.new_page()
                    await offline_page.goto(offline.as_uri())
                    assert await offline_page.locator("pre").count() == 2
                    await expect(offline_page.get_by_role("heading", name="Synthetic Example Bill")).to_be_visible()
                    await offline_page.close()
                    # Real WAV transport with a clearly synthetic silent fixture.
                    await page.get_by_role("button", name="Listen to this answer").first.click()
                    await expect(page.locator("#audio-play")).to_be_enabled(timeout=10000)
                    await expect(page.locator("#audio-status")).to_contain_text("Press Play")
                    await page.locator("#audio-play").click()
                    await expect(page.locator("#audio-status")).to_contain_text("Audio finished", timeout=5000)
                    async def delayed_audio(route):
                        await asyncio.sleep(1)
                        try:
                            await route.continue_()
                        except Exception:
                            pass
                    await page.route("**/api/speech", delayed_audio)
                    await page.get_by_role("button", name="Listen to this answer").first.click()
                    await page.locator("#cancel-audio-request").click()
                    await expect(page.locator("#answer-status")).to_contain_text("Audio request cancelled")
                    await page.wait_for_timeout(1300)
                    await expect(page.locator("#audio-controls")).to_be_hidden()
                    await page.unroute("**/api/speech", delayed_audio)
                    # Actual getUserMedia/MediaRecorder, synthetic device and transcript provider.
                    await page.locator("#record-question").click()
                    await expect(page.locator("#stop-recording")).to_be_visible()
                    await page.wait_for_timeout(1100)
                    await page.locator("#stop-recording").click()
                    await expect(page.locator("#transcribe-recording")).to_be_visible()
                    requests_before = await page.locator(".conversation-entry").count()
                    await page.locator("#transcribe-recording").click()
                    await expect(page.locator("#review-transcript")).to_have_value("What does the receipt rule say?")
                    await page.locator("#review-transcript").fill("What are the exceptions?")
                    await page.locator("#use-transcript").click()
                    await expect(page.locator("#question")).to_have_value("What are the exceptions?")
                    assert await page.locator(".conversation-entry").count() == requests_before
                    # A deliberately delayed network request tests explicit cancellation.
                    async def delayed(route):
                        await asyncio.sleep(1)
                        try:
                            await route.continue_()
                        except Exception:
                            pass
                    await page.route("**/api/conversation", delayed)
                    await page.locator("#ask-submit").click()
                    await page.locator("#cancel-answer").click()
                    await expect(page.locator("#answer-status")).to_contain_text("Answer stopped")
                    await page.wait_for_timeout(1300)
                    await expect(page.locator(".conversation-entry").last).to_contain_text("Stopped by you")
                    await page.unroute("**/api/conversation", delayed)
                    # Transport failure shows a retry path while the source remains accessible.
                    await page.route("**/api/conversation", lambda route: route.abort())
                    await page.locator("#ask-submit").click()
                    await expect(page.get_by_role("button", name="Try this question again")).to_be_visible()
                    await expect(page.locator("pre.statutory-text").first).to_be_visible()
                    await page.unroute("**/api/conversation")
                    await page.route("**/api/session", lambda route: route.abort())
                    await page.locator("#clear-history").click()
                    await expect(page.locator("#session-form")).to_be_visible()
                    await expect(page.locator("#erase-retry")).to_be_visible()
                    assert await page.locator(".conversation-entry").count() == 0
                    await page.unroute("**/api/session")
                    await page.locator("#retry-clear-session").click()
                    await expect(page.locator("#erase-retry")).to_be_hidden()
                    await expect(page.locator("#start-session")).to_be_enabled()
                    assert await page.locator(".conversation-entry").count() == 0
                    assert not await context.cookies()
                    await page.locator("#bill-search").fill("receipt")
                    await page.get_by_role("button", name="Find", exact=True).click()
                    await expect(page.get_by_role("heading", name="Find in the exact bill text")).to_be_visible()
                    await page.go_back()
                    await expect(page.locator("#start-session")).to_be_enabled()
                    assert not errors, errors
                    if os.environ.get("ASK_BILL_SCREENSHOT_DIR"):
                        path = Path(os.environ["ASK_BILL_SCREENSHOT_DIR"])
                        path.mkdir(parents=True, exist_ok=True)
                        await page.screenshot(path=str(path / f"interactive-reader-{width}.png"), full_page=True)
                    report.append({"width": width, "actualApplicationApi": True, "sourceModal": True,
                                   "sessions": True, "transcriptReview": True, "audioTransport": True,
                                   "offlineSourceDownload": True, "cancellation": True})
                    await context.close()
                no_js = await browser.new_context(java_script_enabled=False, viewport={"width": 320, "height": 760})
                page = await no_js.new_page()
                await page.goto(url)
                assert await page.locator("pre.statutory-text").count() == 2
                await expect(page.locator("#session-form")).to_be_hidden()
                await page.locator("[data-tour-start]").click()
                await expect(page.get_by_role("heading", name="Synthetic Example Bill")).to_be_visible()
                await expect(page.locator("blockquote")).to_contain_text("receipt")
                await no_js.close()
            print(json.dumps({"result": "passed", "browser": browser.version, "viewports": report,
                              "noJavaScript": "passed", "providers": "synthetic fixtures; not live integration evidence"}))
            await browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


asyncio.run(run())
