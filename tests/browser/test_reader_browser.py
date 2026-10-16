"""Source-grounded Ask Bill reader browser smoke, with labeled sandbox fallback.

Requires playwright==1.57.0 and compatible Chromium. ASK_BILL_BROWSER_REQUIRE_HTTP=1
fails if Chromium cannot navigate the actual localhost HTTP route.
"""
import os
import re
import json
import time
import socket
import shutil
import subprocess
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'dist' / 'browser-evidence'
EVIDENCE.mkdir(parents=True, exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
URL = f'http://127.0.0.1:{port}/'
process = subprocess.Popen(
    ['node', 'apps/web/preview/server.mjs'], cwd=ROOT,
    env={**os.environ, 'PORT': str(port)},
    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
try:
    for _ in range(60):
        try:
            with urllib.request.urlopen(URL + 'healthz', timeout=0.5) as check:
                assert check.status == 200
                assert json.load(check)['sourceComplete'] is False
            break
        except Exception:
            if process.poll() is not None:
                raise RuntimeError('Preview server exited before becoming healthy')
            time.sleep(0.1)
    else:
        raise RuntimeError('Preview health request timed out')
    with urllib.request.urlopen(URL, timeout=2) as response:
        html = response.read().decode('utf8')
        assert response.headers.get('Content-Security-Policy', '').startswith("default-src 'none'")
    css = (ROOT / 'apps/web/preview/preview.css').read_text()
    js = (ROOT / 'apps/web/preview/preview.js').read_text()
    fallback_markup = re.sub(r'<link rel="stylesheet"[^>]*>', f'<style>{css}</style>', html)
    fallback_markup = re.sub(r'<script src="/preview\.js"[^>]*></script>', '', fallback_markup)
    strict_http = os.environ.get('ASK_BILL_BROWSER_REQUIRE_HTTP', '0') == '1'
    chrome = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    with sync_playwright() as p:
        kwargs = {'headless': True, 'args': ['--no-sandbox']}
        if chrome:
            kwargs['executable_path'] = chrome
        browser = p.chromium.launch(**kwargs)
        modes = []
        for width, height in [(1280, 850), (320, 760)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            try:
                page.goto(URL, wait_until='domcontentloaded', timeout=4500)
                mode = 'live-http'
            except Exception:
                if strict_http:
                    raise
                page.close()  # A blocked navigation may destroy the first page context.
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.set_content(fallback_markup, wait_until='commit', timeout=5000)
                page.add_script_tag(content=js)
                mode = 'source-injected-fallback'
            assert page.title() == 'Ask Bill | Reader preview'
            assert page.locator('#canonical-quote').is_visible()
            assert page.locator('#source-drawer').is_visible()
            assert 'Incomplete draft excerpt' in page.locator('.notice').inner_text()
            size = page.evaluate('({scrollWidth:document.documentElement.scrollWidth,viewport:window.innerWidth})')
            assert size['scrollWidth'] <= size['viewport'] + 1, (width, size)
            page.keyboard.press('Tab')
            assert page.evaluate("document.activeElement?.classList.contains('skip-link')") is True
            page.get_by_role('button', name='What does the draft say about receipt time?').click()
            assert 'intake system' in page.locator('#demo-answer').inner_text()
            assert page.locator('#answer-citation').is_visible()
            page.locator('[data-text-size="large"]').click()
            assert page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--reader-font-size").trim()') == '1.4rem'
            page.get_by_role('button', name='Hide illustration').click()
            assert page.locator('#bill-illustration').is_hidden()
            page.get_by_role('button', name='Show illustration').click()
            assert page.locator('#bill-illustration').is_visible()
            assert not errors, errors
            page.screenshot(path=str(EVIDENCE / f'reader-{width}px.png'), full_page=True)
            modes.append({'viewport': width, 'route': mode, 'horizontalOverflow': False, 'pageErrors': len(errors)})
            context.close()
        reduced = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        rm_page = reduced.new_page()
        rm_page.set_content(fallback_markup, wait_until='domcontentloaded', timeout=5000)
        assert rm_page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches') is True
        reduced.close()
        nojs = browser.new_context(viewport={'width': 375, 'height': 812}, java_script_enabled=False)
        nojs_page = nojs.new_page()
        # JS-disabled Chromium can hang when styles are injected after page creation.
        if strict_http:
            nojs_page.goto(URL, wait_until='commit', timeout=5000)
        else:
            nojs_page.set_content(fallback_markup, wait_until='commit', timeout=5000)
        assert nojs_page.locator('#canonical-quote').is_visible()
        assert nojs_page.locator('#source-drawer').is_visible()
        assert 'Incomplete draft excerpt' in nojs_page.locator('.notice').inner_text()
        nojs.close()
        browser.close()
    print(json.dumps({'result':'passed', 'browser':'chromium', 'evidence':modes,
                      'reducedMotion':'passed', 'javascriptDisabledContent':'passed',
                      'strictHttp':strict_http}, indent=2), flush=True)
finally:
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
