/** Ask Bill original source provenance: no uploads, network requests or provider credentials. */
import {createHash} from 'node:crypto';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CANON=/^[a-zA-Z0-9._-]{1,64}$/;
const ALLOWED=new Set(['text/plain','text/markdown','application/xml','text/xml','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const HOSTS=new Set(['congress.gov','www.congress.gov','govinfo.gov','www.govinfo.gov']);
const MAX=25*1024*1024;
export class SourceError extends Error{constructor(code){super(code);this.name='SourceError';this.code=code;}}
const fail=code=>{throw new SourceError(code)};
const uuid=(value,name)=>typeof value==='string'&&UUID.test(value)?value.toLowerCase():fail('INVALID_'+name);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function officialSourceUrl(input){
 let parsed;
 try{parsed=new URL(input);}catch{fail('SOURCE_URL_INVALID')}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hash||!HOSTS.has(parsed.hostname)||parsed.port)fail('SOURCE_URL_INVALID');
 if(parsed.pathname.length>1500||parsed.search.length>800)fail('SOURCE_URL_INVALID');
 return parsed.toString();
}
function retrievedTime(input){
 if(typeof input!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input))fail('RETRIEVAL_TIME_INVALID');
 const d=new Date(input);if(!Number.isFinite(d.getTime())||d.toISOString().replace(/\.000Z$/,'Z')!==input.replace(/\.000Z$/,'Z'))fail('RETRIEVAL_TIME_INVALID');
 return input;
}
/** Hash-only candidate: raw source bytes stay with the caller's private quarantine adapter. */
export function createSourceCandidate({publisherId,billId,versionId,origin,rawBytes,mime,sourceUrl=null,retrievedAt,canonicalizationVersion}){
 const pub=uuid(publisherId,'PUBLISHER'),bill=uuid(billId,'BILL'),version=uuid(versionId,'VERSION');
 if(!['official','publisher-upload'].includes(origin))fail('ORIGIN_INVALID');
 if(!(rawBytes instanceof Uint8Array)||rawBytes.byteLength<1||rawBytes.byteLength>MAX)fail('SOURCE_SIZE_INVALID');
 if(typeof mime!=='string'||!ALLOWED.has(mime))fail('MIME_INVALID');
 if(typeof canonicalizationVersion!=='string'||!CANON.test(canonicalizationVersion))fail('CANON_VERSION_INVALID');
 if(origin==='official'&&sourceUrl===null)fail('SOURCE_URL_REQUIRED');
 if(origin==='publisher-upload'&&sourceUrl!==null)fail('PRIVATE_URL_FORBIDDEN');
 const url=sourceUrl===null?null:officialSourceUrl(sourceUrl);
 const bytes=Buffer.from(rawBytes);
 return Object.freeze({publisherId:pub,billId:bill,versionId:version,origin,sha256:digest(bytes),byteLength:bytes.length,mime,sourceUrl:url,retrievedAt:retrievedTime(retrievedAt),canonicalizationVersion});
}
/** A candidate is never publication approval. This descriptor must be paired with an object-store digest check. */
export function privateSourceObjectKey(candidate){
 if(!candidate||typeof candidate!=='object'||!UUID.test(candidate.publisherId)||!(/^[a-f0-9]{64}$/).test(candidate.sha256))fail('CANDIDATE_INVALID');
 return candidate.publisherId+'/sha256/'+candidate.sha256;
}
/** Safe, parameterized SQL boundaries, not a PostgreSQL client or completed ingestion service. */
export function recordSourceObjectQuery(candidate,storageKey){
 if(storageKey!==privateSourceObjectKey(candidate))fail('STORAGE_KEY_INVALID');
 return Object.freeze({sql:`INSERT INTO ask_bill.source_objects(publisher_id,sha256,byte_length,mime_type,storage_key)
VALUES($1::uuid,$2,$3::bigint,$4,$5)
ON CONFLICT (publisher_id,sha256) DO NOTHING`,params:Object.freeze([candidate.publisherId,candidate.sha256,candidate.byteLength,candidate.mime,storageKey])});
}
export function findSourceObjectQuery(candidate){
 if(!candidate||!UUID.test(candidate.publisherId)||!/^[a-f0-9]{64}$/.test(candidate.sha256))fail('CANDIDATE_INVALID');
 return Object.freeze({sql:'SELECT id,byte_length,mime_type,storage_key FROM ask_bill.source_objects WHERE publisher_id=$1::uuid AND sha256=$2',params:Object.freeze([candidate.publisherId,candidate.sha256])});
}
export function assertMatchingStoredObject(candidate,storageKey,record){
 if(!record||record.byte_length!==candidate.byteLength||record.mime_type!==candidate.mime||record.storage_key!==storageKey)fail('SOURCE_COLLISION');
 return true;
}
export function recordSourceEventQuery(candidate,sourceObjectId){
 const id=uuid(sourceObjectId,'SOURCE_OBJECT');
 return Object.freeze({sql:`INSERT INTO ask_bill.source_import_events(publisher_id,bill_id,version_id,source_object_id,origin,source_url,retrieved_at,canonicalization_version)
VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::timestamptz,$8)
ON CONFLICT (publisher_id,version_id,source_object_id) DO NOTHING`,params:Object.freeze([candidate.publisherId,candidate.billId,candidate.versionId,id,candidate.origin,candidate.sourceUrl,candidate.retrievedAt,candidate.canonicalizationVersion])});
}
