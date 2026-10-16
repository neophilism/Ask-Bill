/** Ask Bill AB-010. Provider-neutral, bounded job and outbox runners.
 * No producer or worker may claim exactly-once external delivery: receipts must be idempotent.
 * The injected store must run every lease mutation under a trusted tenant-scoped DB transaction.
 */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY = /^[a-zA-Z0-9._:-]{1,150}$/;
const EVENT = /^[a-z][a-z0-9._:-]{0,99}$/;
const CODE = /^[A-Z0-9_]{2,64}$/;
export class JobError extends Error {
  constructor(code, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.name = 'JobError';
  }
}
function need(test, code) { if (!test) throw new JobError(code); }
function uuid(value) { need(typeof value === 'string' && UUID.test(value), 'INVALID_ID'); return value.toLowerCase(); }
function ttl(value) { need(Number.isSafeInteger(value) && value >= 5 && value <= 300, 'INVALID_LEASE'); return value; }
function version(value) { need(Number.isSafeInteger(value) && value >= 1, 'INVALID_FENCE'); return value; }
function methods(store, names) {
  need(store && typeof store === 'object', 'STORE_REQUIRED');
  for (const name of names) need(typeof store[name] === 'function', 'STORE_METHOD_MISSING');
  return store;
}
function event(value) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_EVENT');
  need(typeof value.type === 'string' && EVENT.test(value.type), 'INVALID_EVENT');
  need(typeof value.idempotencyKey === 'string' && KEY.test(value.idempotencyKey), 'INVALID_EVENT');
  need(value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload), 'INVALID_EVENT');
  // A limit on serialized bytes avoids accidental large transcript/source captures.
  need(Buffer.byteLength(JSON.stringify(value.payload), 'utf8') <= 32768, 'EVENT_TOO_LARGE');
  return Object.freeze({type:value.type, idempotencyKey:value.idempotencyKey, payload:value.payload});
}
function diagnostic(error) {
  return error instanceof JobError && CODE.test(error.code) ? error.code : 'PROCESSING_FAILED';
}
function common({store, publisherId, workerId, leaseSeconds}) {
  return {store, publisherId:uuid(publisherId), workerId:uuid(workerId), leaseSeconds:ttl(leaseSeconds)};
}
/** One job = lease -> process -> atomic fenced job+outbox commit.
 * User callback MUST NOT make irrevocable public side effects; they are dispatched via outbox.
 */
export function createJobWorker({store,publisherId,workerId,leaseSeconds=30,handleJob}) {
  const ctx=common({store,publisherId,workerId,leaseSeconds});
  methods(store,['claimJob','heartbeatJob','completeJobAndEnqueue','failJob']);
  need(typeof handleJob==='function','HANDLER_REQUIRED');
  return Object.freeze({
    async runOnce() {
      const claim=await store.claimJob(ctx);
      if (claim===null) return Object.freeze({status:'idle'});
      need(claim && typeof claim==='object' && uuid(claim.jobId)===claim.jobId &&
        typeof claim.kind==='string' && EVENT.test(claim.kind),'INVALID_CLAIM');
      const fence=version(claim.fence);
      const scope={...ctx,jobId:claim.jobId,fence};
      try {
        const output=event(await handleJob(Object.freeze({
          jobId:claim.jobId,kind:claim.kind,fence,
          heartbeat:()=>store.heartbeatJob(scope)
        })));
        const ok=await store.completeJobAndEnqueue({...scope,event:output});
        return Object.freeze({status:ok===true?'completed':'lost-lease'});
      } catch (error) {
        const retry=!(error instanceof JobError) || error.retryable;
        const ok=await store.failJob({...scope,retry,errorCode:diagnostic(error)});
        return Object.freeze({status:ok===true?(retry?'retry':'dead-letter'):'lost-lease',errorCode:diagnostic(error)});
      }
    }
  });
}
/** At-least-once dispatch: external sinks MUST deduplicate idempotencyKey.
 * A successful external delivery followed by worker crash will be retried.
 */
export function createOutboxWorker({store,publisherId,workerId,leaseSeconds=30,deliver}) {
  const ctx=common({store,publisherId,workerId,leaseSeconds});
  methods(store,['claimOutbox','ackOutbox','failOutbox']);
  need(typeof deliver==='function','DELIVERY_REQUIRED');
  return Object.freeze({
    async runOnce() {
      const claim=await store.claimOutbox(ctx);
      if(claim===null)return Object.freeze({status:'idle'});
      need(claim && typeof claim==='object' && uuid(claim.eventId)===claim.eventId,'INVALID_CLAIM');
      const fence=version(claim.fence);
      const payload=event({type:claim.type,idempotencyKey:claim.idempotencyKey,payload:claim.payload});
      const scope={...ctx,eventId:claim.eventId,fence};
      try {
        // Send only to a destination selected by the trusted application, never by model/source text.
        if(await deliver(payload)!==true)throw new JobError('DELIVERY_FAILED',true);
        const ok=await store.ackOutbox(scope);
        return Object.freeze({status:ok===true?'delivered':'lost-lease'});
      }catch(error){
        const retry=!(error instanceof JobError)||error.retryable;
        const ok=await store.failOutbox({...scope,retry,errorCode:diagnostic(error)});
        return Object.freeze({status:ok===true?(retry?'retry':'dead-letter'):'lost-lease',errorCode:diagnostic(error)});
      }
    }
  });
}
