/** AB-004 follow-up: accessible catalog of already published, complete active releases. */
import {publicBillLink} from '../reader/index.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES={draft:'Draft',introduced:'Introduced',amended:'Amended',passed_one_chamber:'Passed one chamber',enacted:'Enacted',effective:'Effective',repealed:'Repealed',unknown:'Status unknown'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class CatalogError extends Error{constructor(code){super(code);this.code=code;this.name='CatalogError';}}
const fail=c=>{throw new CatalogError(c)};
export function validatePublicCatalog({publisherId,page=1,items,hasNext=false}={}){
 if(!UUID.test(publisherId??'')||!Number.isSafeInteger(page)||page<1||page>50||
   !Array.isArray(items)||items.length>20||typeof hasNext!=='boolean'||(page===50&&hasNext))fail('INVALID_CATALOG');
 const seen=new Set(),publicItems=[];
 for(const item of items){
   if(!item||typeof item!=='object'||Array.isArray(item)||
      item.publisherId?.toLowerCase()!==publisherId.toLowerCase()||
      !UUID.test(item.billId??'')||!UUID.test(item.versionId??'')||
      item.publication!=='published'||item.sourceComplete!==true||
      !Object.hasOwn(STATUSES,item.status)||typeof item.title!=='string'||
      !item.title.trim()||item.title.length>300||
      /[\u0000-\u001f]/.test(item.title)||seen.has(item.billId.toLowerCase()))fail('UNVERIFIED_CATALOG_ITEM');
   seen.add(item.billId.toLowerCase());
   publicItems.push(Object.freeze({
     billId:item.billId.toLowerCase(),versionId:item.versionId.toLowerCase(),
     title:item.title,status:item.status
   }));
 }
 return Object.freeze({publisherId:publisherId.toLowerCase(),page,
   hasNext,items:Object.freeze(publicItems)});
}
export function renderPublicCatalog(input){
 const c=validatePublicCatalog(input);
 const entries=c.items.map(item=>'<li><a href="'+escape(publicBillLink({billId:item.billId,versionId:item.versionId}))+'">'+escape(item.title)+'</a><span> — '+escape(STATUSES[item.status])+'</span></li>').join('');
 const previous=c.page>1?'<a href="'+(c.page===2?'/bills':'/bills/page/'+(c.page-1))+'">Previous page</a>':'';
 const next=c.hasNext?'<a href="/bills/page/'+(c.page+1)+'">Next page</a>':'';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Published bills — Ask Bill</title><link rel="stylesheet" href="/public-reader.css"></head><body><a href="#catalog">Skip to published bills</a><header><strong>Ask Bill — source-only catalog</strong></header><main id="catalog"><h1>Published bills</h1><p>Only complete, publicly released document versions belong here. Publication is not proof a proposal became effective law.</p><nav aria-label="Published bills"><ol>'+entries+'</ol></nav><p>Page '+c.page+'</p><nav aria-label="Catalog pages">'+previous+(previous&&next?' · ':'')+next+'</nav></main><footer>Ask Bill is an independent website, not a government service or legal advice. Read the exact bill text without AI, speech or animation.</footer></body></html>';
}
