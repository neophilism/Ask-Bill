/** Run only against a deliberately supplied disposable loopback test database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApplicationPool} from '../../packages/db/pool.mjs';
import {migrate,migrationFiles} from '../../scripts/migrate.mjs';
import {bootstrapSettings,bootstrapPublisher} from '../../scripts/bootstrap-publisher.mjs';
const raw=process.env.ASK_BILL_TEST_DATABASE_URL;
if(!raw)throw Error('EXPLICIT_TEST_DATABASE_REQUIRED');
const url=new URL(raw);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/askbill_/.test(url.pathname))throw Error('DISPOSABLE_LOOPBACK_DATABASE_REQUIRED');
const pool=await createApplicationPool({connectionString:raw,hosted:false,verifyRole:false,max:2});
const publisherId=randomUUID(),userId=randomUUID(),role='ask_bill_bootstrap_'+process.pid;
const env={ASK_BILL_PUBLISHER_ID:publisherId,ASK_BILL_OWNER_USER_ID:userId,ASK_BILL_PUBLISHER_SLUG:'bootstrap-test-'+process.pid,
  ASK_BILL_PUBLISHER_NAME:'Isolated bootstrap acceptance fixture',ASK_BILL_OIDC_ISSUER:'https://identity.example.test',
  ASK_BILL_OWNER_OIDC_SUBJECT:'synthetic-oidc-subject',ASK_BILL_RUNTIME_DB_ROLE:role,ASK_BILL_RUNTIME_DB_PASSWORD:'temporary_fixture_password_with_32_characters'};
const settings=bootstrapSettings(env);
try{
  await test('migration hashes are journaled and a second pass does not reapply',async()=>{
    const first=await migrate({pool}),second=await migrate({pool}),checked=await migrate({pool,checkOnly:true});
    assert.equal(first.checked,(await migrationFiles()).length);assert.deepEqual(second.applied,[]);assert.deepEqual(checked.applied,[]);
  });
  await test('bootstrap binds exact verified identity and refuses to replace an existing publisher',async()=>{
    const result=await bootstrapPublisher({pool,settings});assert.equal(result.identityEnrolled,true);
    await bootstrapPublisher({pool,settings});
    await assert.rejects(bootstrapPublisher({pool,settings:{...settings,name:'different publisher'}}),/EXISTING_PUBLISHER_MISMATCH/);
    await assert.rejects(bootstrapPublisher({pool,settings:{...settings,userId:randomUUID()}}),/EXISTING_IDENTITY_MISMATCH/);
  });
  await test('runtime role can read tenant data but cannot enroll identities or change migration history',async()=>{
    const appUrl=new URL(raw);appUrl.username=role;appUrl.password=env.ASK_BILL_RUNTIME_DB_PASSWORD;
    const app=await createApplicationPool({connectionString:appUrl.href,hosted:false});
    const client=await app.connect();
    try{
      assert.equal((await client.query('SELECT id FROM ask_bill.publishers')).rows.length,0);
      await client.query("SELECT set_config('ask_bill.publisher_id',$1,false)",[publisherId]);
      assert.equal((await client.query('SELECT id FROM ask_bill.publishers')).rows.length,1);
      await assert.rejects(client.query("UPDATE ask_bill.publisher_memberships SET role='viewer' WHERE publisher_id=$1",[publisherId]),error=>error.code==='42501');
      await assert.rejects(client.query('DELETE FROM ask_bill.publisher_auth_identities WHERE publisher_id=$1',[publisherId]),error=>error.code==='42501');
      await assert.rejects(client.query('SELECT * FROM ask_bill_meta.schema_migrations'),error=>error.code==='42501');
      await assert.rejects(client.query('DELETE FROM ask_bill.audit_events WHERE publisher_id=$1',[publisherId]),error=>error.code==='42501');
    }finally{client.release();await app.end();}
  });
}finally{
  const client=await pool.connect();
  try{
    await client.query("SELECT set_config('ask_bill.publisher_id',$1,false)",[publisherId]);
    await client.query('DELETE FROM ask_bill.publisher_auth_identities WHERE publisher_id=$1',[publisherId]);
    await client.query('DELETE FROM ask_bill.publisher_memberships WHERE publisher_id=$1',[publisherId]);
    await client.query('DELETE FROM ask_bill.publishers WHERE id=$1',[publisherId]);
    const exists=await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
    if(exists.rows.length){await client.query('DROP OWNED BY "'+role+'"');await client.query('DROP ROLE "'+role+'"');}
  }finally{client.release();await pool.end();}
}
