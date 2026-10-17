import test from 'node:test';
import assert from 'node:assert/strict';
import {anchorFor,makeExactQuoteSpan,verifyExactQuoteSpan,pointRangeToUtf16,utf16RangeToPoints,AnchorError} from '../packages/content/anchors/index.mjs';
const input={versionId:'bill-v1',provisionId:'sec-1',sourceText:'§ 1 — 😃 café e\u0301 and ﬁligree.',citationLabel:'Section 1'};
test('exact versioned citation covers emoji, composed and decomposed glyphs',()=>{
 const text=input.sourceText,quote='😃 café e\u0301',result=makeExactQuoteSpan({...input,quote,originalLocator:{page:2,xmlId:'sec1'}});
 assert.equal(result.anchor.versionId,'bill-v1');assert.equal(result.span.quote,quote);
 const checked=verifyExactQuoteSpan({sourceVersionId:'bill-v1',provisionId:'sec-1',sourceText:text,span:result.span});
 const offsets=checked.utf16;assert.equal(text.slice(offsets.startUtf16,offsets.endUtf16),quote);
 assert.deepEqual(utf16RangeToPoints(text,offsets.startUtf16,offsets.endUtf16),{start:result.span.start,end:result.span.end});
});
test('version and exact Unicode normalization change anchor identity',()=>{
 const a=anchorFor({...input}),b=anchorFor({...input,versionId:'bill-v2'}),c=anchorFor({...input,sourceText:input.sourceText.normalize('NFC')});
 assert.notEqual(a.anchorId,b.anchorId);assert.notEqual(a.anchorId,c.anchorId);
 assert.throws(()=>makeExactQuoteSpan({...input,quote:'é and ﬁ',sourceText:'cafe\u0301 and ﬁ'}),AnchorError);
});
test('ambiguous repeated passages never silently select the first',()=>{
 const s={...input,sourceText:'No, no, no.',quote:'no'};
 assert.throws(()=>makeExactQuoteSpan(s),e=>e.code==='AMBIGUOUS_QUOTE');
 assert.equal(makeExactQuoteSpan({...s,occurrence:1}).span.start,8);
 assert.throws(()=>makeExactQuoteSpan({...s,occurrence:5}),e=>e.code==='OCCURRENCE_INVALID');
});
test('stale or tampered source span is rejected on the active version',()=>{
 const r=makeExactQuoteSpan({...input,quote:'ﬁligree'});
 assert.throws(()=>verifyExactQuoteSpan({sourceVersionId:'bill-v2',provisionId:'sec-1',sourceText:input.sourceText,span:r.span}),e=>e.code==='VERSION_MISMATCH');
 assert.throws(()=>verifyExactQuoteSpan({sourceVersionId:'bill-v1',provisionId:'sec-1',sourceText:input.sourceText.replace('ﬁ','f'),span:r.span}),e=>e.code==='RANGE_INVALID'||e.code==='QUOTE_TAMPERED');
 assert.throws(()=>verifyExactQuoteSpan({sourceVersionId:'bill-v1',provisionId:'sec-1',sourceText:input.sourceText,span:{...r.span,quoteHash:'0'.repeat(64)}}),e=>e.code==='QUOTE_TAMPERED');
});
test('split surrogate boundaries and invalid character ranges fail closed',()=>{
 const text='A😃B';
 assert.deepEqual(pointRangeToUtf16(text,1,2),{startUtf16:1,endUtf16:3});
 assert.throws(()=>utf16RangeToPoints(text,2,3),e=>e.code==='SPLIT_SURROGATE');
 assert.throws(()=>pointRangeToUtf16(text,2,2),e=>e.code==='RANGE_INVALID');
 assert.throws(()=>anchorFor({...input,sourceText:'\ud800'}),e=>e.code==='UNICODE_SURROGATE');
});
test('randomized deterministic code-point/UTF16 boundaries roundtrip',()=>{
 let seed=0x5335c;const values=['A','e\u0301','😃','ﬁ','\u200d','\r\n','𐐷','§','☀'];
 for(let n=0;n<150;n++){
  seed=(seed*1664525+1013904223)>>>0;const arr=Array.from({length:(seed%20)+1},(_,i)=>values[(i+n+seed)%values.length]);
  const text=arr.join(''),len=Array.from(text).length;
  for(let s=0;s<len;s+=3){const e=Math.min(len,s+1+(n%3));
   const offset=pointRangeToUtf16(text,s,e);
   assert.deepEqual(utf16RangeToPoints(text,offset.startUtf16,offset.endUtf16),{start:s,end:e});
   assert.equal(text.slice(offset.startUtf16,offset.endUtf16),Array.from(text).slice(s,e).join(''));
  }
 }
});
test('rejects malformed citations, locators and nonexact quote',()=>{
 assert.throws(()=>makeExactQuoteSpan({...input,quote:'not in bill'}),e=>e.code==='QUOTE_NOT_FOUND');
 assert.throws(()=>makeExactQuoteSpan({...input,quote:'😃',originalLocator:{page:'two'}}),e=>e.code==='SOURCE_LOCATOR');
 assert.throws(()=>makeExactQuoteSpan({...input,quote:'😃',originalLocator:{domSelector:'body'}}),e=>e.code==='SOURCE_LOCATOR');
 assert.throws(()=>makeExactQuoteSpan({...input,quote:'😃',citationLabel:''}),e=>e.code==='CITATION_LABEL');
 assert.throws(()=>anchorFor({...input,versionId:'../secret'}),e=>e.code==='INVALID_SOURCE_ID');
});
