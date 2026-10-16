import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from '../apps/web/preview/server.mjs';
import { assertIncompleteFixture, renderPreview, escapeHtml } from '../apps/web/preview/reader.mjs';
import { readFile } from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('../fixtures/electronic-filing-excerpt.json',import.meta.url),'utf8'));

test('preview refuses publishable, complete, or malformed fixture, even when it has text',()=>{
  assert.equal(assertIncompleteFixture(fixture).sourceComplete,false);
  for (const bad of [{...fixture,sourceComplete:true},{...fixture,publicationAllowed:true},{...fixture,fixtureOnly:false},{...fixture,status:'enacted'},{...fixture,text:''},{}]){
    assert.throws(()=>renderPreview(bad));
  }
});
test('the legal excerpt is escaped and labeled as unverified, not legally operative',()=>{
  const html=renderPreview(fixture);
  assert(html.includes(escapeHtml(fixture.text)));
  assert(html.includes('Incomplete draft excerpt'));
  assert(html.includes('not a full bill, enacted law'));
  assert(html.includes('Live conversation is not available'));
  assert(html.includes('character not yet built') || html.includes('3D character not yet built'));
  assert(html.includes('aria-live="polite"'));
  assert(html.includes('Skip to the legislation'));
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert(!html.includes('Law Machine'));
  const injected=renderPreview({...fixture,text:'<img src=x onerror="alert(1)">',provisionLabel:'<script>hack</script>'});
  assert(injected.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert(injected.includes('&lt;script&gt;hack&lt;/script&gt;'));
  assert(!injected.includes('<script>hack</script>'));
});
test('local preview serves allowed routes with CSP and never exposes arbitrary files',async()=>{
  const server=await createPreviewServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const addr=server.address();assert(addr && typeof addr!=='string');
    const url='http://127.0.0.1:'+addr.port;
    const page=await fetch(url+'/');
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy')||'',/default-src 'none'/);
    assert.match(page.headers.get('cache-control')||'',/no-store/);
    const html=await page.text();assert(html.includes(fixture.text));
    assert.equal((await fetch(url+'/preview.css')).status,200);
    assert.equal((await fetch(url+'/preview.js')).status,200);
    assert.equal((await fetch(url+'/../../AGENTS.md')).status,404);
    assert.equal((await fetch(url+'/healthz')).status,200);
    assert.deepEqual(await (await fetch(url+'/healthz')).json(),{product:'ask-bill',status:'preview',live:false,sourceComplete:false});
    assert.equal((await fetch(url+'/',{method:'POST'})).status,405);
    assert.equal((await fetch(url+'/',{method:'HEAD'})).status,200);
  } finally {await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
