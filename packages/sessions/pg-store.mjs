/** Tenant-scoped durable anonymous sessions and encrypted 30-minute answer replay. */
import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {sessionFail} from './store.mjs';
const HASH=/^[a-f0-9]{64}$/;
export function createPgSessionStore({pool,publisherId,encryptionKey,maxPerSession=60,maxPerDay=1000,maxSessions=1000}={}) {
  if(!pool?.connect||typeof encryptionKey!=='string'||Buffer.from(encryptionKey,'base64').length!==32)sessionFail('SESSION_DATABASE_CONFIGURATION');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publisherId??'')||
    ![maxSessions,maxPerSession,maxPerDay].every(value=>Number.isSafeInteger(value)&&value>=1&&value<=100000))sessionFail('INVALID_SESSION_LIMIT');
  const key=Buffer.from(encryptionKey,'base64');
  async function transaction(action) {
    const client=await pool.connect();
    try{await client.query('BEGIN');await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[publisherId]);
      const result=await action(client);await client.query('COMMIT');return result;
    }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
  }
  const map=row=>row?Object.freeze({id:row.id,tokenHash:row.token_sha256,csrfHash:row.csrf_sha256,ageBand:row.age_band,
    expiresAt:new Date(row.expires_at).getTime(),conversationEpoch:Number(row.conversation_epoch),requests:Number(row.request_count)}):null;
  const load=async(client,tokenHash,lock=false)=>{
    if(!HASH.test(tokenHash??''))return null;
    const result=await client.query("SELECT * FROM ask_bill.anonymous_sessions WHERE publisher_id=$1 AND token_sha256=$2 AND expires_at>clock_timestamp()"+(lock?' FOR UPDATE':''),[publisherId,tokenHash]);
    return map(result.rows[0]);
  };
  function seal(value,aad){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
    const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),bytes]);}
  function open(bytes,aad){const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAAD(Buffer.from(aad));d.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString('utf8'));}
  return Object.freeze({kind:'postgresql',
    async create(record){return transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[publisherId+':anonymous-sessions']);
      await client.query('DELETE FROM ask_bill.anonymous_sessions WHERE publisher_id=$1 AND id IN (SELECT id FROM ask_bill.anonymous_sessions WHERE publisher_id=$1 AND expires_at<=clock_timestamp() LIMIT 100)',[publisherId]);
      const capacity=await client.query('SELECT count(*)::integer AS total FROM ask_bill.anonymous_sessions WHERE publisher_id=$1',[publisherId]);
      if(Number(capacity.rows[0]?.total)>=maxSessions)sessionFail('SESSION_CAPACITY');
      const result=await client.query(`INSERT INTO ask_bill.anonymous_sessions
        (id,publisher_id,token_sha256,csrf_sha256,age_band,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [randomUUID(),publisherId,record.tokenHash,record.csrfHash,record.ageBand,new Date(record.expiresAt)]);return map(result.rows[0]);});},
    async get(tokenHash){return transaction(client=>load(client,tokenHash));},
    async begin({tokenHash,conversationEpoch,kind}){return transaction(async client=>{
      const current=await load(client,tokenHash,true);if(!current)sessionFail('SESSION_EXPIRED');
      if(!Number.isSafeInteger(conversationEpoch)||conversationEpoch<0||conversationEpoch>100000000||
        (kind==='conversation'?conversationEpoch<=current.conversationEpoch:conversationEpoch!==current.conversationEpoch))sessionFail('STALE_EPOCH');
      if(current.requests>=maxPerSession)sessionFail('USAGE_LIMIT');
      const day=await client.query(`INSERT INTO ask_bill.anonymous_usage_daily (publisher_id,usage_day,request_count)
        VALUES($1,CURRENT_DATE,1) ON CONFLICT(publisher_id,usage_day) DO UPDATE SET request_count=ask_bill.anonymous_usage_daily.request_count+1
        WHERE ask_bill.anonymous_usage_daily.request_count<$2 RETURNING request_count`,[publisherId,maxPerDay]);
      if(!day.rows.length)sessionFail('USAGE_LIMIT');
      const result=await client.query(`UPDATE ask_bill.anonymous_sessions SET request_count=request_count+1,conversation_epoch=$3
        WHERE publisher_id=$1 AND token_sha256=$2 RETURNING *`,[publisherId,tokenHash,kind==='conversation'?conversationEpoch:current.conversationEpoch]);
      return map(result.rows[0]);});},
    async isCurrent(tokenHash,epoch){return transaction(async client=>(await load(client,tokenHash))?.conversationEpoch===epoch);},
    async saveAnswer(tokenHash,answer){return transaction(async client=>{
      const session=await load(client,tokenHash,true);if(!session||session.conversationEpoch!==answer.conversationEpoch)sessionFail('STALE_EPOCH');
      const aad=[publisherId,tokenHash,answer.answerId].join(':');const encrypted=seal(answer,aad);
      if(encrypted.length>100000)sessionFail('ANSWER_SIZE');
      await client.query(`INSERT INTO ask_bill.anonymous_answers(publisher_id,session_id,answer_id,encrypted_answer,expires_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(publisher_id,session_id,answer_id) DO NOTHING`,
        [publisherId,session.id,answer.answerId,encrypted,new Date(session.expiresAt)]);
      await client.query(`DELETE FROM ask_bill.anonymous_answers WHERE publisher_id=$1 AND session_id=$2 AND answer_id IN
        (SELECT answer_id FROM ask_bill.anonymous_answers WHERE publisher_id=$1 AND session_id=$2 ORDER BY created_at DESC OFFSET 10)`,[publisherId,session.id]);});},
    async getAnswer(tokenHash,answerId){return transaction(async client=>{
      const session=await load(client,tokenHash);if(!session)return null;
      const result=await client.query(`SELECT encrypted_answer FROM ask_bill.anonymous_answers
        WHERE publisher_id=$1 AND session_id=$2 AND answer_id=$3 AND expires_at>clock_timestamp()`,[publisherId,session.id,answerId]);
      if(!result.rows.length)return null;
      try{return open(result.rows[0].encrypted_answer,[publisherId,tokenHash,answerId].join(':'));}catch{sessionFail('ANSWER_INTEGRITY');}});},
    async erase(tokenHash){return transaction(client=>client.query('DELETE FROM ask_bill.anonymous_sessions WHERE publisher_id=$1 AND token_sha256=$2',[publisherId,tokenHash]));},
    async cleanup(){return transaction(async client=>{
      await client.query('DELETE FROM ask_bill.anonymous_sessions WHERE publisher_id=$1 AND id IN (SELECT id FROM ask_bill.anonymous_sessions WHERE publisher_id=$1 AND expires_at<=clock_timestamp() LIMIT 100)',[publisherId]);
      await client.query("DELETE FROM ask_bill.anonymous_usage_daily WHERE publisher_id=$1 AND usage_day<CURRENT_DATE-7",[publisherId]);});}
  });
}
