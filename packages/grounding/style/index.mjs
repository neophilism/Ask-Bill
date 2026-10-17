/** AB-041: reading levels change framing, never authenticated legal quotations or exceptions. */
import {createHash} from 'node:crypto';
export class ReadingLevelError extends Error {constructor(code){super(code);this.name='ReadingLevelError';this.code=code;}}
const fail=c=>{throw new ReadingLevelError(c)};
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const allowed=new Set(['simple','standard','concise']);
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(s);
const introductions=Object.freeze({
 concise:'Source text and material exceptions are shown below.',
 standard:'Read the original provision alongside its important exceptions. This is a source quotation, not a personal legal conclusion.',
 simple:'This is the original wording. Read the exception too: it may change how the rule works. This is not advice for your own case.'
});
const cp=s=>Array.from(s);
function verifySpan(span,versionId,text){
 if(!span||span.versionId!==versionId||typeof span.quote!=='string'||
   !Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||
   span.start<0||span.end<=span.start||span.end>cp(text).length||
   cp(text).slice(span.start,span.end).join('')!==span.quote||
   span.quoteHash!==sha(span.quote))fail('SOURCE_SPAN_INVALID');
 return Object.freeze({quote:span.quote,start:span.start,end:span.end,quoteHash:span.quoteHash});
}
export function createReadingLevelCard({level='standard',versionId,source,mainSpan,decisiveExceptions}={}){
 if(!allowed.has(level)||!id(versionId)||!source||source.versionId!==versionId||
   source.publication!=='published'||source.sourceComplete!==true||
   typeof source.canonicalText!=='string'||!source.canonicalText||
   source.sha256!==sha(source.canonicalText)||
   !Array.isArray(decisiveExceptions)||decisiveExceptions.length>30)fail('PUBLISHED_SOURCE_REQUIRED');
 const main=verifySpan(mainSpan,versionId,source.canonicalText);
 const exceptionSpans=decisiveExceptions.map(span=>verifySpan(span,versionId,source.canonicalText));
 if(new Set(exceptionSpans.map(x=>x.quoteHash+'@'+x.start)).size!==exceptionSpans.length)
   fail('EXCEPTION_DUPLICATE');
 if(source.decisionsRequireExceptions===true&&!exceptionSpans.length)fail('EXCEPTION_OMITTED');
 const result={kind:'reading_level_source_card',level,versionId,
   introduction:introductions[level],originalQuote:main.quote,mainSpan:main,
   decisiveExceptions:Object.freeze(exceptionSpans),
   sourceStatus:'verified_published_source_text',claimsPersonalAdvice:false,
   isAgeClassification:false,originalTextNeverModified:true};
 return Object.freeze(result);
}
export function switchEphemeralReadingLevel(state,next,documentVersion){
 if(!allowed.has(next)||!id(documentVersion)||!state||
   !allowed.has(state.level)||!id(state.documentVersion)||state.storage!=='session_memory_only')fail('READING_STATE');
 return Object.freeze({level:next,documentVersion,storage:'session_memory_only',
   relatedToAge:false,historyPersisted:false,
   changedDocument:state.documentVersion!==documentVersion});
}
export function initialEphemeralReadingLevel(versionId){
 if(!id(versionId))fail('DOCUMENT_VERSION_INVALID');
 return Object.freeze({level:'standard',documentVersion:versionId,
   storage:'session_memory_only',relatedToAge:false,historyPersisted:false,
   changedDocument:false});
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sourceReadingCardHtml(card){
 if(!card||card.kind!=='reading_level_source_card'||!allowed.has(card.level)||
   !Array.isArray(card.decisiveExceptions)||typeof card.originalQuote!=='string')fail('CARD_INVALID');
 return '<section class="read-level-card" aria-label="Legislative source and exceptions">'+
   '<p>'+escape(card.introduction)+'</p><blockquote>'+escape(card.originalQuote)+'</blockquote>'+
   card.decisiveExceptions.map(s=>'<p><strong>Exception in exact source:</strong> '+escape(s.quote)+'</p>').join('')+
   '<p>Reading level: '+escape(card.level)+'</p></section>';
}
