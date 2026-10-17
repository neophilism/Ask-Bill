/** Executable Ask Bill web application. Demo mode never opens a live provider. */
import {pathToFileURL} from 'node:url';
import {readApplicationConfig} from '../../../packages/config/runtime.mjs';
import {createApplicationPool} from '../../../packages/db/pool.mjs';
import {createActiveReleaseLookup} from '../../../packages/db/public-release.mjs';
import {createActiveCatalogLookup} from '../../../packages/db/public-catalog.mjs';
import {createMemorySessionStore} from '../../../packages/sessions/store.mjs';
import {createPgSessionStore} from '../../../packages/sessions/pg-store.mjs';
import {createOpenAIResponsesProvider,createOpenAIEntailmentReviewer,createOpenAISpeechProvider,createOpenAITranscriptionProvider} from '../../../packages/providers/index.mjs';
import {createRecordingNormalizer,withBoundedRecordings} from '../../../packages/voice/stt/normalize.mjs';
import {createS3PrivateStorage} from '../../../packages/storage/s3.mjs';
import {createOidcPublisherAuth} from '../../../packages/auth/oidc.mjs';
import {createPostgresAuthStore} from '../../../packages/auth/pg-store.mjs';
import {createCongressClient} from '../../../packages/content/connectors/congress/index.mjs';
import {createPublisherHandler} from '../admin/server/index.mjs';
import {createAskBillApplication} from './server.mjs';
import {demoPack,demoPublisherId} from './demo.mjs';

export async function buildApplicationRuntime({env=process.env,demo=false}={}){
  if(demo&&(env.NODE_ENV==='production'||env.ASK_BILL_STAGE&&!['development','test'].includes(env.ASK_BILL_STAGE)))throw Error('DEMO_LOCAL_ONLY');
  const config=readApplicationConfig(demo?{...env,ASK_BILL_PUBLISHER_ID:demoPublisherId,ASK_BILL_DATABASE_URL:undefined,
    ASK_BILL_ALLOW_LIVE_AI:'false',ASK_BILL_ALLOW_VOICE:'false',ASK_BILL_ALLOW_TRANSCRIPTION:'false',ASK_BILL_ALLOW_PUBLISHING:'false',ASK_BILL_ALLOW_OFFICIAL_IMPORTS:'false'}:env);
  if(!demo&&!config.databaseUrl)throw Error('DATABASE_REQUIRED_USE_EXPLICIT_DEMO');
  let pool,cleanupTimer;
  try{
    pool=config.databaseUrl?await createApplicationPool({connectionString:config.databaseUrl,hosted:config.hosted}):null;
    let lookupPublishedPack,lookupPublishedCatalog;
    if(demo){
      const pack=demoPack();
      lookupPublishedPack=async request=>request.publisherId===pack.publisherId&&request.billId===pack.billId&&request.versionId===pack.versionId?pack:null;
      lookupPublishedCatalog=async({publisherId,page=1})=>({items:publisherId===pack.publisherId&&page===1?[{...pack}]:[],hasNext:false});
    }else{
      lookupPublishedPack=createActiveReleaseLookup({pool,publisherId:config.publisherId});
      lookupPublishedCatalog=createActiveCatalogLookup({pool,publisherId:config.publisherId});
      const client=await pool.connect();
      try{
        await client.query('BEGIN READ ONLY');
        await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[config.publisherId]);
        const enrolled=await client.query('SELECT id FROM ask_bill.publishers WHERE id=$1',[config.publisherId]);
        if(enrolled.rows.length!==1)throw Error('PUBLISHER_NOT_BOOTSTRAPPED');
        // Queries deliberately require the deployment migrations before readiness.
        await client.query('SELECT id FROM ask_bill.anonymous_sessions LIMIT 0');
        await client.query('SELECT version_id FROM ask_bill.publisher_version_reviews LIMIT 0');
        await client.query('COMMIT');
      }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
    }
    const sessionOptions={publisherId:config.publisherId,maxPerSession:config.maxPerSession,maxPerDay:config.maxPerDay};
    const sessions=pool?createPgSessionStore({...sessionOptions,pool,encryptionKey:config.encryptionKey}):createMemorySessionStore({...sessionOptions,stage:config.stage});
    const common={enabled:true,dataProtectionVerified:config.providers.dataProtectionVerified};
    const provider=config.providers.ai?createOpenAIResponsesProvider({...common,apiKey:config.providers.apiKey,model:config.providers.model}):null;
    const reviewer=config.providers.ai?createOpenAIEntailmentReviewer({...common,apiKey:config.providers.apiKey,reviewModel:config.providers.reviewModel}):null;
    // Answer replay loses object identity; reauthorization comes from encrypted
    // session storage plus the API's fresh publication and exact-span checks.
    const speechSources=new WeakMap();
    const authorizeSpeechSegment=(segment,pack)=>speechSources.set(segment,pack);
    const speech=config.providers.voice?{async synthesize(request){
      const pack=speechSources.get(request.segment);speechSources.delete(request.segment);
      if(!pack||pack.versionId!==request.versionId)throw Error('SPEECH_SOURCE_REQUIRED');
      const adapter=createOpenAISpeechProvider({...common,apiKey:config.providers.ttsKey,model:config.providers.ttsModel,
        voice:config.providers.voiceId,voiceRightsVerified:true,
        authorizeSegment:({segment,versionId})=>segment===request.segment&&versionId===pack.versionId,
        lookupSource:({versionId,provisionId})=>versionId===pack.versionId?pack.provisions.find(section=>section.id===provisionId)?.text:null});
      return adapter.synthesize(request);
    }}:null;
    let transcription=null;
    if(config.providers.stt){
      const normalize=await createRecordingNormalizer({ffmpegPath:config.ffmpegPath});
      transcription=withBoundedRecordings(createOpenAITranscriptionProvider({...common,apiKey:config.providers.sttKey,model:config.providers.sttModel,maxSeconds:30}),normalize);
    }
    let publisherHandler=null;
    if(config.origin.startsWith('https://')){
      let auth,storage,repository;
      if(config.publishing){
        storage=createS3PrivateStorage({...config.storage,publisherId:config.publisherId});
        auth=createOidcPublisherAuth({...config.auth,store:createPostgresAuthStore({pool,publisherId:config.publisherId})});
        const {createPublisherWorkflow}=await import('../../../packages/db/publisher-workflow.mjs');
        const congressClient=config.officialImportsEnabled?createCongressClient({apiKey:config.congressApiKey}):undefined;
        repository=createPublisherWorkflow({pool,publisherId:config.publisherId,storage,congressClient});
      }
      publisherHandler=createPublisherHandler({auth,storage,repository,expectedOrigin:config.origin,publisherId:config.publisherId,
        officialImportsEnabled:config.officialImportsEnabled});
    }
    let closing=false;
    const readiness=async()=>{
      if(closing)return false;if(!pool)return true;
      try{await pool.query('SELECT 1');return true;}catch{return false;}
    };
    const server=await createAskBillApplication({...config,sessions,lookupPublishedPack,lookupPublishedCatalog,provider,reviewer,speech,transcription,
      authorizeSpeechSegment,publisherHandler,readiness});
    cleanupTimer=setInterval(()=>{sessions.cleanup().catch(()=>{});},60000);cleanupTimer.unref();
    return {server,config,async close(){
      if(closing)return;closing=true;clearInterval(cleanupTimer);server.beginReaderDrain();
      if(server.listening)await new Promise(resolve=>{
        const timeout=setTimeout(()=>{server.closeAllConnections();resolve();},25000);timeout.unref();
        server.close(()=>{clearTimeout(timeout);resolve();});server.closeIdleConnections();
      });
      await pool?.end();
    }};
  }catch(error){clearInterval(cleanupTimer);await pool?.end();throw error;}
}

async function main(){
  const args=process.argv.slice(2);if(args.some(arg=>arg!=='--demo')||args.length>1)throw Error('USAGE_START_OR_DEMO');
  const runtime=await buildApplicationRuntime({demo:args.includes('--demo')});
  try{await new Promise((resolve,reject)=>{runtime.server.once('error',reject);runtime.server.listen(runtime.config.port,args.includes('--demo')?'127.0.0.1':'0.0.0.0',resolve);});}
  catch(error){await runtime.close();throw error;}
  process.stdout.write(JSON.stringify({product:'ask-bill',status:'listening',stage:runtime.config.stage,port:runtime.config.port,
    mode:args.includes('--demo')?'synthetic-local-demo':'published-source',ai:runtime.config.providers.ai,voice:runtime.config.providers.voice,transcription:runtime.config.providers.stt})+'\n');
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>runtime.close().catch(()=>{process.exitCode=1;}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
  // Startup exceptions can contain connection details. Emit no raw error or env value.
  process.stderr.write('Ask Bill startup failed. Check server configuration, migrations and private service connections.\n');process.exitCode=1;
});
