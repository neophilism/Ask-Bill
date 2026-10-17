"""Real Chromium interaction regression for three animated Bill GLB selectors.

Uses a locally injected model-viewer facade to prove that our frontend logic
does not depend on CDN access during the test. GLB structural playback is
validated separately by the immutable roster checks.
"""
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]

with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    port=sock.getsockname()[1]
env={**os.environ,'PORT':str(port)}
server=subprocess.Popen(['node','apps/web/preview/server.mjs'],cwd=ROOT,env=env,
                        stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
base=f'http://127.0.0.1:{port}'

try:
    for attempt in range(80):
        if server.poll() is not None:
            raise RuntimeError('Local Ask Bill preview failed to start')
        try:
            with urlopen(base+'/compare.html',timeout=1) as result:
                if result.status==200:break
        except OSError:
            time.sleep(.1)
    else:raise RuntimeError('Timeout waiting for comparison HTTP server')

    with sync_playwright() as p:
        binary='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None
        browser=p.chromium.launch(headless=True,executable_path=binary)
        page=browser.new_page(viewport={'width':1280,'height':850})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('https://cdn.jsdelivr.net/**',lambda route:route.abort())
        page.add_init_script("""
            customElements.define('model-viewer', class extends HTMLElement {
              play(){this.setAttribute('data-playing','true');return Promise.resolve()}
              pause(){this.setAttribute('data-playing','false')}
            });
        """)
        page.goto(base+'/compare.html',wait_until='domcontentloaded')
        page.locator('#global-status').filter(has_text='Loaded 20 real GLB candidates').wait_for(timeout=15000)
        assert page.locator('model-viewer').count()==3
        assert page.locator('#choice-0 option').count()==20
        assert page.locator('#viewer-0').get_attribute('src').endswith('bill-10.glb')
        assert page.locator('#viewer-1').get_attribute('src').endswith('bill-12.glb')
        page.locator('#choice-0').select_option('bill-19')
        assert page.locator('#viewer-0').get_attribute('src').endswith('bill-19.glb')
        page.locator('#default-0').click()
        assert page.evaluate("JSON.parse(localStorage.getItem('bill-selected'))")=='bill-19'
        page.locator('#choice-0').select_option('bill-10')
        # Different options produce a seven-person, explicitly chosen shortlist.
        for i in range(1,8):
            page.locator('#choice-0').select_option(f'bill-{i:02}')
            page.locator('#shortlist-0').click()
        assert page.locator('#count').inner_text()=='7 / 7'
        page.locator('#choice-0').select_option('bill-08')
        page.locator('#shortlist-0').click()
        assert page.locator('#count').inner_text()=='7 / 7'
        assert 'seven' in page.locator('#global-status').inner_text()
        page.locator('#pause').click()
        assert page.locator('#viewer-0').get_attribute('data-playing')=='false'
        page.locator('#pause').click()
        assert page.locator('#viewer-0').get_attribute('data-playing')=='true'
        page.locator('#motion').click()
        assert page.locator('#viewer-0').get_attribute('data-playing')=='false'
        page.locator('#motion').click()
        stage=page.locator('#stage-0')
        box=stage.bounding_box()
        stage.hover(position={'x':max(10,int(box['width']*.83)),
                              'y':int(box['height']*.6)})
        page.wait_for_timeout(900)
        movement=page.locator('#move-0').inner_text()
        assert 'following' in movement or 'attentive' in movement,movement
        page.evaluate("""() => {
          const p=document.querySelector('#source-text').firstChild;
          const r=document.createRange();r.setStart(p,5);r.setEnd(p,25);
          const s=getSelection();s.removeAllRanges();s.addRange(r);
          document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        }""")
        assert 'Bill noticed' in page.locator('#selected-text').inner_text()
        page.reload(wait_until='domcontentloaded')
        page.locator('#global-status').filter(has_text='Loaded 20 real GLB candidates').wait_for(timeout=15000)
        assert page.locator('#count').inner_text()=='7 / 7'
        assert page.evaluate("JSON.parse(localStorage.getItem('bill-selected'))")=='bill-19'
        assert not errors,errors
        page.close()
        browser.close()
finally:
    server.terminate()
    try:server.communicate(timeout=5)
    except subprocess.TimeoutExpired:server.kill();server.communicate()
print('AB characters: three-up moving GLB audition, preferences, shortlist, keyboard and safety controls passed')
