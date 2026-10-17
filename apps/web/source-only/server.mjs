/**
 * AB-004: opt-in read-only public HTTP adapter.
 * No default lookup or live listener: a trusted publisher DB service must inject
 * an active-release lookup before any public route can serve legislation.
 */
import {createServer} from 'node:http';
import {createPublicReader} from '../../../packages/ui/reader/index.mjs';
import {renderPublicCatalog} from '../../../packages/ui/catalog/index.mjs';
import {findExactPublishedText,renderSourceSearchResults} from '../../../packages/ui/reader/find.mjs';
import {readFile} from 'node:fs/promises';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTE=/^\/bills\/([0-9a-f-]{36})\/versions\/([0-9a-f-]{36})(\.txt)?$/i;
const HEADERS=Object.freeze({
  'Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'self'; script-src 'none'; img-src 'none'",
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'X-Robots-Tag':'noindex, nofollow',
  'Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Cache-Control':'no-store'
});
function respond(res,status,body,type,head=false,extra={}){
 const bytes=Buffer.from(body,'utf8');
 res.writeHead(status,{...HEADERS,'Content-Type':type,'Content-Length':bytes.length,...extra});
 res.end(head?undefined:bytes);
}
export async function createPublishedSourceServer({publisherId,lookupPublishedPack,lookupPublishedCatalog,maxInflight=64}={}){
 if(typeof publisherId!=='string'||!UUID.test(publisherId)||typeof lookupPublishedPack!=='function')
   throw new Error('TRUSTED_PUBLICATION_ADAPTER_REQUIRED');
 if(lookupPublishedCatalog!==undefined && typeof lookupPublishedCatalog!=='function')throw new Error('TRUSTED_CATALOG_ADAPTER_REQUIRED');
 if(!Number.isSafeInteger(maxInflight)||maxInflight<1||maxInflight>256)throw new Error('INVALID_PUBLIC_READER_CAPACITY');
 const read=createPublicReader({lookupPublishedPack});
 const css=await readFile(new URL('./public-reader.css',import.meta.url),'utf8');
 // Bound concurrent backend work, including slow and disconnected lookups.
 // Do not free a slot until the lookup settles, even when a client disconnects.
 let activeLookups=0;
 let draining=false;
 const dispatch=(res,head,task)=>{
  if(draining||activeLookups>=maxInflight){
   respond(res,503,'Reader temporarily busy','text/plain; charset=utf-8',head,{'Retry-After':'2'});
   return;
  }
  activeLookups++;
  Promise.resolve().then(task).then(result=>{
   if(!res.destroyed&&!res.writableEnded){
    try{respond(res,200,result.body,result.type,head)}catch{}
   }
  },()=>{
   if(!res.destroyed&&!res.writableEnded){
    try{respond(res,404,'Not found','text/plain; charset=utf-8',head)}catch{}
   }
  }).finally(()=>{activeLookups--;});
 };
 const server=createServer((req,res)=>{
  const head=req.method==='HEAD';
  if(draining){respond(res,503,'Reader shutting down','text/plain; charset=utf-8',head,{'Retry-After':'2'});return;}
  if(req.method!=='GET'&&!head){
   respond(res,405,'Method not allowed','text/plain; charset=utf-8',false,{Allow:'GET, HEAD'});
   return;
  }
  const path=req.url??'';
  if(path==='/public-reader.css'){respond(res,200,css,'text/css; charset=utf-8',head);return;}
  // Only this read-only source-search route permits a bounded, single query parameter.
  if(path.includes('/search?')){
    const ix=path.indexOf('?'),endpoint=path.slice(0,ix),raw=path.slice(ix+1);
    const match=/^\/bills\/([0-9a-f-]{36})\/versions\/([0-9a-f-]{36})\/search$/i.exec(endpoint);
    if(!match||!UUID.test(match[1])||!UUID.test(match[2])||!/^q=[^&]{1,280}$/.test(raw)||endpoint.includes('%')){
      respond(res,404,'Not found','text/plain; charset=utf-8',head);return;
    }
    let query;
    try{query=decodeURIComponent(raw.slice(2).replace(/\+/g,' '));}
    catch{respond(res,404,'Not found','text/plain; charset=utf-8',head);return;}
    if(query.length<2||query.length>160||query.trim()!==query||/[\u0000-\u001f\u007f]/.test(query)){
      respond(res,404,'Not found','text/plain; charset=utf-8',head);return;
    }
    dispatch(res,head,async()=>{
      const billId=match[1].toLowerCase(),versionId=match[2].toLowerCase();
      const source=await lookupPublishedPack(Object.freeze({publisherId,billId,versionId}));
      if(!source||source.publisherId?.toLowerCase()!==publisherId.toLowerCase()||
         source.billId?.toLowerCase()!==billId||source.versionId?.toLowerCase()!==versionId)
        throw Error('PUBLISHED_RELEASE_NOT_AVAILABLE');
      const report=findExactPublishedText({pack:source,query});
      return {body:renderSourceSearchResults(report),type:'text/html; charset=utf-8'};
    });return;
  }
  // Reject query strings, percent-encoded paths and alternate URL forms before parsing.
  if(path.includes('%')||path.includes('?')||path.includes('#')||path.length>300){
   respond(res,404,'Not found','text/plain; charset=utf-8',head);return;
  }
  const catalog=/^\/bills(?:\/page\/([1-9][0-9]?))?$/.exec(path);
  if(catalog&&lookupPublishedCatalog){
    const page=catalog[1]?Number(catalog[1]):1;
    if(page>50){respond(res,404,'Not found','text/plain; charset=utf-8',head);return;}
    dispatch(res,head,async()=>{
      const records=await lookupPublishedCatalog(Object.freeze({publisherId,page}));
      return {body:renderPublicCatalog({publisherId,page,items:records.items,hasNext:records.hasNext}),
        type:'text/html; charset=utf-8'};
    });
    return;
  }
  const match=ROUTE.exec(path);
  if(!match||!UUID.test(match[1])||!UUID.test(match[2])){
   respond(res,404,'Not found','text/plain; charset=utf-8',head);return;
  }
  const format=match[3]?'text':'html';
  dispatch(res,head,async()=>{
    const body=await read.read({publisherId,billId:match[1],versionId:match[2],format});
    return {body,type:format==='html'?'text/html; charset=utf-8':'text/plain; charset=utf-8'};
  });
 });
 // Limit slow headers/body submissions and long-lived sockets before database work.
 server.headersTimeout=10000;
 server.requestTimeout=20000;
 server.keepAliveTimeout=5000;
 server.maxRequestsPerSocket=100;
 // Stop accepting traffic; already-started backend reads retain their slots.
 server.beginReaderDrain=()=>{
  if(draining)return;
  draining=true;
  server.close();
  server.closeIdleConnections?.();
 };
 server.readerCapacity=()=>Object.freeze({active:activeLookups,limit:maxInflight,draining});
 return server;
}
