/**
 * AB-071: deterministic, source-semantic character director (partial).
 * Does not decode GLBs, trust model coordinates, scroll the reader or speak.
 * Caller must supply events from the independently verified answer stream.
 */
export class PerformanceError extends Error{
  constructor(code){super(code);this.name='PerformanceError';this.code=code;}
}
const fail=code=>{throw new PerformanceError(code);};
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const validId=v=>typeof v==='string'&&ID.test(v);
const cues=new Set(['reference','emphasize','uncertain','acknowledge']);
const activityKinds=new Set(['pointer','keyboard','touch','focus','selection','question','speech','scroll']);
const clipFor=Object.freeze({emphasize:'Explain',uncertain:'Shrug',acknowledge:'Nod',reference:'Point'});
export function createPerformanceDirector({resolveTarget,onAction=()=>{}}={}){
  if(typeof resolveTarget!=='function'||typeof onAction!=='function')fail('DIRECTOR_ADAPTER_REQUIRED');
  let answerId=null,versionId=null,epoch=-1,sequence=0,started=false,finished=false,state='docked';
  let hidden=false,paused=false,reducedMotion=false,pending=null,actionSerial=0,lastAction=null;
  const claims=new Map(),segments=new Map();
  const current=(serial)=>serial===actionSerial&&!hidden&&!paused&&!reducedMotion;
  const emit=(message)=>{
    const command=Object.freeze(message);
    lastAction=command;
    try{onAction(command);}catch{/* character failure must not compromise reader */}
    return command;
  };
  const cancelPending=()=>{actionSerial++;if(pending){try{pending.abort();}catch{}pending=null;}};
  const scopeEvent=(event)=>{
    if(!event||typeof event!=='object'||event.answerId!==answerId||
       event.documentVersion!==versionId||event.conversationEpoch!==epoch||
       !Number.isSafeInteger(event.sequence)||event.sequence!==sequence)fail('STALE_OR_REPLAYED_EVENT');
  };
  const neutral=(reason)=>{cancelPending();emit({kind:'dock',reason});state=hidden?'hidden':paused?'paused':'docked';};
  const noteSegment=(segment)=>{
    if(!segment||!validId(segment.id)||segment.versionId!==versionId||
       !Array.isArray(segment.claims)||segment.claims.length>40||
       !segment.validation||segments.has(segment.id))fail('SEGMENT_NOT_VERIFIED');
    const approved=new Map();
    for(const claim of segment.claims){
      if(!claim||!validId(claim.id)||claim.kind!=='bill_text'||claim.support!=='supported'||
         !Array.isArray(claim.spans)||claim.spans.length<1||claim.spans.length>20||
         claim.spans.some(x=>x.sourceVersionId!==versionId||!validId(x.provisionId)))fail('CLAIM_SOURCE_INVALID');
      approved.set(claim.id,Object.freeze([...claim.spans]));
    }
    if(!approved.size)fail('SEGMENT_EMPTY');
    segments.set(segment.id,approved);
    claims.set(segment.id,approved);
  };
  const assertCue=(cue)=>{
    if(!cue||typeof cue!=='object'||Array.isArray(cue)||!cues.has(cue.type)||!validId(cue.segmentId))fail('CUE_NOT_ALLOWED');
    const validKeys=cue.type==='reference'?['type','segmentId','claimId','spanIndex']:
      cue.type==='acknowledge'?['type','segmentId']:['type','segmentId','claimId'];
    if(Object.keys(cue).some(k=>!validKeys.includes(k))||Object.keys(cue).length!==validKeys.length)fail('CUE_NOT_ALLOWED');
    if(!segments.has(cue.segmentId))fail('UNVERIFIED_SEGMENT');
    if(cue.type!=='acknowledge'&&(!validId(cue.claimId)||!claims.get(cue.segmentId).has(cue.claimId)))fail('UNVERIFIED_CLAIM');
    if(cue.type==='reference'&&(!Number.isSafeInteger(cue.spanIndex)||cue.spanIndex<0||
      cue.spanIndex>=claims.get(cue.segmentId).get(cue.claimId).length))fail('UNVERIFIED_SPAN');
    return cue;
  };
  return Object.freeze({
    begin({answerId:newId,versionId:newVersion,conversationEpoch:newEpoch}={}){
      if(!validId(newId)||!validId(newVersion)||!Number.isSafeInteger(newEpoch)||newEpoch<0||
         (epoch>=0&&newEpoch<=epoch))fail('ANSWER_SCOPE_INVALID');
      neutral('new-answer');answerId=newId;versionId=newVersion;epoch=newEpoch;sequence=0;
      claims.clear();segments.clear();started=false;finished=false;state=hidden?'hidden':paused?'paused':'thinking';
      return this.snapshot();
    },
    setPreferences(next={}){
      if(!next||typeof next!=='object'||Array.isArray(next)||
         Object.keys(next).some(k=>!['hidden','paused','reducedMotion'].includes(k))||
         Object.values(next).some(x=>typeof x!=='boolean'))fail('PREFERENCES_INVALID');
      const oldHidden=hidden,oldPaused=paused,oldReduce=reducedMotion;
      if(next.hidden!==undefined)hidden=next.hidden;
      if(next.paused!==undefined)paused=next.paused;
      if(next.reducedMotion!==undefined)reducedMotion=next.reducedMotion;
      if(hidden||paused||reducedMotion){
        const desired=hidden?'hidden':paused?'paused':'docked';
        if(state!==desired||(hidden&&!oldHidden)||(paused&&!oldPaused)||(reducedMotion&&!oldReduce))
          neutral(hidden?'hide':paused?'pause':'reduced-motion');
      }else if(oldHidden||oldPaused||oldReduce)state='docked';
      return this.snapshot();
    },
    activity(kind){
      if(!activityKinds.has(kind))fail('ACTIVITY_INVALID');
      neutral('user-'+kind);return this.snapshot();
    },
    async consume(event){
      if(!started&&event?.type!=='answer.started')fail('ANSWER_START_REQUIRED');
      if(finished)fail('ANSWER_ALREADY_FINISHED');scopeEvent(event);
      if(event.type==='answer.started'){
        if(started)fail('DUPLICATE_START');started=true;
        sequence++;if(!hidden&&!paused)state='thinking';return this.snapshot();
      }
      if(event.type==='segment.validated'){
        noteSegment(event.segment);sequence++;if(!hidden&&!paused)state='explaining';return this.snapshot();
      }
      if(event.type==='performance.cue'){
        const cue=assertCue(event.cue);sequence++;
        if(hidden||paused||reducedMotion){
          if(cue.type==='reference'){
            const span=claims.get(cue.segmentId).get(cue.claimId)[cue.spanIndex];
            emit({kind:'source-preview',versionId,provisionId:span.provisionId,reason:'motion-disabled'});
          }
          return this.snapshot();
        }
        if(cue.type!=='reference'){
          state='explaining';emit({kind:'gesture',animation:clipFor[cue.type],segmentId:cue.segmentId});
          return this.snapshot();
        }
        const span=claims.get(cue.segmentId).get(cue.claimId)[cue.spanIndex];
        cancelPending();const token=actionSerial;
        const ctl=new AbortController();pending=ctl;state='navigating';
        let result;
        try{result=await resolveTarget(Object.freeze({versionId,provisionId:span.provisionId,signal:ctl.signal}));}
        catch{result=null;}
        if(!current(token)||ctl.signal.aborted)return this.snapshot();
        pending=null;
        if(!result||result.versionId!==versionId||result.provisionId!==span.provisionId||
           result.visible!==true||result.safe!==true){
          state='docked';emit({kind:'source-preview',versionId,provisionId:span.provisionId,reason:'offscreen-or-unsafe'});
        }else{
          state='explaining';emit({kind:'point',animation:'Point',versionId,provisionId:span.provisionId});
        }
        return this.snapshot();
      }
      if(event.type==='answer.completed'||event.type==='answer.cancelled'||event.type==='answer.failed'){
        sequence++;finished=true;neutral(event.type);return this.snapshot();
      }
      if(['citation.ready','speech.ready'].includes(event.type)){sequence++;return this.snapshot();}
      fail('EVENT_NOT_ALLOWED');
    },
    snapshot(){return Object.freeze({answerId,versionId,conversationEpoch:epoch,sequence,
      state,hidden,paused,reducedMotion,finished,lastAction});},
    dispose(){neutral('disposed');answerId=null;versionId=null;finished=true;return this.snapshot();}
  });
}
