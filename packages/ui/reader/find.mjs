/** AB-091: deterministic read-only find within a verified published version. */
import {createHash} from 'node:crypto';
import {validatePublishedReaderPack,publicBillLink} from './index.mjs';
export class ReaderSearchError extends Error{constructor(code){super(code);this.code=code;this.name='ReaderSearchError';}}
const deny=c=>{throw new ReaderSearchError(c)};
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cp=s=>Array.from(s);
const fold=s=>s.replace(/[A-Z]/g,c=>c.toLowerCase());
export function findExactPublishedText({pack,query,limit=20}={}){
 let p;try{p=validatePublishedReaderPack(pack);}catch{deny('PUBLISHED_SOURCE_REQUIRED');}
 if(typeof query!=='string'||query!==query.trim()||cp(query).length<2||cp(query).length>80||
    /[\u0000-\u001f\u007f]/u.test(query)||cp(query).some(x=>x.length===1&&x.charCodeAt(0)>=0xd800&&x.charCodeAt(0)<=0xdfff)||
    !Number.isSafeInteger(limit)||limit<1||limit>50)deny('INVALID_SEARCH_QUERY');
 const needle=fold(query),results=[];let truncated=false;
 for(const item of p.provisions){
   const haystack=fold(item.text),chars=cp(item.text);let startAt=0;
   while(startAt<haystack.length){
     const pos=haystack.indexOf(needle,startAt);if(pos<0)break;
     if(results.length>=limit){truncated=true;break;}
     const actual=item.text.slice(pos,pos+query.length);
     const begin=cp(item.text.slice(0,pos)).length,end=begin+cp(actual).length;
     const lo=Math.max(0,begin-35),hi=Math.min(chars.length,end+35);
     results.push(Object.freeze({provisionId:item.id,versionId:p.versionId,heading:item.heading,
       start:begin,end,quote:actual,quoteSha256:hash(actual),
       excerpt:(lo?'…':'')+chars.slice(lo,hi).join('')+(hi<chars.length?'…':''),
       href:publicBillLink({billId:p.billId,versionId:p.versionId,provisionId:item.id})}));
     startAt=pos+Math.max(1,needle.length);
   }
   if(truncated)break;
 }
 return Object.freeze({kind:'ask-bill-source-search',publisherId:p.publisherId,billId:p.billId,
   versionId:p.versionId,sourceSha256:p.canonicalSha256,query,
   results:Object.freeze(results),truncated,stored:false});
}
export function renderSourceSearchResults(report){
 if(!report||report.kind!=='ask-bill-source-search'||report.stored!==false||
    !Array.isArray(report.results)||report.results.length>50)deny('UNTRUSTED_SEARCH_REPORT');
 const list=report.results.map(r=>'<li><strong>'+esc(r.heading)+'</strong><p>'+esc(r.excerpt)+'</p>'+
    '<a href="'+esc(r.href)+'">Go to this exact version and provision</a></li>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Find in bill — Ask Bill</title><link rel="stylesheet" href="/public-reader.css"></head><body>'+
 '<a href="#matches">Skip to matches</a><header><strong>Ask Bill — published source search</strong></header><main id="matches"><h1>Find in the exact bill text</h1>'+
 '<p>Matches are from one published source version. They are not legal interpretations or statements of current law.</p><p>Version '+esc(report.versionId)+' · Search: <strong>'+esc(report.query)+'</strong></p>'+
 '<ol>'+list+'</ol>'+(report.results.length?'':'<p>No matching passage was found in this version.</p>')+
 (report.truncated?'<p>Additional matches exist; narrow the query.</p>':'')+
 '<p><a href="'+esc(publicBillLink({billId:report.billId,versionId:report.versionId}))+'">Back to the full bill</a></p></main>'+
 '<footer>Independent site, not government advice. This search does not persist queries.</footer></body></html>';
}
