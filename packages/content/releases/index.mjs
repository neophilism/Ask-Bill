/** AB-024: review-gated, immutable release candidate plans. No public storage is written. */
import {createHash} from 'node:crypto';
export class ReleaseError extends Error{constructor(code){super(code);this.name='ReleaseError';this.code=code;}}
const fail=c=>{throw new ReleaseError(c)};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hex=/^[a-f0-9]{64}$/,hash=t=>createHash('sha256').update(t).digest('hex');
const checks=new Set(['source_complete','extraction_verified','citations_exact','exceptions_reviewed','index_complete','rights_verified']);
const freeze=o=>Object.freeze(o);
export function planReviewedRelease({publisherId,version,provenance,index,review,assets}={}){
 if(typeof publisherId!=='string'||!uuid.test(publisherId)||!version||
   version.publisherId!==publisherId||!uuid.test(version.id)||!uuid.test(version.billId)||
   version.sourceComplete!==true||!['reviewed','published'].includes(version.publication)||
   !hex.test(version.rawByteSha256)||!hex.test(version.canonicalTextSha256))fail('VERSION_NOT_REVIEWED');
 if(!provenance||provenance.publisherId!==publisherId||provenance.versionId!==version.id||
    provenance.originalByteSha256!==version.rawByteSha256||
    provenance.objectStoredAndVerified!==true||!uuid.test(provenance.sourceObjectId))fail('SOURCE_ORIGINAL_MISSING');
 if(!index||index.publisherId!==publisherId||index.versionId!==version.id||
   !uuid.test(index.id)||index.status!=='complete'||index.sourceSha256!==version.canonicalTextSha256||
   index.activated!==true)fail('INDEX_NOT_COMPLETE');
 if(!review||review.publisherId!==publisherId||review.versionId!==version.id||
   !uuid.test(review.reviewerId)||!hex.test(review.reviewSha256)||
   !Array.isArray(review.checks)||review.checks.length!==checks.size||
   new Set(review.checks).size!==checks.size||review.checks.some(x=>!checks.has(x))||
   review.mfaVerifiedByTrustedServer!==true)fail('REVIEW_NOT_APPROVED');
 if(!assets||assets.scope!=='public-packs'||assets.publisherId!==publisherId||
   assets.versionId!==version.id||!hex.test(assets.manifestSha256)||
   assets.stagedAndHashVerified!==true||!Array.isArray(assets.objects)||!assets.objects.length||
   assets.objects.length>200)fail('PUBLIC_PACK_NOT_VERIFIED');
 for(const object of assets.objects)if(!object||!hex.test(object.sha256)||
   !Number.isSafeInteger(object.bytes)||object.bytes<1||object.bytes>25000000)fail('PUBLIC_PACK_INVALID');
 const manifest={version:1,publisherId,billId:version.billId,versionId:version.id,
   originalByteSha256:version.rawByteSha256,canonicalSha256:version.canonicalTextSha256,
   searchGenerationId:index.id,reviewSha256:review.reviewSha256,reviewedBy:review.reviewerId,
   packManifestSha256:assets.manifestSha256,objects:assets.objects.map(o=>({sha256:o.sha256,bytes:o.bytes}))};
 return freeze({state:'reviewed_not_published',releaseHash:hash(JSON.stringify(manifest)),
   manifest:freeze({...manifest,objects:freeze(manifest.objects.map(o=>freeze(o)))}),
   publicationAllowed:false, requiresAuthorizedAtomicActivation:true});
}
export function assertNoPartialPublication({planned,uploaded,activePointer}={}){
 if(!planned||planned.state!=='reviewed_not_published'||!hex.test(planned.releaseHash))fail('PLAN_INVALID');
 if(uploaded!==true)return freeze({state:'not_published',reason:'PUBLIC_PACK_NOT_UPLOADED'});
 if(!activePointer||activePointer.releaseHash!==planned.releaseHash||activePointer.versionId!==planned.manifest.versionId||
    activePointer.publisherId!==planned.manifest.publisherId)return freeze({state:'not_published',reason:'ATOMIC_POINTER_NOT_VERIFIED'});
 return freeze({state:'activation_verified',releaseHash:planned.releaseHash,versionId:planned.manifest.versionId});
}
