import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {generateSyntheticStressPack,officialReferenceTargets,validateOfficialImportTarget,assertPublishableStressPack,FixtureError} from '../content/packs/reference/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
test('large corpus is deterministic, clearly synthetic, and version-independent',()=>{
 const x=generateSyntheticStressPack({sections:1200}),y=generateSyntheticStressPack({sections:1200});
 assert.equal(x.sha256,y.sha256);assert.equal(x.sha256,sha(x.text));assert.equal(x.entries.length,1200);
 assert.equal(x.paths.length,1200);assert.equal(new Set(x.paths).size,1200);
 assert.equal(x.publicationAllowed,false);assert.match(x.text,/NOT FEDERAL LEGISLATION/);
 for(const item of [x.entries[0],x.entries[101],x.entries[1199]]){
  const quoted=Array.from(x.text).slice(item.start,item.end).join('');
  assert.equal(quoted,item.text);assert.equal(item.sha256,sha(quoted));
 }
});
test('alternative document structures exercise distinct navigation keys and Unicode spans',()=>{
 const a=generateSyntheticStressPack({sections:75,structure:'division-section'});
 const b=generateSyntheticStressPack({sections:75,structure:'article-clause'});
 assert.notEqual(a.sha256,b.sha256);assert.notEqual(a.paths[0],b.paths[0]);
 assert.equal(a.sections,b.sections);
 const c=generateSyntheticStressPack({sections:2,unicode:false});assert(!c.text.includes('💡'));
});
test('official candidates are verified API locators, never represented as retrieved bills',()=>{
 const refs=officialReferenceTargets();assert.equal(refs.length,2);
 for(const r of refs){assert.equal(r.sourceRetrieved,false);assert.equal(r.complete,false);assert.equal(r.structure,'unverified');assert.equal(r.publicationAllowed,false);assert.deepEqual(validateOfficialImportTarget(r),r);}
 assert.notEqual(refs[0].congress,refs[1].congress);
 assert.throws(()=>validateOfficialImportTarget({...refs[0],source:'http://127.0.0.1/secrets'}),FixtureError);
 assert.throws(()=>validateOfficialImportTarget({...refs[0],complete:true}),FixtureError);
});
test('the fixture never becomes an authoritative published source and bounds are enforced',()=>{
 const x=generateSyntheticStressPack({sections:3});
 assert.throws(()=>assertPublishableStressPack(x),FixtureError);
 for(const sections of [0,2001,NaN,'500'])assert.throws(()=>generateSyntheticStressPack({sections}),FixtureError);
 assert.throws(()=>generateSyntheticStressPack({sections:10,structure:'untrusted'}),FixtureError);
});
