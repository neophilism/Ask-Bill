/** Real HTTP routes and cryptographic adapters; provider/network/database fixtures are local. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {createOidcPublisherAuth} from '../packages/auth/oidc.mjs';
import {createS3PrivateStorage} from '../packages/storage/s3.mjs';
import {createPublisherHandler} from '../apps/web/admin/server/index.mjs';
import {REVIEW_CHECKS} from '../apps/web/admin/views/index.mjs';
const P='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',U='11111111-1111-4111-8111-111111111111';
const origin='https://publisher.askbill.example',issuer='https://identity.askbill.example';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fixture-key',alg:'RS256',use:'sig'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const error=code=>{const e=new Error(code);e.code=code;throw e;};
async function setup(t,{configured=true}={}){
 let role='owner',mfa=true,nonce,writes=0;const sessions=new Map(),transactions=new Map(),objects=new Map(),bills=new Map(),versions=new Map(),tours=new Map(),translations=new Map(),cookies=new Map(),imports=[];
 const auth=createOidcPublisherAuth({issuer,clientId:'publisher-test',clientSecret:'server-client-test-secret',publisherId:P,expectedOrigin:origin,redirectUri:origin+'/admin/auth/callback',
  store:{
   async saveLoginTransaction(v){transactions.set(v.stateHash,v);},
   async consumeLoginTransaction(q){const v=transactions.get(q.stateHash);if(!v||v.bindingHash!==q.bindingHash||v.expiresAt<=q.now)return null;transactions.delete(q.stateHash);return v;},
   async resolveIdentity(){return {userId:U,role};},async saveSession(s){sessions.set(s.sessionHash,s);},async getSession(q){return sessions.get(q.sessionHash);},async deleteSession(q){sessions.delete(q.sessionHash);},async resolveMembership(){return role;}
  },fetchImpl:async(url)=>{
   if(url.endsWith('/.well-known/openid-configuration'))return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],id_token_signing_alg_values_supported:['RS256']});
   if(url===issuer+'/jwks')return Response.json({keys:[jwk]});
   if(url===issuer+'/token'){
    const seconds=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({iss:issuer,sub:'publisher-owner',aud:'publisher-test',nonce,iat:seconds,exp:seconds+300,auth_time:seconds,amr:mfa?['mfa']:['pwd']})).toString('base64url');
    const body=header+'.'+payload;return Response.json({id_token:body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url')});
   }
   throw new Error('Unexpected OIDC fixture call');
  }});
 const storage=createS3PrivateStorage({endpoint:'https://private-storage.askbill.example',bucket:'publisher-fixture',publisherId:P,
  credentials:{accessKeyId:'LOCALFIXTUREKEY',secretAccessKey:'local-fixture-secret-key'},fetchImpl:async(url,init)=>{
   if(init.method==='PUT'){if(objects.has(url))return new Response(null,{status:412});objects.set(url,{bytes:Buffer.from(init.body),mime:init.headers['content-type']});return new Response(null);}
   if(init.method==='GET'){const object=objects.get(url);return object?new Response(object.bytes,{headers:{'content-type':object.mime}}):new Response(null,{status:404});}
   throw new Error('Unexpected S3 fixture call');
  }});
 function guard(actor){assert.equal(actor.publisherId,P);assert.equal(actor.freshMembershipVerified,true);}
 function billFor(actor,billId){guard(actor);const b=bills.get(billId);if(!b)error('NOT_FOUND');return b;}
 function verFor(actor,billId,versionId){billFor(actor,billId);const v=versions.get(versionId);if(!v||v.billId!==billId)error('NOT_FOUND');return v;}
 const repository={
  async listBills({actor}){guard(actor);return [...bills.values()].map(b=>({...b,versionCount:[...versions.values()].filter(v=>v.billId===b.id).length}));},
  async getBill({actor,billId}){const b=billFor(actor,billId);return {...b,versions:[...versions.values()].filter(v=>v.billId===billId).map(v=>({...v,translations:[...translations.values()].filter(d=>d.billId===billId)})),imports:imports.filter(item=>item.billId===billId)};},
  async createBill({actor,title,jurisdiction}){guard(actor);writes++;const b={id:randomUUID(),publisherId:P,title,jurisdiction,activeReleaseId:null};bills.set(b.id,b);return b;},
  async recordUpload({actor,billId,object,language}){const b=billFor(actor,billId);writes++;const raw=await storage.getPrivateSource({...object});const canonicalText=raw.content.toString('utf8'),versionId=randomUUID();
   versions.set(versionId,{id:versionId,billId,publisherId:P,title:b.title,language,publication:'private',sourceComplete:false,status:'draft',createdAt:new Date().toISOString(),rawByteSha256:object.sha256,canonicalTextSha256:hash(canonicalText),canonicalText,provisions:[{id:randomUUID(),heading:'Source text',text:canonicalText}],reviewChecks:[],indexStatus:'complete'});return {versionId};},
  async getVersion({actor,billId,versionId}){return {...verFor(actor,billId,versionId),activeReleaseId:billFor(actor,billId).activeReleaseId,tourDraft:tours.get(versionId)??null,translations:[...translations.values()].filter(d=>d.billId===billId).map(d=>actor.role==='viewer'?{...d,text:undefined}:d)};},
  async saveTranslationDraft({actor,billId,versionId,language,text,expectedCanonicalSha256}){
   const v=verFor(actor,billId,versionId);assert.equal(actor.mfaVerifiedByTrustedServer,true);
   if(v.canonicalTextSha256!==expectedCanonicalSha256)error('VERSION_CONFLICT');
   writes++;translations.set(billId+':'+language,{billId,language,sourceCanonicalSha256:expectedCanonicalSha256,text,updatedAt:new Date().toISOString()});return {saved:true};
  },
  async saveTourDraft({actor,billId,versionId,stepIds,expectedCanonicalSha256}){
   const v=verFor(actor,billId,versionId);assert.equal(actor.mfaVerifiedByTrustedServer,true);
   if(v.canonicalTextSha256!==expectedCanonicalSha256)error('VERSION_CONFLICT');
   if(stepIds.some(id=>!v.provisions.some(p=>p.id===id)))error('TOUR_INVALID');
   writes++;tours.set(versionId,{stepIds,sourceSha256:expectedCanonicalSha256,stale:false,updatedAt:new Date().toISOString()});
   return {saved:true};
  },
  async getOriginal({actor,billId,versionId}){const v=verFor(actor,billId,versionId),raw=await storage.getPrivateSource({publisherId:P,sha256:v.rawByteSha256});
   return {publisherId:P,billId,versionId,sha256:raw.sha256,bytes:raw.bytes,mime:raw.mime,content:raw.content};},
  async requestOfficialImport({actor,billId,identity}){billFor(actor,billId);assert.equal(identity.congress,119);writes++;
   const jobId=randomUUID(),failed=!imports.some(item=>item.billId===billId&&item.kind==='congress');
   imports.unshift({billId,jobId,kind:'congress',state:failed?'failed':'completed',
    jobStatus:failed?'dead':'completed',errorCode:failed?'SOURCE_UNAVAILABLE':null,identity,createdAt:new Date().toISOString()});return {jobId};},
  async reviewVersion({actor,billId,versionId,checks,expectedCanonicalSha256}){const v=verFor(actor,billId,versionId);assert.equal(actor.mfaVerifiedByTrustedServer,true);if(v.canonicalTextSha256!==expectedCanonicalSha256)error('VERSION_CONFLICT');writes++;v.reviewChecks=[...checks];v.sourceComplete=true;v.publication='reviewed';},
  async publishRelease({actor,billId,versionId,expectedReleaseId}){const b=billFor(actor,billId),v=verFor(actor,billId,versionId);assert.equal(actor.mfaVerifiedByTrustedServer,true);if(v.publication!=='reviewed')error('PUBLICATION_NOT_READY');if(b.activeReleaseId!==expectedReleaseId)error('VERSION_CONFLICT');writes++;b.activeReleaseId=randomUUID();b.activeVersionId=versionId;v.publication='published';return {published:true};},
  async withdrawRelease({actor,billId,releaseId}){const b=billFor(actor,billId);assert.equal(actor.role,'owner');if(b.activeReleaseId!==releaseId)error('VERSION_CONFLICT');writes++;versions.get(b.activeVersionId).publication='withdrawn';b.activeReleaseId=null;b.activeVersionId=null;return {withdrawn:true};},
  async saveCorrection({actor,billId,proposal}){const original=verFor(actor,billId,proposal.audit.oldVersionId);assert.equal(actor.mfaVerifiedByTrustedServer,true);writes++;
   versions.set(proposal.newVersion.id,{...original,id:proposal.newVersion.id,publication:'private',sourceComplete:false,canonicalText:proposal.newVersion.canonicalText,canonicalTextSha256:proposal.newVersion.canonicalSha256,provisions:[{id:randomUUID(),heading:'Source text',text:proposal.newVersion.canonicalText}],reviewChecks:[],indexStatus:'pending',audit:proposal.audit});return {versionId:proposal.newVersion.id};}
 };
 const handler=createPublisherHandler({auth:configured?auth:null,repository:configured?repository:null,storage,expectedOrigin:origin,publisherId:P,officialImportsEnabled:true});
 const server=createServer((req,res)=>{handler(req,res).then(handled=>{if(!handled){res.statusCode=404;res.end();}}).catch(()=>{res.statusCode=500;res.end();});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port;
 function cookieHeader(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');}
 async function request(path,{method='GET',body,anonymous=false,headers={}}={}){
  const response=await fetch(base+path,{method,redirect:'manual',headers:{...(anonymous?{}:{cookie:cookieHeader()}),...(method==='POST'?{origin}:{}),...headers},...(body?{body}:{})});
  for(const value of response.headers.getSetCookie()){const [key,token]=value.split(';')[0].split('=');if(token)cookies.set(key,token);else cookies.delete(key);}
  return response;
 }
 const post=(path,input={},extra={})=>request(path,{method:'POST',body:new URLSearchParams({csrfToken:cookies.get('__Host-ask_bill_csrf')??'',...input}),...extra});
 async function login(){
  const start=await post('/admin/auth/start');assert.equal(start.status,303);const target=new URL(start.headers.get('location'));nonce=target.searchParams.get('nonce');
  const finish=await request('/admin/auth/callback?state='+target.searchParams.get('state')+'&code=fixture-code');assert.equal(finish.status,303);return finish;
 }
 async function addBill(title='Evidence & accountability'){
  const response=await post('/admin/bills',{title,jurisdiction:'United States'});assert.equal(response.status,303);return response.headers.get('location').split('/').pop();
 }
 async function upload(billId,content='😀 Congress shall review the proposal.'){
  const data=new FormData();data.set('csrfToken',cookies.get('__Host-ask_bill_csrf'));data.set('language','en');data.set('source',new Blob([content],{type:'text/plain'}),'source.txt');
  const response=await request('/admin/bills/'+billId+'/uploads',{method:'POST',body:data});assert.equal(response.status,303,await response.clone().text());return response.headers.get('location').split('/').pop();
 }
 async function review(billId,versionId){
  const form=new URLSearchParams({csrfToken:cookies.get('__Host-ask_bill_csrf'),expectedCanonicalSha256:versions.get(versionId).canonicalTextSha256});for(const key of Object.keys(REVIEW_CHECKS))form.append('checks',key);
  return request('/admin/bills/'+billId+'/versions/'+versionId+'/review',{method:'POST',body:form});
 }
 return {request,post,login,addBill,upload,review,bills,versions,objects,getWrites:()=>writes,setRole:v=>{role=v;},setMfa:v=>{mfa=v;},cookies};
}
test('unconfigured and anonymous publishing have honest accessible sign-in states, with public reading links',async t=>{
 const missing=await setup(t,{configured:false}),response=await missing.request('/admin');assert.equal(response.status,503);
 assert.match(await response.text(),/identity provider and its private database/);assert.match(response.headers.get('cache-control'),/no-store/);
 const live=await setup(t),anonymous=await live.request('/admin');assert.equal(anonymous.status,401);assert.match(await anonymous.text(),/Sign in with your publisher account/);
});
test('publisher catalog and version forms escape source markup and preserve semantic reading',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill('<script>alert(1)</script> & public duty'),versionId=await f.upload(billId,'😀 <script>not executable</script> exact law.');
 const catalog=await f.request('/admin'),body=await catalog.text();assert.equal(catalog.status,200);assert.match(body,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(body,/<script>/);
 const page=await f.request('/admin/bills/'+billId+'/versions/'+versionId),html=await page.text();assert.match(html,/&lt;script&gt;not executable/);assert.match(html,/Exact passage to correct/);assert.match(html,/name="checks"/);
 assert.match(page.headers.get('content-security-policy'),/default-src 'none'/);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
 const css=await f.request('/admin/assets/publisher.css');assert.equal(css.status,200);assert.match(await css.text(),/:focus-visible/);
});
test('full owner workflow uploads privately, reviews, publishes, corrects immutably, imports and withdraws',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill(),versionId=await f.upload(billId),base='/admin/bills/'+billId+'/versions/'+versionId;
 assert.equal(f.objects.size,2);assert.equal(f.versions.get(versionId).publication,'private');
 const premature=await f.post(base+'/publish',{confirmed:'true',expectedReleaseId:''});assert.notEqual(premature.status,303);assert.equal(f.bills.get(billId).activeReleaseId,null);
 assert.equal((await f.review(billId,versionId)).status,303);
 assert.equal((await f.post(base+'/publish',{confirmed:'true',expectedReleaseId:''})).status,303);assert.equal(f.versions.get(versionId).publication,'published');
 const original=f.versions.get(versionId),oldText=original.canonicalText;
 const corrected=await f.post(base+'/corrections',{expectedCanonicalSha256:original.canonicalTextSha256,provisionId:original.provisions[0].id,expectedQuote:'Congress',replacement:'The Congress'});
 assert.equal(corrected.status,303,await corrected.clone().text());const newId=corrected.headers.get('location').split('/').pop(),revised=f.versions.get(newId);
 assert.notEqual(newId,versionId);assert.equal(revised.publication,'private');assert.equal(revised.sourceComplete,false);assert.equal(revised.audit.changedRange.start,2);
 assert.equal(f.versions.get(versionId).canonicalText,oldText);assert.equal(revised.rawByteSha256,original.rawByteSha256);assert.deepEqual(revised.reviewChecks,[]);
 assert.equal((await f.post('/admin/bills/'+billId+'/imports',{congress:'119',billType:'hr',billNumber:'10'})).status,303);
 assert.equal((await f.post('/admin/bills/'+billId+'/withdraw',{releaseId:f.bills.get(billId).activeReleaseId,confirmed:'true'})).status,303);
 assert.equal(f.versions.get(versionId).publication,'withdrawn');assert.equal(f.bills.get(billId).activeReleaseId,null);
});
test('failed official refresh is visible, retryable, and source correction stays private',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill(),versionId=await f.upload(billId),
  billPath='/admin/bills/'+billId,version=f.versions.get(versionId);
 assert.equal((await f.post(billPath+'/imports',{congress:'119',billType:'hr',billNumber:'42'})).status,303);
 const failed=await f.request(billPath);assert.match(await failed.text(),/Retry this official source import/);
 assert.equal((await f.post(billPath+'/imports',{congress:'119',billType:'hr',billNumber:'42'})).status,303);
 const corrected=await f.post(billPath+'/versions/'+versionId+'/corrections',{
   expectedCanonicalSha256:version.canonicalTextSha256,provisionId:version.provisions[0].id,
   expectedQuote:'Congress',replacement:'The Congress'});
 assert.equal(corrected.status,303);const next=f.versions.get(corrected.headers.get('location').split('/').pop());
 assert.equal(next.publication,'private');assert.equal(version.publication,'private');
});
test('viewer permissions, stale MFA, CSRF, cross-origin forms and stale source hashes block all writes',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill(),versionId=await f.upload(billId),base='/admin/bills/'+billId+'/versions/'+versionId,before=f.getWrites();
 assert.equal((await f.post('/admin/bills',{title:'bad',jurisdiction:'US',csrfToken:'Z'.repeat(43)})).status,403);
 assert.equal((await f.post('/admin/bills',{title:'bad',jurisdiction:'US'},{headers:{origin:'https://attacker.example'}})).status,403);
 f.setRole('viewer');assert.equal((await f.post('/admin/bills',{title:'bad',jurisdiction:'US'})).status,403);
 const viewed=await f.request('/admin');assert.match(await viewed.text(),/viewer role/);assert.equal(f.getWrites(),before);
 f.setRole('owner');f.setMfa(false);await f.login();assert.equal((await f.review(billId,versionId)).status,403);assert.equal(f.getWrites(),before);
 f.setMfa(true);await f.login();const result=await f.post(base+'/corrections',{expectedCanonicalSha256:'f'.repeat(64),provisionId:f.versions.get(versionId).provisions[0].id,expectedQuote:'Congress',replacement:'A Congress'});
 assert.equal(result.status,409);assert.equal(f.getWrites(),before);
});
test('source-only tour draft can be curated without changing publication',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill(),versionId=await f.upload(billId),
  version=f.versions.get(versionId),base='/admin/bills/'+billId+'/versions/'+versionId;
 const before=f.getWrites();
 const page=await f.request(base);assert.match(await page.text(),/Source-only tour draft/);
 const saved=await f.post(base+'/tour',{expectedCanonicalSha256:version.canonicalTextSha256,stepIds:version.provisions[0].id});
 assert.equal(saved.status,303,await saved.clone().text());assert.equal(f.getWrites(),before+1);
 const reopened=await f.request(base);assert.match(await reopened.text(),/1 selected passages/);
 assert.equal(version.publication,'private');
 assert.equal((await f.post(base+'/tour',{expectedCanonicalSha256:'f'.repeat(64),stepIds:version.provisions[0].id})).status,409);
 assert.equal((await f.post(base+'/tour',{expectedCanonicalSha256:version.canonicalTextSha256,stepIds:randomUUID()})).status,400);
 f.setRole('viewer');assert.equal((await f.post(base+'/tour',{expectedCanonicalSha256:version.canonicalTextSha256,stepIds:version.provisions[0].id})).status,403);
 assert.equal(f.getWrites(),before+1);
});
test('translation drafts remain private and show stale source after correction',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill(),versionId=await f.upload(billId),
  version=f.versions.get(versionId),base='/admin/bills/'+billId+'/versions/'+versionId;
 const saved=await f.post(base+'/translations',{expectedCanonicalSha256:version.canonicalTextSha256,language:'es',text:'Texto traducido privado.'});
 assert.equal(saved.status,303);assert.match(await (await f.request(base)).text(),/Source matches this version/);
 assert.match(await (await f.request(base)).text(),/Texto traducido privado/);
 assert.equal((await f.post(base+'/translations',{expectedCanonicalSha256:'f'.repeat(64),language:'fr',text:'Traduction'})).status,409);
 f.setRole('viewer');assert.equal((await f.post(base+'/translations',{expectedCanonicalSha256:version.canonicalTextSha256,language:'fr',text:'Traduction'})).status,403);
 assert.doesNotMatch(await (await f.request(base)).text(),/Texto traducido privado/);
 f.setRole('owner');const correction=await f.post(base+'/corrections',{expectedCanonicalSha256:version.canonicalTextSha256,
  provisionId:version.provisions[0].id,expectedQuote:'Congress',replacement:'The Congress'});
 assert.equal(correction.status,303);const corrected=await f.request(correction.headers.get('location'));
 assert.match(await corrected.text(),/Source changed; update translation/);
 assert.equal(version.publication,'private');
});
test('duplicate and ambiguous correction input fail closed, and no unknown bill upload reaches storage',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill(),versionId=await f.upload(billId,'repeat then repeat'),v=f.versions.get(versionId),before=f.getWrites();
 const duplicate=new URLSearchParams({csrfToken:f.cookies.get('__Host-ask_bill_csrf'),title:'new title',jurisdiction:'US'});duplicate.append('csrfToken',f.cookies.get('__Host-ask_bill_csrf'));
 assert.equal((await f.request('/admin/bills',{method:'POST',body:duplicate})).status,400);
 const ambiguous=await f.post('/admin/bills/'+billId+'/versions/'+versionId+'/corrections',{expectedCanonicalSha256:v.canonicalTextSha256,provisionId:v.provisions[0].id,expectedQuote:'repeat',replacement:'new wording'});assert.equal(ambiguous.status,409);
 const body=new FormData();body.set('csrfToken',f.cookies.get('__Host-ask_bill_csrf'));body.set('source',new Blob(['unknown draft'],{type:'text/plain'}),'new.txt');body.set('language','en');
 assert.equal((await f.request('/admin/bills/'+randomUUID()+'/uploads',{method:'POST',body})).status,404);assert.equal(f.objects.size,2);assert.equal(f.getWrites(),before);
});
test('original downloads require current publisher membership, pin exact raw bytes and use safe attachment headers',async t=>{
 const f=await setup(t);await f.login();const source='😀 original <script>inert source text</script>.';
 const billId=await f.addBill('unsafe " title'),versionId=await f.upload(billId,source),path='/admin/bills/'+billId+'/versions/'+versionId+'/original';
 const versionPage=await f.request('/admin/bills/'+billId+'/versions/'+versionId);assert.match(await versionPage.text(),/Download original source/);
 const response=await f.request(path);assert.equal(response.status,200);assert.equal(await response.text(),source);
 assert.equal(response.headers.get('content-disposition'),'attachment; filename="ask-bill-source-'+versionId+'.txt"');
 assert.equal(response.headers.get('x-source-sha256'),hash(source));assert.equal(response.headers.get('content-type'),'text/plain');
 assert.equal(response.headers.get('content-length'),String(Buffer.byteLength(source)));
 assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 const head=await f.request(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('x-source-sha256'),hash(source));
 assert.equal((await f.request(path,{anonymous:true})).status,401);
 assert.equal((await f.request('/admin/bills/'+randomUUID()+'/versions/'+versionId+'/original')).status,404);
 f.setRole('viewer');assert.equal((await f.request(path)).status,200);
 f.setRole(null);assert.equal((await f.request(path)).status,401);
});
test('corrected versions download the unchanged original and corrupted private objects are withheld',async t=>{
 const f=await setup(t);await f.login();const billId=await f.addBill(),versionId=await f.upload(billId,'Original scanned wording.'),version=f.versions.get(versionId);
 const base='/admin/bills/'+billId+'/versions/',corrected=await f.post(base+versionId+'/corrections',{expectedCanonicalSha256:version.canonicalTextSha256,
  provisionId:version.provisions[0].id,expectedQuote:'scanned',replacement:'corrected'});
 assert.equal(corrected.status,303);const newId=corrected.headers.get('location').split('/').pop();
 assert.equal(await (await f.request(base+newId+'/original')).text(),'Original scanned wording.');
 const entry=[...f.objects].find(([key])=>key.includes('/private-source/'));assert.ok(entry);entry[1].bytes=Buffer.from('corrupted different bytes');
 const denied=await f.request(base+newId+'/original');assert.notEqual(denied.status,200);assert.equal(denied.headers.get('content-disposition'),null);
 assert.doesNotMatch(await denied.text(),/corrupted different bytes|Original scanned wording/);
});

