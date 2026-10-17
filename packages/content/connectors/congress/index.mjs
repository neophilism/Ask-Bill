/** AB-020: independent Congress.gov v3 adapter. No key/client data enters browser. */
import {createHash} from 'node:crypto';
export class CongressError extends Error{constructor(code){super(code);this.code=code;this.name='CongressError';}}
const fail=c=>{throw new CongressError(c)};
const TYPES=new Set(['hr','s','hjres','sjres','hconres','sconres','hres','sres']);
const API='https://api.congress.gov';
const MAX_JSON=4*1024*1024;
export function congressBillIdentity({congress,billType,billNumber}={}){
 if(!Number.isSafeInteger(congress)||congress<1||congress>999||!TYPES.has(billType)||!Number.isSafeInteger(billNumber)||billNumber<1||billNumber>999999)fail('BILL_IDENTITY');
 return Object.freeze({congress,billType,billNumber,key:String(congress)+billType+String(billNumber)});
}
const validEtag=e=>typeof e==='string'&&e.length<=180&&/^[\x21-\x7e]+$/.test(e);
function sourceFormat(url,identity,type){
 if(typeof url!=='string'||typeof type!=='string')fail('TEXT_FORMAT');
 let u;try{u=new URL(url)}catch{fail('TEXT_FORMAT_URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.search||
  u.hostname!=='www.congress.gov'||!u.pathname.startsWith('/'+identity.congress+'/bills/'+identity.billType+identity.billNumber+'/')||
  !/\.(?:xml|pdf|txt|htm|html)$/i.test(u.pathname))fail('TEXT_FORMAT_URL');
 return Object.freeze({type,url:u.href});
}
async function boundedJson(response){
 const header=Number(response.headers.get('content-length'));
 if(Number.isFinite(header)&&header>MAX_JSON)fail('SOURCE_RESPONSE_LIMIT');
 let size=0,parts=[];
 if(response.body&&typeof response.body[Symbol.asyncIterator]==='function'){
  for await(const part of response.body){
   size+=part.byteLength;if(size>MAX_JSON)fail('SOURCE_RESPONSE_LIMIT');parts.push(Buffer.from(part));
  }
 }else{
  const body=await response.arrayBuffer();size=body.byteLength;if(size>MAX_JSON)fail('SOURCE_RESPONSE_LIMIT');parts=[Buffer.from(body)];
 }
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{fail('SOURCE_JSON_INVALID');}
}
export function createCongressClient({apiKey,fetchImpl=fetch,clock=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),quotaPerHour=4000}={}){
 if(typeof apiKey!=='string'||apiKey.length<8||apiKey.length>256||/[\r\n]/.test(apiKey))fail('API_KEY_MISSING');
 if(typeof fetchImpl!=='function'||typeof clock!=='function'||typeof sleep!=='function'||!Number.isSafeInteger(quotaPerHour)||quotaPerHour<1||quotaPerHour>5000)fail('CLIENT_CONFIG');
 let windowStart=clock(),used=0;
 async function request(path,{etag}={}){
  if(typeof path!=='string'||!/^\/v3\/bill\/[0-9]{1,3}\/[a-z]+\/[0-9]{1,6}(?:\/text)?\?format=json(?:&limit=250&offset=[0-9]{1,6})?$/.test(path))fail('API_PATH_FORBIDDEN');
  if(etag!==undefined&&!validEtag(etag))fail('ETAG_INVALID');
  for(let attempt=0;attempt<3;attempt++){
   const at=clock();
   if(at-windowStart>=3600000){windowStart=at;used=0;}
   if(used>=quotaPerHour)fail('LOCAL_RATE_LIMIT');used++;
   let result;
   try{result=await fetchImpl(API+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{'Accept':'application/json','X-Api-Key':apiKey,...(etag?{'If-None-Match':etag}:{})}});}
   catch{if(attempt===2)fail('SOURCE_NETWORK_ERROR');await sleep(200*(attempt+1));continue;}
   if(result.status===304){if(!etag)fail('CACHE_VALIDATOR_MISSING');return {notModified:true,etag};}
   if(result.status===429||result.status===503){
    if(attempt===2)fail('SOURCE_RATE_LIMITED');
    const retry=Number(result.headers.get('retry-after'));
    await sleep(Number.isFinite(retry)&&retry>=0?Math.min(retry*1000,8000):500*(attempt+1));
    continue;
   }
   if(result.status>=300&&result.status<400)fail('SOURCE_REDIRECT_BLOCKED');
   if(result.status!==200)fail('SOURCE_HTTP_ERROR');
   const body=await boundedJson(result),received=result.headers.get('etag');
   return {notModified:false,data:body,etag:validEtag(received)?received:null};
  }
  fail('SOURCE_RETRIES_EXHAUSTED');
 }
 return Object.freeze({
  async bill(identity,{etag}={}){
   const id=congressBillIdentity(identity),endpoint='/v3/bill/'+id.congress+'/'+id.billType+'/'+id.billNumber+'?format=json';
   const r=await request(endpoint,{etag});if(r.notModified)return r;
   const raw=r.data?.bill;
   if(!raw||typeof raw!=='object'||Number(raw.congress)!==id.congress||Number(raw.number)!==id.billNumber||
     (raw.type&&String(raw.type).toLowerCase().replace(/[^a-z]/g,'')!==id.billType))fail('BILL_RESPONSE_MISMATCH');
   const latestAction=raw.latestAction&&typeof raw.latestAction==='object'?{
    date:typeof raw.latestAction.actionDate==='string'?raw.latestAction.actionDate:null,
    text:typeof raw.latestAction.text==='string'?raw.latestAction.text.slice(0,1000):null}:null;
   return Object.freeze({notModified:false,identity:id,title:typeof raw.title==='string'?raw.title.slice(0,400):null,
     latestAction,lawStatus:'unknown',effectiveAt:null,sourceUrl:API+endpoint.split('?')[0],etag:r.etag,
     retrievedAt:new Date(clock()).toISOString()});
  },
  async textVersions(identity,{etag}={}){
   const id=congressBillIdentity(identity),path='/v3/bill/'+id.congress+'/'+id.billType+'/'+id.billNumber+'/text?format=json&limit=250&offset=';
   let pages=[],versionItems=[],currentEtag=etag;
   for(let page=0;page<16;page++){
    const response=await request(path+String(page*250),{etag:page===0?currentEtag:undefined});
    if(response.notModified)return response;
    if(page===0)currentEtag=response.etag;
    const versions=response.data?.textVersions;
    if(!Array.isArray(versions)||versions.length>250)fail('TEXT_RESPONSE_INVALID');
    for(const item of versions){
     if(typeof item.type!=='string'||!item.type.trim()||typeof item.date!=='string'||!Number.isFinite(Date.parse(item.date))||!Array.isArray(item.formats))fail('TEXT_VERSION_INVALID');
     const formats=item.formats.map(f=>sourceFormat(f.url,id,f.type));
     versionItems.push(Object.freeze({type:item.type,date:item.date,formats:Object.freeze(formats),
      sourceKey:createHash('sha256').update(JSON.stringify([id,item.type,item.date,formats])).digest('hex')}));
    }
    const count=response.data?.pagination?.count;
    if(versions.length<250||Number.isSafeInteger(count)&&versionItems.length>=count)break;
    if(page===15)fail('TEXT_PAGINATION_LIMIT');
   }
   return Object.freeze({notModified:false,identity:id,versions:Object.freeze(versionItems),etag:currentEtag,
     retrievedAt:new Date(clock()).toISOString(),source:'Congress.gov API v3',isOfficialMetadata:true});
  }
 });
}
