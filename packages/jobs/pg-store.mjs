/** AB-010 PostgreSQL adapter. The injected pool must be server-only and least privileged.
 * This module never opens a connection itself or grants tenant rights to untrusted clients.
 */
import {JobError} from './index.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function tenant(value){if(typeof value!=='string'||!UUID.test(value))throw new JobError('INVALID_ID');return value.toLowerCase()}
function argsScope(scope,owner){if(!scope||typeof scope!=='object'||tenant(scope.publisherId)!==owner)throw new JobError('TENANT_FORBIDDEN');}
function queryArgs(scope){return [scope.publisherId,scope.workerId,scope.leaseSeconds]}
function bool(result){return result.rows?.[0]?.ok===true}
export function createPgJobStore({pool,trustedPublisherId}){
 const owner=tenant(trustedPublisherId);
 if(!pool||typeof pool.connect!=='function')throw new JobError('PG_POOL_REQUIRED');
 async function transaction(sql,params){
  const client=await pool.connect();
  if(!client||typeof client.query!=='function'||typeof client.release!=='function')throw new JobError('PG_CLIENT_INVALID');
  try{
   await client.query('BEGIN');
   // This context is trusted backend state, never a publisher ID parsed from a public request.
   await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[owner]);
   const result=await client.query(sql,params);
   await client.query('COMMIT');
   return result;
  }catch(error){
   try{await client.query('ROLLBACK')}catch{ /* preserve original DB failure */ }
   throw error;
  }finally{client.release()}
 }
 return Object.freeze({
  async enqueueJob({publisherId,kind,dedupeKey}){
   argsScope({publisherId},owner);
   const result=await transaction('SELECT ask_bill.enqueue_job($1::uuid,$2::text,$3::text) AS id',[owner,kind,dedupeKey]);
   return result.rows?.[0]?.id ?? null;
  },
  async claimJob(scope){
   argsScope(scope,owner);
   const result=await transaction('SELECT * FROM ask_bill.claim_job($1::uuid,$2::uuid,$3::integer)',queryArgs(scope));
   const row=result.rows?.[0];
   return row?{jobId:row.job_id,kind:row.job_kind,fence:Number(row.fence_version),leaseExpires:row.lease_expires}:null;
  },
  async heartbeatJob(scope){
   argsScope(scope,owner);
   const result=await transaction('SELECT ask_bill.heartbeat_job($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::integer) AS ok',[owner,scope.jobId,scope.workerId,scope.fence,scope.leaseSeconds]);
   return bool(result);
  },
  async completeJobAndEnqueue(scope){
   argsScope(scope,owner);
   const e=scope.event;
   const result=await transaction('SELECT ask_bill.complete_job_and_enqueue($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::jsonb) AS ok',
     [owner,scope.jobId,scope.workerId,scope.fence,e.type,e.idempotencyKey,JSON.stringify(e.payload)]);
   return bool(result);
  },
  async failJob(scope){
   argsScope(scope,owner);
   const result=await transaction('SELECT ask_bill.fail_job($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::boolean,$6::text) AS ok',
     [owner,scope.jobId,scope.workerId,scope.fence,scope.retry,scope.errorCode]);
   return bool(result);
  },
  async reapExpiredJobs({publisherId}){
   argsScope({publisherId},owner);
   const result=await transaction('SELECT ask_bill.reap_expired_jobs($1::uuid) AS count',[owner]);
   return Number(result.rows?.[0]?.count ?? 0);
  },
  async claimOutbox(scope){
   argsScope(scope,owner);
   const result=await transaction('SELECT * FROM ask_bill.claim_outbox($1::uuid,$2::uuid,$3::integer)',queryArgs(scope));
   const row=result.rows?.[0];
   return row?{eventId:row.event_id,type:row.event_type,idempotencyKey:row.idempotency_key,
     payload:row.event_payload,fence:Number(row.fence_version)}:null;
  },
  async ackOutbox(scope){
   argsScope(scope,owner);
   const result=await transaction('SELECT ask_bill.ack_outbox($1::uuid,$2::uuid,$3::uuid,$4::bigint) AS ok',
     [owner,scope.eventId,scope.workerId,scope.fence]);
   return bool(result);
  },
  async failOutbox(scope){
   argsScope(scope,owner);
   const result=await transaction('SELECT ask_bill.fail_outbox($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::boolean,$6::text) AS ok',
     [owner,scope.eventId,scope.workerId,scope.fence,scope.retry,scope.errorCode]);
   return bool(result);
  },
  async reapExpiredOutbox({publisherId}){
   argsScope({publisherId},owner);
   const result=await transaction('SELECT ask_bill.reap_expired_outbox($1::uuid) AS count',[owner]);
   return Number(result.rows?.[0]?.count ?? 0);
  }
 });
}
