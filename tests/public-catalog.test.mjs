import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPublicCatalog,validatePublicCatalog,CatalogError} from '../packages/ui/catalog/index.mjs';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const pub='11111111-1111-4111-8111-111111111111',bill='22222222-2222-4222-8222-222222222222',ver='33333333-3333-4333-8333-333333333333';
const entry={publisherId:pub,billId:bill,versionId:ver,title:'<Original Bill & Proposal>',status:'introduced',publication:'published',sourceComplete:true};
const catalog={publisherId:pub,page:1,items:[entry],hasNext:true};
async function withServer(lookup,fn){
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>null,lookupPublishedCatalog:lookup});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const addr=server.address();return await fn('http://127.0.0.1:'+addr.port)}
 finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
}
test('only complete and published version-bound catalog records render as escaped accessible links',()=>{
 const page=renderPublicCatalog(catalog);
 assert.match(page,/Published bills/);assert.match(page,/aria-label="Published bills"/);
 assert.match(page,/&lt;Original Bill &amp; Proposal&gt;/);assert(!page.includes('<Original Bill'));
 assert.match(page,new RegExp('/bills/'+bill+'/versions/'+ver));
 assert.match(page,/publication is not proof/i);assert.match(page,/Next page/);
 assert(Object.isFrozen(validatePublicCatalog(catalog).items));
});
test('unpublished, cross-publisher, malformed and duplicate entries are refused',()=>{
 for(const change of [{publication:'reviewed'},{sourceComplete:false},{publisherId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{status:'current_law'},{title:''}]){
  assert.throws(()=>renderPublicCatalog({...catalog,items:[{...entry,...change}]}),CatalogError);
 }
 assert.throws(()=>renderPublicCatalog({...catalog,items:[entry,entry]}),CatalogError);
 assert.throws(()=>renderPublicCatalog({...catalog,page:50,hasNext:true}),CatalogError);
 assert.throws(()=>renderPublicCatalog({...catalog,page:'1'}),CatalogError);
});
test('real HTTP catalog supports page navigation without AI, session or character',async()=>withServer(async({publisherId,page})=>{
 assert.equal(publisherId,pub);return {items:[entry],hasNext:page===1};
},async url=>{
 const first=await fetch(url+'/bills');assert.equal(first.status,200);
 assert.match(first.headers.get('content-type'),/text\/html/);
 assert.match(first.headers.get('content-security-policy'),/script-src 'none'/);
 assert.match(await first.text(),/Next page/);
 const second=await fetch(url+'/bills/page/2');assert.equal(second.status,200);
 assert.match(await second.text(),/Previous page/);
 const h=await fetch(url+'/bills/page/2',{method:'HEAD'});
 assert.equal(h.status,200);assert.equal((await h.text()).length,0);
 assert.equal((await fetch(url+'/bills/page/99')).status,404);
 assert.equal((await fetch(url+'/bills?private=token')).status,404);
 assert.equal((await fetch(url+'/bills',{method:'POST'})).status,405);
}));
test('missing catalog adapter, poisoned records, and thrown private errors produce identical 404',async()=>{
 const noCatalog=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>null});
 await new Promise(resolve=>noCatalog.listen(0,'127.0.0.1',resolve));
 try{const addr=noCatalog.address();assert.equal((await fetch('http://127.0.0.1:'+addr.port+'/bills')).status,404)}
 finally{await new Promise(resolve=>noCatalog.close(resolve))}
 await withServer(async()=>({items:[{...entry,sourceComplete:false}],hasNext:false}),async url=>{
  const response=await fetch(url+'/bills');
  assert.equal(response.status,404);assert.equal(await response.text(),'Not found');
 });
 await withServer(async()=>{throw new Error('private database credentials')},async url=>{
  const response=await fetch(url+'/bills');
  assert.equal(response.status,404);assert.equal(await response.text(),'Not found');
 });
 await assert.rejects(()=>createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>null,lookupPublishedCatalog:true}),/TRUSTED_CATALOG_ADAPTER_REQUIRED/);
});
