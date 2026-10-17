import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from '../apps/web/preview/server.mjs';

async function withServer(fn) {
  const server=await createPreviewServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  try {await fn(`http://127.0.0.1:${address.port}`)}
  finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}
}

test('preview serves 20-character audition as a separate local-only route with route-scoped policy',async()=>{
  await withServer(async base=>{
    const r=await fetch(base+'/characters');
    assert.equal(r.status,200);
    assert.match(r.headers.get('content-security-policy'),/cdn\.jsdelivr\.net/);
    assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await r.text();
    assert.match(html,/Twenty-character walking audition/);
    assert.match(html,/model-viewer/);
    assert.match(html,/id="dance-now"/);
    assert.match(html,/id="auto-idle"/);
    assert.match(html,/type="module" src="\.\/characters\.js"/);
    assert.doesNotMatch(html,/<script>\s*\(\(/);
    for(const route of ['/characters.js','/characters.css','/packages/character/attention/option10-controller.cjs','/packages/character/animation/idle-director.mjs']){
      const f=await fetch(base+route);assert.equal(f.status,200,route);
      assert.ok(Number(f.headers.get('content-length')||0)>100 || (await f.text()).length>100,route);
    }
    const main=await fetch(base+'/preview');
    assert.doesNotMatch(main.headers.get('content-security-policy')||'',/cdn\.jsdelivr/);
    assert.match(await main.text(),/Audition 20 Bills/);
  });
});

test('serves source-owned 33-clip library with 8 distinct idle dances',async()=>{
  await withServer(async base=>{
    const r=await fetch(base+'/assets/bill/characters/animation-library.json');
    assert.equal(r.status,200);
    assert.match(r.headers.get('content-type'),/application\/json/);
    const lib=await r.json();
    assert.equal(lib.clips.length,33);
    assert.equal(lib.clips.filter(x=>x.category==='dance').length,8);
    assert.deepEqual(lib.clips.slice(0,8).map(x=>x.name),['Idle','WalkFunny','Talk','Wave','Point','Laugh','Celebrate','Look']);
    assert.equal((await fetch(base+'/assets/bill/characters/animation-library.json',{method:'HEAD'})).status,200);
    assert.equal((await fetch(base+'/assets/bill/characters/animation-private.json')).status,404);
  });
});

test('twenty immutable GLB routes plus manifest are served with a locked-down path allowlist',async()=>{
  await withServer(async base=>{
    const manifest=await fetch(base+'/assets/bill/characters/dist/manifest.json');
    assert.equal(manifest.status,200);const d=await manifest.json();
    assert.equal(d.characters.length,20);assert.equal(d.default,'bill-10');
    for(const id of ['01','10','20']){
      const path='/assets/bill/characters/dist/bill-'+id+'.glb';
      const r=await fetch(base+path);assert.equal(r.status,200,path);
      assert.equal(r.headers.get('content-type'),'model/gltf-binary');
      const b=await r.arrayBuffer();const bytes=new Uint8Array(b.slice(0,4));
      assert.equal(String.fromCharCode(...bytes),'glTF');
      const head=await fetch(base+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
    }
    for(const path of ['/assets/bill/characters/dist/bill-00.glb','/assets/bill/characters/dist/bill-21.glb','/assets/bill/characters/dist/other.json','/assets/bill/characters/dist/secret.env']){
      assert.equal((await fetch(base+path)).status,404,path);
    }
  });
});