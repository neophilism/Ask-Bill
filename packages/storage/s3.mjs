/** Server-only S3-compatible private source storage, AWS Signature Version 4. */
import {createHash,createHmac} from 'node:crypto';
import {StorageError} from './index.mjs';
import {scanQuarantinedBytes} from '../content/intake/index.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const MAX_BYTES=25*1024*1024;
const SCOPES=new Set(['quarantine','private-source']);
const fail=code=>{throw new StorageError(code)};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function timestamp(now){const value=now();if(!Number.isSafeInteger(value)||value<0)fail('INVALID_CLOCK');return new Date(value).toISOString().replace(/[:-]|\.\d{3}/g,'');}
function credentials(value){
 if(!value||typeof value.accessKeyId!=='string'||!/^[A-Za-z0-9]{8,128}$/.test(value.accessKeyId)||typeof value.secretAccessKey!=='string'||
  value.secretAccessKey.length<8||value.secretAccessKey.length>4096||/[\x00-\x20\x7f]/.test(value.secretAccessKey)||
  (value.sessionToken!==undefined&&(typeof value.sessionToken!=='string'||value.sessionToken.length>8192||/[\r\n\0]/.test(value.sessionToken))))fail('S3_CREDENTIALS_REQUIRED');
 return value;
}
function signingKey(secret,date,region){return hmac(hmac(hmac(hmac('AWS4'+secret,date),region),'s3'),'aws4_request');}
function canonicalQuery(url){return [...url.searchParams.entries()].map(([k,v])=>[encode(k),encode(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(([k,v])=>k+'='+v).join('&');}

/** Exported for deterministic official SigV4 test vectors, not for browser use. */
export function signS3Request({method,url,headers={},body=Buffer.alloc(0),region,credentials:provided,now=()=>Date.now()}={}){
 const auth=credentials(provided),target=new URL(url);
 if(target.protocol!=='https:'||target.username||target.password||target.hash||!['GET','HEAD','PUT','DELETE'].includes(method)||!/^[-a-z0-9]{1,40}$/.test(region??''))fail('S3_CONFIGURATION_INVALID');
 const amzDate=timestamp(now),date=amzDate.slice(0,8),payloadHash=digest(body),normalized={};
 for(const [key,value] of Object.entries(headers)){
  const name=key.toLowerCase();if(!/^[a-z0-9-]+$/.test(name)||typeof value!=='string'||/[\r\n\0]/.test(value))fail('S3_HEADERS_INVALID');
  normalized[name]=value.trim().replace(/\s+/g,' ');
 }
 normalized.host=target.host;normalized['x-amz-date']=amzDate;normalized['x-amz-content-sha256']=payloadHash;
 if(auth.sessionToken)normalized['x-amz-security-token']=auth.sessionToken;
 const names=Object.keys(normalized).sort(),signedHeaders=names.join(';');
 const canonical=[method,target.pathname,canonicalQuery(target),names.map(k=>k+':'+normalized[k]+'\n').join(''),signedHeaders,payloadHash].join('\n');
 const scope=date+'/'+region+'/s3/aws4_request',stringToSign=['AWS4-HMAC-SHA256',amzDate,scope,digest(canonical)].join('\n');
 const signature=createHmac('sha256',signingKey(auth.secretAccessKey,date,region)).update(stringToSign).digest('hex');
 normalized.authorization=`AWS4-HMAC-SHA256 Credential=${auth.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
 return Object.freeze(normalized);
}

export function createS3PrivateStorage({endpoint,region='auto',bucket,quarantineBucket=bucket,sourceBucket=bucket,publisherId,
 credentials:provided,fetchImpl=globalThis.fetch,now=()=>Date.now(),pathStyle=true}={}){
 let base;try{base=new URL(endpoint)}catch{fail('S3_CONFIGURATION_INVALID')}
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||
  !/^[-a-z0-9]{1,40}$/.test(region)||!UUID.test(publisherId??'')||typeof fetchImpl!=='function'||typeof now!=='function'||typeof pathStyle!=='boolean')fail('S3_CONFIGURATION_INVALID');
 for(const name of [quarantineBucket,sourceBucket])if(typeof name!=='string'||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)||name.includes('..')||/^\d+\.\d+\.\d+\.\d+$/.test(name))fail('S3_CONFIGURATION_INVALID');
 const auth=credentials(provided),publisher=publisherId.toLowerCase();
 function object({scope,publisherId:requested,key,sha256}){
  if(requested!==publisher||!SCOPES.has(scope)||!HEX.test(sha256??''))fail('OBJECT_FORBIDDEN');
  const safeKey=publisher+'/sha256/'+sha256;
  if(key!==undefined&&key!==safeKey)fail('UNSAFE_OBJECT_KEY');
  const selectedBucket=scope==='quarantine'?quarantineBucket:sourceBucket;
  const url=new URL(base.href);if(!pathStyle)url.hostname=selectedBucket+'.'+base.hostname;
  url.pathname=(pathStyle?'/'+encode(selectedBucket):'')+'/'+[scope,...safeKey.split('/')].map(encode).join('/');
  return {url,key:safeKey};
 }
 async function request(method,url,{body,headers={}}={}){
  const signed=signS3Request({method,url:url.href,headers,body,region,credentials:auth,now});
  let response;try{response=await fetchImpl(url.href,{method,headers:signed,...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)})}catch{fail('STORAGE_UNAVAILABLE')}
  if(response.status>=300&&response.status<400)fail('STORAGE_REDIRECT_BLOCKED');
  if(response.status===401||response.status===403)fail('STORAGE_ACCESS_DENIED');
  return response;
 }
 async function readObject(input){
  const {url,key}=object(input),response=await request('GET',url,{headers:{'x-amz-checksum-mode':'ENABLED'}});
  if(response.status===404)fail('OBJECT_NOT_FOUND');if(response.status!==200)fail('STORAGE_UNAVAILABLE');
  const limit=input.maxBytes??MAX_BYTES;if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_BYTES)fail('UPLOAD_LIMIT');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))fail('OBJECT_RESPONSE_LIMIT');
  const chunks=[];let size=0;
  if(!response.body)fail('OBJECT_INTEGRITY_FAILED');
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>limit)fail('OBJECT_RESPONSE_LIMIT');chunks.push(Buffer.from(chunk));}
  const content=Buffer.concat(chunks);
  if(size<1||(declared!==null&&Number(declared)!==size)||digest(content)!==input.sha256||
   (input.size!==undefined&&input.size!==size))fail('OBJECT_INTEGRITY_FAILED');
  const checksum=response.headers.get('x-amz-checksum-sha256');
  if(checksum&&checksum!==Buffer.from(input.sha256,'hex').toString('base64'))fail('OBJECT_INTEGRITY_FAILED');
  return {scope:input.scope,publisherId:publisher,key,sha256:input.sha256,bytes:size,mime:response.headers.get('content-type')?.split(';')[0]??'application/octet-stream',content};
 }
 async function putObject(input){
  const {url,key}=object(input);
  const checked=scanQuarantinedBytes(input.content,input.mime);
  if(checked.sha256!==input.sha256)fail('OBJECT_INTEGRITY_FAILED');
  const response=await request('PUT',url,{body:Buffer.from(input.content),headers:{'content-type':input.mime,'content-length':String(checked.bytes),
   'if-none-match':'*','x-amz-checksum-sha256':Buffer.from(checked.sha256,'hex').toString('base64'),'cache-control':'private, no-store'}});
  if(response.status===412){
   const previous=await readObject({...input,size:checked.bytes,maxBytes:checked.bytes});
   if(previous.mime!==input.mime)fail('OBJECT_IMMUTABILITY_CONFLICT');
  }else if(response.status!==200&&response.status!==201&&response.status!==204)fail(response.status===409?'OBJECT_WRITE_CONFLICT':'STORAGE_UNAVAILABLE');
  const returned=response.headers.get('x-amz-checksum-sha256');
  if(returned&&returned!==Buffer.from(checked.sha256,'hex').toString('base64'))fail('OBJECT_INTEGRITY_FAILED');
  // Confirm bytes independently, including providers which omit checksum headers.
  await readObject({...input,size:checked.bytes,maxBytes:checked.bytes});
  return Object.freeze({scope:input.scope,publisherId:publisher,key,sha256:checked.sha256,bytes:checked.bytes,mime:input.mime,objectStoredAndVerified:true});
 }
 return Object.freeze({
  kind:'s3-compatible',publisherId:publisher,
  putQuarantine(input){return putObject({...input,scope:'quarantine'});},
  putPrivateSource(input){return putObject({...input,scope:'private-source'});},
  getPrivateSource(input){return readObject({...input,scope:'private-source'});},
  getQuarantine(input){return readObject({...input,scope:'quarantine'});},
  async promoteQuarantine(input){const old=await readObject({...input,scope:'quarantine'});return putObject({...input,content:old.content,mime:input.mime??old.mime,scope:'private-source'});},
  async deleteQuarantine(input){const {url}=object({...input,scope:'quarantine'});const response=await request('DELETE',url);if(![204,200,404].includes(response.status))fail('STORAGE_UNAVAILABLE');return {deleted:true};},
  /** A short-lived bearer download. It is deliberately never called a public URL. */
  signedDownload({...input}={}){
   const ttl=input.ttlSeconds??60;if(!Number.isSafeInteger(ttl)||ttl<1||ttl>300)fail('INVALID_EXPIRY');
   const {url}=object(input),amzDate=timestamp(now),date=amzDate.slice(0,8),scope=date+'/'+region+'/s3/aws4_request';
   const entries={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':auth.accessKeyId+'/'+scope,'X-Amz-Date':amzDate,
    'X-Amz-Expires':String(ttl),'X-Amz-SignedHeaders':'host','response-content-disposition':'attachment','response-cache-control':'private, no-store'};
   if(auth.sessionToken)entries['X-Amz-Security-Token']=auth.sessionToken;
   for(const [key,value] of Object.entries(entries))url.searchParams.set(key,value);
   const canonical=['GET',url.pathname,canonicalQuery(url),'host:'+url.host+'\n','host','UNSIGNED-PAYLOAD'].join('\n');
   const toSign=['AWS4-HMAC-SHA256',amzDate,scope,digest(canonical)].join('\n');
   const signature=createHmac('sha256',signingKey(auth.secretAccessKey,date,region)).update(toSign).digest('hex');
   url.searchParams.set('X-Amz-Signature',signature);
   return Object.freeze({url:url.href,expiresAt:new Date(Date.parse(amzDate.slice(0,4)+'-'+amzDate.slice(4,6)+'-'+amzDate.slice(6,8)+'T'+amzDate.slice(9,11)+':'+amzDate.slice(11,13)+':'+amzDate.slice(13,15)+'Z')+ttl*1000).toISOString(),scope:input.scope,private:true});
  }
 });
}
