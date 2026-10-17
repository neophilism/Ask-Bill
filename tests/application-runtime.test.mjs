import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {readApplicationConfig} from '../packages/config/runtime.mjs';
import {applicationPoolSettings} from '../packages/db/pool.mjs';
import {buildApplicationRuntime} from '../apps/web/application/start.mjs';
import {demoPack,demoPublisherId} from '../apps/web/application/demo.mjs';

const base={ASK_BILL_STAGE:'test',ASK_BILL_PUBLISHER_ID:demoPublisherId};
const key=Buffer.alloc(32,97).toString('base64');
const hosted={...base,ASK_BILL_STAGE:'production',ASK_BILL_PUBLIC_ORIGIN:'https://askbill.example',
  ASK_BILL_DATABASE_URL:'postgresql://ask_bill_runtime:fixture-only@db.example/ask_bill',ASK_BILL_SESSION_ENCRYPTION_KEY:key};
const storage={ASK_BILL_STORAGE_URL:'https://objects.example',ASK_BILL_STORAGE_BUCKET:'ask-bill-private',
  ASK_BILL_STORAGE_ACCESS_KEY_ID:'FIXTUREKEY123',ASK_BILL_STORAGE_SECRET_ACCESS_KEY:'fixture-only-storage-secret'};
const publishing={...hosted,...storage,ASK_BILL_ALLOW_PUBLISHING:'true',ASK_BILL_OIDC_ISSUER:'https://identity.example/tenant',
  ASK_BILL_OIDC_CLIENT_ID:'ask-bill-test'};

test('runtime defaults expose source reading without enabling providers or publishing',()=>{
  const config=readApplicationConfig(base);
  assert.equal(config.stage,'test');assert.equal(config.databaseUrl,null);assert.equal(config.publishing,false);
  assert.equal(config.providers.ai,false);assert.equal(config.providers.voice,false);assert.equal(config.providers.stt,false);
  assert.equal(config.officialImportsEnabled,false);assert.equal(config.auth,null);assert.equal(config.storage,null);
  assert.ok(Object.isFrozen(config));assert.ok(Object.isFrozen(config.providers));
});
test('production requires HTTPS, a durable database, encryption and strict finite configuration',()=>{
  assert.equal(readApplicationConfig(hosted).hosted,true);
  for(const patch of [
    {ASK_BILL_STAGE:'preview'}, {ASK_BILL_PUBLIC_ORIGIN:'http://askbill.example'},
    {ASK_BILL_PUBLIC_ORIGIN:'https://askbill.example/'}, {ASK_BILL_PUBLIC_ORIGIN:'https://user:secret@askbill.example'},
    {ASK_BILL_DATABASE_URL:undefined}, {ASK_BILL_DATABASE_URL:'https://db.example'},
    {ASK_BILL_DATABASE_URL:'postgresql://user@db.example'}, {ASK_BILL_SESSION_ENCRYPTION_KEY:undefined},
    {ASK_BILL_SESSION_ENCRYPTION_KEY:'a'.repeat(44)},
    {PORT:'Infinity'}, {PORT:'1e3'}, {PORT:'0x1000'}, {PORT:' 4100'}, {PORT:'04100'}, {PORT:'65536'},
    {ASK_BILL_DAILY_REQUEST_LIMIT:'NaN'}, {ASK_BILL_MAX_GENERATIONS:'51'},
    {ASK_BILL_ALLOW_LIVE_AI:'yes'}, {ASK_BILL_ALLOW_VOICE:'1'}, {ASK_BILL_ALLOW_PUBLISHING:''},
    {ASK_BILL_BUILD_SHA:'unsafe\nheader'}, {ASK_BILL_FFMPEG_PATH:'./ffmpeg'}
  ])assert.throws(()=>readApplicationConfig({...hosted,...patch}),undefined,JSON.stringify(Object.keys(patch)));
  assert.throws(()=>readApplicationConfig({...base,NODE_ENV:'production'}),/PRODUCTION_STAGE_REQUIRED/);
  assert.throws(()=>readApplicationConfig({ASK_BILL_PUBLISHER_ID:demoPublisherId,NODE_ENV:'production'}),/MISSING_ASK_BILL_DATABASE_URL/);
  assert.throws(()=>readApplicationConfig({...base,ASK_BILL_PUBLIC_ORIGIN:'http://public.example'}),/INVALID_PUBLIC_ORIGIN/);
});
test('live model, review, voice and transcription credentials require explicit independent gates',()=>{
  for(const flag of ['ASK_BILL_ALLOW_LIVE_AI','ASK_BILL_ALLOW_VOICE','ASK_BILL_ALLOW_TRANSCRIPTION']){
    assert.throws(()=>readApplicationConfig({...hosted,[flag]:'true'}),/PROVIDER_DATA_PROTECTION_REQUIRED/);
  }
  const ai={...hosted,ASK_BILL_ALLOW_LIVE_AI:'true',ASK_BILL_PROVIDER_DATA_PROTECTION:'verified',
    ASK_BILL_LLM_API_KEY:'fixture-ai-secret',ASK_BILL_LLM_MODEL:'test-generation',ASK_BILL_REVIEW_MODEL:'test-review'};
  assert.equal(readApplicationConfig(ai).providers.ai,true);
  assert.throws(()=>readApplicationConfig({...ai,ASK_BILL_REVIEW_MODEL:'test-generation'}),/INDEPENDENT_REVIEW_MODEL_REQUIRED/);
  assert.throws(()=>readApplicationConfig({...ai,ASK_BILL_LLM_API_KEY:undefined}),/MISSING_ASK_BILL_LLM_API_KEY/);
  const voice={...hosted,ASK_BILL_ALLOW_VOICE:'true',ASK_BILL_PROVIDER_DATA_PROTECTION:'verified',ASK_BILL_TTS_API_KEY:'fixture-tts-secret'};
  assert.throws(()=>readApplicationConfig(voice),/VOICE_RIGHTS_REQUIRED/);
  assert.equal(readApplicationConfig({...voice,ASK_BILL_VOICE_RIGHTS:'verified'}).providers.voice,true);
  assert.equal(readApplicationConfig({...hosted,ASK_BILL_ALLOW_TRANSCRIPTION:'true',ASK_BILL_PROVIDER_DATA_PROTECTION:'verified',
    ASK_BILL_STT_API_KEY:'fixture-stt-secret'}).providers.stt,true);
});
test('publisher and Congress configuration validate usable server-only credential paths',()=>{
  const config=readApplicationConfig({...publishing,ASK_BILL_OIDC_CLIENT_SECRET:'fixture-oidc-secret',
    ASK_BILL_OIDC_TOKEN_ENDPOINT_AUTH_METHOD:'client_secret_post',ASK_BILL_OIDC_ALLOWED_ENDPOINT_ORIGINS:'https://identity.example,https://login.example',
    ASK_BILL_OIDC_MFA_ACR:'urn:example:mfa',ASK_BILL_STORAGE_SESSION_TOKEN:'fixture-session-token',
    ASK_BILL_STORAGE_PATH_STYLE:'false',ASK_BILL_STORAGE_QUARANTINE_BUCKET:'ask-bill-quarantine',
    ASK_BILL_ALLOW_OFFICIAL_IMPORTS:'true',ASK_BILL_CONGRESS_API_KEY:'fixture-congress-key'});
  assert.equal(config.auth.redirectUri,'https://askbill.example/admin/auth/callback');
  assert.deepEqual(config.auth.allowedEndpointOrigins,['https://identity.example','https://login.example']);
  assert.deepEqual(config.auth.acceptedMfaAcr,['urn:example:mfa']);
  assert.equal(config.auth.tokenEndpointAuthMethod,'client_secret_post');assert.equal(config.storage.pathStyle,false);
  assert.equal(config.storage.quarantineBucket,'ask-bill-quarantine');assert.equal(config.storage.credentials.sessionToken,'fixture-session-token');
  for(const item of [config.auth,config.auth.allowedEndpointOrigins,config.storage,config.storage.credentials])assert.ok(Object.isFrozen(item));
  for(const patch of [
    {ASK_BILL_STORAGE_URL:'http://objects.example'}, {ASK_BILL_STORAGE_URL:'https://objects.example/path'},
    {ASK_BILL_STORAGE_BUCKET:'../../public'}, {ASK_BILL_STORAGE_PATH_STYLE:'yes'},
    {ASK_BILL_OIDC_ISSUER:'http://identity.example'}, {ASK_BILL_OIDC_ISSUER:'https://identity.example?client_secret=x'},
    {ASK_BILL_OIDC_ALLOWED_ENDPOINT_ORIGINS:'https://login.example/path'},
    {ASK_BILL_OIDC_ALLOWED_ENDPOINT_ORIGINS:'https://login.example,https://login.example'},
    {ASK_BILL_OIDC_MFA_ACR:'mfa,,verified'}, {ASK_BILL_OIDC_TOKEN_ENDPOINT_AUTH_METHOD:'client_secret_post'},
    {ASK_BILL_ALLOW_OFFICIAL_IMPORTS:'true'}
  ])assert.throws(()=>readApplicationConfig({...publishing,...patch}));
  assert.throws(()=>readApplicationConfig({...hosted,ASK_BILL_ALLOW_OFFICIAL_IMPORTS:'true'}),/OFFICIAL_IMPORTS_REQUIRE_PUBLISHING/);
});
test('worker configuration excludes unrelated secrets, capability flags and public origin',()=>{
  const env={...base,...storage,ASK_BILL_DATABASE_URL:'postgresql://worker@127.0.0.1/ask_bill'};
  for(const name of ['ASK_BILL_SESSION_ENCRYPTION_KEY','ASK_BILL_ALLOW_LIVE_AI','ASK_BILL_LLM_API_KEY','ASK_BILL_ALLOW_VOICE',
    'ASK_BILL_TTS_API_KEY','ASK_BILL_ALLOW_TRANSCRIPTION','ASK_BILL_STT_API_KEY','ASK_BILL_OIDC_ISSUER','ASK_BILL_OIDC_CLIENT_SECRET',
    'ASK_BILL_ALLOW_PUBLISHING','ASK_BILL_PUBLIC_ORIGIN'])Object.defineProperty(env,name,{get(){throw Error('UNRELATED_SECRET_READ');}});
  const config=readApplicationConfig(env,{component:'worker'});
  assert.equal(config.component,'worker');assert.ok(config.storage);assert.equal(config.officialImportsEnabled,false);
  for(const property of ['origin','providers','auth','encryptionKey','publishing'])assert.equal(property in config,false);
  assert.throws(()=>readApplicationConfig(base,{component:'worker'}),/MISSING_ASK_BILL_DATABASE_URL/);
  assert.throws(()=>readApplicationConfig(base,{component:'unknown'}),/INVALID_APPLICATION_COMPONENT/);
});
test('database URLs cannot weaken certificate verification, redirect sockets, change role or remove timeouts',()=>{
  const config=applicationPoolSettings({connectionString:'postgresql://runtime:pa%40ss@db.example:6543/ask_bill?sslmode=disable&channel_binding=require'});
  assert.deepEqual(config.ssl,{rejectUnauthorized:true});assert.equal(config.password,'pa@ss');assert.equal(config.port,6543);
  assert.equal(config.options,'-c search_path=pg_catalog');assert.equal(config.statement_timeout,15000);assert.equal(config.query_timeout,20000);
  assert.equal('connectionString' in config,false);
  for(const suffix of ['?ssl=false','?sslmode=require&sslmode=disable','?sslrootcert=/tmp/file','?host=foreign.example',
    '?options=-c%20role%3Dpostgres','?statement_timeout=0','?query_timeout=0','?application_name=secret','?channel_binding=invalid']){
    assert.throws(()=>applicationPoolSettings({connectionString:'postgresql://runtime:secret@db.example/ask_bill'+suffix}),/DATABASE_URL_OPTIONS_FORBIDDEN/);
  }
  for(const connectionString of ['https://user@db.example/ask_bill','postgresql://runtime@db.example',
    'postgresql://runtime@db.example:70000/ask_bill','postgresql://runtime@db.example/ask_bill#secret'])assert.throws(()=>applicationPoolSettings({connectionString}));
  assert.throws(()=>applicationPoolSettings({connectionString:'postgresql://runtime@db.example/ask_bill',hosted:false}),/LOCAL_DATABASE_MUST_BE_LOOPBACK/);
  const local=applicationPoolSettings({connectionString:'postgresql://runtime@[::1]/ask_bill',hosted:false});
  assert.equal(local.host,'::1');assert.equal(local.ssl,false);
});

async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server.address().port;}
async function freePort(){const server=createServer();const port=await listen(server);await new Promise(resolve=>server.close(resolve));return port;}
async function stop(child){
  if(child.exitCode!==null||child.signalCode!==null)return;
  child.kill('SIGTERM');
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000);timer.unref();
  try{await once(child,'exit');}finally{clearTimeout(timer);}
}
const cli=fileURLToPath(new URL('../apps/web/application/start.mjs',import.meta.url));
function startDemo(port,extra={}){
  // Pass a minimal fixture environment. No real service credentials enter child processes.
  const child=spawn(process.execPath,[cli,'--demo'],{cwd:fileURLToPath(new URL('../',import.meta.url)),
    env:{PATH:process.env.PATH,NODE_ENV:'test',ASK_BILL_STAGE:'test',PORT:String(port),ASK_BILL_PUBLIC_ORIGIN:'http://127.0.0.1:'+port,...extra},
    stdio:['ignore','pipe','pipe']});
  const output={stdout:'',stderr:''};child.stdout.on('data',chunk=>{output.stdout+=chunk;});child.stderr.on('data',chunk=>{output.stderr+=chunk;});
  return {child,output};
}
async function started(child,output){
  const timeout=AbortSignal.timeout(10000);
  while(!output.stdout.includes('\n')){
    if(child.exitCode!==null||child.signalCode!==null)throw Error('DEMO_EXITED_EARLY: '+output.stderr);
    await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,15);const abort=()=>{clearTimeout(timer);reject(Error('DEMO_START_TIMEOUT'));};
      if(timeout.aborted)return abort();timeout.addEventListener('abort',abort,{once:true});timer.unref();
      setTimeout(()=>timeout.removeEventListener('abort',abort),16).unref();});
  }
  return JSON.parse(output.stdout.split('\n')[0]);
}
test('building an explicit demo ignores live provider flags and closes idempotently',async()=>{
  await assert.rejects(buildApplicationRuntime({env:base}),/DATABASE_REQUIRED_USE_EXPLICIT_DEMO/);
  for(const env of [{...base,ASK_BILL_STAGE:'production'},{...base,NODE_ENV:'production'}])await assert.rejects(buildApplicationRuntime({env,demo:true}),/DEMO_LOCAL_ONLY/);
  const app=await buildApplicationRuntime({env:{...base,ASK_BILL_ALLOW_LIVE_AI:'true',ASK_BILL_ALLOW_VOICE:'true',
    ASK_BILL_ALLOW_TRANSCRIPTION:'true',ASK_BILL_ALLOW_PUBLISHING:'true',ASK_BILL_ALLOW_OFFICIAL_IMPORTS:'true'},demo:true});
  try{
    assert.equal(app.config.providers.ai,false);assert.equal(app.config.providers.voice,false);assert.equal(app.config.publishing,false);
    const port=await listen(app.server),response=await fetch('http://127.0.0.1:'+port+'/api/capabilities');
    assert.deepEqual(await response.json(),{conversation:true,tts:false,stt:false,mode:'source',sessionMinutes:30});
  }finally{await app.close();await app.close();}
  assert.equal(app.server.listening,false);
});
test('actual --demo serves the reader, source-only answers and private session erasure, then terminates',async()=>{
  const port=await freePort(),{child,output}=startDemo(port,{ASK_BILL_ALLOW_LIVE_AI:'true',ASK_BILL_LLM_API_KEY:'fixture-canary-never-in-output'});
  const origin='http://127.0.0.1:'+port,pack=demoPack();
  try{
    const status=await started(child,output);assert.equal(status.mode,'synthetic-local-demo');assert.equal(status.ai,false);
    const health=await fetch(origin+'/health/ready');assert.equal(health.status,200);assert.equal((await health.json()).product,'ask-bill');
    const catalog=await fetch(origin+'/bills');assert.equal(catalog.status,200);assert.match(await catalog.text(),/synthetic, not a real bill/);
    const reader=await fetch(origin+'/bills/'+pack.billId+'/versions/'+pack.versionId);assert.equal(reader.status,200);assert.match(await reader.text(),/Section 3/);
    assert.equal((await fetch(origin+'/reader-client.mjs')).status,200);
    const sessionResponse=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({ageBand:'adult'})});
    assert.equal(sessionResponse.status,201);const session=await sessionResponse.json(),cookie=sessionResponse.headers.get('set-cookie').split(';')[0];
    const headers={Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':session.csrfToken};
    const answer=await fetch(origin+'/api/conversation',{method:'POST',headers,body:JSON.stringify({billId:pack.billId,versionId:pack.versionId,question:'reading room',conversationEpoch:1})});
    assert.equal(answer.status,200);const stream=await answer.text();assert.match(stream,/segment.validated/);assert.match(stream,/answer.completed/);
    assert.equal((await fetch(origin+'/api/session',{method:'DELETE',headers})).status,200);
    assert.equal((await fetch(origin+'/api/conversation',{method:'POST',headers,body:JSON.stringify({billId:pack.billId,versionId:pack.versionId,question:'reading room',conversationEpoch:2})})).status,401);
    assert.doesNotMatch(output.stdout+output.stderr,/fixture-canary-never-in-output/);assert.equal(output.stderr,'');
  }finally{await stop(child);}
  assert.equal(child.exitCode,0);assert.equal(child.signalCode,null);
});
test('demo production misuse and occupied listen ports exit safely with no configuration disclosure',async()=>{
  const listener=createServer(),port=await listen(listener);
  try{
    for(const extra of [{},{NODE_ENV:'production',ASK_BILL_LLM_API_KEY:'fixture-canary-secret'}]){
      const {child,output}=startDemo(port,extra);
      const timer=setTimeout(()=>child.kill('SIGKILL'),10000);timer.unref();
      try{await once(child,'exit');}finally{clearTimeout(timer);await stop(child);}
      assert.equal(child.exitCode,1);assert.equal(child.signalCode,null);assert.equal(output.stdout,'');
      assert.match(output.stderr,/Ask Bill startup failed/);assert.doesNotMatch(output.stderr,/fixture-canary-secret|postgresql:|Error:| at /);
    }
  }finally{await new Promise(resolve=>listener.close(resolve));}
});
