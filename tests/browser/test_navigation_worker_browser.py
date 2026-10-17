"""AB-068 real Chromium integration: source-page geometry to bounded module Worker."""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
process = subprocess.Popen(['node','tests/browser/navigation_fixture_server.mjs'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    line = process.stdout.readline().strip()
    assert line, 'The isolated navigation fixture server failed to start'
    host = 'http://127.0.0.1:' + str(json.loads(line)['port'])
    with sync_playwright() as playwright:
        binary = '/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None
        browser = playwright.chromium.launch(headless=True, executable_path=binary)
        for width in (320,1280):
            page = browser.new_page(viewport={'width':width,'height':700},reduced_motion='reduce')
            failures = []
            page.on('pageerror', lambda exc:failures.append(str(exc)))
            page.goto(host+'/',wait_until='domcontentloaded')
            page.locator('#question').focus()
            result = page.evaluate("""async () => {
              const {createViewportGeometry}=await import('/viewport.mjs');
              const {buildTraversalGraph}=await import('/graph.mjs');
              const root=document.querySelector('#reader');
              const layout={layoutRevision:3,anchors:Array.from(root.querySelectorAll('section[id^="provision-"]')).map(el=>{
                const r=el.getBoundingClientRect();
                return {versionId:'v1',provisionId:el.id.slice(10),layoutRevision:3,
                  visible:r.width>0&&r.height>0,
                  viewportRect:{x:r.x,y:r.y,width:r.width,height:r.height},
                  pageRect:{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}};
              })};
              const stage=document.querySelector('#stage').getBoundingClientRect();
              const converter=createViewportGeometry({versionId:'v1',layoutRevision:layout.layoutRevision,
                scroll:{x:scrollX,y:scrollY},layoutViewport:{width:innerWidth,height:innerHeight},
                visualViewport:{offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,
                  width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale},
                canvasRect:{x:stage.x,y:stage.y,width:stage.width,height:stage.height},
                canvasBitmap:{width:Math.round(stage.width*devicePixelRatio),height:Math.round(stage.height*devicePixelRatio)}});
              const target=converter.anchorToCanvas(layout.anchors[1]);
              const surfaces=layout.anchors.map(a=>({id:a.provisionId,versionId:'v1',layoutRevision:3,kind:'ledge',scrollContainerId:'root',rect:a.viewportRect}));
              const graph=buildTraversalGraph({versionId:'v1',layoutRevision:3,viewport:{x:0,y:0,width:innerWidth,height:innerHeight},surfaces,bodyRadius:8,maxStep:80});
              // Strip graph callbacks: Worker messaging uses only structured-clone data.
              const clone={versionId:graph.versionId,layoutRevision:graph.layoutRevision,
                nodes:graph.nodes.map(({id,x,y})=>({id,x,y})),edges:graph.edges};
              const worker=new Worker('/worker-entry.mjs',{type:'module'});
              const answer=new Promise((resolve,reject)=>{
                worker.addEventListener('message',event=>resolve(event.data),{once:true});
                worker.addEventListener('error',event=>reject(Error(event.message)),{once:true});
              });
              worker.postMessage({type:'plan',requestId:'test-1',
                payload:{graph:clone,versionId:'v1',layoutRevision:3,conversationEpoch:1,startNodeId:'alpha:0',goalNodeId:'beta:2'}});
              const planned=await answer;
              worker.terminate();
              let wrongVersion=false;
              try{converter.anchorToCanvas({...layout.anchors[1],versionId:'v2'});}
              catch(error){wrongVersion=error.code==='VERSION_MISMATCH';}
              const obstacle={kind:'selection',versionId:'v1',layoutRevision:3,
                rect:{x:surfaces[0].rect.x+surfaces[0].rect.width-8,y:surfaces[0].rect.y-3,width:44,height:30}};
              const blocked=buildTraversalGraph({versionId:'v1',layoutRevision:3,
                viewport:{x:0,y:0,width:innerWidth,height:innerHeight},surfaces,bodyRadius:8,maxStep:80,obstacles:[obstacle]});
              return {target,kind:planned.result.kind,visited:planned.result.nodes?.length||0,
                blocked:blocked.reachable('alpha:0','beta:2').kind,wrongVersion,
                focus:document.activeElement.id,viewport:document.documentElement.scrollWidth,
                reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
            }""")
            assert result['target']['kind']=='target', result
            assert result['kind']=='route' and result['visited']>=2, result
            assert result['blocked']=='dock' and result['wrongVersion'], result
            assert result['focus']=='question' and result['viewport']<=width, result
            assert result['reducedMotion'] and not failures, (result,failures)
            page.close()
        browser.close()
finally:
    process.terminate()
    try: process.wait(timeout=3)
    except subprocess.TimeoutExpired: process.kill();process.wait(timeout=3)
print('AB-068 Chromium HTTP, module Worker and source-geometry checks passed')
