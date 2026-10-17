/** Composable private publisher routes, backed only by injected identity and durable stores. */
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {AuthError} from '../../../../packages/auth/server.mjs';
import {scanQuarantinedBytes} from '../../../../packages/content/intake/index.mjs';
import {prepareExtractionCorrection} from '../../../../packages/content/audit/index.mjs';
import {congressBillIdentity} from '../../../../packages/content/connectors/congress/index.mjs';
import {renderPublisherLogin,renderPublisherCatalog,renderPublisherBill,renderPublisherVersion,renderPublisherError,REVIEW_CHECKS} from '../views/index.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const MAX_UPLOAD=25*1024*1024;
const ORIGINAL_EXTENSIONS=Object.freeze({'text/plain':'txt','text/markdown':'md','application/xml':'xml','text/xml':'xml',
 'application/pdf':'pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx'});
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const hash=value=>createHash('sha256').update(value).digest('hex');
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const statuses={ORIGIN_FORBIDDEN:403,CSRF_FORBIDDEN:403,ACTION_FORBIDDEN:403,MFA_REQUIRED:403,PUBLISHER_FORBIDDEN:403,MEMBERSHIP_REVOKED:403,UPLOAD_LIMIT:413,REQUEST_TOO_LARGE:413,NOT_FOUND:404,VERSION_CONFLICT:409,QUOTE_MISMATCH:409,QUOTE_AMBIGUOUS:409,METHOD_NOT_ALLOWED:405,AUTH_RATE_LIMITED:429};
const messages={
 MFA_REQUIRED:'A fresh multi-factor sign-in is required for this action. Return to the source page and verify your identity.',
 ACTION_FORBIDDEN:'Your publisher role does not permit this action.',
 ORIGIN_FORBIDDEN:'This request did not come from the publisher website. Open the publisher page and try again.',
 CSRF_FORBIDDEN:'This form is no longer valid for your session. Reload the page and try again.',
 VERSION_CONFLICT:'The source or active release changed while you were reviewing it. Reload the current version before continuing.',
 QUOTE_MISMATCH:'The exact passage could not be found in the selected provision. Copy the passage from the source and try again.',
 QUOTE_AMBIGUOUS:'That passage occurs more than once in the selected provision. Include enough surrounding words to identify one occurrence.',
 NOT_FOUND:'This bill or source version is not available in your publisher library.',
 REQUEST_TOO_LARGE:'The uploaded request is too large. Source files must be 25 MB or smaller.',
 UPLOAD_LIMIT:'The source file must contain between one byte and 25 MB.',
 REVIEW_INCOMPLETE:'Complete all six source review checks before recording the review.',
 PUBLISH_CONFIRMATION_REQUIRED:'Confirm that you intend to publish this reviewed source.',
 WITHDRAW_CONFIRMATION_REQUIRED:'Confirm that you intend to withdraw the active release.',
 AUTH_RATE_LIMITED:'Too many sign-in attempts are in progress. Wait a few minutes before retrying.',
 SERVICE_NOT_CONFIGURED:'This publishing capability is not connected on this deployment.',
 STORAGE_UNAVAILABLE:'The private source store is temporarily unavailable. Try again after the connection is restored.',
 OIDC_LOGIN_DENIED:'The identity provider did not complete sign-in. You can try again.',
 PUBLISHER_NOT_ENROLLED:'This identity is not enrolled for this publisher. Use your enrolled publisher account.',
 OIDC_STATE_INVALID:'This sign-in attempt expired or was already used. Start a new sign-in.',
 PUBLICATION_NOT_READY:'This version still requires a verified source, complete index and publication review.',
 SOURCE_NOT_REVIEWED:'This version still requires a complete publication review.'
};
function string(value,{min=1,max=300,trim=true}={}){
 if(typeof value!=='string')fail('REQUEST_INVALID');const result=trim?value.trim():value;
 if(result.length<min||result.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result))fail('REQUEST_INVALID');return result;
}
function id(value){if(typeof value!=='string'||!UUID.test(value))fail('REQUEST_INVALID');return value.toLowerCase();}
function int(value){if(typeof value!=='string'||!/^\d{1,6}$/.test(value))fail('REQUEST_INVALID');return Number(value);}
function exactDigest(value){if(!HEX.test(value??''))fail('REQUEST_INVALID');return value;}
async function bytes(req,max){
 const declared=req.headers['content-length'];
 if(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>max))fail('REQUEST_TOO_LARGE');
 let length=0;const chunks=[];
 for await(const chunk of req){length+=chunk.byteLength;if(length>max)fail('REQUEST_TOO_LARGE');chunks.push(chunk);}
 if(declared!==undefined&&length!==Number(declared))fail('REQUEST_INVALID');
 return Buffer.concat(chunks);
}
async function fields(req,{upload=false}={}){
 const type=req.headers['content-type']??'';let data;
 if(upload&&/^multipart\/form-data;\s*boundary=/i.test(type)){
  try{data=await new Response(await bytes(req,MAX_UPLOAD+65536),{headers:{'content-type':type}}).formData()}catch(error){if(error.code)throw error;fail('REQUEST_INVALID');}
 }else if(/^application\/x-www-form-urlencoded(?:;|$)/i.test(type))data=new URLSearchParams((await bytes(req,65536)).toString('utf8'));
 else fail('CONTENT_TYPE_REQUIRED');
 const entries=[...data.entries()];if(entries.length>24)fail('REQUEST_INVALID');
 const out={};for(const [name,value] of entries){
  if(!/^[A-Za-z][A-Za-z0-9]{0,50}$/.test(name))fail('REQUEST_INVALID');
  if(name==='checks'){out.checks??=[];out.checks.push(value);continue;}
  if(Object.hasOwn(out,name))fail('REQUEST_INVALID');out[name]=value;
 }
 return out;
}
function contentMime(file){
 if(file.type&&file.type!=='application/octet-stream')return file.type;
 const extension=String(file.name??'').split('.').pop().toLowerCase();
 return {txt:'text/plain',md:'text/markdown',xml:'application/xml',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}[extension]??'application/octet-stream';
}

export function createPublisherHandler({auth,repository,storage,expectedOrigin,publisherId,officialImportsEnabled=false}={}){
 let origin;try{origin=new URL(expectedOrigin)}catch{fail('PUBLISHER_CONFIGURATION_INVALID')}
 if(origin.protocol!=='https:'||origin.href!==origin.origin+'/'||!UUID.test(publisherId??'')||typeof officialImportsEnabled!=='boolean')fail('PUBLISHER_CONFIGURATION_INVALID');
 const publisher=publisherId.toLowerCase(),configured=Boolean(auth&&repository),safeOrigin=origin.origin;
 const css=readFile(new URL('../client/publisher.css',import.meta.url),'utf8');
 async function call(method,input){if(typeof repository?.[method]!=='function')fail('SERVICE_NOT_CONFIGURED');return repository[method](input);}
 function headers(res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache');
  res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 }
 function html(req,res,status,body){headers(res);res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Length',Buffer.byteLength(body));res.end(req.method==='HEAD'?undefined:body);return true;}
 function redirect(res,target,cookies){headers(res);res.statusCode=303;res.setHeader('Location',target);if(cookies?.length)res.setHeader('Set-Cookie',cookies);res.end();return true;}
 const billPath=billId=>'/admin/bills/'+billId;
 const versionPath=(billId,versionId)=>billPath(billId)+'/versions/'+versionId;
 async function fetchVersion(actor,billId,versionId){
  const version=await call('getVersion',{actor,billId,versionId});
  if(!isObject(version)||version.publisherId!==publisher||version.billId!==billId||version.id!==versionId||!Array.isArray(version.provisions)||version.provisions.length>500||
   version.provisions.some(p=>!UUID.test(p.id??'')||typeof p.text!=='string'))fail('NOT_FOUND');
  return version;
 }
 return async function publisherHandler(req,res){
  let url;try{url=new URL(req.url,safeOrigin)}catch{return false;}
  if(url.pathname!=='/admin'&&!url.pathname.startsWith('/admin/'))return false;
  let context;
  try{
   if(url.origin!==safeOrigin||url.pathname.includes('%')||url.search.length>1000)fail('REQUEST_INVALID');
   if(url.pathname==='/admin/assets/publisher.css'){
    if(!['GET','HEAD'].includes(req.method))fail('METHOD_NOT_ALLOWED');
    const source=await css;headers(res);res.setHeader('Content-Type','text/css; charset=utf-8');res.setHeader('Content-Length',Buffer.byteLength(source));res.end(req.method==='HEAD'?undefined:source);return true;
   }
   if(!configured)return html(req,res,503,renderPublisherLogin({configured:false}));
   if(url.pathname==='/admin/auth/start'){
    if(req.method!=='POST')fail('METHOD_NOT_ALLOWED');
    const input=await fields(req),requireMfa=input.requireMfa==='true';
    if(requireMfa)await auth.authorize({cookieHeader:req.headers.cookie,csrfToken:input.csrfToken,requestOrigin:req.headers.origin,method:'POST',action:'view',publisherId:publisher});
   const result=await auth.beginLogin({requestOrigin:req.headers.origin,cookieHeader:req.headers.cookie,returnTo:input.returnTo??'/admin',requireMfa});
    return redirect(res,result.location,result.setCookies);
   }
   if(url.pathname==='/admin/auth/callback'){
    if(req.method!=='GET')fail('METHOD_NOT_ALLOWED');
    const result=await auth.finishLogin({callbackUrl:url.href,cookieHeader:req.headers.cookie});
    return redirect(res,result.location,result.setCookies);
   }
   try{context=await auth.getContext({cookieHeader:req.headers.cookie});}
   catch(error){if(error instanceof AuthError)return html(req,res,401,renderPublisherLogin({error:error.code==='MEMBERSHIP_REVOKED'?'Publisher access has been revoked for this account.':''}));throw error;}
   if(context.publisherId!==publisher)fail('PUBLISHER_FORBIDDEN');
   if(req.method==='GET'||req.method==='HEAD'){
    const actor=await auth.authorize({cookieHeader:req.headers.cookie,method:req.method,action:'view',publisherId:publisher});
    if(url.pathname==='/admin'||url.pathname==='/admin/'){
     const bills=await call('listBills',{actor});
     if(!Array.isArray(bills)||bills.length>500||bills.some(b=>b.publisherId!==publisher||!UUID.test(b.id??'')))fail('PUBLISHER_DATA_INVALID');
     return html(req,res,200,renderPublisherCatalog({context,bills}));
    }
    const match=url.pathname.match(/^\/admin\/bills\/([a-f0-9-]{36})(?:\/versions\/([a-f0-9-]{36})(\/original)?)?$/i);
    if(!match)fail('NOT_FOUND');const billId=id(match[1]);
    if(match[3]){
     const versionId=id(match[2]),version=await fetchVersion(actor,billId,versionId);
     const original=await call('getOriginal',{actor,billId,versionId});
     if(!original||original.publisherId!==publisher||original.billId!==billId||original.versionId!==versionId||
       !(original.content instanceof Uint8Array)||!Number.isSafeInteger(original.bytes)||original.bytes<1||original.bytes>MAX_UPLOAD||
       original.content.byteLength!==original.bytes||!Object.hasOwn(ORIGINAL_EXTENSIONS,original.mime)||
       !HEX.test(original.sha256??'')||original.sha256!==version.rawByteSha256||hash(original.content)!==version.rawByteSha256)fail('OBJECT_INTEGRITY_FAILED');
     headers(res);res.statusCode=200;res.setHeader('Content-Type',original.mime);res.setHeader('Content-Length',original.bytes);
     res.setHeader('Content-Disposition','attachment; filename="ask-bill-source-'+versionId+'.'+ORIGINAL_EXTENSIONS[original.mime]+'"');
     res.setHeader('X-Source-Sha256',original.sha256);res.end(req.method==='HEAD'?undefined:original.content);return true;
    }
    if(match[2])return html(req,res,200,renderPublisherVersion({context,version:await fetchVersion(actor,billId,id(match[2]))}));
    const bill=await call('getBill',{actor,billId});
    if(!isObject(bill)||bill.publisherId!==publisher||bill.id!==billId||!Array.isArray(bill.versions)||bill.versions.length>500)fail('NOT_FOUND');
    return html(req,res,200,renderPublisherBill({context,bill,storageAvailable:Boolean(storage),importsAvailable:officialImportsEnabled}));
   }
   if(req.method!=='POST')fail('METHOD_NOT_ALLOWED');
   const upload=url.pathname.endsWith('/uploads');
   if(upload&&context.role==='viewer')fail('ACTION_FORBIDDEN');
   const input=await fields(req,{upload});
   const request={cookieHeader:req.headers.cookie,csrfToken:input.csrfToken,requestOrigin:req.headers.origin,method:'POST',publisherId:publisher};
   if(url.pathname==='/admin/auth/logout'){
    const result=await auth.logout(request);return redirect(res,'/admin',result.setCookies);
   }
   if(url.pathname==='/admin/bills'){
    const actor=await auth.authorize({...request,action:'upload'});
    const created=await call('createBill',{actor,title:string(input.title),jurisdiction:string(input.jurisdiction,{min:2,max:100})});
    return redirect(res,billPath(id(created?.id)));
   }
   const route=url.pathname.match(/^\/admin\/bills\/([a-f0-9-]{36})(?:\/versions\/([a-f0-9-]{36}))?\/(uploads|imports|corrections|review|publish|withdraw)$/i);
   if(!route)fail('NOT_FOUND');
   const billId=id(route[1]),versionId=route[2]?id(route[2]):null,operation=route[3];
   if(['corrections','review','publish'].includes(operation)!==Boolean(versionId))fail('NOT_FOUND');
   const action=operation==='withdraw'?'withdraw':['corrections','review','publish'].includes(operation)?'publish':'upload';
   const actor=await auth.authorize({...request,action});
   if(operation==='uploads'){
    if(!storage||typeof storage.putQuarantine!=='function'||typeof storage.promoteQuarantine!=='function')fail('SERVICE_NOT_CONFIGURED');
    const bill=await call('getBill',{actor,billId});
    if(!bill||bill.publisherId!==publisher||bill.id!==billId)fail('NOT_FOUND');
    const file=input.source;
    if(!file||typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_UPLOAD)fail('UPLOAD_LIMIT');
    if(!['en','es'].includes(input.language??'en'))fail('REQUEST_INVALID');
    const content=Buffer.from(await file.arrayBuffer()),mime=contentMime(file),scan=scanQuarantinedBytes(content,mime);
    await storage.putQuarantine({publisherId:publisher,sha256:scan.sha256,mime,content});
    const object=await storage.promoteQuarantine({publisherId:publisher,sha256:scan.sha256,mime});
    if(!object?.objectStoredAndVerified||object.publisherId!==publisher||object.sha256!==scan.sha256||object.bytes!==scan.bytes||object.scope!=='private-source')fail('OBJECT_INTEGRITY_FAILED');
    const result=await call('recordUpload',{actor,billId,object,language:input.language??'en'});
    return redirect(res,result?.versionId?versionPath(billId,id(result.versionId)):billPath(billId));
   }
   if(operation==='imports'){
    if(!officialImportsEnabled)fail('SERVICE_NOT_CONFIGURED');
    const identity=congressBillIdentity({congress:int(input.congress),billType:input.billType,billNumber:int(input.billNumber)});
    const result=await call('requestOfficialImport',{actor,billId,identity});
    return redirect(res,result?.versionId?versionPath(billId,id(result.versionId)):billPath(billId));
   }
   if(operation==='corrections'){
    const version=await fetchVersion(actor,billId,versionId);
    if(exactDigest(input.expectedCanonicalSha256)!==version.canonicalTextSha256)fail('VERSION_CONFLICT');
    if(typeof version.canonicalText!=='string'||hash(version.canonicalText)!==version.canonicalTextSha256||version.provisions.map(p=>p.text).join('\n\n')!==version.canonicalText)fail('SOURCE_CANONICAL_INVALID');
    const provisionId=id(input.provisionId),provision=version.provisions.find(p=>p.id===provisionId);if(!provision)fail('NOT_FOUND');
    const expectedQuote=string(input.expectedQuote,{max:20000,trim:false}),replacement=string(input.replacement,{max:20000,trim:false});
    const startUtf16=provision.text.indexOf(expectedQuote);if(startUtf16<0)fail('QUOTE_MISMATCH');
    if(provision.text.indexOf(expectedQuote,startUtf16+1)>=0)fail('QUOTE_AMBIGUOUS');
    let offset=0;for(const p of version.provisions){if(p.id===provisionId)break;offset+=Array.from(p.text).length+2;}
    const start=offset+Array.from(provision.text.slice(0,startUtf16)).length;
    const proposal=prepareExtractionCorrection({publisherId:publisher,source:{publisherId:publisher,billId,versionId,rawByteSha256:version.rawByteSha256,canonicalSha256:version.canonicalTextSha256,publication:version.publication,text:version.canonicalText,legalStatus:version.status},versionId,newVersionId:randomUUID(),provisionId,oldText:version.canonicalText,expectedQuote,start,end:start+Array.from(expectedQuote).length,replacement,actor});
    const result=await call('saveCorrection',{actor,billId,proposal});
    return redirect(res,versionPath(billId,id(result?.versionId??proposal.newVersion.id)));
   }
   if(operation==='review'){
    if(!Array.isArray(input.checks)||input.checks.length!==6||new Set(input.checks).size!==6||input.checks.some(c=>!Object.hasOwn(REVIEW_CHECKS,c)))fail('REVIEW_INCOMPLETE');
    await call('reviewVersion',{actor,billId,versionId,checks:input.checks,expectedCanonicalSha256:exactDigest(input.expectedCanonicalSha256)});
    return redirect(res,versionPath(billId,versionId));
   }
   if(operation==='publish'){
    if(input.confirmed!=='true')fail('PUBLISH_CONFIRMATION_REQUIRED');
    const result=await call('publishRelease',{actor,billId,versionId,expectedReleaseId:input.expectedReleaseId?id(input.expectedReleaseId):null});
    if(result===false||result?.published===false)fail('VERSION_CONFLICT');return redirect(res,billPath(billId));
   }
   if(operation==='withdraw'){
    if(input.confirmed!=='true')fail('WITHDRAW_CONFIRMATION_REQUIRED');
    const result=await call('withdrawRelease',{actor,billId,releaseId:id(input.releaseId)});
    if(result===false||result?.withdrawn===false)fail('VERSION_CONFLICT');return redirect(res,billPath(billId));
   }
   fail('NOT_FOUND');
  }catch(error){
   if(res.headersSent){res.end();return true;}
   const code=typeof error?.code==='string'?error.code:'PUBLISHER_UNAVAILABLE';
   const status=statuses[code]??(code.includes('INVALID')||code.includes('MISMATCH')||code.includes('INCOMPLETE')||code.includes('CONFIRMATION')?400:code.startsWith('OIDC_')||code==='PUBLISHER_NOT_ENROLLED'?401:503);
   const message=messages[code]??(status===400?'The request could not be validated. Check the supplied source and form fields.':'The publisher request is unavailable. Check your current source and try again.');
   return html(req,res,status,context?renderPublisherError({context,error:message}):renderPublisherLogin({configured,error:message}));
  }
 };
}
