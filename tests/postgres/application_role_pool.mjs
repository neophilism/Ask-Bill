/** Disposable PostgreSQL acceptance for the dedicated runtime credential policy. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createApplicationPool,assertApplicationDatabaseRole} from '../../packages/db/pool.mjs';
const connectionString=process.env.ASK_BILL_TEST_DATABASE_URL;
let target;try{target=new URL(connectionString);}catch{throw Error('ASK_BILL_TEST_DATABASE_URL_REQUIRED');}
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||!/^\/(?:askbill_test(?:_[a-z0-9_]+)?|askbill_fixture)$/.test(target.pathname))throw Error('DISPOSABLE_LOCAL_TEST_DATABASE_REQUIRED');
const suffix=randomBytes(5).toString('hex'),runtime='ab_runtime_test_'+suffix,group='ab_runtime_group_'+suffix,privileged='ab_runtime_priv_'+suffix;
const schema='ab_runtime_schema_'+suffix,table='ab_runtime_table_'+suffix,database='askbill_test_role_'+suffix;
let owner;
const denied=()=>assert.rejects(assertApplicationDatabaseRole(owner,{roleName:runtime}),/DEDICATED_NONOWNER_DATABASE_ROLE_REQUIRED/);
const fixturePassword='temporary_runtime_fixture_password_not_a_secret';
function runtimeUrl(databaseName){const url=new URL(connectionString);url.username=runtime;url.password=fixturePassword;if(databaseName)url.pathname='/'+databaseName;return url.href;}
before(async()=>{
  owner=await createApplicationPool({connectionString,hosted:false,verifyRole:false,max:1});
  await owner.query('CREATE ROLE '+runtime+" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '"+fixturePassword+"'");
  await owner.query('CREATE ROLE '+group+' WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await owner.query('CREATE ROLE '+privileged+' WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
});
after(async()=>{
  if(!owner)return;
  try{
    await owner.query('DROP DATABASE IF EXISTS '+database);
    await owner.query('DROP TABLE IF EXISTS ask_bill.'+table);
    await owner.query('DROP SCHEMA IF EXISTS '+schema);
    for(const role of [runtime,group,privileged]){await owner.query('DROP OWNED BY '+role);await owner.query('DROP ROLE '+role);}
  }finally{await owner.end();}
});
test('an ordinary dedicated login opens and gets a fixed pg_catalog search path',async()=>{
  assert.equal(await assertApplicationDatabaseRole(owner,{roleName:runtime}),true);
  const pool=await createApplicationPool({connectionString:runtimeUrl(),hosted:false});
  try{
    assert.equal((await pool.query('SELECT current_user')).rows[0].current_user,runtime);
    assert.equal((await pool.query('SHOW search_path')).rows[0].search_path,'pg_catalog');
  }finally{await pool.end();}
});
test('superuser, bypass RLS, role creation, database creation and replication capabilities fail closed',async()=>{
  for(const [grant,revoke] of [['SUPERUSER','NOSUPERUSER'],['BYPASSRLS','NOBYPASSRLS'],['CREATEROLE','NOCREATEROLE'],['CREATEDB','NOCREATEDB'],['REPLICATION','NOREPLICATION']]){
    await owner.query('ALTER ROLE '+runtime+' '+grant);
    try{await denied();}finally{await owner.query('ALTER ROLE '+runtime+' '+revoke);}
  }
});
test('indirect SET ROLE privileges remain forbidden for a NOINHERIT login',async()=>{
  await owner.query('ALTER ROLE '+privileged+' CREATEROLE');
  await owner.query('GRANT '+privileged+' TO '+group);
  await owner.query('GRANT '+group+' TO '+runtime);
  try{await denied();await assert.rejects(createApplicationPool({connectionString:runtimeUrl(),hosted:false}),/DATABASE_READINESS_FAILED/);}
  finally{await owner.query('REVOKE '+group+' FROM '+runtime);await owner.query('REVOKE '+privileged+' FROM '+group);await owner.query('ALTER ROLE '+privileged+' NOCREATEROLE');}
});
test('predefined privileged membership cannot provide server file access',async()=>{
  await owner.query('GRANT pg_read_server_files TO '+group);await owner.query('GRANT '+group+' TO '+runtime);
  try{await denied();}finally{await owner.query('REVOKE '+group+' FROM '+runtime);await owner.query('REVOKE pg_read_server_files FROM '+group);}
});
test('schema ownership and object-creation grants are rejected',async()=>{
  await owner.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+runtime);
  try{await denied();}finally{await owner.query('DROP SCHEMA '+schema);}
  await owner.query('GRANT CREATE ON SCHEMA ask_bill TO '+runtime);
  try{await denied();}finally{await owner.query('REVOKE CREATE ON SCHEMA ask_bill FROM '+runtime);}
  await owner.query('GRANT CREATE ON DATABASE '+target.pathname.slice(1)+' TO '+runtime);
  try{await denied();}finally{await owner.query('REVOKE CREATE ON DATABASE '+target.pathname.slice(1)+' FROM '+runtime);}
  await owner.query('GRANT CREATE ON SCHEMA ask_bill TO '+group);await owner.query('GRANT '+group+' TO '+runtime);
  try{await denied();}finally{await owner.query('REVOKE '+group+' FROM '+runtime);await owner.query('REVOKE CREATE ON SCHEMA ask_bill FROM '+group);}
});
test('table ownership and ownership inherited through a group are rejected',async()=>{
  await owner.query('CREATE TABLE ask_bill.'+table+'(id integer)');
  await owner.query('ALTER TABLE ask_bill.'+table+' OWNER TO '+runtime);
  try{await denied();}finally{await owner.query('DROP TABLE ask_bill.'+table);}
  await owner.query('CREATE SCHEMA '+schema+' AUTHORIZATION '+group);await owner.query('GRANT '+group+' TO '+runtime);
  try{await denied();}finally{await owner.query('REVOKE '+group+' FROM '+runtime);await owner.query('DROP SCHEMA '+schema);}
});
test('TRUNCATE and pre-existing column grants cannot bypass RLS or enrollment policy',async()=>{
  for(const grant of ['TRUNCATE ON ask_bill.bills','INSERT(user_id) ON ask_bill.publisher_auth_identities',
    'UPDATE(user_id) ON ask_bill.publisher_auth_identities','UPDATE(role) ON ask_bill.publisher_memberships',
    'DELETE ON ask_bill.publishers','UPDATE(detail) ON ask_bill.audit_events','DELETE ON ask_bill.audit_events']){
    await owner.query('GRANT '+grant+' TO '+runtime);
    try{await denied();}finally{await owner.query('REVOKE '+grant+' FROM '+runtime);}
  }
  await owner.query('GRANT UPDATE(user_id) ON ask_bill.publisher_auth_identities TO '+group);
  await owner.query('GRANT '+group+' TO '+runtime);
  try{await denied();}finally{await owner.query('REVOKE '+group+' FROM '+runtime);await owner.query('REVOKE UPDATE(user_id) ON ask_bill.publisher_auth_identities FROM '+group);}
});
test('runtime credentials cannot acquire access to migration metadata',async()=>{
  const exists=(await owner.query("SELECT to_regnamespace('ask_bill_meta') AS schema")).rows[0]?.schema!==null;
  if(!exists){await owner.query('CREATE SCHEMA ask_bill_meta');await owner.query('REVOKE ALL ON SCHEMA ask_bill_meta FROM PUBLIC');}
  await owner.query('GRANT USAGE ON SCHEMA ask_bill_meta TO '+group);await owner.query('GRANT '+group+' TO '+runtime);
  try{await denied();}finally{
    await owner.query('REVOKE '+group+' FROM '+runtime);await owner.query('REVOKE USAGE ON SCHEMA ask_bill_meta FROM '+group);
    if(!exists)await owner.query('DROP SCHEMA ask_bill_meta');
  }
});
test('owning the current database is forbidden even with all elevated role flags disabled',async()=>{
  await owner.query('CREATE DATABASE '+database+' OWNER '+runtime);
  try{await assert.rejects(createApplicationPool({connectionString:runtimeUrl(database),hosted:false}),/DATABASE_READINESS_FAILED/);}
  finally{await owner.query('DROP DATABASE '+database);}
  assert.equal(await assertApplicationDatabaseRole(owner,{roleName:runtime}),true);
});
