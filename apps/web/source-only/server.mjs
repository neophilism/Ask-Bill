/**
 * AB-004: opt-in read-only public HTTP adapter.
 * No default lookup or live listener: a trusted publisher DB service must inject
 * an active-release lookup before any public route can serve legislation.
 */
import {createServer} from 'node:http';
import {createPublicReader} from '../../../packages/ui/reader/index.mjs';
import {readFile} from 'node:fs/promises';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTE=/^\/bills\/([0-9a-f-]{36})\/versions\/([0-9a-f-]{36})(\.txt)?$/i;
const HEADERS=Object.freeze({
  'Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'self'; script-src 'none'; img-src 'none'",
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
export async function createPublishedSourceServer({publisherId,lookupPublishedPack}={}){
 if(typeof publisherId!=='string'||!UUID.test(publisherId)||typeof lookupPublishedPack!=='function')
   throw new Error('TRUSTED_PUBLICATION_ADAPTER_REQUIRED');
 const read=createPublicReader({lookupPublishedPack});
 const css=await readFile(new URL('./public-reader.css',import.meta.url),'utf8');
 return createServer((req,res)=>{
  const head=req.method==='HEAD';
  if(req.method!=='GET'&&!head){
   respond(res,405,'Method not allowed','text/plain; charset=utf-8',false,{Allow:'GET, HEAD'});
   return;
  }
  const path=req.url??'';
  if(path==='/public-reader.css'){respond(res,200,css,'text/css; charset=utf-8',head);return;}
  // Reject query strings, percent-encoded paths and alternate URL forms before parsing.
  if(path.includes('%')||path.includes('?')||path.includes('#')||path.length>300){
   respond(res,404,'Not found','text/plain; charset=utf-8',head);return;
  }
  const match=ROUTE.exec(path);
  if(!match||!UUID.test(match[1])||!UUID.test(match[2])){
   respond(res,404,'Not found','text/plain; charset=utf-8',head);return;
  }
  const format=match[3]?'text':'html';
  read.read({publisherId,billId:match[1],versionId:match[2],format})
    .then(body=>respond(res,200,body,format==='html'?'text/html; charset=utf-8':'text/plain; charset=utf-8',head),
      ()=>respond(res,404,'Not found','text/plain; charset=utf-8',head));
 });
}
