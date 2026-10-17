/** AB-028: private quarantine ingestion never directly publishes legislative bytes. */
import {createHash} from 'node:crypto';
import {JobError} from '../../jobs/index.mjs';
import {scanQuarantinedBytes} from '../intake/index.mjs';
import {parseTextOrMarkdown,parseDocx} from '../parsers/index.mjs';
import {parseLegislativeXml} from '../xml/index.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hex=/^[a-f0-9]{64}$/;
const fail=(code,retryable=false)=>{throw new JobError(code,retryable)};
const hash=b=>createHash('sha256').update(b).digest('hex');
const MAX=25*1024*1024;
function verifyPrivateInput(item,trustedPublisherId){
 if(!item||!uuid.test(trustedPublisherId)||item.publisherId!==trustedPublisherId||
   !uuid.test(item.versionId)||item.publication!=='private'||item.sourceComplete!==false||
   !hex.test(item.expectedRawSha256)||!(item.bytes instanceof Uint8Array)||
   item.bytes.byteLength<1||item.bytes.byteLength>MAX)fail('QUARANTINE_NOT_AUTHORIZED');
 return item;
}
/** Output is metadata, not extracted statutory language or a publishable pack. */
export async function preparePrivatePreview({item,trustedPublisherId}={}){
 const record=verifyPrivateInput(item,trustedPublisherId);
 let scanned;
 try{scanned=scanQuarantinedBytes(record.bytes,record.mime);}
 catch{fail('QUARANTINE_REJECTED');}
 if(scanned.sha256!==record.expectedRawSha256||scanned.disposition!=='quarantined')fail('SOURCE_BYTES_MISMATCH');
 let parsed;
 try{
  if(record.mime==='text/plain'||record.mime==='text/markdown')parsed=parseTextOrMarkdown(record.bytes,record.mime);
  else if(record.mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')parsed=parseDocx(record.bytes);
  else if(record.mime==='application/xml'||record.mime==='text/xml')parsed=parseLegislativeXml(record.bytes,{versionId:record.versionId});
  else if(record.mime==='application/pdf'){
   // PDF execution is reserved for the sandboxed AB-016 worker, never this generic runner.
   parsed={format:'pdf',warnings:['requires_dedicated_sandbox_and_page_review'],sourceComplete:false,publicationAllowed:false};
  }else fail('UNSUPPORTED_SOURCE_FORMAT');
 }catch(e){
  if(e instanceof JobError)throw e;
  fail('PARSER_REVIEW_REQUIRED');
 }
 if(parsed.sourceComplete!==false||parsed.publicationAllowed!==false)fail('PARSER_ELEVATED_AUTHORITY');
 const format=parsed.format??record.mime;
 const warnings=[...(parsed.warnings??[])];
 const meta=Object.freeze({publisherId:record.publisherId,versionId:record.versionId,
  rawSha256:record.expectedRawSha256,mime:record.mime,format,
  sourceComplete:false,publicationAllowed:false,
  needsManualReview:true,warnings:Object.freeze(warnings),
  requiresOriginalSourceRetention:true});
 return Object.freeze({status:'quarantined_private_preview',metadata:meta});
}
/** Must be passed only to createJobWorker. Its outbox action is PRIVATE and idempotent. */
export function createPrivateImportHandler({trustedPublisherId,loadQuarantine}={}){
 if(!uuid.test(trustedPublisherId)||typeof loadQuarantine!=='function')fail('RECOVERY_HANDLER_CONFIG');
 return async function handleJob({jobId,kind,heartbeat}={}){
  if(!uuid.test(jobId)||kind!=='content.intake'||typeof heartbeat!=='function')fail('INTAKE_KIND_FORBIDDEN');
  if(await heartbeat()!==true)fail('JOB_LEASE_LOST');
  let item;
  try{item=await loadQuarantine(jobId);}
  catch{fail('SOURCE_UNAVAILABLE',true);}
  if(item===null||item===undefined)fail('SOURCE_UNAVAILABLE',true);
  const preview=await preparePrivatePreview({item,trustedPublisherId});
  if(await heartbeat()!==true)fail('JOB_LEASE_LOST');
  const metadata=preview.metadata;
  // SQL outbox receipts must deduplicate this stable key. Raw source and questions do not enter logs.
  return Object.freeze({type:'content.private_preview_ready',
    idempotencyKey:'intake-'+metadata.versionId+'-'+metadata.rawSha256.slice(0,12),
    payload:Object.freeze({publisherId:metadata.publisherId,versionId:metadata.versionId,
      rawSha256:metadata.rawSha256,format:metadata.format,
      needsManualReview:true,publicationAllowed:false,warningCount:metadata.warnings.length})});
 };
}
export function classifyRecoveryAction(status){
 if(!['quarantine','retry','dead-letter','review_required','withdrawn','last_published'].includes(status))
  fail('UNRECOGNIZED_RECOVERY_STATE');
 if(status==='retry')return Object.freeze({action:'retry_with_backoff',safeToPublish:false});
 if(status==='dead-letter')return Object.freeze({action:'investigate_and_repair',safeToPublish:false});
 if(status==='withdrawn')return Object.freeze({action:'keep_withdrawn',safeToPublish:false});
 if(status==='last_published')return Object.freeze({action:'serve_immutable_previous_release',safeToPublish:false});
 return Object.freeze({action:'hold_private_review',safeToPublish:false});
}
