/** Pre-enroll one verified publisher identity and create a non-owner runtime role.
 * Values arrive through the private environment, never command-line arguments.
 */
import {pathToFileURL} from 'node:url';
import {createApplicationPool,assertApplicationDatabaseRole} from '../packages/db/pool.mjs';
import {publisherIdentityHash} from '../packages/auth/pg-store.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const quoteIdentifier=value=>'"'+value.replaceAll('"','""')+'"';
const quoteLiteral=value=>"'"+value.replaceAll("'","''")+"'";
const required=(env,key)=>{const value=env[key];if(typeof value!=='string'||!value||value.length>2000||/[\u0000-\u001f]/u.test(value))throw Error('BOOTSTRAP_CONFIGURATION');return value;};
export function bootstrapSettings(env){
  const publisherId=required(env,'ASK_BILL_PUBLISHER_ID'),userId=required(env,'ASK_BILL_OWNER_USER_ID');
  const slug=required(env,'ASK_BILL_PUBLISHER_SLUG'),name=required(env,'ASK_BILL_PUBLISHER_NAME');
  const issuer=required(env,'ASK_BILL_OIDC_ISSUER'),subject=required(env,'ASK_BILL_OWNER_OIDC_SUBJECT');
  const role=required(env,'ASK_BILL_RUNTIME_DB_ROLE'),password=env.ASK_BILL_RUNTIME_DB_PASSWORD;
  let origin;try{origin=new URL(issuer);}catch{throw Error('BOOTSTRAP_CONFIGURATION');}
  if(!uuid.test(publisherId)||!uuid.test(userId)||!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)||name.length>200||
    origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||subject.length>255||
    !/^[a-z][a-z0-9_]{2,62}$/.test(role)||['postgres','public','ask_bill'].includes(role)||
    (password!==undefined&&(password.length<32||password.length>256||/[\u0000-\u001f\\]/u.test(password))))throw Error('BOOTSTRAP_CONFIGURATION');
  return {publisherId:publisherId.toLowerCase(),userId:userId.toLowerCase(),slug,name,issuer,subject,role,password};
}
export async function bootstrapPublisher({pool,settings}={}){
  const {publisherId,userId,slug,name,issuer,subject,role,password}=settings;
  const identityHash=publisherIdentityHash({issuer,subject}),client=await pool.connect(),roleSql=quoteIdentifier(role);
  try{
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ask-bill:publisher-bootstrap',0))");
    const found=await client.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolcanlogin FROM pg_roles WHERE rolname=$1',[role]);
    if(found.rows.length){
      const row=found.rows[0];if(row.rolsuper||row.rolbypassrls||row.rolcreaterole||row.rolcreatedb||!row.rolcanlogin)throw Error('RUNTIME_ROLE_UNSAFE');
      const inherits=await client.query('SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1 LIMIT 1',[role]);
      if(inherits.rows.length)throw Error('RUNTIME_ROLE_INHERITS_PRIVILEGES');
    }else{
      if(!password)throw Error('NEW_RUNTIME_ROLE_PASSWORD_REQUIRED');
      await client.query('CREATE ROLE '+roleSql+' WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '+quoteLiteral(password));
    }
    const owns=await client.query("SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname=$1 AND n.nspname='ask_bill' LIMIT 1",[role]);
    if(owns.rows.length)throw Error('RUNTIME_ROLE_OWNS_TABLES');
    await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[publisherId]);
    await client.query('INSERT INTO ask_bill.publishers(id,slug,display_name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[publisherId,slug,name]);
    const publisher=await client.query('SELECT slug,display_name FROM ask_bill.publishers WHERE id=$1',[publisherId]);
    if(publisher.rows[0]?.slug!==slug||publisher.rows[0]?.display_name!==name)throw Error('EXISTING_PUBLISHER_MISMATCH');
    await client.query("INSERT INTO ask_bill.publisher_memberships(publisher_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT(publisher_id,user_id) DO NOTHING",[publisherId,userId]);
    const member=await client.query('SELECT role FROM ask_bill.publisher_memberships WHERE publisher_id=$1 AND user_id=$2',[publisherId,userId]);
    if(member.rows[0]?.role!=='owner')throw Error('EXISTING_MEMBERSHIP_MISMATCH');
    await client.query('INSERT INTO ask_bill.publisher_auth_identities(publisher_id,identity_sha256,user_id) VALUES($1,$2,$3) ON CONFLICT(publisher_id,identity_sha256) DO NOTHING',[publisherId,identityHash,userId]);
    const identity=await client.query('SELECT user_id,disabled_at FROM ask_bill.publisher_auth_identities WHERE publisher_id=$1 AND identity_sha256=$2',[publisherId,identityHash]);
    if(identity.rows[0]?.user_id!==userId||identity.rows[0]?.disabled_at)throw Error('EXISTING_IDENTITY_MISMATCH');
    await client.query('GRANT USAGE ON SCHEMA ask_bill TO '+roleSql);
    await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ask_bill TO '+roleSql);
    await client.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ask_bill TO '+roleSql);
    await client.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ask_bill TO '+roleSql);
    await client.query('REVOKE INSERT,UPDATE,DELETE ON ask_bill.publishers,ask_bill.publisher_memberships,ask_bill.publisher_auth_identities FROM '+roleSql);
    await client.query('REVOKE UPDATE,DELETE ON ask_bill.audit_events FROM '+roleSql);
    await assertApplicationDatabaseRole(client,{roleName:role});
    await client.query('COMMIT');
    return {publisherId,userId,runtimeRole:role,identityEnrolled:true};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}
async function main(){
  if(process.argv.length>2)throw Error('BOOTSTRAP_ENV_ONLY');
  const settings=bootstrapSettings(process.env),url=required(process.env,'ASK_BILL_MIGRATION_DATABASE_URL');
  const pool=await createApplicationPool({connectionString:url,hosted:!['development','test'].includes(process.env.ASK_BILL_STAGE??'production'),verifyRole:false,max:1});
  try{const result=await bootstrapPublisher({pool,settings});process.stdout.write(JSON.stringify({product:'ask-bill',bootstrap:result})+'\n');}
  finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
  process.stderr.write('Ask Bill publisher bootstrap failed. Check the verified identity, publisher details and dedicated database role. Existing identities are never replaced.\n');process.exitCode=1;
});
