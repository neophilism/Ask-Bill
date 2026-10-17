/** Explicit owner-only migration command; never runs as part of a public request. */
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createApplicationPool} from '../packages/db/pool.mjs';
const root=new URL('../',import.meta.url);
export async function migrationFiles(){
  const files=[];
  for(const directory of ['migrations/','packages/auth/migrations/']){
    for(const name of (await readdir(new URL(directory,root))).filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort()){
      const path=directory+name,sql=await readFile(new URL(path,root),'utf8');
      files.push({path,sql,sha256:createHash('sha256').update(sql).digest('hex')});
    }
  }
  return files;
}
export async function migrate({pool,checkOnly=false}={}){
  const files=await migrationFiles(),client=await pool.connect();
  try{
    await client.query("SELECT pg_advisory_lock(hashtextextended('ask-bill:schema-migrations',0))");
    if(!checkOnly){
      await client.query('CREATE SCHEMA IF NOT EXISTS ask_bill_meta');
      await client.query(`CREATE TABLE IF NOT EXISTS ask_bill_meta.schema_migrations(
        path text PRIMARY KEY,sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),applied_at timestamptz NOT NULL DEFAULT now())`);
      await client.query('REVOKE ALL ON SCHEMA ask_bill_meta FROM PUBLIC');
      await client.query('REVOKE ALL ON ask_bill_meta.schema_migrations FROM PUBLIC');
    }
    const applied=await client.query('SELECT path,sha256 FROM ask_bill_meta.schema_migrations');
    const known=new Map(applied.rows.map(row=>[row.path,row.sha256]));
    for(const [path,sha256] of known){
      if(!files.some(file=>file.path===path&&file.sha256===sha256))throw Error('MIGRATION_HISTORY_MISMATCH');
    }
    const pending=files.filter(file=>!known.has(file.path));
    if(checkOnly&&pending.length)throw Error('MIGRATIONS_PENDING');
    for(const file of pending){
      // Each checked-in migration owns an explicit transaction and is repeatable.
      // A crash before journaling is safe: the same hash is reapplied next time.
      await client.query(file.sql);
      await client.query('INSERT INTO ask_bill_meta.schema_migrations(path,sha256) VALUES($1,$2)',[file.path,file.sha256]);
    }
    return {checked:files.length,applied:pending.map(file=>file.path)};
  }catch(error){
    try{await client.query('ROLLBACK');}catch{}
    throw error;
  }finally{
    try{await client.query("SELECT pg_advisory_unlock(hashtextextended('ask-bill:schema-migrations',0))");}catch{}
    client.release();
  }
}
async function main(){
  const args=process.argv.slice(2);if(args.some(arg=>arg!=='--check')||args.length>1)throw Error('MIGRATION_ARGUMENTS');
  const url=process.env.ASK_BILL_MIGRATION_DATABASE_URL;if(!url)throw Error('MIGRATION_OWNER_URL_REQUIRED');
  const hosted=!['development','test'].includes(process.env.ASK_BILL_STAGE??'production');
  const pool=await createApplicationPool({connectionString:url,hosted,verifyRole:false,max:1});
  try{const result=await migrate({pool,checkOnly:args.includes('--check')});process.stdout.write(JSON.stringify({product:'ask-bill',migrations:result})+'\n');}
  finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
  process.stderr.write('Ask Bill migration failed. Check the owner connection, migration history and database permissions.\n');process.exitCode=1;
});
