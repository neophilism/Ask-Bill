import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareExtractionCorrection} from '../packages/content/audit/index.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const publisherId='aaaaaaaa-1000-4000-8000-000000000001',billId='aaaaaaaa-1000-4000-8000-000000000002';
const versionId='aaaaaaaa-1000-4000-8000-000000000003',newVersionId='aaaaaaaa-1000-4000-8000-000000000004';
const provisionId='aaaaaaaa-1000-4000-8000-000000000005';
const actor={publisherId,userId:'aaaaaaaa-1000-4000-8000-000000000006',role:'editor',freshMembershipVerified:true,mfaVerifiedByTrustedServer:true};
function correction(text,start,end,expectedQuote,replacement){
  const source=Object.freeze({publisherId,versionId,billId,publication:'published',legalStatus:'introduced',
    text,canonicalSha256:sha(text),rawByteSha256:sha('immutable original bytes')});
  return prepareExtractionCorrection({publisherId,source,versionId,newVersionId,provisionId,oldText:text,start,end,expectedQuote,replacement,actor});
}
test('large complete sources retain codepoint-correct edits beyond the former 500k character limit',()=>{
  const prefix='a'.repeat(600000)+'💡',text=prefix+' unique source quote.';
  const start=Array.from(prefix).length+1,result=correction(text,start,start+6,'unique','precise');
  assert.equal(result.newVersion.canonicalText,prefix+' precise source quote.');
  assert.equal(result.newVersion.rawByteSha256,sha('immutable original bytes'));
  assert.deepEqual(result.audit.changedRange,{start,end:start+6});assert.equal(result.previousVersionUnchanged,true);
  assert.equal(result.newVersion.publication,'private');assert.equal(result.newVersion.sourceComplete,false);
});
test('the complete source limit is 1.5MB of UTF-8 and permits an exact-boundary Unicode edit',()=>{
  const text='a'.repeat(1499996)+'💡';assert.equal(Buffer.byteLength(text),1500000);
  const result=correction(text,1499996,1499997,'💡','ñ');
  assert.equal(Buffer.byteLength(result.newVersion.canonicalText),1499998);
  assert.throws(()=>correction('é'.repeat(750001),0,1,'é','e'),/ORIGINAL_SOURCE_NOT_VERIFIED/);
  const nearLimit='é'.repeat(749999)+'x';assert.equal(Buffer.byteLength(nearLimit),1499999);
  assert.throws(()=>correction(nearLimit,749999,750000,'x','💡'),/CORRECTION_NOT_MEANINGFUL/);
});
test('bounded correction spans and well-formed Unicode remain mandatory',()=>{
  assert.throws(()=>correction('original',0,8,'original','x'.repeat(20001)),/CORRECTION_INPUT/);
  assert.throws(()=>correction('x'.repeat(20001),0,20001,'x'.repeat(20001),'replacement'),/CORRECTION_INPUT/);
  assert.throws(()=>correction('original',0,8,'original','\ud800'),/CORRECTION_INPUT/);
  assert.throws(()=>correction('bad\ud800source',0,3,'bad','good'),/ORIGINAL_SOURCE_NOT_VERIFIED/);
});
