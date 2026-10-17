/** Legacy fixture-preview settings. Hosted application wiring lives in ../runtime.mjs. */
import {ConfigError,createPublicSettings,type Stage,type PublicSettings} from './index.js';
export type Env = Readonly<Record<string,string|undefined>>;
export type ServerCapabilities = Readonly<{public:PublicSettings;databaseReady:boolean;storageReady:boolean;liveAiReady:false;voiceReady:false}>;
function enabled(v:string|undefined,name:string):boolean {
  if (v !== undefined && !['true','false'].includes(v))throw new ConfigError('INVALID_FLAG',`${name} must be true or false`);
  return v==='true';
}
function validConnection(value:string|undefined,kind:'database'|'storage',stage:Stage):boolean {
  if(!value)return false;
  if(value.length>4096)throw new ConfigError('CONNECTION_URL_INVALID',kind+' URL is too long');
  let parsed:URL;
  try {parsed=new URL(value);} catch {throw new ConfigError('CONNECTION_URL_INVALID',kind+' URL is malformed');}
  if(kind==='database' && !['postgres:','postgresql:'].includes(parsed.protocol))throw new ConfigError('DATABASE_SCHEME_INVALID','Expected a PostgreSQL URL');
  if(kind==='storage' && !['http:','https:'].includes(parsed.protocol))throw new ConfigError('STORAGE_SCHEME_INVALID','Storage origin must be HTTP(S)');
  if(kind==='storage' && (parsed.protocol!=='https:' && !(stage!=='production'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))))
    throw new ConfigError('STORAGE_TLS_REQUIRED','Storage must use HTTPS except on local loopback');
  return true;
}
/** Does not retain, return, log, or serialize any supplied secrets. */
export function validateServerSettings(env:Env,stage:Stage):ServerCapabilities {
  const base=createPublicSettings(stage,env.ASK_BILL_PUBLIC_ORIGIN);
  const requestsLive=enabled(env.ASK_BILL_ALLOW_LIVE_AI,'ASK_BILL_ALLOW_LIVE_AI');
  const requestsVoice=enabled(env.ASK_BILL_ALLOW_VOICE,'ASK_BILL_ALLOW_VOICE');
  if(requestsLive){
    if(!env.ASK_BILL_LLM_API_KEY)throw new ConfigError('LLM_CREDENTIAL_MISSING','Live AI requires a configured private API key');
    if(env.ASK_BILL_PROVIDER_DATA_PROTECTION!=='verified')throw new ConfigError('PROVIDER_DATA_PROTECTION_MISSING','Verify provider data retention/privacy before enabling live AI');
    throw new ConfigError('APPLICATION_RUNTIME_REQUIRED','Use the application runtime to enable real provider adapters; the fixture preview cannot activate them');
  }
  if(requestsVoice){
    if(!env.ASK_BILL_TTS_API_KEY)throw new ConfigError('VOICE_CREDENTIAL_MISSING','Live voice requires a configured private API key');
    throw new ConfigError('APPLICATION_RUNTIME_REQUIRED','Use the application runtime to enable real speech adapters; the fixture preview cannot activate them');
  }
  const config={public:base,databaseReady:validConnection(env.ASK_BILL_DATABASE_URL,'database',stage),storageReady:validConnection(env.ASK_BILL_STORAGE_URL,'storage',stage),liveAiReady:false as const,voiceReady:false as const};
  return Object.freeze(config);
}
