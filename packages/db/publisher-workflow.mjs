/** Durable publisher intake, immutable extraction revisions, review, and release activation. */
import {createHash,randomUUID} from 'node:crypto';
import {JobError} from '../jobs/index.mjs';
import {scanQuarantinedBytes} from '../content/intake/index.mjs';
import {congressBillIdentity} from '../content/connectors/congress/index.mjs';
import {createSourceCandidate,privateSourceObjectKey,recordSourceObjectQuery,
  findSourceObjectQuery,assertMatchingStoredObject,recordSourceEventQuery} from '../content/provenance/index.mjs';
import {buildSearchGeneration} from '../content/search/index.mjs';
import {planReviewedRelease} from '../content/releases/index.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/,MAX_BYTES=25*1024*1024,MAX_TEXT=1500000;
const MIME=new Set(['text/plain','text/markdown','application/xml','text/xml','application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const CANON='reader-canon-v1';
export const PUBLISHER_REVIEW_CHECKS=Object.freeze(['source_complete','extraction_verified','citations_exact',
  'exceptions_reviewed','index_complete','rights_verified']);
export class PublisherWorkflowError extends Error {
  constructor(code){super(code);this.name='PublisherWorkflowError';this.code=code;}
}
const fail=code=>{throw new PublisherWorkflowError(code);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const id=(value,code='INPUT_INVALID')=>typeof value==='string'&&UUID.test(value)?value.toLowerCase():fail(code);
const iso=value=>value instanceof Date?value.toISOString():new Date(value).toISOString();
const clean=(value,min,max)=>typeof value==='string'&&value.length>=min&&value.length<=max&&
  value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function objectReceipt(value,publisherId){
  if(!value||value.scope!=='private-source'||value.publisherId!==publisherId||
    !HEX.test(value.sha256??'')||value.key!==publisherId+'/sha256/'+value.sha256||
    !Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>MAX_BYTES||!MIME.has(value.mime)||
    value.objectStoredAndVerified!==true)fail('SOURCE_OBJECT_INVALID');
  return {scope:'private-source',publisherId,key:value.key,sha256:value.sha256,bytes:value.bytes,mime:value.mime,
    objectStoredAndVerified:true};
}
function extraction(value){
  if(!value||!clean(value.canonicalText,1,MAX_TEXT)||Buffer.byteLength(value.canonicalText)>MAX_TEXT||
    !/^[a-zA-Z0-9._-]{1,64}$/.test(value.parserVersion??'')||!Array.isArray(value.provisions)||
    value.provisions.length<1||value.provisions.length>500||!Array.isArray(value.warnings)||value.warnings.length>64)
    fail('EXTRACTION_OUTPUT_INVALID');
  const provisions=value.provisions.map(p=>{
    if(!p||!clean(p.text,1,150000)||!p.text.trim()||!clean(p.heading,1,180)||
      !p.originalLocator||typeof p.originalLocator!=='object'||Array.isArray(p.originalLocator)||
      Buffer.byteLength(JSON.stringify(p.originalLocator))>2048)fail('EXTRACTION_OUTPUT_INVALID');
    return {id:randomUUID(),heading:p.heading,text:p.text,originalLocator:JSON.parse(JSON.stringify(p.originalLocator))};
  });
  if(provisions.map(p=>p.text).join('\n\n')!==value.canonicalText||
    value.warnings.some(w=>typeof w!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(w)))fail('EXTRACTION_OUTPUT_INVALID');
  return {canonicalText:value.canonicalText,canonicalSha256:sha(value.canonicalText),parserVersion:value.parserVersion,
    provisions,warnings:[...value.warnings]};
}
function reviewChecks(value){
  if(!Array.isArray(value)||value.length!==6||new Set(value).size!==6||
    value.some(x=>!PUBLISHER_REVIEW_CHECKS.includes(x)))fail('REVIEW_INCOMPLETE');
  return [...PUBLISHER_REVIEW_CHECKS];
}
function actorInput(actor,publisherId,action){
  if(!actor||id(actor.publisherId,'PUBLISHER_FORBIDDEN')!==publisherId)fail('PUBLISHER_FORBIDDEN');
  id(actor.userId,'MEMBERSHIP_REVOKED');
  if(actor.freshMembershipVerified!==true||!['owner','editor','viewer'].includes(actor.role))fail('MEMBERSHIP_REVOKED');
  if(action!=='view'&&actor.action!==action)fail('ACTION_FORBIDDEN');
  if(action!=='view'&&!['owner','editor'].includes(actor.role)||action==='withdraw'&&actor.role!=='owner')fail('ACTION_FORBIDDEN');
  if(['publish','withdraw'].includes(action)&&actor.mfaVerifiedByTrustedServer!==true)fail('MFA_REQUIRED');
  return {...actor,publisherId,userId:actor.userId.toLowerCase()};
}
function errorCode(error){
  const value=error?.code;
  if(typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(value))return value;
  return 'SOURCE_IMPORT_FAILED';
}
const retryable=code=>/^(?:DATABASE_|STORAGE_UNAVAILABLE|SOURCE_NETWORK_|SOURCE_RATE_|LOCAL_RATE_|EXTRACTION_TIMEOUT|EXTRACTION_PROCESS_UNAVAILABLE|OBJECT_WRITE_CONFLICT)/.test(code);

export function createPublisherWorkflow({pool,publisherId,storage,congressClient,extractSource,
  fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
  const publisher=id(publisherId,'TRUSTED_DATABASE_CONFIGURATION_REQUIRED');
  if(!pool||typeof pool.connect!=='function'||typeof now!=='function'||typeof fetchImpl!=='function')
    fail('TRUSTED_DATABASE_CONFIGURATION_REQUIRED');
  const timestamp=()=>{const value=now();if(!Number.isSafeInteger(value)||value<0)fail('CLOCK_INVALID');return new Date(value).toISOString();};
  async function transaction(work){
    let client;
    try{
      client=await pool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[publisher]);
      const result=await work(client);
      await client.query('COMMIT');return result;
    }catch(error){
      if(client)try{await client.query('ROLLBACK');}catch{}
      if(error instanceof PublisherWorkflowError||error instanceof JobError)throw error;
      fail('DATABASE_OPERATION_FAILED');
    }finally{client?.release();}
  }
  async function membership(client,userId,roles){
    // Hold the membership row against concurrent revocation for this transaction.
    const result=await client.query('SELECT ask_bill.lock_publisher_membership($1::uuid,$2::uuid) AS role',[publisher,userId]);
    if(result.rows.length!==1||result.rows[0].role===null)fail('MEMBERSHIP_REVOKED');
    if(!roles.includes(result.rows[0].role))fail('ACTION_FORBIDDEN');
    return result.rows[0].role;
  }
  async function authorized(actor,action,work){
    const trusted=actorInput(actor,publisher,action);
    return transaction(async client=>{
      const role=await membership(client,trusted.userId,action==='view'?['owner','editor','viewer']:action==='withdraw'?['owner']:['owner','editor']);
      if(role!==trusted.role)fail('MEMBERSHIP_REVOKED');
      return work(client,trusted);
    });
  }
  async function audit(client,actor,action,target,detail={}){
    await client.query('INSERT INTO ask_bill.audit_events(publisher_id,actor_user_id,action,target_id,detail) VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5::jsonb)',
      [publisher,actor,action,target,JSON.stringify(detail)]);
  }
  async function billRow(client,billId,{lock=false}={}){
    const result=await client.query('SELECT id,publisher_id,title,jurisdiction FROM ask_bill.bills WHERE publisher_id=$1::uuid AND id=$2::uuid'+(lock?' FOR UPDATE':''),[publisher,billId]);
    if(result.rows.length!==1)fail('NOT_FOUND');return result.rows[0];
  }
  async function activeRelease(client,billId){
    const result=await client.query('SELECT release_id FROM ask_bill.release_active WHERE publisher_id=$1::uuid AND bill_id=$2::uuid',[publisher,billId]);
    return result.rows[0]?.release_id??null;
  }
  async function versionRow(client,billId,versionId,{lock=false}={}){
    const result=await client.query(`SELECT v.*,b.title,b.jurisdiction FROM ask_bill.bill_versions v
      JOIN ask_bill.bills b ON b.publisher_id=v.publisher_id AND b.id=v.bill_id
      WHERE v.publisher_id=$1::uuid AND v.bill_id=$2::uuid AND v.id=$3::uuid`+(lock?' FOR UPDATE OF v':''),[publisher,billId,versionId]);
    if(result.rows.length!==1)fail('NOT_FOUND');return result.rows[0];
  }
  async function sourceProvisions(client,version){
    const budget=(await client.query(`SELECT count(*)::integer AS count,COALESCE(sum(octet_length(canonical_text)),0)::bigint AS bytes
      FROM ask_bill.provisions WHERE publisher_id=$1::uuid AND version_id=$2::uuid`,[publisher,version.id])).rows[0];
    const size=Number(budget?.bytes),count=Number(budget?.count);
    if(!Number.isSafeInteger(size)||size<1||size+Math.max(0,count-1)*2>MAX_TEXT||!Number.isSafeInteger(count)||count<1||count>500)fail('SOURCE_INTEGRITY_FAILED');
    const rows=(await client.query(`SELECT id,heading,canonical_text,original_locator FROM ask_bill.provisions
      WHERE publisher_id=$1::uuid AND version_id=$2::uuid ORDER BY provision_path,id LIMIT 501`,[publisher,version.id])).rows;
    if(rows.length!==count||rows.some(p=>!clean(p.canonical_text,1,150000)||!UUID.test(p.id)||!clean(p.heading,1,180)))fail('SOURCE_INTEGRITY_FAILED');
    const canonicalText=rows.map(p=>p.canonical_text).join('\n\n');
    if(sha(canonicalText)!==version.canonical_text_sha256||Buffer.byteLength(canonicalText)>MAX_TEXT)fail('SOURCE_INTEGRITY_FAILED');
    return {canonicalText,provisions:rows.map(p=>({id:p.id,heading:p.heading,text:p.canonical_text,originalLocator:p.original_locator}))};
  }
  async function indexRow(client,versionId){
    return (await client.query(`SELECT g.id,g.status,g.source_sha256 FROM ask_bill.search_active a
      JOIN ask_bill.search_generations g ON g.publisher_id=a.publisher_id AND g.version_id=a.version_id AND g.id=a.generation_id
      WHERE a.publisher_id=$1::uuid AND a.version_id=$2::uuid`,[publisher,versionId])).rows[0]??null;
  }
  async function sourceObject(client,version){
    const result=await client.query(`SELECT o.id,o.sha256,o.byte_length,o.mime_type,o.storage_key,e.origin,e.source_url,e.retrieved_at
      FROM ask_bill.publisher_version_extractions x
      JOIN ask_bill.source_objects o ON o.publisher_id=x.publisher_id AND o.id=x.source_object_id
      JOIN ask_bill.source_import_events e ON e.publisher_id=x.publisher_id AND e.version_id=x.version_id AND e.source_object_id=x.source_object_id
      WHERE x.publisher_id=$1::uuid AND x.version_id=$2::uuid AND x.canonical_sha256=$3 AND o.sha256=$4 LIMIT 2`,
      [publisher,version.id,version.canonical_text_sha256,version.raw_byte_sha256]);
    if(result.rows.length!==1)fail('SOURCE_INTEGRITY_FAILED');return result.rows[0];
  }
  async function verifyStored(receipt){
    if(!storage||typeof storage.getPrivateSource!=='function')fail('SERVICE_NOT_CONFIGURED');
    let value;
    try{value=await storage.getPrivateSource({publisherId:publisher,sha256:receipt.sha256,key:receipt.key,size:receipt.bytes,maxBytes:receipt.bytes});}
    catch(error){throw new PublisherWorkflowError(errorCode(error));}
    if(!value||!(value.content instanceof Uint8Array)||value.content.byteLength!==receipt.bytes||value.sha256!==receipt.sha256||
      value.mime!==receipt.mime||sha(value.content)!==receipt.sha256)fail('SOURCE_INTEGRITY_FAILED');
    try{scanQuarantinedBytes(value.content,receipt.mime);}catch{fail('SOURCE_BYTES_REJECTED');}
    return Buffer.from(value.content);
  }
  async function persistIndex(client,versionId,canonicalSha256,provisions){
    const generation=buildSearchGeneration({publisherId:publisher,versionId,sourceHash:canonicalSha256,
      provisions:provisions.map(p=>({publisherId:publisher,versionId,provisionId:p.id,text:p.text,textSha256:sha(p.text)}))});
    const generationId=randomUUID();
    await client.query(`INSERT INTO ask_bill.search_generations(id,publisher_id,version_id,source_sha256,index_sha256,expected_entries,status)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,'building')`,[generationId,publisher,versionId,canonicalSha256,generation.generationHash,generation.entryCount]);
    await client.query(`INSERT INTO ask_bill.search_entries(publisher_id,version_id,generation_id,provision_id,canonical_text,text_sha256)
      SELECT $1::uuid,$2::uuid,$3::uuid,x.id,x.text,x.hash FROM jsonb_to_recordset($4::jsonb) AS x(id uuid,text text,hash text)`,
      [publisher,versionId,generationId,JSON.stringify(generation.entries.map(e=>({id:e.provisionId,text:e.text,hash:e.textSha256})))]);
    await client.query("UPDATE ask_bill.search_generations SET status='complete',completed_at=clock_timestamp() WHERE publisher_id=$1::uuid AND version_id=$2::uuid AND id=$3::uuid",[publisher,versionId,generationId]);
    const activated=await client.query('SELECT ask_bill.activate_search_generation($1::uuid,$2::uuid,$3::uuid,NULL) AS ok',[publisher,versionId,generationId]);
    if(activated.rows[0]?.ok!==true)fail('INDEX_ACTIVATION_CONFLICT');
    return generationId;
  }
  async function insertVersion(client,{billId,versionId,language,status='unknown',rawSha256,retrievedAt,parsed,sourceObjectId,previousVersionId=null}){
    await client.query(`INSERT INTO ask_bill.bill_versions(id,publisher_id,bill_id,language,status,raw_byte_sha256,canonical_text_sha256,
      canonicalization_version,source_complete,publication,retrieved_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,false,'private',$9::timestamptz)`,
      [versionId,publisher,billId,language,status,rawSha256,parsed.canonicalSha256,CANON,retrievedAt]);
    await client.query(`INSERT INTO ask_bill.provisions(id,publisher_id,version_id,provision_path,heading,canonical_text,original_locator)
      SELECT x.id,$1::uuid,$2::uuid,x.path,x.heading,x.text,x.locator FROM jsonb_to_recordset($3::jsonb)
      AS x(id uuid,path text,heading text,text text,locator jsonb)`,[publisher,versionId,JSON.stringify(parsed.provisions.map((p,i)=>
      ({id:p.id,path:String(i+1).padStart(6,'0'),heading:p.heading,text:p.text,locator:p.originalLocator})))]);
    await client.query(`INSERT INTO ask_bill.publisher_version_extractions(publisher_id,bill_id,version_id,source_object_id,
      canonical_text,canonical_sha256,parser_version,warnings,previous_version_id)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::jsonb,$9::uuid)`,
      [publisher,billId,versionId,sourceObjectId,parsed.canonicalText,parsed.canonicalSha256,parsed.parserVersion,JSON.stringify(parsed.warnings),previousVersionId]);
    await persistIndex(client,versionId,parsed.canonicalSha256,parsed.provisions);
  }
  async function enqueue(client,{billId,actor,kind,language,payload,dedupeKey}){
    await billRow(client,billId,{lock:kind==='upload'});
    if(kind==='upload'){
      const prior=(await client.query(`SELECT r.job_id,r.version_id,j.status FROM ask_bill.publisher_source_requests r
        JOIN ask_bill.jobs j ON j.publisher_id=r.publisher_id AND j.id=r.job_id
        WHERE r.publisher_id=$1::uuid AND r.bill_id=$2::uuid AND r.kind='upload' AND r.language=$3 AND r.payload=$4::jsonb
        ORDER BY r.created_at DESC,r.id DESC LIMIT 1`,[publisher,billId,language,JSON.stringify(payload)])).rows[0];
      if(prior&&prior.status!=='dead')return {jobId:prior.job_id,...(prior.version_id?{versionId:prior.version_id}:{})};
      // An explicitly repeated upload may recover a terminal infrastructure failure.
      // Keep the failed request/job and its original requester as immutable audit history.
      if(prior)dedupeKey='upload-retry:'+sha(dedupeKey+':'+randomUUID());
    }
    const jobId=(await client.query("SELECT ask_bill.enqueue_job($1::uuid,'source.import',$2) AS id",[publisher,dedupeKey])).rows[0]?.id;
    if(!UUID.test(jobId??''))fail('DATABASE_OPERATION_FAILED');
    const prior=await client.query('SELECT version_id,target_version_id FROM ask_bill.publisher_source_requests WHERE publisher_id=$1::uuid AND job_id=$2::uuid',[publisher,jobId]);
    if(prior.rows.length)return {jobId,...(prior.rows[0].version_id?{versionId:prior.rows[0].version_id}:{})};
    const requestId=randomUUID(),versionId=randomUUID();
    await client.query(`INSERT INTO ask_bill.publisher_source_requests(id,publisher_id,bill_id,job_id,requested_by,target_version_id,kind,language,payload)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,$9::jsonb)`,
      [requestId,publisher,billId,jobId,actor.userId,versionId,kind,language,JSON.stringify(payload)]);
    await audit(client,actor.userId,'source.import.requested',requestId,{billId,jobId,versionId,kind});
    return {jobId};
  }
  async function selectOfficial(identity,signal){
    if(!congressClient||typeof congressClient.textVersions!=='function'||!storage||typeof storage.putQuarantine!=='function'||
      typeof storage.promoteQuarantine!=='function')fail('SERVICE_NOT_CONFIGURED');
    let listing;
    try{listing=await congressClient.textVersions(identity);}catch(error){fail(errorCode(error));}
    if(signal.aborted)fail('SOURCE_IMPORT_CANCELLED');
    if(listing?.isOfficialMetadata!==true||listing.identity?.key!==identity.key||!Array.isArray(listing.versions)||
      listing.versions.length<1||listing.versions.length>4000)fail('OFFICIAL_SOURCE_RESPONSE_INVALID');
    const editions=[...listing.versions].filter(v=>typeof v.date==='string'&&Number.isFinite(Date.parse(v.date))&&
      clean(v.type,1,200)&&Array.isArray(v.formats)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||a.type.localeCompare(b.type,'en'));
    if(!editions.length)fail('OFFICIAL_SOURCE_UNAVAILABLE');
    const selected=editions[0],formats=[];
    for(const format of selected.formats){
      let url;try{url=new URL(format.url);}catch{continue;}
      if(url.protocol!=='https:'||url.hostname!=='www.congress.gov'||url.port||url.username||url.password||url.search||url.hash||
        !url.pathname.startsWith('/'+identity.congress+'/bills/'+identity.billType+identity.billNumber+'/')||
        !/^\/[a-zA-Z0-9/_.-]{1,1200}$/.test(url.pathname))continue;
      const suffix=url.pathname.split('.').at(-1).toLowerCase(),mime={xml:'application/xml',txt:'text/plain',pdf:'application/pdf'}[suffix];
      // The offline XML parser recognizes only the exact verified inert Congress
      // prolog pair; all unknown directives and entity declarations remain forbidden.
      if(mime)formats.push({url:url.href,mime,rank:{xml:0,txt:1,pdf:2}[suffix]});
    }
    formats.sort((a,b)=>a.rank-b.rank||a.url.localeCompare(b.url,'en'));
    if(!formats.length)fail('OFFICIAL_FORMAT_UNSUPPORTED');
    const format=formats[0],abort=new AbortController();
    let rejectDeadline,reader;
    const cancel=()=>{abort.abort();rejectDeadline?.(new PublisherWorkflowError('SOURCE_IMPORT_CANCELLED'));};
    signal.addEventListener('abort',cancel,{once:true});
    const deadline=new Promise((_,reject)=>{rejectDeadline=reject;});
    const timer=setTimeout(()=>{abort.abort();void reader?.cancel().catch(()=>{});rejectDeadline(new PublisherWorkflowError('SOURCE_NETWORK_TIMEOUT'));},30000);
    try{
      const transfer=(async()=>{
        let response;try{response=await fetchImpl(format.url,{method:'GET',redirect:'manual',
          headers:{Accept:format.mime,'Accept-Encoding':'identity','User-Agent':'Ask-Bill-source-import/1.0'},signal:abort.signal});}
        catch{fail(signal.aborted?'SOURCE_IMPORT_CANCELLED':'SOURCE_NETWORK_ERROR');}
        if(abort.signal.aborted){void response.body?.cancel().catch(()=>{});fail('SOURCE_IMPORT_CANCELLED');}
        if(response.status>=300&&response.status<400)fail('SOURCE_REDIRECT_BLOCKED');
        if(response.status!==200)fail(response.status===429||response.status===503?'SOURCE_RATE_LIMITED':'SOURCE_HTTP_ERROR');
        const length=response.headers.get('content-length');
        if(length!==null&&(!/^\d+$/.test(length)||Number(length)<1||Number(length)>MAX_BYTES))fail('SOURCE_RESPONSE_LIMIT');
        if(!response.body||typeof response.body.getReader!=='function')fail('SOURCE_RESPONSE_INVALID');
        reader=response.body.getReader();const chunks=[];let size=0;
        for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
          if(size>MAX_BYTES)fail('SOURCE_RESPONSE_LIMIT');chunks.push(Buffer.from(next.value));}
        const bytes=Buffer.concat(chunks,size);
        if(size<1||length!==null&&Number(length)!==size)fail('SOURCE_RESPONSE_INVALID');
        try{scanQuarantinedBytes(bytes,format.mime);}catch{fail('SOURCE_BYTES_REJECTED');}
        return bytes;
      })();
      const bytes=await Promise.race([transfer,deadline]);
      if(signal.aborted)fail('SOURCE_IMPORT_CANCELLED');
      const digest=sha(bytes),input={publisherId:publisher,sha256:digest,content:bytes,mime:format.mime};
      let receipt;
      try{await storage.putQuarantine(input);receipt=await storage.promoteQuarantine({publisherId:publisher,sha256:digest,mime:format.mime,size:bytes.length});}
      catch(error){fail(errorCode(error));}
      return {receipt:objectReceipt(receipt,publisher),bytes,sourceUrl:format.url,retrievedAt:timestamp(),
        metadata:{identity:{congress:identity.congress,billType:identity.billType,billNumber:identity.billNumber},editionType:selected.type,editionDate:selected.date,
          sourceUrl:format.url,legalStatus:'unknown'}};
    }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);abort.abort();void reader?.cancel().catch(()=>{});}
  }
  const importEvent=request=>({type:'source.imported',idempotencyKey:'source-imported-'+request.job_id,
    payload:{billId:request.bill_id,versionId:request.version_id??request.target_version_id,requestId:request.id}});
  async function leaseRequest(client,{jobId,workerId,fence},{lock=true}={}){
    const result=await client.query(`SELECT r.* FROM ask_bill.publisher_source_requests r JOIN ask_bill.jobs j
      ON j.publisher_id=r.publisher_id AND j.id=r.job_id WHERE r.publisher_id=$1::uuid AND r.job_id=$2::uuid
      AND j.kind='source.import' AND j.status='leased' AND j.lease_owner=$3::uuid AND j.fence=$4::bigint AND j.lease_until>clock_timestamp()`+
      (lock?' FOR UPDATE OF r,j':''),[publisher,jobId,workerId,fence]);
    if(result.rows.length!==1)throw new JobError('STALE_JOB_LEASE');
    return result.rows[0];
  }
  async function markImportFailure(scope,code){
    try{await transaction(async client=>{
      const current=await leaseRequest(client,scope);
      if(current.state!=='completed')await client.query("UPDATE ask_bill.publisher_source_requests SET state='failed',error_code=$3 WHERE publisher_id=$1::uuid AND id=$2::uuid",[publisher,current.id,code]);
    });}catch{}
  }

  return Object.freeze({
    async listBills({actor}={}){
      return authorized(actor,'view',async client=>{
        const rows=(await client.query(`SELECT b.id,b.title,b.jurisdiction,
          (SELECT count(*)::integer FROM ask_bill.bill_versions v WHERE v.publisher_id=b.publisher_id AND v.bill_id=b.id) AS version_count,
          p.version_id AS active_version_id FROM ask_bill.bills b
          LEFT JOIN ask_bill.release_active a ON a.publisher_id=b.publisher_id AND a.bill_id=b.id
          LEFT JOIN ask_bill.release_packs p ON p.publisher_id=a.publisher_id AND p.bill_id=a.bill_id AND p.id=a.release_id
          WHERE b.publisher_id=$1::uuid ORDER BY b.created_at DESC,b.id LIMIT 501`,[publisher])).rows;
        if(rows.length>500)fail('RESULT_LIMIT');
        return rows.map(r=>({id:r.id,publisherId:publisher,title:r.title,jurisdiction:r.jurisdiction,
          versionCount:r.version_count,activeVersionId:r.active_version_id??null}));
      });
    },
    async getBill({actor,billId}={}){
      billId=id(billId);
      return authorized(actor,'view',async client=>{
        const bill=await billRow(client,billId);
        const rows=(await client.query(`SELECT v.id,v.publication,v.source_complete,v.status,v.canonical_text_sha256,v.created_at,
          (SELECT g.status FROM ask_bill.search_active a JOIN ask_bill.search_generations g ON g.publisher_id=a.publisher_id
            AND g.version_id=a.version_id AND g.id=a.generation_id WHERE a.publisher_id=v.publisher_id AND a.version_id=v.id) AS index_status,
          (SELECT r.checks FROM ask_bill.publisher_version_reviews r WHERE r.publisher_id=v.publisher_id AND r.version_id=v.id
            AND r.canonical_sha256=v.canonical_text_sha256 ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS review_checks
          FROM ask_bill.bill_versions v WHERE v.publisher_id=$1::uuid AND v.bill_id=$2::uuid ORDER BY v.created_at DESC,v.id LIMIT 501`,[publisher,billId])).rows;
        if(rows.length>500)fail('RESULT_LIMIT');
        const requests=(await client.query(`SELECT r.id,r.job_id,r.kind,r.state,r.version_id,r.error_code,r.created_at,j.status AS job_status
          FROM ask_bill.publisher_source_requests r JOIN ask_bill.jobs j ON j.publisher_id=r.publisher_id AND j.id=r.job_id
          WHERE r.publisher_id=$1::uuid AND r.bill_id=$2::uuid ORDER BY r.created_at DESC,r.id LIMIT 100`,[publisher,billId])).rows;
        return {id:billId,publisherId:publisher,title:bill.title,jurisdiction:bill.jurisdiction,activeReleaseId:await activeRelease(client,billId),
          versions:rows.map(r=>({id:r.id,publication:r.publication,sourceComplete:r.source_complete,status:r.status,
            canonicalTextSha256:r.canonical_text_sha256,createdAt:iso(r.created_at),indexStatus:r.index_status??'missing',reviewChecks:r.review_checks??[],errors:[]})),
          imports:requests.map(r=>({id:r.id,jobId:r.job_id,kind:r.kind,state:r.state,jobStatus:r.job_status,versionId:r.version_id,
            errorCode:r.error_code,createdAt:iso(r.created_at)}))};
      });
    },
    async createBill({actor,title,jurisdiction}={}){
      if(!clean(title,1,300)||!title.trim()||!clean(jurisdiction,2,100)||jurisdiction.trim().length<2)fail('INPUT_INVALID');
      return authorized(actor,'upload',async(client,trusted)=>{
        const billId=randomUUID();await client.query('INSERT INTO ask_bill.bills(id,publisher_id,title,jurisdiction) VALUES($1::uuid,$2::uuid,$3,$4)',[billId,publisher,title.trim(),jurisdiction.trim()]);
        await audit(client,trusted.userId,'bill.created',billId);return {id:billId};
      });
    },
    async recordUpload({actor,billId,object,language='en'}={}){
      billId=id(billId);if(!['en','es'].includes(language))fail('INPUT_INVALID');const receipt=objectReceipt(object,publisher);
      if(!storage||typeof storage.getPrivateSource!=='function')fail('SERVICE_NOT_CONFIGURED');
      return authorized(actor,'upload',(client,trusted)=>enqueue(client,{billId,actor:trusted,kind:'upload',language,payload:receipt,
        dedupeKey:'upload:'+billId+':'+language+':'+receipt.sha256}));
    },
    async requestOfficialImport({actor,billId,identity}={}){
      billId=id(billId);let selected;try{selected=congressBillIdentity(identity);}catch{fail('INPUT_INVALID');}
      if(!congressClient||typeof congressClient.textVersions!=='function'||!storage||typeof storage.putQuarantine!=='function'||
        typeof storage.promoteQuarantine!=='function')fail('SERVICE_NOT_CONFIGURED');
      return authorized(actor,'upload',(client,trusted)=>enqueue(client,{billId,actor:trusted,kind:'congress',language:'en',payload:selected,
        dedupeKey:'congress:'+billId+':'+selected.key+':'+randomUUID()}));
    },
    async getVersion({actor,billId,versionId}={}){
      billId=id(billId);versionId=id(versionId);
      return authorized(actor,'view',async client=>{
        const version=await versionRow(client,billId,versionId),source=await sourceProvisions(client,version),index=await indexRow(client,versionId);
        const reviewed=(await client.query(`SELECT checks FROM ask_bill.publisher_version_reviews WHERE publisher_id=$1::uuid AND version_id=$2::uuid
          AND canonical_sha256=$3 ORDER BY created_at DESC,id DESC LIMIT 1`,[publisher,versionId,version.canonical_text_sha256])).rows[0];
        const parsed=(await client.query('SELECT warnings,previous_version_id FROM ask_bill.publisher_version_extractions WHERE publisher_id=$1::uuid AND version_id=$2::uuid',[publisher,versionId])).rows[0];
        return {id:versionId,publisherId:publisher,billId,title:version.title,publication:version.publication,sourceComplete:version.source_complete,
          status:version.status,rawByteSha256:version.raw_byte_sha256,canonicalTextSha256:version.canonical_text_sha256,canonicalText:source.canonicalText,
          provisions:source.provisions.map(({id,heading,text})=>({id,heading,text})),reviewChecks:reviewed?.checks??[],indexStatus:index?.status??'missing',
          activeReleaseId:await activeRelease(client,billId),warnings:parsed?.warnings??[],previousVersionId:parsed?.previous_version_id??null};
      });
    },
    async getOriginal({actor,billId,versionId}={}){
      billId=id(billId);versionId=id(versionId);
      return authorized(actor,'view',async client=>{
        const version=await versionRow(client,billId,versionId),original=await sourceObject(client,version);
        const content=await verifyStored({sha256:original.sha256,key:original.storage_key,bytes:Number(original.byte_length),mime:original.mime_type});
        return {publisherId:publisher,billId,versionId,content,mime:original.mime_type,sha256:original.sha256,bytes:content.byteLength};
      });
    },
    async reviewVersion({actor,billId,versionId,checks,expectedCanonicalSha256}={}){
      billId=id(billId);versionId=id(versionId);checks=reviewChecks(checks);
      if(!HEX.test(expectedCanonicalSha256??''))fail('INPUT_INVALID');
      return authorized(actor,'publish',async(client,trusted)=>{
        const version=await versionRow(client,billId,versionId,{lock:true});
        if(version.canonical_text_sha256!==expectedCanonicalSha256)fail('VERSION_CONFLICT');
        if(!['private','reviewed','published'].includes(version.publication))fail('PUBLICATION_NOT_READY');
        await sourceProvisions(client,version);await sourceObject(client,version);
        const index=await indexRow(client,versionId);
        if(index?.status!=='complete'||index.source_sha256!==expectedCanonicalSha256)fail('PUBLICATION_NOT_READY');
        const review={publisherId:publisher,versionId,reviewerId:trusted.userId,canonicalSha256:expectedCanonicalSha256,
          rawSha256:version.raw_byte_sha256,checks,reviewedAt:timestamp()},reviewSha256=sha(JSON.stringify(review));
        await client.query(`INSERT INTO ask_bill.publisher_version_reviews(publisher_id,version_id,reviewer_id,canonical_sha256,raw_sha256,checks,review_sha256)
          VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7) ON CONFLICT(publisher_id,version_id,review_sha256) DO NOTHING`,
          [publisher,versionId,trusted.userId,expectedCanonicalSha256,version.raw_byte_sha256,JSON.stringify(checks),reviewSha256]);
        await client.query(`UPDATE ask_bill.bill_versions SET source_complete=true,publication=CASE WHEN publication='published' THEN publication ELSE 'reviewed' END
          WHERE publisher_id=$1::uuid AND bill_id=$2::uuid AND id=$3::uuid`,[publisher,billId,versionId]);
        await audit(client,trusted.userId,'version.reviewed',versionId,{billId,reviewSha256,canonicalSha256:expectedCanonicalSha256,checks});
        return {reviewed:true,versionId,reviewSha256};
      });
    },
    async publishRelease({actor,billId,versionId,expectedReleaseId=null}={}){
      billId=id(billId);versionId=id(versionId);if(expectedReleaseId!==null)expectedReleaseId=id(expectedReleaseId);
      return authorized(actor,'publish',async(client,trusted)=>{
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2,0))",[publisher,billId]);
        const active=await activeRelease(client,billId);
        if(active!==expectedReleaseId)return {published:false,reason:'VERSION_CONFLICT',activeReleaseId:active};
        const version=await versionRow(client,billId,versionId,{lock:true});
        if(!version.source_complete||!['reviewed','published'].includes(version.publication)||version.canonicalization_version!==CANON)fail('SOURCE_NOT_REVIEWED');
        const source=await sourceProvisions(client,version),original=await sourceObject(client,version),index=await indexRow(client,versionId);
        const review=(await client.query(`SELECT * FROM ask_bill.publisher_version_reviews WHERE publisher_id=$1::uuid AND version_id=$2::uuid
          AND reviewer_id=$3::uuid AND canonical_sha256=$4 AND raw_sha256=$5 ORDER BY created_at DESC,id DESC LIMIT 1`,
          [publisher,versionId,trusted.userId,version.canonical_text_sha256,version.raw_byte_sha256])).rows[0];
        if(!review)fail('SOURCE_NOT_REVIEWED');
        if(index?.status!=='complete'||index.source_sha256!==version.canonical_text_sha256)fail('PUBLICATION_NOT_READY');
        await verifyStored({sha256:original.sha256,key:original.storage_key,bytes:Number(original.byte_length),mime:original.mime_type});
        const publishedAt=version.published_at?iso(version.published_at):timestamp();
        if(Date.parse(publishedAt)<Date.parse(version.retrieved_at))fail('CLOCK_INVALID');
        const pack={schema:'ask-bill-reader-v1',canonicalizationVersion:CANON,publisherId:publisher,billId,versionId,
          title:version.title,jurisdiction:version.jurisdiction,language:version.language,status:version.status,publication:'published',sourceComplete:true,
          retrievedAt:iso(version.retrieved_at),publishedAt,canonicalSha256:version.canonical_text_sha256,
          provisions:source.provisions.map(p=>({id:'s'+p.id.replace(/-/g,''),heading:p.heading,text:p.text,sha256:sha(p.text)}))};
        const bytes=Buffer.from(JSON.stringify(pack)),packSha256=sha(bytes);
        async function storePack(content,digest){
          await client.query(`INSERT INTO ask_bill.publisher_public_packs(publisher_id,version_id,sha256,pack_bytes) VALUES($1::uuid,$2::uuid,$3,$4)
            ON CONFLICT(publisher_id,version_id,sha256) DO NOTHING`,[publisher,versionId,digest,content]);
          const checked=(await client.query(`SELECT octet_length(pack_bytes) AS bytes,encode(sha256(pack_bytes),'hex') AS digest
            FROM ask_bill.publisher_public_packs WHERE publisher_id=$1::uuid AND version_id=$2::uuid AND sha256=$3`,[publisher,versionId,digest])).rows[0];
          if(checked?.bytes!==content.length||checked.digest!==digest)fail('PUBLICATION_NOT_READY');
        }
        await storePack(bytes,packSha256);
        const plan=planReviewedRelease({publisherId:publisher,
          version:{id:versionId,billId,publisherId:publisher,sourceComplete:true,publication:version.publication,
            rawByteSha256:version.raw_byte_sha256,canonicalTextSha256:version.canonical_text_sha256},
          provenance:{publisherId:publisher,versionId,originalByteSha256:original.sha256,objectStoredAndVerified:true,sourceObjectId:original.id},
          index:{publisherId:publisher,versionId,id:index.id,status:index.status,sourceSha256:index.source_sha256,activated:true},
          review:{publisherId:publisher,versionId,reviewerId:trusted.userId,reviewSha256:review.review_sha256,checks:reviewChecks(review.checks),mfaVerifiedByTrustedServer:true},
          assets:{scope:'public-packs',publisherId:publisher,versionId,manifestSha256:packSha256,stagedAndHashVerified:true,objects:[{sha256:packSha256,bytes:bytes.length}]}});
        await storePack(Buffer.from(JSON.stringify(plan.manifest)),plan.releaseHash);
        const releaseId=randomUUID();
        await client.query(`INSERT INTO ask_bill.release_packs(id,publisher_id,bill_id,version_id,generation_id,original_sha256,canonical_sha256,manifest_sha256,review_sha256,reviewed_by)
          VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9,$10::uuid)`,
          [releaseId,publisher,billId,versionId,index.id,original.sha256,version.canonical_text_sha256,plan.releaseHash,review.review_sha256,trusted.userId]);
        await client.query('UPDATE ask_bill.bill_versions SET published_at=COALESCE(published_at,$4::timestamptz) WHERE publisher_id=$1::uuid AND bill_id=$2::uuid AND id=$3::uuid',[publisher,billId,versionId,publishedAt]);
        const result=await client.query('SELECT ask_bill.activate_reviewed_release($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) AS ok',[publisher,billId,releaseId,expectedReleaseId,trusted.userId]);
        if(result.rows[0]?.ok!==true)fail('PUBLICATION_NOT_READY');
        await audit(client,trusted.userId,'release.activated',releaseId,{billId,versionId,manifestSha256:plan.releaseHash,packSha256});
        return {published:true,releaseId,versionId,manifestSha256:plan.releaseHash,packSha256};
      });
    },
    async withdrawRelease({actor,billId,releaseId}={}){
      billId=id(billId);releaseId=id(releaseId);
      return authorized(actor,'withdraw',async(client,trusted)=>{
        await billRow(client,billId);
        const result=await client.query('SELECT ask_bill.withdraw_reviewed_release($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS ok',[publisher,billId,releaseId,trusted.userId]);
        if(result.rows[0]?.ok!==true)return {withdrawn:false,reason:'VERSION_CONFLICT'};
        await audit(client,trusted.userId,'release.withdrawn',releaseId,{billId});return {withdrawn:true,releaseId};
      });
    },
    async saveCorrection({actor,billId,proposal}={}){
      billId=id(billId);
      if(!proposal||proposal.status!=='private_unreviewed_correction'||proposal.publicationAllowed!==false||proposal.previousVersionUnchanged!==true||
        !proposal.newVersion||!proposal.audit)fail('CORRECTION_INVALID');
      const next=proposal.newVersion,change=proposal.audit,oldVersionId=id(change.oldVersionId),versionId=id(next.id);
      if(oldVersionId===versionId||next.publisherId!==publisher||next.billId!==billId||next.previousVersionId!==oldVersionId||
        next.publication!=='private'||next.sourceComplete!==false||next.correctionRequiresIndependentReview!==true||
        !clean(next.canonicalText,1,MAX_TEXT)||Buffer.byteLength(next.canonicalText)>MAX_TEXT||sha(next.canonicalText)!==next.canonicalSha256||
        change.publisherId!==publisher||change.billId!==billId||change.newVersionId!==versionId||change.publiclyVisible!==false||
        change.eventType!=='extraction.correction.proposed')fail('CORRECTION_INVALID');
      return authorized(actor,'publish',async(client,trusted)=>{
        const old=await versionRow(client,billId,oldVersionId),source=await sourceProvisions(client,old),original=await sourceObject(client,old);
        if(change.actorId!==trusted.userId||change.oldCanonicalSha256!==old.canonical_text_sha256||change.sourceRawSha256!==old.raw_byte_sha256||
          change.newCanonicalSha256!==next.canonicalSha256||next.rawByteSha256!==old.raw_byte_sha256||next.legalStatus!==old.status)fail('CORRECTION_INVALID');
        const {start,end}=change.changedRange??{},points=Array.from(source.canonicalText),updated=Array.from(next.canonicalText);
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>points.length||end-start>20000)fail('CORRECTION_INVALID');
        const replacementLength=updated.length-(points.length-(end-start));
        if(replacementLength<1||replacementLength>20000||updated.slice(0,start).join('')!==points.slice(0,start).join('')||
          updated.slice(start+replacementLength).join('')!==points.slice(end).join(''))fail('CORRECTION_INVALID');
        const replacement=updated.slice(start,start+replacementLength).join('');
        if(sha(replacement)!==change.newSpanSha256||sha(points.slice(start,end).join(''))!==change.previousSpanSha256||
          next.canonicalSha256===old.canonical_text_sha256)fail('CORRECTION_INVALID');
        let offset=0,changed=false;
        const provisions=source.provisions.map(p=>{
          const length=Array.from(p.text).length;let text=p.text;
          if(p.id===change.provisionId){
            if(start<offset||end>offset+length)fail('CORRECTION_INVALID');
            const cp=Array.from(p.text);text=cp.slice(0,start-offset).join('')+replacement+cp.slice(end-offset).join('');changed=true;
          }
          offset+=length+2;
          return {heading:p.heading,text,originalLocator:{previousProvisionId:p.id,extractionCorrection:true}};
        });
        if(!changed)fail('CORRECTION_INVALID');
        const parsed=extraction({canonicalText:next.canonicalText,parserVersion:'publisher-correction-v1',provisions,warnings:['independent_review_required']});
        await insertVersion(client,{billId,versionId,language:old.language,status:old.status,rawSha256:old.raw_byte_sha256,
          retrievedAt:iso(old.retrieved_at),parsed,sourceObjectId:original.id,previousVersionId:oldVersionId});
        await client.query(`INSERT INTO ask_bill.source_import_events(publisher_id,bill_id,version_id,source_object_id,origin,source_url,retrieved_at,canonicalization_version)
          SELECT publisher_id,bill_id,$3::uuid,source_object_id,origin,source_url,retrieved_at,$4 FROM ask_bill.source_import_events
          WHERE publisher_id=$1::uuid AND version_id=$2::uuid`,[publisher,oldVersionId,versionId,CANON]);
        await audit(client,trusted.userId,'extraction.correction.proposed',versionId,{billId,oldVersionId,newVersionId:versionId,
          oldCanonicalSha256:old.canonical_text_sha256,newCanonicalSha256:parsed.canonicalSha256,sourceRawSha256:old.raw_byte_sha256,
          provisionId:change.provisionId,previousSpanSha256:change.previousSpanSha256,newSpanSha256:change.newSpanSha256,changedRange:{start,end},publiclyVisible:false});
        return {versionId};
      });
    },
    async handleImportJob({jobId,kind,fence,workerId,heartbeat,signal}={}){
      jobId=id(jobId);workerId=id(workerId);
      if(kind!=='source.import'||!Number.isSafeInteger(fence)||fence<1||heartbeat!==undefined&&typeof heartbeat!=='function'||
        signal!==undefined&&!(signal instanceof AbortSignal))throw new JobError('SOURCE_JOB_INVALID');
      if(typeof extractSource!=='function')throw new JobError('SERVICE_NOT_CONFIGURED');
      const scope={jobId,workerId,fence};
      let request;
      try{request=await transaction(async client=>{
          const request=await leaseRequest(client,scope);
          if(request.state==='completed')return request;
          await membership(client,request.requested_by,['owner','editor']);
          await client.query("UPDATE ask_bill.publisher_source_requests SET state='processing',error_code=NULL WHERE publisher_id=$1::uuid AND id=$2::uuid",[publisher,request.id]);
          return request;
        });
      }catch(error){
        const code=errorCode(error);await markImportFailure(scope,code);
        throw error instanceof JobError?error:new JobError(code,retryable(code));
      }
      if(request.state==='completed')return importEvent(request);
      const abort=new AbortController();let lostLease=false,beating=false;
      const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
      const pulse=async()=>{
        if(!heartbeat||beating)return;beating=true;
        try{if(await heartbeat()!==true){lostLease=true;abort.abort();}}catch{lostLease=true;abort.abort();}finally{beating=false;}
      };
      const timer=heartbeat?setInterval(()=>{void pulse();},10000):null;timer?.unref();
      try{
        await pulse();if(abort.signal.aborted)throw new JobError(lostLease?'STALE_JOB_LEASE':'SOURCE_IMPORT_CANCELLED',!lostLease);
        let receipt,bytes,sourceUrl=null,retrievedAt=timestamp(),metadata={};
        if(request.kind==='upload'){
          receipt=objectReceipt(request.payload,publisher);bytes=await verifyStored(receipt);
        }else if(request.kind==='congress'){
          const selected=await selectOfficial(congressBillIdentity(request.payload),abort.signal);
          ({receipt,bytes,sourceUrl,retrievedAt,metadata}=selected);
          // The storage adapter verifies the promoted object, and persistence independently pins its digest.
          if(sha(bytes)!==receipt.sha256)fail('SOURCE_INTEGRITY_FAILED');
        }else throw new JobError('SOURCE_JOB_INVALID');
        if(abort.signal.aborted)throw new JobError(lostLease?'STALE_JOB_LEASE':'SOURCE_IMPORT_CANCELLED',!lostLease);
        let output;try{output=await extractSource({bytes,mime:receipt.mime,versionId:request.target_version_id,signal:abort.signal});}
        catch(error){
          if(abort.signal.aborted)throw new JobError(lostLease?'STALE_JOB_LEASE':'SOURCE_IMPORT_CANCELLED',!lostLease);
          throw new JobError(errorCode(error),retryable(errorCode(error)));
        }
        const parsed=extraction(output);
        const candidate=createSourceCandidate({publisherId:publisher,billId:request.bill_id,versionId:request.target_version_id,
          origin:request.kind==='upload'?'publisher-upload':'official',rawBytes:bytes,mime:receipt.mime,sourceUrl,retrievedAt,canonicalizationVersion:CANON});
        return await transaction(async client=>{
          const current=await leaseRequest(client,scope);
          if(current.state==='completed')return importEvent(current);
          await membership(client,current.requested_by,['owner','editor']);
          if(abort.signal.aborted)throw new JobError(lostLease?'STALE_JOB_LEASE':'SOURCE_IMPORT_CANCELLED',!lostLease);
          const key=privateSourceObjectKey(candidate),insert=recordSourceObjectQuery(candidate,key);
          await client.query(insert.sql,insert.params);
          const find=findSourceObjectQuery(candidate),stored=(await client.query(find.sql,find.params)).rows;
          if(stored.length!==1)fail('SOURCE_INTEGRITY_FAILED');
          assertMatchingStoredObject(candidate,key,{...stored[0],byte_length:Number(stored[0].byte_length)});
          await insertVersion(client,{billId:current.bill_id,versionId:current.target_version_id,language:current.language,
            rawSha256:candidate.sha256,retrievedAt,parsed,sourceObjectId:stored[0].id});
          const provenance=recordSourceEventQuery(candidate,stored[0].id);await client.query(provenance.sql,provenance.params);
          await client.query(`UPDATE ask_bill.publisher_source_requests SET state='completed',version_id=target_version_id,
            completed_at=clock_timestamp(),source_metadata=$3::jsonb,error_code=NULL WHERE publisher_id=$1::uuid AND id=$2::uuid`,[publisher,current.id,JSON.stringify(metadata)]);
          await audit(client,current.requested_by,'source.import.completed',current.target_version_id,{billId:current.bill_id,jobId,
            rawSha256:candidate.sha256,canonicalSha256:parsed.canonicalSha256,provisionCount:parsed.provisions.length,publication:'private'});
          return importEvent(current);
        });
      }catch(error){
        const code=lostLease?'STALE_JOB_LEASE':errorCode(error);
        await markImportFailure(scope,code);
        throw error instanceof JobError?error:new JobError(code,retryable(code));
      }finally{if(timer)clearInterval(timer);signal?.removeEventListener('abort',cancel);abort.abort();}
    }
  });
}
