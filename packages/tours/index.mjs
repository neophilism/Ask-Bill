/** AB-089: exact, version-pinned source-reading tour. No AI, speech or animation. */
import {createHash} from 'node:crypto';
import {validatePublishedReaderPack,publicBillLink} from '../ui/reader/index.mjs';
export class SourceTourError extends Error{constructor(code){super(code);this.code=code;this.name='SourceTourError';}}
const deny=code=>{throw new SourceTourError(code)};
const issued=new WeakSet();
const cp=s=>Array.from(s);
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createSourceOnlyTour({pack,maxSteps=12}={}){
 let p;try{p=validatePublishedReaderPack(pack)}catch{deny('PUBLISHED_SOURCE_REQUIRED')}
 if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>20)deny('INVALID_TOUR_BUDGET');
 const selected=p.provisions.slice(0,maxSteps);
 const steps=selected.map((s,i)=>{
  const points=cp(s.text),excerpt=points.slice(0,250).join('');
  return Object.freeze({index:i+1,versionId:p.versionId,provisionId:s.id,
    heading:s.heading,quote:excerpt,quoteSha256:hash(excerpt),
    sourceSectionSha256:s.sha256,truncated:points.length>250,
    sourceLink:publicBillLink({billId:p.billId,versionId:p.versionId,provisionId:s.id})});
 });
 const result=Object.freeze({kind:'ask-bill-source-only-tour',billId:p.billId,versionId:p.versionId,
  publisherId:p.publisherId,title:p.title,status:p.status,
  sourceSha256:p.canonicalSha256,totalSections:p.provisions.length,
  steps:Object.freeze(steps),tourHasMoreSections:p.provisions.length>steps.length,
  sourceOnly:true,verifiedSourceOnly:true,audioEnabled:false,modelEnabled:false});
 issued.add(result);
 return result;
}
export function renderSourceTourStep({tour,step}={}){
 if(!issued.has(tour)||!Number.isSafeInteger(step)||step<1||step>tour.steps.length)deny('UNAVAILABLE_TOUR_STEP');
 const selected=tour.steps[step-1],base=publicBillLink({billId:tour.billId,versionId:tour.versionId});
 const previous=step>1?'<a href="'+escape(base)+'/tour/'+(step-1)+'">Previous passage</a>':'';
 const next=step<tour.steps.length?'<a href="'+escape(base)+'/tour/'+(step+1)+'">Next passage</a>':'';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'+
 '<title>Source reading tour — Ask Bill</title><link rel="stylesheet" href="/public-reader.css"></head><body>'+
 '<a href="#tour">Skip to passage</a><header><strong>Ask Bill — source-only guided reading</strong></header>'+
 '<main id="tour"><h1>'+escape(tour.title)+'</h1><p role="status">Step '+step+' of '+tour.steps.length+
 '. Document status: <strong>'+escape(tour.status)+'</strong>.</p>'+
 '<p>This shows the exact published source version, not legal advice or an AI interpretation. No speech or animation is needed.</p>'+
 '<h2>'+escape(selected.heading)+'</h2><blockquote class="statutory-text">'+escape(selected.quote)+'</blockquote>'+
 (selected.truncated?'<p>This is a shortened exact excerpt, not the full provision. Open the source for the complete wording and exceptions.</p>':'')+
 '<p>Source quote SHA-256: <code>'+selected.quoteSha256+'</code></p>'+
 '<p><a href="'+escape(selected.sourceLink)+'">Read this full provision in its original version</a></p>'+
 (tour.tourHasMoreSections?'<p>This introduction covers only part of the document. The complete source remains available.</p>':'')+
 '<nav aria-label="Tour navigation">'+previous+(previous&&next?' · ':'')+next+
 ' · <a href="'+escape(base)+'">Leave the tour and read the complete bill</a></nav></main>'+
 '<footer>Independent site, not a government service. Source text and links work without JavaScript.</footer></body></html>';
}
