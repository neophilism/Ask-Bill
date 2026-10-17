/** AB-086: shared interruption scope across generation, audio, captions, motion and microphone.
 * Never authorizes model output or legal sources; validated source stream is required upstream.
 */
export class ConversationEpochError extends Error {
  constructor(code){super(code);this.code=code;this.name='ConversationEpochError';}
}
const deny=code=>{throw new ConversationEpochError(code)};
const NAME=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;
const TYPES=new Set(['answer.started','segment.validated','citation.ready','performance.cue','speech.ready','correction','answer.completed','answer.cancelled','answer.failed']);
const PORTS=['generation','audio','captions','motion','microphone'];
/** Callers must supply trusted, validated published sources; this coordinates cancellation only. */
export function createConversationEpochCoordinator({versionId,ports={},onStatus=()=>{}}={}){
 if(typeof versionId!=='string'||!NAME.test(versionId)||!ports||typeof ports!=='object'||Array.isArray(ports)||
    Object.keys(ports).some(k=>!PORTS.includes(k))||typeof onStatus!=='function')deny('INVALID_EPOCH_CONFIG');
 for(const [name,port] of Object.entries(ports))if(!port||typeof port.cancel!=='function')deny('PORT_CANCEL_REQUIRED_'+name);
 let epoch=0,answerId=null,version=versionId,sequence=0,state='idle',faulted=false;
 let destroyed=false,invalidations=0;const pending=new Map();
 const snapshot=()=>Object.freeze({versionId:version,conversationEpoch:epoch,answerId,expectedSequence:sequence,state,
   faulted,disabledLive:faulted||destroyed,retainedQuestions:0,pendingOperations:pending.size});
 const emit=()=>{try{onStatus(snapshot());}catch{/* status display cannot bypass safety */}};
 const requireLive=()=>{if(destroyed)deny('COORDINATOR_DISPOSED');};
 const cancelPorts=(reason)=>{
   const errors=[];for(const name of PORTS){const port=ports[name];if(!port)continue;
     try{port.cancel(Object.freeze({reason,versionId:version,conversationEpoch:epoch}));}catch{errors.push(name);}}
   pending.clear();if(errors.length){faulted=true;state='paused';}invalidations++;emit();
   return errors.length===0;
 };
 const bump=(reason,newVersion,newAnswer)=>{
   requireLive();if(epoch>=Number.MAX_SAFE_INTEGER-1)deny('EPOCH_EXHAUSTED');
   epoch++;version=newVersion;answerId=newAnswer;sequence=0;state=newAnswer?'preparing':'idle';
   faulted=false;const clean=cancelPorts(reason);return Object.freeze({accepted:clean,reason:clean?'READY':'PORT_FAILURE',...snapshot()});
 };
 return Object.freeze({
   snapshot,
   beginAnswer({answerId:newId}={}){
     if(typeof newId!=='string'||!NAME.test(newId))deny('INVALID_ANSWER_ID');
     return bump('NEW_QUESTION',version,newId);
   },
   switchVersion({versionId:newVersion}={}){
     if(typeof newVersion!=='string'||!NAME.test(newVersion))deny('INVALID_SOURCE_VERSION');
     return bump('SOURCE_VERSION_CHANGED',newVersion,null);
   },
   stop(){return bump('USER_STOP',version,null);},
   /** An event is only eligible for server/source verification after its scope is accepted. */
   offerEvent(event){
     requireLive();if(faulted||!answerId||['idle','paused','finished'].includes(state))return Object.freeze({accepted:false,reason:'INACTIVE_SCOPE'});
     if(!event||typeof event!=='object'||Array.isArray(event)||!TYPES.has(event.type)||
        !Number.isSafeInteger(event.sequence)||event.sequence<0||
        event.versionId!==version||event.conversationEpoch!==epoch||event.answerId!==answerId)return Object.freeze({accepted:false,reason:'STALE_OR_UNVERIFIED_EVENT'});
     if(event.sequence!==sequence)return Object.freeze({accepted:false,reason:'OUT_OF_ORDER_EVENT'});
     if(sequence===0&&event.type!=='answer.started')return Object.freeze({accepted:false,reason:'START_REQUIRED'});
     if(sequence>0&&event.type==='answer.started')return Object.freeze({accepted:false,reason:'DUPLICATE_START'});
     // A caller must separately run AnswerStreamGuard and proof-of-citation validators before releasing content.
     sequence++;state=['answer.completed','answer.cancelled','answer.failed'].includes(event.type)?'finished':'active';emit();
     return Object.freeze({accepted:true,reason:'SCOPE_ACCEPTED_NOT_SOURCE_APPROVED',
       versionId:version,conversationEpoch:epoch,sequence:event.sequence,
       requiresIndependentSourceValidation:true});
   },
   /** Bound an asynchronous provider/renderer completion to the active epoch. */
   async guardCompletion({operation,label,apply}={}){
     requireLive();if(!PORTS.includes(label)||typeof apply!=='function'||!operation||typeof operation.then!=='function'||
        faulted||state==='idle'||state==='paused'||state==='finished')deny('OPERATION_NOT_ADMITTED');
     const ticket=Symbol(label),scopedEpoch=epoch,scopedVersion=version,scopedAnswer=answerId;
     pending.set(ticket,label);emit();
     try{
       const value=await operation;
       if(destroyed||faulted||scopedEpoch!==epoch||scopedVersion!==version||scopedAnswer!==answerId||
          state==='idle'||state==='paused'||state==='finished')return Object.freeze({applied:false,reason:'STALE_COMPLETION'});
       // Caller callback only ever receives a completion after scope gate; never model commands directly.
       await apply(value);
       return Object.freeze({applied:true,reason:'CURRENT_SCOPE'});
     }finally{pending.delete(ticket);emit();}
   },
   /** The UI cannot reuse a faulty generation without a new explicit question. */
   pauseDueToFailure(){requireLive();state='paused';faulted=true;cancelPorts('FAIL_CLOSED');return snapshot();},
   dispose(){if(destroyed)return snapshot();destroyed=true;epoch++;
     version=version;answerId=null;sequence=0;state='disposed';cancelPorts('DISPOSED');return snapshot();}
 });
}
