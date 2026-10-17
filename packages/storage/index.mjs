/** Ask Bill AB-009 server-only signed-object capability contracts. No cloud backend. */
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const MIME=new Set(['application/pdf','text/plain','application/xml','text/xml','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const PREFIXES=new Set(['quarantine','private-source','public-packs']);
const MAX_UPLOAD=25*1024*1024;
export class StorageError extends Error{constructor(code){super(code);this.code=code;this.name='StorageError';}}
function deny(code){throw new StorageError(code)}
function uuid(value){if(typeof value!=='string'||!UUID.test(value))deny('INVALID_PUBLISHER');return value.toLowerCase()}
function b64(s){return Buffer.from(s).toString('base64url')}
function unb64(s){return Buffer.from(s,'base64url').toString('utf8')}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function storageKey(publisherId,key){
 const publisher=uuid(publisherId);
 if(typeof key!=='string'||key.length>240||!new RegExp('^'+publisher+'/[a-zA-Z0-9_.-]{1,100}(?:/[a-zA-Z0-9_.-]{1,100})?$').test(key)||key.includes('..'))deny('UNSAFE_OBJECT_KEY');
 return key;
}
function nowSafe(now){if(!Number.isSafeInteger(now)||now<0)deny('INVALID_CLOCK');return now}
function origin(url){try{const u=new URL(url);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)deny('INVALID_ORIGIN');return u.origin}catch{deny('INVALID_ORIGIN')}}
export function corsOrigin(requestOrigin, permittedOrigins){
 if(!Array.isArray(permittedOrigins)||permittedOrigins.length>20)deny('CORS_POLICY_INVALID');
 const normalized=permittedOrigins.map(origin);
 if(typeof requestOrigin!=='string'||!normalized.includes(requestOrigin))deny('ORIGIN_FORBIDDEN');
 return requestOrigin;
}
export function sniffUpload(bytes, declaredMime){
 if(!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))deny('INVALID_BYTES');
 const buf=Buffer.from(bytes);
 if(buf.length<1||buf.length>MAX_UPLOAD)deny('UPLOAD_LIMIT');
 if(!MIME.has(declaredMime))deny('MIME_FORBIDDEN');
 if(declaredMime==='application/pdf'&&!buf.subarray(0,5).equals(Buffer.from('%PDF-')))deny('MIME_MISMATCH');
 if(declaredMime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'&&!buf.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04])))deny('MIME_MISMATCH');
 if(['text/xml','application/xml'].includes(declaredMime)){
  const prefix=buf.toString('utf8').trimStart();
  if(!prefix.startsWith('<')||/<!DOCTYPE|<!ENTITY/i.test(prefix))deny('UNSAFE_XML');
 }
 if(declaredMime==='text/plain'&&buf.includes(0))deny('MIME_MISMATCH');
 return Object.freeze({bytes:buf.length,sha256:createHash('sha256').update(buf).digest('hex'),mime:declaredMime});
}
/** Testable, finite-lifetime, server-secret-bound ticket writer/verifier; no live object store. */
export function createCapabilityService({secret,now=()=>Date.now(),nonceRegistry}={}){
 if(!Buffer.isBuffer(secret)||secret.length<32)deny('SIGNING_KEY_REQUIRED');
 if(typeof now!=='function')deny('INVALID_CLOCK');
 if(!nonceRegistry||typeof nonceRegistry.consume!=='function')deny('NONCE_STORE_REQUIRED');
 const sign=data=>createHmac('sha256',secret).update(data).digest('base64url');
 return Object.freeze({
  issueUpload({publisherId,key,sha256,size,mime,ttlMs=300000}){
   const pub=uuid(publisherId);storageKey(pub,key);
   if(typeof sha256!=='string'||!HEX.test(sha256))deny('INVALID_DIGEST');
   if(!Number.isSafeInteger(size)||size<1||size>MAX_UPLOAD)deny('UPLOAD_LIMIT');
   if(!MIME.has(mime))deny('MIME_FORBIDDEN');
   if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>300000)deny('INVALID_EXPIRY');
   const issuedAt=nowSafe(now());
   const payload={v:1,act:'upload',scope:'quarantine',pub,key,digest:sha256,size,mime,iat:issuedAt,exp:issuedAt+ttlMs,nonce:randomBytes(16).toString('base64url')};
   const body=b64(JSON.stringify(payload));return body+'.'+sign(body);
  },
  verifyUpload({ticket,publisherId,key,content,mime}){
   if(typeof ticket!=='string'||ticket.length>3000||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(ticket))deny('INVALID_TICKET');
   const [body,sig]=ticket.split('.');
   if(!safeEqual(sign(body),sig))deny('INVALID_SIGNATURE');
   let p;try{p=JSON.parse(unb64(body))}catch{deny('INVALID_TICKET')}
   if(!p||p.v!==1||p.act!=='upload'||p.scope!=='quarantine'||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.exp-p.iat>300000||!/^[-_a-zA-Z0-9]{22}$/.test(p.nonce))deny('INVALID_TICKET');
   const t=nowSafe(now());if(t<p.iat||t>=p.exp)deny('TICKET_EXPIRED');
   if(p.pub!==uuid(publisherId)||p.key!==storageKey(publisherId,key))deny('OBJECT_FORBIDDEN');
   const actual=sniffUpload(content,mime);
   if(actual.mime!==p.mime||actual.bytes!==p.size||actual.sha256!==p.digest)deny('OBJECT_INTEGRITY_FAILED');
   if(nonceRegistry.consume(p.nonce,p.exp)!==true)deny('TICKET_REPLAY');
   return Object.freeze({scope:'quarantine',publisherId:p.pub,key:p.key,sha256:p.digest,bytes:p.size,mime:p.mime});
  }
 });
}
/** Memory nonce tracker for tests only; production requires durable, atomic nonce redemption. */
export function testNonceRegistry(){const redeemed=new Set;return{consume(nonce){if(redeemed.has(nonce))return false;redeemed.add(nonce);return true}}}
/** Public immutable assets never receive access to private/quarantine collections. */
export function publicPackReference({scope,publisherId,key,sha256}){
 if(scope!=='public-packs')deny('NOT_PUBLIC');
 return Object.freeze({scope,publisherId:uuid(publisherId),key:storageKey(publisherId,key),sha256:HEX.test(sha256)?sha256:deny('INVALID_DIGEST')});
}
