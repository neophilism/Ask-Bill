/** AB-018: exact version-pinned citation anchors and Unicode index boundaries. */
import {createHash} from 'node:crypto';
export class AnchorError extends Error{constructor(code){super(code);this.code=code;this.name='AnchorError';}}
const fail=code=>{throw new AnchorError(code)};
const ID=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/;
const digest=x=>createHash('sha256').update(x,'utf8').digest('hex');
function unicode(value,limit=500000){
 if(typeof value!=='string'||Array.from(value).length>limit)fail('UNICODE_LENGTH');
 for(const ch of value){const n=ch.codePointAt(0);if(n>=0xd800&&n<=0xdfff)fail('UNICODE_SURROGATE');}
 return value;
}
function meta(versionId,provisionId){
 if(typeof versionId!=='string'||!ID.test(versionId)||typeof provisionId!=='string'||!ID.test(provisionId))fail('INVALID_SOURCE_ID');
}
function limits(text,start,end){
 const chars=Array.from(unicode(text)),n=chars.length;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>n)fail('RANGE_INVALID');
 return chars;
}
export function pointRangeToUtf16(text,start,end){
 const chars=limits(text,start,end);
 return Object.freeze({startUtf16:chars.slice(0,start).join('').length,endUtf16:chars.slice(0,end).join('').length});
}
export function utf16RangeToPoints(text,startUtf16,endUtf16){
 unicode(text);
 if(!Number.isSafeInteger(startUtf16)||!Number.isSafeInteger(endUtf16)||startUtf16<0||endUtf16<=startUtf16||endUtf16>text.length)fail('RANGE_INVALID');
 const boundaries=new Map([[0,0]]);let index=0,unit=0;
 for(const ch of text){unit+=ch.length;index++;boundaries.set(unit,index);}
 if(!boundaries.has(startUtf16)||!boundaries.has(endUtf16))fail('SPLIT_SURROGATE');
 return Object.freeze({start:boundaries.get(startUtf16),end:boundaries.get(endUtf16)});
}
export function anchorFor({versionId,provisionId,sourceText}){
 meta(versionId,provisionId);unicode(sourceText);
 const sourceHash=digest(sourceText);
 return Object.freeze({anchorId:'ab-'+digest(JSON.stringify([versionId,provisionId,sourceHash])).slice(0,24),
   versionId,provisionId,sourceHash,sourceCodePoints:Array.from(sourceText).length});
}
export function makeExactQuoteSpan({versionId,provisionId,sourceText,quote,citationLabel,occurrence,originalLocator={}}){
 const anchor=anchorFor({versionId,provisionId,sourceText});
 unicode(quote,4000);if(!quote.length)fail('EMPTY_QUOTE');
 if(typeof citationLabel!=='string'||!citationLabel.trim()||citationLabel.length>250)fail('CITATION_LABEL');
 if(originalLocator===null||typeof originalLocator!=='object'||Array.isArray(originalLocator))fail('SOURCE_LOCATOR');
 for(const [k,v] of Object.entries(originalLocator)){
  if(!['page','xmlId','sourceRange'].includes(k))fail('SOURCE_LOCATOR');
  if(k==='page'?!Number.isSafeInteger(v)||v<1:typeof v!=='string'||!v.length||v.length>200)fail('SOURCE_LOCATOR');
 }
 const chars=Array.from(sourceText),needle=Array.from(quote),hits=[];
 for(let i=0;i+needle.length<=chars.length;i++){
  if(chars[i]!==needle[0])continue;
  let equal=true;for(let j=1;j<needle.length;j++)if(chars[i+j]!==needle[j]){equal=false;break;}
  if(equal)hits.push(i);
 }
 if(!hits.length)fail('QUOTE_NOT_FOUND');
 if(occurrence===undefined&&hits.length>1)fail('AMBIGUOUS_QUOTE');
 if(occurrence!==undefined&&(!Number.isSafeInteger(occurrence)||occurrence<0||occurrence>=hits.length))fail('OCCURRENCE_INVALID');
 const start=hits[occurrence??0],end=start+needle.length;
 const span=Object.freeze({sourceVersionId:versionId,provisionId,start,end,quote,quoteHash:digest(quote),citationLabel,
   originalLocator:Object.freeze({...originalLocator})});
 return Object.freeze({anchor,...anchor,span});
}
export function verifyExactQuoteSpan({sourceVersionId,provisionId,sourceText,span}){
 meta(sourceVersionId,provisionId);
 if(!span||span.sourceVersionId!==sourceVersionId||span.provisionId!==provisionId)fail('VERSION_MISMATCH');
 const chars=limits(sourceText,span.start,span.end),actual=chars.slice(span.start,span.end).join('');
 if(actual!==span.quote||digest(actual)!==span.quoteHash)fail('QUOTE_TAMPERED');
 return Object.freeze({anchor:anchorFor({versionId:sourceVersionId,provisionId,sourceText}),utf16:pointRangeToUtf16(sourceText,span.start,span.end)});
}
