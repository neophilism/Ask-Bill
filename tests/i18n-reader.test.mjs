import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
import {renderSpanishSourceReader,uiLabels,LocaleError} from '../packages/i18n/index.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const pub='11111111-1111-4111-8111-111111111111',bill='22222222-2222-4222-8222-222222222222',v='33333333-3333-4333-8333-333333333333',source='Original <law> 😃; does not create a new rule.';
function pack(){return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId:pub,billId:bill,versionId:v,title:'Proposed <Bill>',jurisdiction:'United States',language:'en-US',status:'introduced',publication:'published',sourceComplete:true,retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',canonicalSha256:hash(source),provisions:[{id:'sec-1',heading:'Definition & section',text:source,sha256:hash(source)}]};}
const path='/bills/'+bill+'/versions/'+v;
test('Spanish interface labels have matching English keys and refuse unknown locales',()=>{
 assert.deepEqual(Object.keys(uiLabels('en')).sort(),Object.keys(uiLabels('es')).sort());
 assert(Object.isFrozen(uiLabels('es')));
 assert.throws(()=>uiLabels('xx'),LocaleError);
});
test('the original English law is unchanged and visibly labeled while navigation is Spanish',()=>{
 const html=renderSpanishSourceReader(pack());
 assert.match(html,/<html lang="es">/);assert.match(html,/lang="en-US"/);
 assert(html.includes('No se proporciona traducción jurídica'));
 assert(html.includes('navegación en español'));
 assert(html.includes('Original &lt;law&gt; 😃'));
 assert(!html.includes('Original <law>'));
 assert(!html.includes('<script'));assert(html.includes('data-source-version="'+v+'"'));
});
test('private and tampered packs cannot become Spanish public pages',()=>{
 for(const changes of [{sourceComplete:false},{publication:'private'},{canonicalSha256:hash('wrong')}])
 assert.throws(()=>renderSpanishSourceReader({...pack(),...changes}),LocaleError);
});
test('public HTTPS-style local route returns no-JS bilingual page, not fake legal translation',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>pack()});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const main=await (await fetch(url+path)).text();
  assert(main.includes('Interfaz en español'));
  const response=await fetch(url+path+'/es');
  assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/script-src 'none'/);
  assert.match(await response.text(),/texto original sigue siendo/);
  for(const suffix of ['/es?q=x','/es%2f','/xx'])assert.equal((await fetch(url+path+suffix)).status,404);
  assert.equal((await fetch(url+path+'/es',{method:'POST'})).status,405);
 } finally {await new Promise(ok=>server.close(ok));}
});
test('cross-tenant Spanish document lookup returns only an opaque 404',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>({...pack(),publisherId:'44444444-4444-4444-8444-444444444444'})});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const r=await fetch('http://127.0.0.1:'+server.address().port+path+'/es');
 assert.equal(r.status,404);assert.equal(await r.text(),'Not found');}
 finally {await new Promise(ok=>server.close(ok));}
});
