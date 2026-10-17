/** AB-092: share only publicly released, verified source text; never anonymous chat. */
import {validatePublishedReaderPack,publicBillLink} from '../ui/reader/index.mjs';
export class SourceShareError extends Error{constructor(code){super(code);this.code=code;this.name='SourceShareError';}}
const deny=c=>{throw new SourceShareError(c)};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createSourceOnlyShare({pack,provisionId}={}){
 let p;try{p=validatePublishedReaderPack(pack);}catch{deny('PUBLISHED_SOURCE_REQUIRED');}
 if(typeof provisionId!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,100}$/.test(provisionId))deny('INVALID_PROVISION');
 const item=p.provisions.find(x=>x.id===provisionId);
 if(!item)deny('PROVISION_UNAVAILABLE');
 return Object.freeze({kind:'ask-bill-source-share-v1',billId:p.billId,versionId:p.versionId,
   title:p.title,jurisdiction:p.jurisdiction,status:p.status,
   publishedAt:p.publishedAt,retrievedAt:p.retrievedAt,
   provisionId:item.id,heading:item.heading,text:item.text,quoteSha256:item.sha256,
   canonicalSha256:p.canonicalSha256,officialUrl:p.sourceUrl,
   sourceLink:publicBillLink({billId:p.billId,versionId:p.versionId,provisionId:item.id}),
   sourceComplete:true,publication:'published',containsPrivateChat:false,containsUserData:false,
   legalDisclaimer:'Exact published document version; this is not confirmation of current law or legal advice.'});
}
function verified(share){
 if(!share||share.kind!=='ask-bill-source-share-v1'||share.publication!=='published'||
   share.sourceComplete!==true||share.containsPrivateChat!==false||share.containsUserData!==false||
   typeof share.text!=='string'||share.text.length>150000||typeof share.heading!=='string'||
   !/^[a-f0-9]{64}$/.test(share.quoteSha256??''))deny('UNVERIFIED_SHARE');
 return share;
}
export function renderSourceShareHtml(input){
 const s=verified(input);
 const official=s.officialUrl?'<a rel="noopener noreferrer" href="'+esc(s.officialUrl)+'">Official document reference</a>':
  'No official source link has been recorded';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<meta name="robots" content="noindex,nofollow"><title>Source passage — Ask Bill</title><link rel="stylesheet" href="/public-reader.css"></head>'+
  '<body><a href="#source">Skip to exact source</a><header><strong>Ask Bill — public source share</strong></header>'+
  '<main id="source"><h1>'+esc(s.title)+'</h1><p>Document status: <strong>'+esc(s.status)+
  '</strong>. Published '+esc(s.publishedAt)+'; version '+esc(s.versionId)+'.</p>'+
  '<p>'+esc(s.legalDisclaimer)+'</p><h2>'+esc(s.heading)+'</h2><pre class="statutory-text">'+esc(s.text)+'</pre>'+
  '<p>Exact provision SHA-256: <code>'+esc(s.quoteSha256)+'</code></p><p>'+official+'</p>'+
  '<p><a href="'+esc(s.sourceLink)+'">Open the entire public version and its source passage</a></p></main>'+
  '<footer>No private conversation, personal data, or custom answer is published by this feature.</footer></body></html>';
}
export function renderSourceShareText(input){
 const s=verified(input);
 return [s.title,'Version: '+s.versionId,'Status: '+s.status,
   'Retrieved: '+s.retrievedAt,'Published: '+s.publishedAt,
   'Exact source SHA-256: '+s.quoteSha256,'Source: '+s.sourceLink,
   'Official link: '+(s.officialUrl??'not recorded'),s.legalDisclaimer,'',s.heading,s.text,''].join('\n');
}
