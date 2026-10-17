/** AB-037: source-bound comparison; never treat a proposed bill as current law. */
import {createHash} from 'node:crypto';
export class BackgroundError extends Error{constructor(code){super(code);this.name='BackgroundError';this.code=code;}}
const fail=c=>{throw new BackgroundError(c)};
const HASH=/^[a-f0-9]{64}$/,ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;
const digest=s=>createHash('sha256').update(s,'utf8').digest('hex');
const officialHosts=new Set(['uscode.house.gov','www.govinfo.gov','govinfo.gov']);
function date(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||
    new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail('INVALID_DATE');
 return s;
}
function url(value){
 let u;try{u=new URL(value);}catch{fail('OFFICIAL_URL_REQUIRED');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||!officialHosts.has(u.hostname)||
    u.port||u.pathname.includes('..'))fail('UNAPPROVED_PRIMARY_SOURCE');
 return u.toString();
}
export function primaryLawRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record))fail('INVALID_PRIMARY_SOURCE');
 const keys=['kind','sourceId','jurisdiction','officialUrl','versionId','sourceText','sha256','retrievedAt','asOf','effectiveDate','sourceStatus'];
 if(Object.keys(record).some(k=>!keys.includes(k))||record.kind!=='statute_primary_source'||
    record.jurisdiction!=='US'||record.sourceStatus!=='in_force_on_as_of'||
    !ID.test(record.sourceId)||!ID.test(record.versionId)||
    typeof record.sourceText!=='string'||!record.sourceText.trim()||record.sourceText.length>500000||
    typeof record.sha256!=='string'||!HASH.test(record.sha256)||digest(record.sourceText)!==record.sha256)fail('SOURCE_INTEGRITY');
 const asOf=date(record.asOf), effectiveDate=date(record.effectiveDate), retrievedAt=date(record.retrievedAt);
 if(effectiveDate>asOf||retrievedAt<asOf)fail('TEMPORAL_CONFLICT');
 return Object.freeze({...record,officialUrl:url(record.officialUrl)});
}
export function proposedSourceRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record)||
   record.kind!=='proposed_legislation'||!['draft','introduced','amended','passed_one_chamber'].includes(record.status)||
   !ID.test(record.sourceId)||!ID.test(record.versionId)||
   typeof record.sourceText!=='string'||!record.sourceText.trim()||
   typeof record.sha256!=='string'||!HASH.test(record.sha256)||digest(record.sourceText)!==record.sha256)
   fail('DRAFT_SOURCE_INVALID');
 return Object.freeze({...record});
}
export function exactExcerpt({source,span}){
 if(!source||!span||span.sourceVersionId!==source.versionId||
    !Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||
    span.end<=span.start||span.end>Array.from(source.sourceText).length)fail('SOURCE_SPAN');
 const quote=Array.from(source.sourceText).slice(span.start,span.end).join('');
 if(quote!==span.quote||span.quoteHash!==digest(quote))fail('QUOTE_TAMPERED');
 return Object.freeze({versionId:source.versionId,quote,sourceId:source.sourceId,offsets:{start:span.start,end:span.end}});
}
/** A comparison of source documents, not a promise of legal effect or amendment application. */
export function compareText({law,draft,lawSpan,draftSpan}={}){
 const existing=primaryLawRecord(law),proposal=proposedSourceRecord(draft);
 if(existing.versionId===proposal.versionId||existing.sourceId===proposal.sourceId)fail('SOURCES_NOT_INDEPENDENT');
 return Object.freeze({type:'dated_primary_source_comparison',status:'source_text_only',
   currentLaw:Object.freeze({label:'Existing statutory source',jurisdiction:existing.jurisdiction,
     asOf:existing.asOf,effectiveDate:existing.effectiveDate,officialUrl:existing.officialUrl,
     ...exactExcerpt({source:existing,span:lawSpan})}),
   proposed:Object.freeze({label:'Proposed bill, not enacted law',status:proposal.status,
     ...exactExcerpt({source:proposal,span:draftSpan})}),
   caveat:'These are separately sourced quotations. No automatic amendment, personal legal conclusion, or claim of current legal effect is inferred.'});
}
