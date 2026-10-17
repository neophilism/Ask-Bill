import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createElectronicFilingPack,explainFixtureQuestion,assertPublishablePack,ReferencePackError} from '../content/packs/electronic-filing/index.mjs';
const fixture=JSON.parse(await readFile(new URL('../fixtures/electronic-filing-excerpt.json',import.meta.url),'utf8'));
const sha=t=>createHash('sha256').update(t).digest('hex');
test('original fragment is byte-for-byte pinned and its exact quote is inspectable',()=>{
 const pack=createElectronicFilingPack(fixture);assert.equal(pack.originalExcerptSha256,sha(fixture.text));
 assert.equal(pack.originalSpan.quote,fixture.text);assert.equal(pack.originalSpan.end,Array.from(fixture.text).length);
 assert.equal(pack.publicationAllowed,false);assert.equal(pack.sourceComplete,false);assert.equal(pack.questions.length,6);
 assert.deepEqual(pack.missing,['opening_sections','definitions','following_clause','authenticated_full_version']);
});
test('any modified or falsely complete draft cannot masquerade as the original',()=>{
 for(const altered of [{...fixture,text:fixture.text+' No exceptions apply.'},{...fixture,sourceComplete:true},
   {...fixture,publicationAllowed:true},{...fixture,status:'enacted'},{...fixture,provisionLabel:'Section 1'}])
  assert.throws(()=>createElectronicFilingPack(altered),ReferencePackError);
});
test('receipt-time question quotes the source without inventing a completed legal rule',()=>{
 const pack=createElectronicFilingPack(fixture);
 const answer=explainFixtureQuestion(pack,'receipt_rule');
 assert.equal(answer.status,'verbatim_only');assert.equal(answer.citations[0].quote,fixture.text);
 assert.equal(answer.isCurrentLaw,false);assert.match(answer.text,/draft excerpt, not an enacted legal rule/);
 const employee=explainFixtureQuestion(pack,'employee_read');
 assert.equal(employee.status,'source_incomplete');assert.match(employee.text,/ends immediately/);
});
test('wrong agency, correction, definitions and deadlines are explicitly unresolved',()=>{
 const pack=createElectronicFilingPack(fixture);
 for(const key of ['wrong_agency','correction','definitions','deadline']){
  const answer=explainFixtureQuestion(pack,key);assert.equal(answer.citations.length,0);
  assert.notEqual(answer.status,'supported');assert.equal(answer.caseSpecificAdvice,false);
 }
 assert.equal(explainFixtureQuestion(pack,'unlisted').status,'not_supported');
});
test('the fixture can never pass the public-release gate',()=>{
 const pack=createElectronicFilingPack(fixture);
 assert.throws(()=>assertPublishablePack(pack),ReferencePackError);
 assert.throws(()=>assertPublishablePack({...pack,sourceComplete:true}),ReferencePackError);
});
