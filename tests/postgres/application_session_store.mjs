/** Run against a disposable localhost database with migrations 001 and 008 applied. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {createPgSessionStore} from '../../packages/sessions/pg-store.mjs';
const url=process.env.ASK_BILL_TEST_DATABASE_URL;
if(!url)throw Error('ASK_BILL_TEST_DATABASE_URL must name a disposable localhost database');
const connection=new URL(url);
if(!['localhost','127.0.0.1','[::1]'].includes(connection.hostname)||!/^\/(?:askbill_test(?:_[a-z0-9_]+)?|askbill_fixture)$/.test(connection.pathname))throw Error('Only the disposable localhost Ask Bill test database is permitted');
const require=createRequire(new URL('../../packages/db/package.json',import.meta.url));
const {Pool}=require('pg');
const owner=new Pool({connectionString:url,max:3});
const publisher='bbbbbbbb-1000-4000-8000-000000000001',otherPublisher='bbbbbbbb-1000-4000-8000-000000000002';
const roleName='ask_bill_session_security_fixture';
const hash=value=>createHash('sha256').update(value).digest('hex');
const encryptionKey=Buffer.alloc(32,41).toString('base64');
let pool,store,foreign,first,second;
const record=label=>({tokenHash:hash(label),csrfHash:hash('csrf:'+label),ageBand:'adult',expiresAt:Date.now()+600000});
before(async()=>{
 await owner.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${roleName}') THEN CREATE ROLE ${roleName} NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$`);
 await owner.query(`GRANT USAGE ON SCHEMA ask_bill TO ${roleName}`);
 await owner.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ask_bill.anonymous_sessions,ask_bill.anonymous_answers,ask_bill.anonymous_usage_daily TO ${roleName}`);
 await owner.query('INSERT INTO ask_bill.publishers(id,slug,display_name) VALUES($1,$2,$3),($4,$5,$6)',[publisher,'session-security-fixture-a','Session fixture A',otherPublisher,'session-security-fixture-b','Session fixture B']);
 pool=new Pool({connectionString:url,max:8,options:'-c role='+roleName});
 const authority=await pool.query('SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
 assert.equal(authority.rows[0].current_user,roleName);assert.equal(authority.rows[0].rolsuper,false);assert.equal(authority.rows[0].rolbypassrls,false);
 store=createPgSessionStore({pool,publisherId:publisher,encryptionKey,maxSessions:2,maxPerSession:3,maxPerDay:3});
 foreign=createPgSessionStore({pool,publisherId:otherPublisher,encryptionKey,maxSessions:2,maxPerSession:3,maxPerDay:3});
});
after(async()=>{
 if(pool)await pool.end();
 try{
  await owner.query('DELETE FROM ask_bill.anonymous_sessions WHERE publisher_id=ANY($1::uuid[])',[[publisher,otherPublisher]]);
  await owner.query('DELETE FROM ask_bill.anonymous_usage_daily WHERE publisher_id=ANY($1::uuid[])',[[publisher,otherPublisher]]);
  await owner.query('DELETE FROM ask_bill.publishers WHERE id=ANY($1::uuid[])',[[publisher,otherPublisher]]);
 }finally{await owner.end();}
});
test('concurrent durable session creation respects the advisory-locked publisher capacity',async()=>{
 const responses=await Promise.allSettled([1,2,3].map(n=>store.create(record('security-capacity-'+n))));
 const admitted=responses.filter(r=>r.status==='fulfilled');assert.equal(admitted.length,2);
 assert.equal(responses.find(r=>r.status==='rejected').reason.code,'SESSION_CAPACITY');
 [first,second]=admitted.map(r=>r.value);
 assert.equal((await owner.query('SELECT count(*)::int AS n FROM ask_bill.anonymous_sessions WHERE publisher_id=$1',[publisher])).rows[0].n,2);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM ask_bill.anonymous_sessions')).rows[0].n,0,'FORCE RLS has no implicit tenant outside a scoped transaction');
 assert.equal(await foreign.get(first.tokenHash),null);
 await foreign.create(record('foreign-session'));
});
test('future and stale audio epochs do not advance state or spend durable request quota',async()=>{
 await store.begin({tokenHash:first.tokenHash,conversationEpoch:1,kind:'conversation'});
 for(const conversationEpoch of [0,2])await assert.rejects(()=>store.begin({tokenHash:first.tokenHash,conversationEpoch,kind:'transcription'}),error=>error.code==='STALE_EPOCH');
 assert.equal((await store.get(first.tokenHash)).requests,1);
 await store.begin({tokenHash:first.tokenHash,conversationEpoch:1,kind:'speech'});
 assert.equal((await store.get(first.tokenHash)).requests,2);
});
test('answers are encrypted and authenticated to their publisher, session and answer identity',async()=>{
 const answerId=randomUUID(),answer={answerId,conversationEpoch:1,billId:randomUUID(),versionId:randomUUID(),segments:[],text:'PRIVATE ANSWER SENTINEL'};
 await store.saveAnswer(first.tokenHash,answer);
 assert.deepEqual(await store.getAnswer(first.tokenHash,answerId),answer);
 assert.equal(await foreign.getAnswer(first.tokenHash,answerId),null);
 const bytes=(await owner.query('SELECT encrypted_answer FROM ask_bill.anonymous_answers WHERE publisher_id=$1 AND answer_id=$2',[publisher,answerId])).rows[0].encrypted_answer;
 assert.equal(bytes.includes(Buffer.from('PRIVATE ANSWER SENTINEL')),false);
 const wrongId=randomUUID();
 await owner.query(`INSERT INTO ask_bill.anonymous_answers(publisher_id,session_id,answer_id,encrypted_answer,expires_at)
  SELECT publisher_id,session_id,$3,encrypted_answer,expires_at FROM ask_bill.anonymous_answers WHERE publisher_id=$1 AND answer_id=$2`,[publisher,answerId,wrongId]);
 await assert.rejects(()=>store.getAnswer(first.tokenHash,wrongId),error=>error.code==='ANSWER_INTEGRITY');
 await assert.rejects(()=>store.saveAnswer(first.tokenHash,{...answer,answerId:randomUUID(),conversationEpoch:0}),error=>error.code==='STALE_EPOCH');
 await store.erase(first.tokenHash);
 assert.equal((await owner.query('SELECT count(*)::int AS n FROM ask_bill.anonymous_answers WHERE publisher_id=$1',[publisher])).rows[0].n,0);
});
test('daily usage survives erasure and a fresh session cannot reset the publisher budget',async()=>{
 const next=await store.create(record('replacement-session'));
 await store.begin({tokenHash:next.tokenHash,conversationEpoch:1,kind:'conversation'});
 await store.erase(next.tokenHash);
 const fresh=await store.create(record('cannot-reset-daily-budget'));
 await assert.rejects(()=>store.begin({tokenHash:fresh.tokenHash,conversationEpoch:1,kind:'conversation'}),error=>error.code==='USAGE_LIMIT');
 assert.equal((await store.get(fresh.tokenHash)).requests,0);
 // Expired rows are reclaimed under the same capacity lock before creating a replacement.
 await owner.query("UPDATE ask_bill.anonymous_sessions SET created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes' WHERE publisher_id=$1 AND token_sha256=$2",[publisher,fresh.tokenHash]);
 const reclaimed=await store.create(record('reclaimed-expired-session'));assert(reclaimed.id);assert.equal(await store.get(fresh.tokenHash),null);
});
test('per-session caps are enforced independently from the publisher daily allowance',async()=>{
 const capped=createPgSessionStore({pool,publisherId:publisher,encryptionKey,maxSessions:2,maxPerSession:1,maxPerDay:100});
 await capped.begin({tokenHash:second.tokenHash,conversationEpoch:1,kind:'conversation'});
 await assert.rejects(()=>capped.begin({tokenHash:second.tokenHash,conversationEpoch:2,kind:'conversation'}),error=>error.code==='USAGE_LIMIT');
 assert.equal((await capped.get(second.tokenHash)).requests,1);
});
