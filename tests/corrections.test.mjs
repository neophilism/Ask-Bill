import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {prepareExtractionCorrection,invalidatePinnedSession,CorrectionError} from '../packages/content/audit/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
const pub='11111111-1111-4111-8111-111111111111',old='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
 next='bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',bill='cccccccc-0000-4000-8000-cccccccccccc',provision='dddddddd-0000-4000-8000-dddddddddddd';
const text='An electronic 💡 filing can be accepted.';
const source=Object.freeze({publisherId:pub,versionId:old,billId:bill,publication:'published',legalStatus:'introduced',
 rawByteSha256:sha('raw source'),canonicalSha256:sha(text),text});
const actor={userId:'eeeeeeee-0000-4000-8000-eeeeeeeeeeee',publisherId:pub,role:'editor',freshMembershipVerified:true,mfaVerifiedByTrustedServer:true};
const args={publisherId:pub,source,versionId:old,newVersionId:next,provisionId:provision,oldText:text,
 expectedQuote:'💡',start:14,end:15,replacement:'secure',actor};
test('Unicode correction retains original law and opens a new private, incomplete version',()=>{
 const original=structuredClone(source);const result=prepareExtractionCorrection(args);
 assert.equal(result.previousVersionUnchanged,true);assert.deepEqual(source,original);
 assert.equal(result.newVersion.rawByteSha256,source.rawByteSha256);
 assert.equal(result.newVersion.canonicalText,'An electronic secure filing can be accepted.');
 assert.equal(result.newVersion.publication,'private');assert.equal(result.newVersion.sourceComplete,false);
 assert.equal(result.publicationAllowed,false);assert.notEqual(result.newVersion.canonicalSha256,source.canonicalSha256);
 assert.equal(result.audit.actorId,actor.userId);assert(!JSON.stringify(result.audit).includes(result.newVersion.canonicalText));
 assert(result.invalidated.includes('answers'));assert(result.invalidated.includes('index_generation'));
});
test('wrong tenant, non-MFA actor and forged previously published text are rejected',()=>{
 for(const update of [{publisherId:'22222222-2222-4222-8222-222222222222'},
  {actor:{...actor,role:'viewer'}},{actor:{...actor,mfaVerifiedByTrustedServer:false}},
  {oldText:text.replace('accepted','enacted')},{source:{...source,canonicalSha256:'f'.repeat(64)}},
  {source:{...source,publication:'enacted'}},{newVersionId:old}])
  assert.throws(()=>prepareExtractionCorrection({...args,...update}),CorrectionError);
});
test('quoted span mismatch and no-op correction are denied',()=>{
 assert.throws(()=>prepareExtractionCorrection({...args,expectedQuote:'😇'}),CorrectionError);
 assert.throws(()=>prepareExtractionCorrection({...args,replacement:'💡'}),CorrectionError);
 assert.throws(()=>prepareExtractionCorrection({...args,start:15,end:16}),CorrectionError);
 assert.throws(()=>prepareExtractionCorrection({...args,replacement:'<script>\u0000</script>'}),CorrectionError);
});
test('active conversations never silently switch away from original source version',()=>{
 const proposal=prepareExtractionCorrection(args);
 const session={versionId:old,epoch:2,answerIds:['answer-old']};
 const result=invalidatePinnedSession(session,proposal);
 assert.equal(result.versionId,old);assert.deepEqual(result.answerIds,['answer-old']);
 assert.equal(result.requiresExplicitSwitch,true);assert.equal(result.correctionVersionId,null);
 assert.throws(()=>invalidatePinnedSession({...session,versionId:next},proposal),CorrectionError);
});
