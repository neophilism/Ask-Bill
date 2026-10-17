/** Ask Bill readiness and liveness: no secrets, no network or external side effects. */
const STAGES=new Set(['local','staging','production']);
const NAMES=['database','objectStorage','publisherIdentity','jobQueue'];
const SHA=/^(?:dev|unknown|[a-f0-9]{7,40})$/;
export class HealthConfigError extends Error {
 constructor(code){super(code);this.name='HealthConfigError';this.code=code;}
}
const fail=code=>{throw new HealthConfigError(code)};
const simple=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
export function createHealthMonitor({stage='local',buildSha='dev',schemaVersion=0,expectedSchemaVersion=0,probes={},timeoutMs=300}={}){
 if(!STAGES.has(stage))fail('INVALID_STAGE');
 if(typeof buildSha!=='string'||!SHA.test(buildSha))fail('INVALID_BUILD_SHA');
 if(!Number.isSafeInteger(schemaVersion)||schemaVersion<0||!Number.isSafeInteger(expectedSchemaVersion)||expectedSchemaVersion<0)fail('INVALID_SCHEMA_VERSION');
 if(!Number.isInteger(timeoutMs)||timeoutMs<20||timeoutMs>5000)fail('INVALID_HEALTH_TIMEOUT');
 if(!simple(probes)||Object.keys(probes).some(name=>!NAMES.includes(name)||typeof probes[name]!=='function'))fail('INVALID_PROBE_CONFIG');
 let draining=false;
 const version=Object.freeze({buildSha,schemaVersion});
 function liveness(){return Object.freeze({product:'ask-bill',stage,status:'alive',draining,version});}
 async function check(name){
  if(typeof probes[name]!=='function')return 'missing';
  let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve('timeout'),timeoutMs);});
  try{
   const result=await Promise.race([Promise.resolve().then(()=>probes[name]()).then(v=>v===true?'ok':'unavailable',()=> 'unavailable'),timeout]);
   return result;
  }finally{clearTimeout(timer);}
 }
 async function readiness(){
  const required=stage==='local'?[]:NAMES;
  const dependencies={};
  for(const name of required){dependencies[name]=await check(name);}
  const ready=!draining && schemaVersion===expectedSchemaVersion && required.every(name=>dependencies[name]==='ok');
  return Object.freeze({product:'ask-bill',stage,status:ready?'ready':'not_ready',productionCapable:stage!=='local'&&ready,scope:stage==='local'?'offline-preview-only':'provider-gated',draining,version,dependencies:Object.freeze(dependencies)});
 }
 function beginDrain(){draining=true;}
 return Object.freeze({liveness,readiness,beginDrain});
}
export async function healthHttpResponse(monitor,{method='GET',pathname='/health/ready'}={}){
 if(method!=='GET'&&method!=='HEAD')return {status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'},body:'Method not allowed'};
 if(pathname!=='/health/live'&&pathname!=='/health/ready')return {status:404,headers:{'Cache-Control':'no-store'},body:'Not found'};
 const data=pathname==='/health/live'?monitor.liveness():await monitor.readiness();
 const status=pathname==='/health/live'?200:(data.status==='ready'?200:503);
 return {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===503?{'Retry-After':'10'}:{})},body:method==='HEAD'?'':JSON.stringify(data)};
}
