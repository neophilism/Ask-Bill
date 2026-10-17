/** Integrated source-grounded conversation. No provider draft is ever streamed. */
import {createHash, randomUUID} from 'node:crypto';
import {validatePublishedReaderPack} from '../../../packages/ui/reader/index.mjs';
import {createQuestionRouter} from '../../../packages/grounding/router/index.mjs';
import {buildReaderEvidence} from '../../../packages/grounding/reader-evidence.mjs';
import {validateClaimDraft} from '../../../packages/grounding/claims/index.mjs';
import {approveModelReviewedSegment} from '../../../packages/grounding/entailment/reviewed.mjs';
import {approveVerbatimSegment, ValidatedAnswerStream} from '../../../packages/streaming/index.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
export class ConversationError extends Error {
  constructor(code) { super(code); this.name='ConversationError'; this.code=code; }
}
const fail = code => { throw new ConversationError(code); };
const RECOVERY = {
  AGE_CONSENT_REQUIRED:'Use the guided learning page, which does not send questions or microphone recordings.',
  PERSONAL_LEGAL_ADVICE_OUT_OF_SCOPE:'Bill can explain the published text. For advice about your situation, consult a qualified professional.',
  CURRENT_LAW_NOT_VERIFIED:'This reader has the selected legislative version. Open its official source to check the current law.',
  NO_RELIABLE_EVIDENCE:'Select a specific passage or use source search. There is not enough verified context for this answer.',
  PROVIDER_UNAVAILABLE:'An explanation is unavailable right now. The full text, section links and guided tour still work.'
};
export function createConversationService({publisherId, lookupPublishedPack, provider=null, reviewer=null}={}) {
  if (typeof lookupPublishedPack !== 'function') fail('SOURCE_LOOKUP_REQUIRED');
  return Object.freeze({
    mode:provider&&reviewer?'live':'source',
    async answer({billId,versionId,question,readingLevel='standard',selectedSpan=null,ageBand,
      conversationEpoch,signal,onEvent=()=>{},isCurrent=async()=>true}={}) {
      if (signal?.aborted) fail('REQUEST_ABORTED');
      const pack=await lookupPublishedPack({publisherId,billId,versionId});
      if (!pack || pack.publisherId!==publisherId || pack.billId!==billId || pack.versionId!==versionId) fail('SOURCE_UNAVAILABLE');
      const source=validatePublishedReaderPack(pack);
      const router=createQuestionRouter({trustedPublisherId:publisherId,resolveVersion:async()=>({
        publisherId,versionId,publication:'published',sourceComplete:true
      })});
      const route=await router.route({publisherId,versionId,question,readingLevel,ageBand,
        selectedSpan:selectedSpan?{...selectedSpan,versionId}:null});
      const stream=new ValidatedAnswerStream({answerId:randomUUID(),versionId,epoch:conversationEpoch});
      const context={epoch:conversationEpoch,versionId};
      const emit=async(type,data={})=>{
        if(signal?.aborted || !await isCurrent()) fail('REQUEST_ABORTED');
        const event=stream.emit(type,data,context); await onEvent(event); return event;
      };
      await emit('answer.started');
      if (route.status!=='allowed') {
        await emit('answer.failed',{code:route.reason??'OUT_OF_SCOPE',recovery:RECOVERY[route.reason]??'Try asking about a passage of this published version.'});
        return {events:stream.replay(),segments:[]};
      }
      const retrieval=buildReaderEvidence({pack,question,selectedSpan});
      if (retrieval.status!=='source_evidence' || retrieval.evidence.truncated || retrieval.evidence.unresolvedReferences.length) {
        await emit('answer.failed',{code:'NO_RELIABLE_EVIDENCE',recovery:RECOVERY.NO_RELIABLE_EVIDENCE});
        return {events:stream.replay(),segments:[]};
      }
      const {evidence,bundle}=retrieval;
      let approval;
      if (provider && reviewer) {
        try {
          const draft=await provider.generate({route,question,bundle,signal});
          const held=await validateClaimDraft({route,evidence,draft,validatedAt:new Date().toISOString(),promptConfigSha256:hash('ask-bill:grounded-question:v2')});
          const review=await reviewer.review({route,bundle,draft,signal});
          approval=await approveModelReviewedSegment({held,evidence,draft,bundle,review});
        } catch (error) {
          if(signal?.aborted) fail('REQUEST_ABORTED');
          // No exception/raw provider payload reaches the client or logs.
          await emit('answer.failed',{code:'PROVIDER_UNAVAILABLE',recovery:RECOVERY.PROVIDER_UNAVAILABLE});
          return {events:stream.replay(),segments:[]};
        }
      } else {
        const claims=evidence.included.map(item=>({kind:'bill_text',sourceId:item.provisionId,
          quote:item.text,claimText:item.text,occurrence:0}));
        const text=claims.map(claim=>claim.claimText).join('\n\n');
        if (text.length>4000 || claims.some(claim=>claim.quote.length>4000)) {
          await emit('answer.failed',{code:'NO_RELIABLE_EVIDENCE',recovery:RECOVERY.NO_RELIABLE_EVIDENCE});
          return {events:stream.replay(),segments:[]};
        }
        const draft={type:'untrusted_draft',provider:'exact-published-source',versionId,text,claims,
          verificationRequired:true,noCitationAuthority:true};
        const held=await validateClaimDraft({route,evidence,draft,validatedAt:new Date().toISOString(),promptConfigSha256:hash('ask-bill:source-excerpts:v1')});
        approval=await approveVerbatimSegment({held,evidence});
      }
      // Re-resolve publication immediately before delivering a supported answer.
      const current=await lookupPublishedPack({publisherId,billId,versionId});
      if(!current || current.publisherId!==publisherId || current.billId!==billId || current.versionId!==versionId ||
        validatePublishedReaderPack(current).canonicalSha256!==source.canonicalSha256) fail('SOURCE_WITHDRAWN');
      const event=await emit('segment.validated',{approval});
      for (const claim of event.segment.claims) for (const span of claim.spans) await emit('citation.ready',{span});
      await emit('answer.completed');
      return {answerId:event.answerId,versionId,billId,conversationEpoch,events:stream.replay(),segments:[event.segment]};
    }
  });
}
