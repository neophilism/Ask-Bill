import pg from 'pg';

/** Parse only connection identity; URL options cannot override TLS, role or limits. */
export function applicationPoolSettings({connectionString,hosted=true,max=8,verifyRole=true}={}){
  if(typeof hosted!=='boolean'||typeof verifyRole!=='boolean'||typeof connectionString!=='string'||
    connectionString.length>8192||/[\u0000-\u0020\u007f]/.test(connectionString))throw Error('DATABASE_URL_INVALID');
  let url,user,password,database;
  try{url=new URL(connectionString);user=decodeURIComponent(url.username);password=decodeURIComponent(url.password);
    database=decodeURIComponent(url.pathname.slice(1));}catch{throw Error('DATABASE_URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!user||!database||url.hash||
    database.includes('/')||[user,password,database].some(value=>value.includes('\0'))||
    (url.port&&(!/^[0-9]+$/.test(url.port)||Number(url.port)<1||Number(url.port)>65535)))throw Error('DATABASE_URL_INVALID');
  if(!Number.isSafeInteger(max)||max<1||max>25)throw Error('DATABASE_POOL_LIMIT');
  const allowed=new Set(['sslmode','channel_binding']);
  for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)throw Error('DATABASE_URL_OPTIONS_FORBIDDEN');
  const sslmode=url.searchParams.get('sslmode'),binding=url.searchParams.get('channel_binding');
  if(sslmode!==null&&!['disable','allow','prefer','require','verify-ca','verify-full'].includes(sslmode)||
    binding!==null&&!['disable','prefer','require'].includes(binding))throw Error('DATABASE_URL_OPTIONS_FORBIDDEN');
  if(!hosted&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('LOCAL_DATABASE_MUST_BE_LOOPBACK');
  // node-postgres merges connectionString options over explicit configuration.
  // Supplying individual fields keeps the verified TLS object and bounded timeouts.
  return {host:url.hostname.replace(/^\[|\]$/g,''),port:url.port?Number(url.port):5432,user,password,database,max,
    connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,query_timeout:20000,
    application_name:'ask-bill',ssl:hosted?{rejectUnauthorized:true}:false,
    enableChannelBinding:binding!=='disable',...(verifyRole?{options:'-c search_path=pg_catalog'}:{})};
}

/** Includes privileges reachable through SET ROLE, even with NOINHERIT. */
export async function assertApplicationDatabaseRole(client,{roleName=null}={}){
  if(roleName!==null&&(typeof roleName!=='string'||roleName.length<1||roleName.length>63))throw Error('DATABASE_ROLE_INVALID');
  const result=await client.query(`WITH requested AS (
      SELECT * FROM pg_catalog.pg_roles WHERE rolname=COALESCE($1::text,session_user::text)
    ), reachable AS (
      SELECT r.* FROM pg_catalog.pg_roles r,requested target
      WHERE pg_catalog.pg_has_role(target.oid,r.oid,'MEMBER')
    ) SELECT target.rolname,
      ($1::text IS NULL AND current_user<>session_user) AS switched_role,
      EXISTS(SELECT 1 FROM reachable WHERE rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication
        OR left(rolname,3)='pg_') AS privileged_role,
      EXISTS(SELECT 1 FROM pg_catalog.pg_database d JOIN reachable r ON r.oid=d.datdba
        WHERE d.datname=current_database()) AS owns_database,
      EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n JOIN reachable r ON r.oid=n.nspowner
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS owns_schema,
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN reachable r ON r.oid=c.relowner WHERE n.nspname IN ('ask_bill','ask_bill_meta')) AS owns_tables,
      EXISTS(SELECT 1 FROM reachable r WHERE pg_catalog.has_database_privilege(r.oid,current_database(),'CREATE')) AS can_create_schema,
      EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n,reachable r WHERE n.nspname IN ('ask_bill','ask_bill_meta','public')
        AND pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE')) AS can_create_objects,
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,reachable r
        WHERE n.nspname='ask_bill' AND c.relkind IN ('r','p')
          AND pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE')) AS can_truncate,
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,reachable r
        WHERE n.nspname='ask_bill' AND c.relname IN ('publishers','publisher_memberships','publisher_auth_identities')
          AND (pg_catalog.has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE')
            OR pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AS can_enroll_identity,
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,reachable r
        WHERE n.nspname='ask_bill' AND c.relname='audit_events'
          AND (pg_catalog.has_any_column_privilege(r.oid,c.oid,'UPDATE')
            OR pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AS can_change_audit,
      EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n,reachable r WHERE n.nspname='ask_bill_meta'
        AND (pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE,CREATE') OR EXISTS(
          SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace=n.oid AND c.relkind IN ('r','p','v','m','f')
            AND (pg_catalog.has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
              OR pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))))) AS can_access_migration_metadata
    FROM requested target`,[roleName]);
  const role=result.rows[0];
  if(!role||['switched_role','privileged_role','owns_database','owns_schema','owns_tables','can_create_schema','can_create_objects',
    'can_truncate','can_enroll_identity','can_change_audit','can_access_migration_metadata']
    .some(key=>role[key]!==false))throw Error('DEDICATED_NONOWNER_DATABASE_ROLE_REQUIRED');
  return true;
}

export async function createApplicationPool(options={}){
  const {verifyRole=true}=options,pool=new pg.Pool(applicationPoolSettings(options));
  // Pool errors are handled without echoing credentials or query parameters.
  pool.on('error',()=>{});
  try{if(verifyRole)await assertApplicationDatabaseRole(pool);return pool;}
  catch{await pool.end();throw Error('DATABASE_READINESS_FAILED');}
}
