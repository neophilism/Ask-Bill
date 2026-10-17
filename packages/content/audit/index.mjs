/** AB-027: source extraction corrections create new private revisions, never overwrite law. */
import {createHash} from 'node:crypto';
export class CorrectionError extends Error {constructor(code){super(code);this.name='CorrectionError';this.code=code;}}
const fail=code=>{throw new CorrectionError(code)};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sha=/^[a-f0-9]{64}$/,digest=s=>createHash('sha256').update(s,'utf8').digest('hex');
const MAX_SOURCE_BYTES=1500000;
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=MAX_SOURCE_BYTES&&s.isWellFormed()&&Buffer.byteLength(s,'utf8')<=MAX_SOURCE_BYTES;
export function prepareExtractionCorrection({publisherId,source,versionId,newVersionId,provisionId,oldText,
  expectedQuote,start,end,replacement,actor}={}){
 if(!uuid.test(publisherId)||!uuid.test(versionId)||!uuid.test(newVersionId)||versionId===newVersionId||
   !uuid.test(provisionId)||!source||source.publisherId!==publisherId||
   source.versionId!==versionId||!uuid.test(source.billId)||!sha.test(source.rawByteSha256)||
   !sha.test(source.canonicalSha256)||!['private','reviewed','published','withdrawn'].includes(source.publication)||
   !valid(source.text)||digest(source.text)!==source.canonicalSha256)fail('ORIGINAL_SOURCE_NOT_VERIFIED');
 if(!actor||!uuid.test(actor.userId)||!['owner','editor'].includes(actor.role)||
   actor.publisherId!==publisherId||actor.freshMembershipVerified!==true||
   actor.mfaVerifiedByTrustedServer!==true)fail('PUBLISHER_REVIEW_REQUIRED');
 if(typeof expectedQuote!=='string'||!expectedQuote||expectedQuote.length>20000||!expectedQuote.isWellFormed()||
   !Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||
   !valid(oldText)||oldText!==source.text||end>Array.from(oldText).length||
   !valid(replacement)||replacement.length>20000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(replacement))fail('CORRECTION_INPUT');
 const cps=Array.from(oldText);
 if(cps.slice(start,end).join('')!==expectedQuote)fail('QUOTE_MISMATCH');
 const next=cps.slice(0,start).join('')+replacement+cps.slice(end).join('');
 if(Buffer.byteLength(next,'utf8')>MAX_SOURCE_BYTES||next===oldText)fail('CORRECTION_NOT_MEANINGFUL');
 const nextDigest=digest(next);
 // Legal source bytes remain unchanged; corrected extraction is a new private candidate.
 const version=Object.freeze({id:newVersionId,previousVersionId:versionId,billId:source.billId,
   publisherId,publication:'private',sourceComplete:false,legalStatus:source.legalStatus,
   rawByteSha256:source.rawByteSha256,canonicalText:next,canonicalSha256:nextDigest,
   correctionRequiresIndependentReview:true});
 const audit=Object.freeze({eventType:'extraction.correction.proposed',
   publisherId,billId:source.billId,oldVersionId:versionId,newVersionId,
   actorId:actor.userId,provisionId,oldCanonicalSha256:source.canonicalSha256,
   newCanonicalSha256:nextDigest,previousSpanSha256:digest(expectedQuote),
   newSpanSha256:digest(replacement),sourceRawSha256:source.rawByteSha256,
   changedRange:Object.freeze({start,end}),publiclyVisible:false});
 const invalidated=Object.freeze(['citations','answers','curated_audio','conversation_context',
   'index_generation','tours','comparisons','publication_review','cache']);
 return Object.freeze({status:'private_unreviewed_correction',newVersion:version,audit,
   invalidated,publicationAllowed:false,previousVersionUnchanged:true});
}
export function invalidatePinnedSession(session,proposal){
 if(!session||!proposal||proposal.status!=='private_unreviewed_correction'||
    session.versionId!==proposal.audit.oldVersionId)fail('SESSION_SCOPE');
 // Existing published source remains pinned; no silent switch to private correction.
 return Object.freeze({...session,staleCorrectionAvailable:true,
   correctionVersionId:null,requiresExplicitSwitch:true});
}
