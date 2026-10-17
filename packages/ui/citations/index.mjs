/** AB-036: inspectable citations without graphics, speech or model access. */
export class CitationCardError extends Error{constructor(code){super(code);this.code=code;this.name='CitationCardError';}}
const deny=code=>{throw new CitationCardError(code)};
const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(v);
export function presentCitation({claim,span,versionId,sourceText}={}){
 if(!valid(versionId)||!claim||!['supported','qualified','disputed','incomplete_source','unavailable'].includes(claim.support)||!span||span.sourceVersionId!==versionId||!valid(span.provisionId)||typeof sourceText!=='string')deny('SOURCE_CONTEXT');
 if(!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<=span.start||span.end>Array.from(sourceText).length)deny('SOURCE_RANGE');
 const exact=Array.from(sourceText).slice(span.start,span.end).join('');
 if(exact!==span.quote||typeof span.citationLabel!=='string'||!span.citationLabel.trim())deny('SOURCE_QUOTE_MISMATCH');
 return Object.freeze({kind:'exact_source',versionId,provisionId:span.provisionId,citationLabel:span.citationLabel,quote:exact,sourceAnchor:'provision-'+encodeURIComponent(span.provisionId),support:claim.support});
}
export function answerView({segments,versionId}={}){
 if(!Array.isArray(segments)||segments.length>100||!valid(versionId))deny('INVALID_ANSWER');
 const out=segments.map(s=>{if(!s||s.versionId!==versionId||typeof s.text!=='string'||s.text.length>5000||s.approved!==true)deny('UNAPPROVED_ANSWER');return Object.freeze({id:s.id,text:s.text,claims:s.claims||[],versionId});});
 return Object.freeze(out);
}
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function citationCardHtml(card){
 if(!card||card.kind!=='exact_source'||!valid(card.versionId)||!valid(card.provisionId)||typeof card.quote!=='string'||typeof card.citationLabel!=='string')deny('INVALID_CARD');
 return '<aside class="source-card" aria-label="Source evidence"><strong>'+html(card.citationLabel)+'</strong><blockquote>'+html(card.quote)+'</blockquote><p>Version '+html(card.versionId)+'</p><a href="#'+html(card.sourceAnchor)+'">Go to source passage</a></aside>';
}
