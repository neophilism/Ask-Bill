/** AB-035: server-side, independently verified source-only SSE. */
import {AnswerStreamGuard,parseAnswerEvent,parseSemanticCue} from '@ask-bill/contracts';
import {evaluateLiteralSupport} from '../grounding/entailment/index.mjs';
export class StreamError extends Error{constructor(code){super(code);this.name='StreamError';this.code=code;}}
const fail=c=>{throw new StreamError(c)};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9][\w.:-]{0,119}$/.test(v);
const grants=new WeakSet(),issued=new WeakSet();
const allowed={
 'answer.started':[], 'segment.validated':['approval'], 'citation.ready':['span'],
 'performance.cue':['cue'], 'speech.ready':[], 'correction':['approval','replacesSegmentId'],
 'answer.completed':[], 'answer.cancelled':[], 'answer.failed':['code','recovery']
};
const checkKeys=(type,data)=>{
 if(!Object.hasOwn(allowed,type)||!data||typeof data!=='object'||Array.isArray(data)||
    Object.keys(data).length!==allowed[type].length||
    Object.keys(data).some(k=>!allowed[type].includes(k)))fail('EVENT_PAYLOAD_REJECTED');
};
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))deepFreeze(x);Object.freeze(v);}return v;}
/** Source+exception review issues process-local, one-use approvals; no booleans. */
export async function approveVerbatimSegment({held,evidence}={}){
 let review;try{review=await evaluateLiteralSupport({held,evidence});}catch{fail('INDEPENDENT_REVIEW_FAILED');}
 if(review.status!=='verified_verbatim_source_only'||review.displayAllowed!==true||
   review.semanticEntailmentVerified!==true||review.spokenAllowed!==false||
   review.entailmentMethod!=='exact_verbatim'||!review.segment)fail('MATERIAL_REVIEW_REQUIRED');
 const grant=Object.freeze({segment:review.segment,versionId:review.documentVersion});
 grants.add(grant);return grant;
}
export class ValidatedAnswerStream{
 #state='new';#epoch;#version;#answer;#events=[];#max;#sequence=0;#segments=new Map();#guard;
 constructor({answerId,versionId,epoch=0,maxReplay=100}={}){
  if(!id(answerId)||!id(versionId)||!Number.isSafeInteger(epoch)||epoch<0||
      !Number.isSafeInteger(maxReplay)||maxReplay<1||maxReplay>1000)fail('STREAM_CONFIG');
  this.#answer=answerId;this.#version=versionId;this.#epoch=epoch;this.#max=maxReplay;
  this.#guard=new AnswerStreamGuard(answerId,versionId,epoch);
 }
 emit(type,data={},context={}){
  checkKeys(type,data);
  if(!Number.isSafeInteger(context.epoch)||context.epoch!==this.#epoch||context.versionId!==this.#version)fail('EVENT_CONTEXT');
  if(this.#state==='finished')fail('STREAM_FINISHED');
  if(this.#state==='new'&&type!=='answer.started')fail('START_REQUIRED');
  if(this.#state==='active'&&type==='answer.started')fail('ALREADY_STARTED');
  const body={};
  if(type==='segment.validated'||type==='correction'){
   if(!grants.has(data.approval)||data.approval.versionId!==this.#version)fail('SERVER_APPROVAL_REQUIRED');
   if(!id(data.approval.segment?.id)||this.#segments.has(data.approval.segment.id))fail('DUPLICATE_SEGMENT');
   if(type==='correction'){
    if(!id(data.replacesSegmentId)||!this.#segments.has(data.replacesSegmentId))fail('UNAPPROVED_TARGET');
    body.replacesSegmentId=data.replacesSegmentId;
   }
   body.segment=data.approval.segment;
  }else if(type==='citation.ready'){
   const span=data.span;
   if(!span||typeof span!=='object'||span.sourceVersionId!==this.#version||
      ![...this.#segments.values()].some(s=>s.claims.some(c=>c.spans.some(x=>
        x.provisionId===span.provisionId&&x.start===span.start&&x.end===span.end&&
        x.quote===span.quote&&x.quoteHash===span.quoteHash&&x.citationLabel===span.citationLabel))))
      fail('UNAPPROVED_CITATION');
   body.span=span;
  }else if(type==='performance.cue'){
   const segment=data.cue&&this.#segments.get(data.cue.segmentId);
   if(!segment)fail('UNAPPROVED_TARGET');
   try{body.cue=parseSemanticCue(data.cue,segment);}catch{fail('INVALID_CUE');}
  }else if(type==='speech.ready'){
   fail('SPEECH_NOT_AUTHORIZED');
  }else if(type==='answer.failed'){
   body.code=data.code;body.recovery=data.recovery;
  }
  const raw={schemaVersion:1,answerId:this.#answer,sequence:this.#sequence,
   conversationEpoch:this.#epoch,documentVersion:this.#version,createdAt:new Date().toISOString(),type,...body};
  let event;
  try{event=parseAnswerEvent(raw);this.#guard.accept(event);}catch{fail('EVENT_SCHEMA_REJECTED');}
  deepFreeze(event);issued.add(event);this.#events.push(event);this.#sequence++;
  if(this.#events.length>this.#max)this.#events.shift();
  if(type==='segment.validated'||type==='correction'){this.#segments.set(body.segment.id,body.segment);grants.delete(data.approval);}
  if(this.#state==='new')this.#state='active';
  if(['answer.completed','answer.cancelled','answer.failed'].includes(type))this.#state='finished';
  return event;
 }
 cancel(){this.#epoch++;this.#state='finished';}
 replay(lastEventId=-1){
  if(!Number.isSafeInteger(lastEventId)||lastEventId< -1)fail('INVALID_EVENT_ID');
  if(this.#events.length&&lastEventId<this.#events[0].sequence-1)fail('REPLAY_EXPIRED');
  return Object.freeze(this.#events.filter(e=>e.sequence>lastEventId));
 }
 get epoch(){return this.#epoch;}
}
export function encodeSse(event){
 if(!event||!issued.has(event))fail('UNAUTHORIZED_EVENT');
 const data=JSON.stringify(event);if(data.length>100000)fail('EVENT_TOO_LARGE');
 return 'id: '+event.sequence+'\nevent: '+event.type+'\ndata: '+data+'\n\n';
}
