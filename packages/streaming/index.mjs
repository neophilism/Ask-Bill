/** AB-035: validated event-only SSE. Model token streaming is not an allowed input. */
export class StreamError extends Error{constructor(code){super(code);this.code=code;this.name='StreamError';}}
const fail=code=>{throw new StreamError(code)};
const types=new Set(['answer.started','segment.validated','citation.ready','performance.cue','speech.ready','correction','answer.completed','answer.cancelled','answer.failed']);
const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9][\w.:-]{0,119}$/.test(v);
export class ValidatedAnswerStream{
 #state='new';#epoch;#version;#answer;#events=[];#count;#segments=new Set();
 constructor({answerId,versionId,epoch=0,maxReplay=100}={}){
  if(!safeId(answerId)||!safeId(versionId)||!Number.isSafeInteger(epoch)||epoch<0||!Number.isSafeInteger(maxReplay)||maxReplay<1||maxReplay>1000)fail('STREAM_CONFIG');
  this.#answer=answerId;this.#version=versionId;this.#epoch=epoch;this.#count=maxReplay;
 }
 emit(type,payload={},context={}){
  if(!types.has(type)||typeof payload!=='object'||payload===null||Array.isArray(payload)||!Number.isSafeInteger(context.epoch)||context.epoch!==this.#epoch||context.versionId!==this.#version)fail('EVENT_CONTEXT');
  if(this.#state==='finished')fail('STREAM_FINISHED');
  if(this.#state==='new'&&type!=='answer.started')fail('START_REQUIRED');
  if(this.#state==='active'&&type==='answer.started')fail('ALREADY_STARTED');
  const body={type,...payload};
  if(type==='segment.validated'){
    if(!payload.segment||payload.segment.versionId!==this.#version||payload.segment.validation?.schema!=='v1'||!safeId(payload.segment.id)||!Array.isArray(payload.segment.claims)||!payload.segment.claims.length||payload.segment.validation?.validatedAt===undefined||payload.approved!==true)fail('SEGMENT_NOT_APPROVED');
    if(this.#segments.has(payload.segment.id))fail('DUPLICATE_SEGMENT');
    this.#segments.add(payload.segment.id);
  }
  if(['citation.ready','performance.cue','speech.ready','correction'].includes(type)){
    const target=payload.segmentId??payload.cue?.segmentId??payload.replacesSegmentId;
    if(!safeId(target)||!this.#segments.has(target))fail('UNAPPROVED_TARGET');
  }
  if(type==='answer.started')this.#state='active';
  if(['answer.completed','answer.cancelled','answer.failed'].includes(type))this.#state='finished';
  const event=Object.freeze({schemaVersion:1,answerId:this.#answer,documentVersion:this.#version,conversationEpoch:this.#epoch,sequence:this.#events.length?this.#events[this.#events.length-1].sequence+1:0,...body});
  this.#events.push(event);if(this.#events.length>this.#count)this.#events.shift();
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
 if(!event||!Number.isSafeInteger(event.sequence)||!types.has(event.type)||typeof event.answerId!=='string')fail('INVALID_EVENT');
 const data=JSON.stringify(event);
 if(data.length>100000)fail('EVENT_TOO_LARGE');
 return 'id: '+event.sequence+'\nevent: '+event.type+'\ndata: '+data+'\n\n';
}
