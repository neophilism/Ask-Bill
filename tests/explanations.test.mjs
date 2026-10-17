import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {quotedProvisions,buildPerspectiveBrief,escapePerspectiveText,PerspectiveError} from '../packages/grounding/explanations/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex'),v='bill-v1',text='The draft establishes an electronic filing option, except during outages.';
const bill={versionId:v,status:'introduced',publication:'published',sourceComplete:true};
const provisions=[{versionId:v,provisionId:'p1',text,sha256:sha(text)}];
const selected=[{versionId:v,provisionId:'p1',start:0,end:Array.from(text).length,quote:text,quoteHash:sha(text)}];
const position=(stance,speaker,statement)=>({stance,speaker,statement,record:{versionId:v,canonicalText:'Statement: '+statement,sha256:sha('Statement: '+statement),asOf:'2026-10-16',sourceUrl:'https://example.org/public-comment'}});
test('source quote remains distinct from attributed position; one side never creates imaginary opposition',()=>{
 const brief=buildPerspectiveBrief({bill,provisions,selected,positions:[position('support','Example Witness','Electronic filing could reduce paper.')],unknowns:['unknown_current_law']});
 assert.equal(brief.quotations[0].quote,text);assert.equal(brief.positions.length,1);
 assert.equal(brief.positions[0].stance,'support');assert.match(brief.caveat,/not fabricated/);
 assert.deepEqual(brief.unknowns,['unknown_current_law']);assert(Object.isFrozen(brief.positions));
});
test('two opposing statements are attributed, never asserted as enacted law',()=>{
 const b=buildPerspectiveBrief({bill,provisions,selected,positions:[position('support','Speaker A','I support this approach.'),position('oppose','Speaker B','I oppose this approach.')]});
 assert.equal(b.positions[0].stance,'support');assert.equal(b.positions[1].stance,'oppose');
 assert.match(b.sourceCitationLabel,/not current law/);
 assert.throws(()=>buildPerspectiveBrief({bill:{...bill,status:'enacted'},provisions,selected}),PerspectiveError);
});
test('source hash, version, unknown stance and fabricated quotation fail closed',()=>{
 assert.throws(()=>quotedProvisions({versionId:v,provisions:[{...provisions[0],sha256:'f'.repeat(64)}],selected}),PerspectiveError);
 assert.throws(()=>quotedProvisions({versionId:v,provisions,selected:[{...selected[0],quote:'forged'}]}),PerspectiveError);
 assert.throws(()=>quotedProvisions({versionId:v,provisions,selected:[{...selected[0],versionId:'v2'}]}),PerspectiveError);
 assert.throws(()=>buildPerspectiveBrief({bill,provisions,selected,positions:[position('nonsense','Speaker','I object.')] }),PerspectiveError);
});
test('missing positions are surfaced as unknown, not auto-balanced',()=>{
 const b=buildPerspectiveBrief({bill,provisions,selected});assert.deepEqual(b.unknowns,['missing_published_position']);
 assert.equal(b.positions.length,0);
});
test('unsupported forecasts stay attributed and untrusted HTML is rendered inert',()=>{
 const statement='This might cost $500000 next year.';
 const p=position('concern','Witness',statement);
 const b=buildPerspectiveBrief({bill,provisions,selected,positions:[p]});
 assert.match(b.positions[0].prediction,/no independent quantitative verification/);
 assert.match(escapePerspectiveText('<script>alert(1)</script>'),/&lt;script&gt;/);
 assert.throws(()=>buildPerspectiveBrief({bill,provisions,selected,positions:[{...p,record:{...p.record,sourceUrl:'javascript:alert(1)'}}]}),PerspectiveError);
});
