import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {createOidcPublisherAuth} from '../packages/auth/oidc.mjs';
import {publisherIdentityHash} from '../packages/auth/pg-store.mjs';
const P='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',U='11111111-1111-4111-8111-111111111111';
const issuer='https://identity.askbill.example',origin='https://askbill.example',clientId='ask-bill-publisher';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'signing-1',use:'sig',alg:'RS256'};
const hash=v=>createHash('sha256').update(v).digest('hex');
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function fixture({claims={},metadata={},enrolled=true,amr=['mfa'],mutateToken,options={}}={}){
 let time=1_790_000_000_000,role='owner';const transactions=new Map(),sessions=new Map(),requests=[];
 const store={
  async saveLoginTransaction(t){transactions.set(t.stateHash,structuredClone(t));},
  async consumeLoginTransaction(q){const t=transactions.get(q.stateHash);if(!t||t.bindingHash!==q.bindingHash||t.expiresAt<=q.now)return null;transactions.delete(q.stateHash);return t;},
  async resolveIdentity(){return enrolled?{userId:U,role}:null;},
  async saveSession(s){sessions.set(s.sessionHash,s);},
  async getSession(s){return sessions.get(s.sessionHash);},
  async deleteSession(s){sessions.delete(s.sessionHash);},
  async resolveMembership(){return role;}
 };
 let nonce;
 const fetchImpl=async(url,init)=>{
  requests.push({url,init});assert.equal(init.redirect,'manual');
  if(url.endsWith('/.well-known/openid-configuration'))return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256'],...metadata});
  if(url===issuer+'/jwks')return Response.json({keys:[jwk]});
  if(url===issuer+'/token'){
   const body=new URLSearchParams(init.body);assert.equal(body.get('grant_type'),'authorization_code');assert.match(body.get('code_verifier'),/^[A-Za-z0-9_-]{43}$/);
   const header=b64({alg:'RS256',kid:jwk.kid});const payload=b64({iss:issuer,sub:'enrolled-subject',aud:clientId,nonce,iat:Math.floor(time/1000),exp:Math.floor(time/1000)+300,auth_time:Math.floor(time/1000),amr,...claims});
   const raw=header+'.'+payload;const idToken=raw+'.'+sign('RSA-SHA256',Buffer.from(raw),privateKey).toString('base64url');
   return Response.json({id_token:mutateToken?mutateToken(idToken):idToken,access_token:'unused-server-token',token_type:'Bearer'});
  }
  throw new Error('Unexpected request');
 };
 const auth=createOidcPublisherAuth({issuer,clientId,clientSecret:'server-only-client-secret',expectedOrigin:origin,redirectUri:origin+'/admin/auth/callback',publisherId:P,store,fetchImpl,now:()=>time,...options});
 async function begin(requireMfa=false,cookieHeader){const result=await auth.beginLogin({requestOrigin:origin,requireMfa,cookieHeader});const url=new URL(result.location);nonce=url.searchParams.get('nonce');return {...result,url,state:url.searchParams.get('state'),cookie:result.setCookies.map(c=>c.split(';')[0]).join('; ')};}
 async function finish(start){return auth.finishLogin({callbackUrl:origin+'/admin/auth/callback?state='+start.state+'&code=single-use-code&iss='+encodeURIComponent(issuer),cookieHeader:start.cookie});}
 return {auth,store,requests,transactions,sessions,begin,finish,setRole:r=>{role=r;},advance:ms=>{time+=ms;},now:()=>time};
}
const denied=(code,fn)=>assert.rejects(fn,error=>error.code===code);
test('OIDC code flow uses PKCE, browser-bound one-use state and opaque persisted sessions',async()=>{
 const f=fixture(),start=await f.begin(true),transaction=[...f.transactions.values()][0];
 assert.equal(start.url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(start.url.searchParams.get('code_challenge'),createHash('sha256').update(transaction.verifier).digest('base64url'));
 assert.equal(start.url.searchParams.get('prompt'),'login');assert.match(start.setCookies[0],/Secure; HttpOnly; SameSite=Lax/);
 assert.doesNotMatch(start.location,/secret|verifier/);
 const result=await f.finish(start);assert.equal(result.location,'/admin');
 assert.equal(f.transactions.size,0);assert.equal(f.sessions.size,1);
 const cookies=result.setCookies.slice(0,2).map(c=>c.split(';')[0]).join('; '),ctx=await f.auth.getContext({cookieHeader:cookies});
 assert.equal(ctx.role,'owner');assert.equal(ctx.recentMfa,true);assert.equal(ctx.publisherId,P);
 const session=[...f.sessions.values()][0];assert.equal(session.csrfHash,hash(ctx.csrfToken));assert.equal(session.mfaVerifiedAt,f.now());
 assert.doesNotMatch(JSON.stringify(session),/access_token|id_token|server-only-client-secret/);
 await denied('OIDC_STATE_INVALID',()=>f.finish(start));
});
test('login state cannot be redeemed by a different browser or duplicate cookie',async()=>{
 const f=fixture(),start=await f.begin();
 await denied('OIDC_STATE_INVALID',()=>f.finish({...start,cookie:'__Host-ask_bill_oidc='+'Z'.repeat(43)}));
 await denied('SESSION_INVALID',()=>f.finish({...start,cookie:start.cookie+'; '+start.cookie}));
 assert.equal(f.requests.filter(r=>r.url.endsWith('/token')).length,0);
 await f.finish(start);
});
test('callback and return targets reject open redirects, duplicate parameters, and issuer mixup',async()=>{
 const f=fixture(),start=await f.begin();
 await denied('RETURN_PATH_INVALID',()=>f.auth.beginLogin({requestOrigin:origin,returnTo:'//attacker.example'}));
 await denied('ORIGIN_FORBIDDEN',()=>f.auth.beginLogin({requestOrigin:'https://attacker.example'}));
 for(const url of [origin+'/admin/auth/callback?state='+start.state+'&state='+start.state+'&code=x',origin+'/admin/auth/callback?state='+start.state+'&code=x&iss=https://wrong.example','https://wrong.example/admin/auth/callback?state='+start.state+'&code=x']){
  await denied('OIDC_CALLBACK_INVALID',()=>f.auth.finishLogin({callbackUrl:url,cookieHeader:start.cookie}));
 }
});
test('provider metadata cannot redirect credentials or key lookups to an unapproved origin',async()=>{
 const f=fixture({metadata:{token_endpoint:'https://attacker.example/token'}});
 await denied('OIDC_ENDPOINT_FORBIDDEN',()=>f.begin());assert.equal(f.requests.length,1);
 const g=fixture({metadata:{issuer:'https://other.example'}});await denied('OIDC_DISCOVERY_INVALID',()=>g.begin());
});
test('cryptographic ID token checks reject untrusted signatures and algorithm substitutions',async()=>{
 const f=fixture({mutateToken:token=>token.slice(0,token.lastIndexOf('.')+1)+Buffer.alloc(256,0).toString('base64url')});
 await denied('ID_TOKEN_SIGNATURE_INVALID',async()=>f.finish(await f.begin()));
 const g=fixture({mutateToken:token=>b64({alg:'none',kid:jwk.kid})+'.'+token.split('.').slice(1).join('.')});
 await denied('ID_TOKEN_ALGORITHM_FORBIDDEN',async()=>g.finish(await g.begin()));
});
test('token issuer, audience, azp, nonce, authentication time and token time are validated',async()=>{
 for(const invalid of [{iss:'https://other.example'},{aud:'other-client'},{aud:[clientId,'other-client']},{azp:'other-client'},{nonce:'wrong'},{sub:''}]){
  const f=fixture({claims:invalid});await denied('ID_TOKEN_CLAIMS_INVALID',async()=>f.finish(await f.begin()));
 }
 for(const invalid of [{exp:1},{iat:1},{auth_time:1},{auth_time:1_790_001_000}]){
  const f=fixture({claims:invalid});await denied('ID_TOKEN_TIME_INVALID',async()=>f.finish(await f.begin()));
 }
});
test('explicit enrollment prevents arbitrary provider accounts from gaining publisher access',async()=>{
 const f=fixture({enrolled:false});await denied('PUBLISHER_NOT_ENROLLED',async()=>f.finish(await f.begin()));assert.equal(f.sessions.size,0);
 assert.notEqual(publisherIdentityHash({issuer,subject:'one'}),publisherIdentityHash({issuer,subject:'two'}));
 assert.notEqual(publisherIdentityHash({issuer,subject:'one'}),publisherIdentityHash({issuer:issuer+'/other',subject:'one'}));
});
test('MFA comes from configured verified claims and the original auth_time; step-up fails closed',async()=>{
 const f=fixture({amr:['pwd']});await denied('MFA_REQUIRED',async()=>f.finish(await f.begin(true)));assert.equal(f.sessions.size,0);
 const g=fixture({amr:['pwd'],claims:{acr:'unrecognized-higher-assurance'}}),logged=await g.finish(await g.begin());
 const cookieHeader=logged.setCookies.slice(0,2).map(c=>c.split(';')[0]).join('; '),ctx=await g.auth.getContext({cookieHeader});
 assert.equal(ctx.recentMfa,false);
 await denied('MFA_REQUIRED',()=>g.auth.authorize({cookieHeader,csrfToken:ctx.csrfToken,requestOrigin:origin,method:'POST',action:'publish'}));
 const h=fixture({amr:['pwd'],claims:{acr:'trusted-aal2'},options:{acceptedMfaAcr:['trusted-aal2']}});await h.finish(await h.begin(true));
});
test('every mutation rechecks publisher role, CSRF, origin and recent MFA; logout revokes durable session',async()=>{
 const f=fixture(),logged=await f.finish(await f.begin()),cookieHeader=logged.setCookies.slice(0,2).map(c=>c.split(';')[0]).join('; ');
 const ctx=await f.auth.getContext({cookieHeader}),request={cookieHeader,csrfToken:ctx.csrfToken,requestOrigin:origin,method:'POST',action:'publish'};
 assert.equal((await f.auth.authorize(request)).mfaVerifiedByTrustedServer,true);
 await denied('CSRF_FORBIDDEN',()=>f.auth.authorize({...request,csrfToken:'A'.repeat(43)}));
 await denied('ORIGIN_FORBIDDEN',()=>f.auth.authorize({...request,requestOrigin:'https://attacker.example'}));
 await denied('PUBLISHER_FORBIDDEN',()=>f.auth.authorize({...request,publisherId:U}));
 await denied('METHOD_NOT_ALLOWED',()=>f.auth.authorize({...request,method:'GET'}));
 f.setRole('viewer');await denied('ACTION_FORBIDDEN',()=>f.auth.authorize(request));
 f.setRole('owner');f.advance(600001);await denied('MFA_REQUIRED',()=>f.auth.authorize(request));
 const cleared=await f.auth.logout(request);assert(cleared.setCookies.every(c=>c.includes('Max-Age=0')));assert.equal(f.sessions.size,0);
 await denied('SESSION_EXPIRED',()=>f.auth.getContext({cookieHeader}));
});
test('expired login transactions and disabled memberships invalidate authorization',async()=>{
 const f=fixture(),start=await f.begin();f.advance(300001);await denied('OIDC_STATE_INVALID',()=>f.finish(start));
 const g=fixture(),logged=await g.finish(await g.begin()),cookieHeader=logged.setCookies.slice(0,2).map(c=>c.split(';')[0]).join('; ');
 g.setRole(null);await denied('MEMBERSHIP_REVOKED',()=>g.auth.getContext({cookieHeader}));
});
test('MFA reauthentication revokes the previous session even when Strict cookies are absent on the OAuth callback',async()=>{
 const f=fixture(),logged=await f.finish(await f.begin()),previous=logged.setCookies.slice(0,2).map(c=>c.split(';')[0]).join('; ');
 const started=await f.begin(true,previous);assert.match([...f.transactions.values()][0].previousSessionHash,/^[a-f0-9]{64}$/);
 const renewed=await f.finish(started);assert.equal(f.sessions.size,1);
 await denied('SESSION_EXPIRED',()=>f.auth.getContext({cookieHeader:previous}));
 assert.equal((await f.auth.getContext({cookieHeader:renewed.setCookies.slice(0,2).map(c=>c.split(';')[0]).join('; ')})).recentMfa,true);
});
