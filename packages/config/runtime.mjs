/** One server-only composition configuration. Never serialize this object to clients. */
import {isAbsolute} from 'node:path';
export class RuntimeConfigError extends Error {constructor(code){super(code);this.name='RuntimeConfigError';this.code=code;}}
const fail=code=>{throw new RuntimeConfigError(code);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const flag=(env,key,fallback=false)=>{if(env[key]!==undefined&&!['true','false'].includes(env[key]))fail('INVALID_'+key);return env[key]===undefined?fallback:env[key]==='true';};
const required=(env,key,max=4096)=>{const value=env[key];if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))fail('MISSING_'+key);return value;};
const optional=(env,key,fallback,max=4096)=>env[key]===undefined?fallback:required(env,key,max);
const integer=(env,key,fallback,min,max)=>{const input=env[key];if(input!==undefined&&(typeof input!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(input)))fail('INVALID_'+key);
  const value=input===undefined?fallback:Number(input);if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_'+key);return value;};
function httpsUrl(value,code,{originOnly=false}={}){let url;try{url=new URL(value);}catch{fail(code);}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(originOnly&&url.origin!==value))fail(code);return url;}
function list(env,key,fallback,maximum){
  if(env[key]===undefined)return Object.freeze([...fallback]);
  const values=required(env,key).split(',').map(value=>value.trim());
  if(values.length>maximum||values.some(value=>!value||value.length>200)||new Set(values).size!==values.length)fail('INVALID_'+key);
  return Object.freeze(values);
}
function storageConfig(env){
  const endpoint=required(env,'ASK_BILL_STORAGE_URL'),url=httpsUrl(endpoint,'INVALID_STORAGE_URL');
  if(url.pathname!=='/')fail('INVALID_STORAGE_URL');
  const bucket=required(env,'ASK_BILL_STORAGE_BUCKET',63),region=optional(env,'ASK_BILL_STORAGE_REGION','auto',40);
  const quarantineBucket=optional(env,'ASK_BILL_STORAGE_QUARANTINE_BUCKET',bucket,63),sourceBucket=optional(env,'ASK_BILL_STORAGE_SOURCE_BUCKET',bucket,63);
  if(!/^[-a-z0-9]{1,40}$/.test(region)||[bucket,quarantineBucket,sourceBucket].some(value=>
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)||value.includes('..')||/^\d+\.\d+\.\d+\.\d+$/.test(value)))fail('INVALID_STORAGE_CONFIGURATION');
  const accessKeyId=required(env,'ASK_BILL_STORAGE_ACCESS_KEY_ID',128),secretAccessKey=required(env,'ASK_BILL_STORAGE_SECRET_ACCESS_KEY');
  if(!/^[A-Za-z0-9]{8,128}$/.test(accessKeyId)||secretAccessKey.length<8||/[\u0000-\u0020\u007f]/.test(secretAccessKey))fail('INVALID_STORAGE_CREDENTIALS');
  const credentials=Object.freeze({accessKeyId,secretAccessKey,
    ...(env.ASK_BILL_STORAGE_SESSION_TOKEN===undefined?{}:{sessionToken:required(env,'ASK_BILL_STORAGE_SESSION_TOKEN',8192)})});
  return Object.freeze({endpoint,region,bucket,quarantineBucket,sourceBucket,credentials,pathStyle:flag(env,'ASK_BILL_STORAGE_PATH_STYLE',true)});
}
function congressKey(env,enabled){
  if(!enabled)return null;
  const key=required(env,'ASK_BILL_CONGRESS_API_KEY',256);if(key.length<8)fail('INVALID_CONGRESS_API_KEY');return key;
}
export function readApplicationConfig(env=process.env,{component='web'}={}){
  if(!['web','worker'].includes(component))fail('INVALID_APPLICATION_COMPONENT');
  const stage=env.ASK_BILL_STAGE??(env.NODE_ENV==='production'?'production':'development');if(!['development','test','staging','production'].includes(stage))fail('INVALID_STAGE');
  const hosted=stage==='production'||stage==='staging';
  if(env.NODE_ENV==='production'&&!hosted)fail('PRODUCTION_STAGE_REQUIRED');
  const requestedPublisher=required(env,'ASK_BILL_PUBLISHER_ID');if(!uuid.test(requestedPublisher))fail('INVALID_PUBLISHER_ID');
  const publisherId=requestedPublisher.toLowerCase();
  const databaseUrl=hosted||component==='worker'?required(env,'ASK_BILL_DATABASE_URL',8192):optional(env,'ASK_BILL_DATABASE_URL',null,8192);
  if(databaseUrl){let database;try{database=new URL(databaseUrl);}catch{fail('INVALID_DATABASE_URL');}
    if(!['postgres:','postgresql:'].includes(database.protocol)||!database.hostname||!database.username||!database.pathname.slice(1)||database.hash)fail('INVALID_DATABASE_URL');}
  const buildSha=env.RENDER_GIT_COMMIT??env.ASK_BILL_BUILD_SHA??'development';
  if(typeof buildSha!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(buildSha))fail('INVALID_BUILD_SHA');
  const officialImportsEnabled=flag(env,'ASK_BILL_ALLOW_OFFICIAL_IMPORTS');
  if(component==='worker'){
    // Extraction workers receive no OIDC, session, generation or speech credentials.
    return Object.freeze({component,stage,hosted,publisherId,databaseUrl,storage:storageConfig(env),officialImportsEnabled,
      congressApiKey:congressKey(env,officialImportsEnabled),buildSha});
  }
  const origin=env.ASK_BILL_PUBLIC_ORIGIN??(hosted?'':'http://127.0.0.1:4100');let parsed;
  try{parsed=new URL(origin);}catch{fail('MISSING_ASK_BILL_PUBLIC_ORIGIN');}
  if(parsed.origin!==origin||parsed.username||parsed.password||!['http:','https:'].includes(parsed.protocol)||
    (hosted&&parsed.protocol!=='https:')||(!hosted&&parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))fail('INVALID_PUBLIC_ORIGIN');
  const encryptionKey=hosted||databaseUrl?required(env,'ASK_BILL_SESSION_ENCRYPTION_KEY'):optional(env,'ASK_BILL_SESSION_ENCRYPTION_KEY',null);
  if(encryptionKey&&(!/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey)||Buffer.from(encryptionKey,'base64').length!==32||Buffer.from(encryptionKey,'base64').toString('base64')!==encryptionKey))fail('INVALID_SESSION_ENCRYPTION_KEY');
  const ai=flag(env,'ASK_BILL_ALLOW_LIVE_AI'),voice=flag(env,'ASK_BILL_ALLOW_VOICE'),stt=flag(env,'ASK_BILL_ALLOW_TRANSCRIPTION'),publishing=flag(env,'ASK_BILL_ALLOW_PUBLISHING');
  const dataProtectionVerified=env.ASK_BILL_PROVIDER_DATA_PROTECTION==='verified';
  if((ai||voice||stt)&&!dataProtectionVerified)fail('PROVIDER_DATA_PROTECTION_REQUIRED');
  const providers={ai,voice,stt,dataProtectionVerified};
  if(ai){providers.apiKey=required(env,'ASK_BILL_LLM_API_KEY');providers.model=required(env,'ASK_BILL_LLM_MODEL',150);providers.reviewModel=required(env,'ASK_BILL_REVIEW_MODEL',150);
    if(providers.model===providers.reviewModel)fail('INDEPENDENT_REVIEW_MODEL_REQUIRED');}
  if(voice){providers.ttsKey=required(env,'ASK_BILL_TTS_API_KEY');providers.ttsModel=optional(env,'ASK_BILL_TTS_MODEL','gpt-4o-mini-tts',150);providers.voiceId=optional(env,'ASK_BILL_VOICE_ID','alloy',150);
    if(env.ASK_BILL_VOICE_RIGHTS!=='verified')fail('VOICE_RIGHTS_REQUIRED');}
  if(stt){providers.sttKey=required(env,'ASK_BILL_STT_API_KEY');providers.sttModel=optional(env,'ASK_BILL_STT_MODEL','gpt-4o-mini-transcribe',150);}
  let storage=null,auth=null;
  if(publishing){
    if(parsed.protocol!=='https:')fail('PUBLISHER_HTTPS_REQUIRED');
    if(!databaseUrl||!encryptionKey)fail('DURABLE_PUBLISHER_DATABASE_REQUIRED');
    storage=storageConfig(env);
    const issuer=required(env,'ASK_BILL_OIDC_ISSUER');httpsUrl(issuer,'INVALID_OIDC_ISSUER');
    const clientSecret=optional(env,'ASK_BILL_OIDC_CLIENT_SECRET',null);
    const method=optional(env,'ASK_BILL_OIDC_TOKEN_ENDPOINT_AUTH_METHOD',clientSecret?'client_secret_basic':'none',30);
    if(!['none','client_secret_basic','client_secret_post'].includes(method)||(method!=='none'&&!clientSecret))fail('INVALID_OIDC_CLIENT_AUTH');
    const acceptedMfaAcr=env.ASK_BILL_OIDC_MFA_ACR===''?Object.freeze([]):list(env,'ASK_BILL_OIDC_MFA_ACR',[],12);
    const acceptedMfaAmr=list(env,'ASK_BILL_OIDC_MFA_AMR',['mfa'],12);
    const allowedEndpointOrigins=list(env,'ASK_BILL_OIDC_ALLOWED_ENDPOINT_ORIGINS',[new URL(issuer).origin],8);
    allowedEndpointOrigins.forEach(value=>httpsUrl(value,'INVALID_OIDC_ENDPOINT_ORIGIN',{originOnly:true}));
    auth=Object.freeze({issuer,clientId:required(env,'ASK_BILL_OIDC_CLIENT_ID'),...(clientSecret?{clientSecret}:{}),tokenEndpointAuthMethod:method,
      acceptedMfaAcr,acceptedMfaAmr,allowedEndpointOrigins,redirectUri:origin+'/admin/auth/callback',expectedOrigin:origin,publisherId});
  }
  if(officialImportsEnabled&&!publishing)fail('OFFICIAL_IMPORTS_REQUIRE_PUBLISHING');
  const congressApiKey=congressKey(env,officialImportsEnabled),ffmpegPath=optional(env,'ASK_BILL_FFMPEG_PATH','/usr/bin/ffmpeg',1024);
  if(!isAbsolute(ffmpegPath))fail('INVALID_FFMPEG_PATH');
  return Object.freeze({component,stage,hosted,origin,publisherId,databaseUrl,encryptionKey,providers:Object.freeze(providers),storage,auth,publishing,
    port:integer(env,'PORT',hosted?10000:4100,1,65535),maxInflight:integer(env,'ASK_BILL_MAX_GENERATIONS',25,1,50),
    maxPerSession:integer(env,'ASK_BILL_SESSION_REQUEST_LIMIT',60,1,1000),maxPerDay:integer(env,'ASK_BILL_DAILY_REQUEST_LIMIT',1000,1,100000),
    officialImportsEnabled,congressApiKey,ffmpegPath,buildSha});
}
