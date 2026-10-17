import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const publisherId='11111111-1111-4111-8111-111111111111';
const bill='22222222-2222-4222-8222-222222222222';
const version='33333333-3333-4333-8333-333333333333';
const path='/bills/'+bill+'/versions/'+version;
async function host(options,run){
 const server=await createPublishedSourceServer({publisherId,...options});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{return await run('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
test('browser accepts a privacy-neutral, accessible, CSP-protected 404',async()=>host({lookupPublishedPack:async()=>{throw Error('secret-provider-password-do-not-log');}},async url=>{
 for(const target of [path,'/bad-route']){
  const res=await fetch(url+target,{headers:{Accept:'text/html'}});
  assert.equal(res.status,404);assert.match(res.headers.get('content-type'),/text\/html/);
  assert.match(res.headers.get('content-security-policy'),/script-src 'none'/);
  assert.equal(res.headers.get('set-cookie'),null);
  const html=await res.text();
  assert.match(html,/This page is not available/);assert.match(html,/Skip to message/);
  assert(!html.includes('secret-provider-password'));
 }
}));
test('API clients still receive the existing plain generic 404',async()=>host({lookupPublishedPack:async()=>null},async url=>{
 const r=await fetch(url+path);assert.equal(r.status,404);
 assert.equal(await r.text(),'Not found');
 assert.match(r.headers.get('content-type'),/text\/plain/);
}));
test('HTML method-rejection page retains method policy and no scripts',async()=>host({lookupPublishedPack:async()=>null},async url=>{
 const r=await fetch(url+path,{method:'POST',headers:{Accept:'text/html'}});
 assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'GET, HEAD');
 const text=await r.text();assert.match(text,/This page is read-only/);assert(!text.includes('<script'));
}));
test('capacity overload sends accessible 503 and preserves Retry-After without leaking internals',async()=>{
 let entered,release;
 const began=new Promise(ok=>entered=ok),blocked=new Promise(ok=>release=ok);
 await host({maxInflight:1,lookupPublishedPack:async()=>{entered();await blocked;return null;}},async url=>{
  const first=fetch(url+path,{headers:{Accept:'text/html'}});
  await began;
  const second=await fetch(url+path,{headers:{Accept:'text/html'}});
  assert.equal(second.status,503);assert.equal(second.headers.get('retry-after'),'2');
  assert.match(await second.text(),/temporarily unavailable/);
  release();await first;
 });
});
test('HEAD error renders no response bytes even when Accept includes HTML',async()=>host({lookupPublishedPack:async()=>null},async url=>{
 const r=await fetch(url+'/bad-route',{method:'HEAD',headers:{Accept:'text/html'}});
 assert.equal(r.status,404);assert.match(r.headers.get('content-type'),/text\/html/);
 assert.equal(await r.text(),'');
}));
