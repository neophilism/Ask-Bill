import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {primaryLawRecord,proposedSourceRecord,exactExcerpt,compareText,BackgroundError} from '../packages/grounding/background/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex'),lawText='The official statute permits a filing with the agency.',draftText='A new draft proposes electronic submission.';
const law={kind:'statute_primary_source',sourceId:'law-1',jurisdiction:'US',officialUrl:'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title1-section1',
 versionId:'law-v1',sourceText:lawText,sha256:sha(lawText),retrievedAt:'2026-10-16',asOf:'2026-10-15',effectiveDate:'2025-01-01',sourceStatus:'in_force_on_as_of'};
const draft={kind:'proposed_legislation',sourceId:'draft-1',versionId:'draft-v1',status:'introduced',sourceText:draftText,sha256:sha(draftText)};
const span=(record)=>({sourceVersionId:record.versionId,start:0,end:Array.from(record.sourceText).length,quote:record.sourceText,quoteHash:sha(record.sourceText)});
test('primary law and draft versions display side-by-side with explicit status and dates',()=>{
 const a=compareText({law,draft,lawSpan:span(law),draftSpan:span(draft)});
 assert.equal(a.type,'dated_primary_source_comparison');assert.equal(a.currentLaw.asOf,'2026-10-15');
 assert.match(a.proposed.label,/not enacted law/);assert.match(a.caveat,/No automatic amendment/);
 assert.equal(a.proposed.quote,draftText);assert(Object.isFrozen(a.currentLaw));
});
test('arbitrary sites, nonofficial draft sources and wrong current-law dates fail closed',()=>{
 for(const officialUrl of ['http://uscode.house.gov/','https://uscode.house.gov.evil.tld/doc','javascript:alert(1)','https://example.gov/doc'])
  assert.throws(()=>primaryLawRecord({...law,officialUrl}),BackgroundError);
 assert.throws(()=>primaryLawRecord({...law,effectiveDate:'2028-01-01'}),BackgroundError);
 assert.throws(()=>primaryLawRecord({...law,asOf:'2026-02-31'}),BackgroundError);
 assert.throws(()=>proposedSourceRecord({...draft,status:'enacted'}),BackgroundError);
});
test('source bytes, version pins and quotation digests remain independent',()=>{
 assert.throws(()=>primaryLawRecord({...law,sourceText:'Adversary supplied text.'}),BackgroundError);
 assert.throws(()=>exactExcerpt({source:law,span:{...span(law),quoteHash:sha('wrong')}}),BackgroundError);
 assert.throws(()=>compareText({law,draft,lawSpan:{...span(law),sourceVersionId:'draft-v1'},draftSpan:span(draft)}),BackgroundError);
 assert.throws(()=>compareText({law,draft:{...draft,versionId:'law-v1'},lawSpan:span(law),draftSpan:span(draft)}),BackgroundError);
});
test('exact excerpts use Unicode code-point offsets, not UTF-16 indexes',()=>{
 const source={...draft,sourceText:'One 💡 proposal',sha256:sha('One 💡 proposal')};
 const quote='💡',s={sourceVersionId:source.versionId,start:4,end:5,quote,quoteHash:sha(quote)};
 assert.equal(exactExcerpt({source,span:s}).quote,'💡');
 assert.throws(()=>exactExcerpt({source,span:{...s,end:6}}),BackgroundError);
});
