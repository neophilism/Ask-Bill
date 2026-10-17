/** AB-036: accessible source cards verified against authoritative versioned content. */
import {AnswerStreamGuard,parseAnswerEvent,verifySourceSpan} from '../../contracts/dist/index.js';
export class CitationCardError extends Error{constructor(code){super(code);this.code=code;this.name='CitationCardError';}}
const deny=c=>{throw new CitationCardError(c)};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(v);
const sha=/^[a-f0-9]{64}$/;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function verifiedSource(versionId,provisionId,sourceLookup){
 if(typeof sourceLookup!=='function')deny('SOURCE_LOOKUP_REQUIRED');
 const source=await sourceLookup(provisionId);
 if(!source||source.versionId!==versionId||source.publication!=='published'||
   source.sourceComplete!==true||typeof source.text!=='string'||
   typeof source.sha256!=='string'||!sha.test(source.sha256))deny('UNPUBLISHED_OR_UNVERIFIED_SOURCE');
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source.text));
 const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 if(actual!==source.sha256)deny('SOURCE_DIGEST_MISMATCH');
 return source;
}
export async function presentCitation({claim,span,versionId,sourceLookup,allowModelReviewed=false}={}){
 const allowedKind=claim?.kind==='bill_text'||allowModelReviewed&&['interpretation','hypothetical'].includes(claim?.kind);
 if(!id(versionId)||!claim||!allowedKind||claim.support!=='supported'||
   !Array.isArray(claim.spans)||!span||!id(span.provisionId)||span.sourceVersionId!==versionId||
   !claim.spans.some(x=>x.provisionId===span.provisionId&&x.start===span.start&&x.end===span.end&&
      x.quote===span.quote&&x.quoteHash===span.quoteHash&&x.citationLabel===span.citationLabel))deny('CLAIM_SOURCE_MISMATCH');
 const source=await verifiedSource(versionId,span.provisionId,sourceLookup);
 try{await verifySourceSpan(span,{versionId,provisionId:span.provisionId,text:source.text});}
 catch{deny('EXACT_QUOTE_INVALID');}
 return Object.freeze({kind:'exact_source',versionId,provisionId:span.provisionId,
   citationLabel:span.citationLabel,quote:span.quote,quoteHash:span.quoteHash,start:span.start,end:span.end,
   sourceAnchor:'provision-'+span.provisionId,support:claim.support});
}
/** Reject every unsupported, nonverbatim or wrong-version event before rendering it. */
export async function answerView({events,versionId,answerId,epoch,sourceLookup,allowModelReviewed=false}={}){
 if(!id(versionId)||!id(answerId)||!Number.isSafeInteger(epoch)||epoch<0||
   !Array.isArray(events)||events.length<1||events.length>101)deny('INVALID_ANSWER');
 const guard=new AnswerStreamGuard(answerId,versionId,epoch),out=[],spans=[];
 for(let i=0;i<events.length;i++){
   let event;
   try{event=parseAnswerEvent(events[i]);guard.accept(event);}
   catch{deny('UNVERIFIED_EVENT');}
   if(event.sequence!==i)deny('MISSING_EVENT');
   if(event.type==='segment.validated'||event.type==='correction'){
     const s=event.segment;
     const reviewed=allowModelReviewed===true&&s?.validation?.validatorConfig==='ff5ade6a8906f3eb09834a7f7750fdc6090d76de5474ad837d8cbd66a9cb9e99';
     if(!s||!Array.isArray(s.claims)||!s.claims.length||s.claims.some(c=>!(reviewed?['bill_text','interpretation','hypothetical'].includes(c.kind):c.kind==='bill_text')||
       c.support!=='supported'||c.spans.length!==1||(!reviewed&&c.text!==c.spans[0].quote))||
       s.text!==s.claims.map(c=>c.text).join('\n\n'))deny('NOT_VERBATIM_REVIEWED');
     const cards=[];
     for(const claim of s.claims){
       const card=await presentCitation({claim,span:claim.spans[0],versionId,sourceLookup,allowModelReviewed:reviewed});
       cards.push(card);spans.push(card);
     }
     out.push(Object.freeze({id:s.id,text:s.text,versionId,citations:Object.freeze(cards),
       label:reviewed?'AI explanation — check the cited source':'Exact source quotation',
       qualifications:Object.freeze([...new Set(s.claims.flatMap(claim=>claim.qualifications))])}));
   }
   if(event.type==='citation.ready'){
     if(!spans.some(c=>c.provisionId===event.span.provisionId&&c.quote===event.span.quote&&
       c.versionId===event.span.sourceVersionId&&c.start===event.span.start&&c.end===event.span.end&&c.quoteHash===event.span.quoteHash))deny('UNAPPROVED_CITATION');
   }
   if(event.type==='speech.ready')deny('SPEECH_NOT_REVIEWED');
 }
 return Object.freeze(out);
}
export function citationCardHtml(card){
 if(!card||card.kind!=='exact_source'||!id(card.versionId)||!id(card.provisionId)||
   typeof card.quote!=='string'||card.quote.length>20000||
   typeof card.citationLabel!=='string'||card.citationLabel.length>250||
   card.sourceAnchor!=='provision-'+card.provisionId)deny('INVALID_CARD');
 return '<aside class="source-card" aria-label="Source evidence"><strong>'+escape(card.citationLabel)+
   '</strong><blockquote>'+escape(card.quote)+'</blockquote><p>Version '+escape(card.versionId)+
   '</p><a href="#'+escape(card.sourceAnchor)+'">Go to source passage</a></aside>';
}
