import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {planReviewedRelease,assertNoPartialPublication,ReleaseError} from '../packages/content/releases/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex'),pub='11111111-1111-4111-8111-111111111111',id='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',bill='bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',rev='cccccccc-0000-4000-8000-cccccccccccc',gen='dddddddd-0000-4000-8000-dddddddddddd';
const version={publisherId:pub,id,billId:bill,sourceComplete:true,publication:'reviewed',rawByteSha256:sha('raw'),canonicalTextSha256:sha('canonical')};
const provenance={publisherId:pub,versionId:id,originalByteSha256:version.rawByteSha256,objectStoredAndVerified:true,sourceObjectId:rev};
const index={publisherId:pub,versionId:id,id:gen,status:'complete',sourceSha256:version.canonicalTextSha256,activated:true};
const review={publisherId:pub,versionId:id,reviewerId:rev,reviewSha256:sha('review'),mfaVerifiedByTrustedServer:true,checks:['source_complete','extraction_verified','citations_exact','exceptions_reviewed','index_complete','rights_verified']};
const assets={scope:'public-packs',publisherId:pub,versionId:id,manifestSha256:sha('manifest'),stagedAndHashVerified:true,objects:[{sha256:sha('pack'),bytes:1000}]};
const input={publisherId:pub,version,provenance,index,review,assets};
test('reviewed candidate does not publish or activate itself',()=>{
 const planned=planReviewedRelease(input);assert.equal(planned.publicationAllowed,false);
 assert.equal(planned.state,'reviewed_not_published');assert.match(planned.releaseHash,/^[a-f0-9]{64}$/);
 assert.equal(assertNoPartialPublication({planned,uploaded:false}).state,'not_published');
 assert.equal(assertNoPartialPublication({planned,uploaded:true}).state,'not_published');
 assert.equal(assertNoPartialPublication({planned,uploaded:true,activePointer:{publisherId:pub,versionId:id,releaseHash:planned.releaseHash}}).state,'activation_verified');
});
test('incomplete source, missing provenance and nonexistent index are never releasable',()=>{
 for(const bad of [{...input,version:{...version,sourceComplete:false}},{...input,provenance:{...provenance,originalByteSha256:sha('tampered')}},{...input,index:{...index,status:'building'}},{...input,index:{...index,activated:false}}])
  assert.throws(()=>planReviewedRelease(bad),ReleaseError);
});
test('publisher scope, unsigned reviews and missing MFA cannot be bypassed',()=>{
 for(const bad of [{...input,review:{...review,mfaVerifiedByTrustedServer:false}},
  {...input,review:{...review,checks:review.checks.slice(1)}},
  {...input,review:{...review,checks:[...review.checks.slice(1),'source_complete','source_complete']}},
  {...input,publisherId:'22222222-2222-4222-8222-222222222222'}])
  assert.throws(()=>planReviewedRelease(bad),ReleaseError);
});
test('public manifest and active pointer must match exact version and digest',()=>{
 assert.throws(()=>planReviewedRelease({...input,assets:{...assets,scope:'private-source'}}),ReleaseError);
 const plan=planReviewedRelease(input);
 assert.equal(assertNoPartialPublication({planned:plan,uploaded:true,activePointer:{...plan.manifest,releaseHash:'f'.repeat(64)}}).state,'not_published');
});
