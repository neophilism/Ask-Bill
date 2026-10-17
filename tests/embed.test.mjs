import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
import {validateEmbedOrigins,renderEmbeddablePublishedSource,embedSecurityHeaders,EmbedError} from '../packages/embed/index.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const publisherId='11111111-1111-4111-8111-111111111111',billId='22222222-2222-4222-8222-222222222222',versionId='33333333-3333-4333-8333-333333333333';
const source='Introduction to the draft 😃 <img src=x onerror=alert(1)>';
const path='/embed/bills/'+billId+'/versions/'+versionId,allowed=['https://publisher.example.org'];
function pack(){return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId,billId,versionId,title:'Proposed & Document',language:'en-US',jurisdiction:'US',status:'introduced',publication:'published',sourceComplete:true,retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',canonicalSha256:hash(source),provisions:[{id:'sec-1',heading:'Introduction',text:source,sha256:hash(source)}]};}
test('embed origins require explicit unique production HTTPS, without wildcard/private or credentials',()=>{
 assert.deepEqual(validateEmbedOrigins(allowed),allowed);
 for(const bad of [['https://*.example.org'],['http://publisher.example.org'],['https://127.0.0.1'],['https://publisher.example.org/path'],['https://publisher.example.org?x=1'],['https://user:pass@publisher.example.org'],['https://publisher.example.org','https://publisher.example.org'],['https://localhost'],['https://publisher.example.org:8443']])
  assert.throws(()=>validateEmbedOrigins(bad),EmbedError);
 assert.deepEqual(validateEmbedOrigins([]),[]);
 const headers=embedSecurityHeaders(allowed);
 assert(headers['Content-Security-Policy'].includes('frame-ancestors https://publisher.example.org'));
 assert(headers['Content-Security-Policy'].includes("script-src 'none'"));
 assert(headers['Content-Security-Policy'].includes('sandbox allow-same-origin'));
 assert.equal(headers['Permissions-Policy'],'microphone=(), camera=(), geolocation=()');
 assert.equal(headers['X-Frame-Options'],undefined);
});
test('only a complete, published, exact-hash source is embeddable; markup is escaped',()=>{
 const html=renderEmbeddablePublishedSource({pack:pack(),origins:allowed});
 assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert(!html.includes('<img src=x'));
 assert(html.includes('not verified as currently effective law'));
 for(const overrides of [{publication:'private'},{sourceComplete:false},{canonicalSha256:hash('tampered')}])
  assert.throws(()=>renderEmbeddablePublishedSource({pack:{...pack(),...overrides},origins:allowed}),EmbedError);
 assert.throws(()=>renderEmbeddablePublishedSource({pack:pack(),origins:[]}),e=>e.code==='EMBED_NOT_AUTHORIZED');
});
test('without an origin grant embed route is absent and ordinary source stays unembeddable',async()=>{
 const server=await createPublishedSourceServer({publisherId,lookupPublishedPack:async()=>pack()});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const url='http://127.0.0.1:'+server.address().port;
 const ordinary=await fetch(url+'/bills/'+billId+'/versions/'+versionId);
 assert.equal(ordinary.headers.get('x-frame-options'),'DENY');
 assert.match(ordinary.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await fetch(url+path)).status,404);
 }finally{await new Promise(ok=>server.close(ok));}
});
test('granted iframe is source-only and restricts parent origin, scripts and microphone',async()=>{
 const server=await createPublishedSourceServer({publisherId,lookupPublishedPack:async()=>pack(),embedOrigins:allowed});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const url='http://127.0.0.1:'+server.address().port;
 const response=await fetch(url+path);
 assert.equal(response.status,200);
 const csp=response.headers.get('content-security-policy');
 assert(csp.includes('frame-ancestors https://publisher.example.org'));assert(!csp.includes("frame-ancestors 'none'"));
 assert.equal(response.headers.get('x-frame-options'),null);
 assert.equal(response.headers.get('permissions-policy'),'microphone=(), camera=(), geolocation=()');
 assert.equal(response.headers.get('cache-control'),'no-store');
 const text=await response.text();assert(text.includes('Skip to legislation'));assert(!text.includes('<script>'));
 assert.equal((await fetch(url+path,{method:'POST'})).status,405);
 assert.equal((await fetch(url+path+'?q=secret')).status,404);
 assert.equal((await fetch(url+path+'%2Ffake')).status,404);
 }finally{await new Promise(ok=>server.close(ok));}
});
test('wrong publisher and unpublished releases remain opaque 404',async()=>{
 const server=await createPublishedSourceServer({publisherId,lookupPublishedPack:async()=>({...pack(),publisherId:'44444444-4444-4444-8444-444444444444'}),embedOrigins:allowed});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+path);
 assert.equal(response.status,404);assert.equal(await response.text(),'Not found');}
 finally{await new Promise(ok=>server.close(ok));}
});
