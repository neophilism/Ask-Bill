/** Executable source-import worker. No loop, credentials, or database connection starts on import. */
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {readApplicationConfig} from '../../packages/config/runtime.mjs';
import {createApplicationPool} from '../../packages/db/pool.mjs';
import {createPublisherWorkflow} from '../../packages/db/publisher-workflow.mjs';
import {createPublisherSourceExtractor,probePublisherSourceSandbox} from '../../packages/db/publisher-source-extraction.mjs';
import {createS3PrivateStorage} from '../../packages/storage/s3.mjs';
import {createCongressClient} from '../../packages/content/connectors/congress/index.mjs';
import {createPgJobStore} from '../../packages/jobs/pg-store.mjs';
import {JobError} from '../../packages/jobs/index.mjs';
import {composeAskBillWorkers} from './jobs.mjs';
import {createWorkerDrainController} from './drain.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fixedError=error=>typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)?error.code:'WORKER_OPERATION_FAILED';
const fail=code=>{throw new JobError(code);};
const integer=(env,key,fallback,min,max)=>{const n=env[key]===undefined?fallback:Number(env[key]);
  if(!Number.isSafeInteger(n)||n<min||n>max)fail('WORKER_CONFIGURATION_INVALID');return n;};

export async function createWorkerApplication({env=process.env,pool:providedPool,storage:providedStorage,
  extractSource:providedExtractor,congressClient:providedCongress,deliver,onStatus}={}){
  const config=readApplicationConfig(env,{component:'worker'});
  const workerId=env.ASK_BILL_WORKER_ID??randomUUID();
  if(!UUID.test(workerId)||deliver!==undefined&&typeof deliver!=='function'||onStatus!==undefined&&typeof onStatus!=='function')fail('WORKER_CONFIGURATION_INVALID');
  const pollMs=integer(env,'ASK_BILL_WORKER_POLL_MS',1000,100,30000);
  const leaseSeconds=integer(env,'ASK_BILL_WORKER_LEASE_SECONDS',120,30,900);
  const timeoutMs=integer(env,'ASK_BILL_SOURCE_EXTRACTION_TIMEOUT_MS',120000,1000,300000);
  const uncontained=env.ASK_BILL_ALLOW_UNCONTAINED_SOURCE_TESTS==='true';
  if(env.ASK_BILL_ALLOW_UNCONTAINED_SOURCE_TESTS!==undefined&&!['true','false'].includes(env.ASK_BILL_ALLOW_UNCONTAINED_SOURCE_TESTS))fail('WORKER_CONFIGURATION_INVALID');
  if(uncontained&&config.hosted)fail('PARSER_SANDBOX_REQUIRED');
  let sandboxArgs=[];
  if(env.ASK_BILL_SOURCE_SANDBOX_ARGS!==undefined){try{sandboxArgs=JSON.parse(env.ASK_BILL_SOURCE_SANDBOX_ARGS);}catch{fail('WORKER_CONFIGURATION_INVALID');}}
  if(!Array.isArray(sandboxArgs)||sandboxArgs.length>30||sandboxArgs.some(x=>typeof x!=='string'||x.length>2000||x.includes('\0')))fail('WORKER_CONFIGURATION_INVALID');
  let containment='uncontained-test-only',extractSource=providedExtractor;
  if(providedExtractor!==undefined&&typeof providedExtractor!=='function')fail('WORKER_CONFIGURATION_INVALID');
  if(!uncontained&&!(providedExtractor&&config.stage==='test')){
    if(env.ASK_BILL_SOURCE_SANDBOX_VERIFIED!=='verified'||!env.ASK_BILL_SOURCE_SANDBOX_COMMAND)fail('PARSER_SANDBOX_REQUIRED');
    await probePublisherSourceSandbox({sandboxCommand:env.ASK_BILL_SOURCE_SANDBOX_COMMAND,sandboxArgs});
    containment='os-boundary-probe-passed';
    extractSource??=createPublisherSourceExtractor({sandboxCommand:env.ASK_BILL_SOURCE_SANDBOX_COMMAND,sandboxArgs,sandboxVerified:true,timeoutMs});
  }else{
    extractSource??=createPublisherSourceExtractor({allowUncontainedForTests:true,timeoutMs});
  }
  const storage=providedStorage??createS3PrivateStorage({...config.storage,publisherId:config.publisherId});
  const congressClient=config.officialImportsEnabled?(providedCongress??createCongressClient({apiKey:config.congressApiKey})):undefined;
  const pool=providedPool??await createApplicationPool({connectionString:config.databaseUrl,hosted:config.hosted,max:4});
  const ownedPool=!providedPool,abort=new AbortController(),drain=createWorkerDrainController();
  let running=false,inFlight=false,closed=false,loop=null,stopPromise=null,lastReap=0;
  const workflow=createPublisherWorkflow({pool,publisherId:config.publisherId,storage,congressClient,extractSource});
  const store=createPgJobStore({pool,trustedPublisherId:config.publisherId});
  const workers=composeAskBillWorkers({pool,trustedPublisherId:config.publisherId,workerId,leaseSeconds,
    handleJob:job=>{
      if(job.kind!=='source.import')throw new JobError('UNSUPPORTED_JOB_KIND');
      return workflow.handleImportJob({...job,workerId,signal:abort.signal});
    },deliver:deliver??(async()=>{throw new JobError('OUTBOX_SINK_NOT_CONFIGURED',true);})});
  async function runOnce(){
    if(closed||drain.state().draining)return {status:'draining'};
    if(inFlight)throw new JobError('WORKER_ALREADY_RUNNING');
    inFlight=true;
    try{return await drain.run(async()=>{
      if(Date.now()-lastReap>=30000){
        await store.reapExpiredJobs({publisherId:config.publisherId});
        if(deliver)await store.reapExpiredOutbox({publisherId:config.publisherId});
        lastReap=Date.now();
      }
      const job=await workers.jobs.runOnce();
      // Source/public routes read the current database release directly. Pending outbox records
      // stay durable until a trusted idempotent sink is explicitly configured.
      const outbox=deliver?await workers.outbox.runOnce():null;
      const result={status:job.status,...(job.errorCode?{errorCode:job.errorCode}:{}),outboxStatus:outbox?.status??'not-configured'};
      if(onStatus&&result.status!=='idle')await onStatus(Object.freeze({...result}));
      return result;
    });}finally{inFlight=false;}
  }
  function run(){
    if(closed||drain.state().draining)throw new JobError('WORKER_DRAINING');
    if(running)return loop;
    running=true;
    loop=(async()=>{
      while(!drain.state().draining){
        let result;
        try{result=await runOnce();}catch(error){
          if(onStatus)await onStatus({status:'retry',errorCode:fixedError(error),outboxStatus:'not-run'});
          result={status:'retry'};
        }
        if(drain.state().draining)break;
        if(result.status==='idle'||result.status==='retry')try{await delay(pollMs,undefined,{signal:abort.signal});}catch{}
      }
    })().finally(()=>{running=false;});
    return loop;
  }
  function stop({timeoutMs=20000}={}){
    if(stopPromise)return stopPromise;
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw new JobError('WORKER_CONFIGURATION_INVALID');
    drain.beginDrain();abort.abort();
    stopPromise=(async()=>{
      const drained=await drain.waitForDrain({timeoutMs});
      if(drained&&loop)await loop;
      if(drained&&ownedPool)await pool.end();
      closed=drained;
      return {drained};
    })();
    return stopPromise;
  }
  return Object.freeze({run,runOnce,stop,workflow,readiness:Object.freeze({publisherId:config.publisherId,workerId,
    containment,concurrency:1,pollMs,leaseSeconds,officialImportsEnabled:config.officialImportsEnabled,outboxConfigured:Boolean(deliver)})});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--help'){
    console.log('Ask Bill source worker: configure ASK_BILL_PUBLISHER_ID, ASK_BILL_DATABASE_URL, private S3 storage, and a verified source sandbox; then run node apps/worker/application.mjs. One fenced source job runs per process.');
  }else{
    let application;
    try{
      application=await createWorkerApplication({onStatus:status=>console.log(JSON.stringify({component:'ask-bill-source-worker',...status}))});
      const shutdown=()=>{void application.stop().then(({drained})=>{if(!drained)process.exitCode=1;});};
      process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
      console.log(JSON.stringify({component:'ask-bill-source-worker',status:'ready',containment:application.readiness.containment,
        concurrency:application.readiness.concurrency,outboxConfigured:application.readiness.outboxConfigured}));
      await application.run();await application.stop();
      process.removeListener('SIGTERM',shutdown);process.removeListener('SIGINT',shutdown);
    }catch(error){
      console.error('Ask Bill worker stopped: '+fixedError(error));process.exitCode=1;
      if(application)await application.stop();
    }
  }
}
