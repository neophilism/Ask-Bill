/** Server-only OIDC authorization-code / PKCE login; no credentials enter the browser. */
import {createHash,createPublicKey,randomBytes,timingSafeEqual,verify} from 'node:crypto';
import {AuthError,publisherActionAllowed,secureSessionCookie,clearSessionCookie} from './server.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const ROLES=new Set(['owner','editor','viewer']);
const LOGIN_COOKIE='__Host-ask_bill_oidc';
const CSRF_COOKIE='__Host-ask_bill_csrf';
const SESSION_COOKIE='__Host-ask_bill_session';
const LOGIN_TTL=300000,SESSION_TTL=1800000,MFA_TTL=600000;
const fail=code=>{throw new AuthError(code)};
const hash=value=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function text(value,max=512){return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);}
function clock(now){const value=now();if(!Number.isSafeInteger(value)||value<0)fail('INVALID_CLOCK');return value;}
function httpsUrl(value){
 let url;try{url=new URL(value)}catch{fail('OIDC_CONFIGURATION_INVALID')}
 if(!text(value,2000)||url.protocol!=='https:'||url.username||url.password||url.hash||url.search)fail('OIDC_CONFIGURATION_INVALID');
 return url;
}
function readCookie(header,name){
 if(typeof header!=='string'||header.length>8192||/[\r\n\0]/.test(header))fail('SESSION_INVALID');
 const entries=header.split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
 if(entries.length!==1)fail('SESSION_INVALID');
 const value=entries[0].slice(name.length+1);if(!TOKEN.test(value))fail('SESSION_INVALID');return value;
}
function cookie(name,value,maxAge,sameSite='Strict'){
 return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}`;
}
function returnPath(value){
 if(typeof value!=='string'||value.length>1000||!/^\/admin(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value))fail('RETURN_PATH_INVALID');
 return value;
}
async function readJson(response,maxBytes=131072){
 if(!response||response.status!==200)fail('OIDC_PROVIDER_UNAVAILABLE');
 if(!/^application\/(?:[a-z0-9.-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type')??''))fail('OIDC_RESPONSE_INVALID');
 const declared=Number(response.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>maxBytes)fail('OIDC_RESPONSE_TOO_LARGE');
 let size=0;const chunks=[];
 if(response.body){for await(const chunk of response.body){size+=chunk.byteLength;if(size>maxBytes)fail('OIDC_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}}
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('OIDC_RESPONSE_INVALID')}
 if(!record(value))fail('OIDC_RESPONSE_INVALID');return value;
}
function jwtPart(value){
 if(!/^[A-Za-z0-9_-]+$/.test(value))fail('ID_TOKEN_INVALID');
 const bytes=Buffer.from(value,'base64url');
 if(bytes.toString('base64url')!==value)fail('ID_TOKEN_INVALID');
 let parsed;try{parsed=JSON.parse(bytes.toString('utf8'))}catch{fail('ID_TOKEN_INVALID')}
 if(!record(parsed))fail('ID_TOKEN_INVALID');return parsed;
}

/**
 * Store operations are async. consumeLoginTransaction must atomically delete-and-return
 * only the unexpired state with its browser binding. Identity enrollment is out of band;
 * an arbitrary provider user or email address never creates publisher membership.
 */
export function createOidcPublisherAuth({issuer,clientId,clientSecret,redirectUri,expectedOrigin,publisherId,
 store,fetchImpl=globalThis.fetch,now=()=>Date.now(),acceptedMfaAcr=[],acceptedMfaAmr=['mfa'],
 allowedEndpointOrigins,tokenEndpointAuthMethod=clientSecret?'client_secret_basic':'none'}={}){
 const issuerUrl=httpsUrl(issuer),redirect=httpsUrl(redirectUri),originUrl=httpsUrl(expectedOrigin);
 if(originUrl.href!==originUrl.origin+'/'||redirect.origin!==originUrl.origin||redirect.pathname!=='/admin/auth/callback'||
  !text(clientId)||!UUID.test(publisherId??'')||typeof fetchImpl!=='function'||typeof now!=='function')fail('OIDC_CONFIGURATION_INVALID');
 if(!['none','client_secret_basic','client_secret_post'].includes(tokenEndpointAuthMethod)||
   (tokenEndpointAuthMethod!=='none'&&!text(clientSecret,4096)))fail('OIDC_CONFIGURATION_INVALID');
 if(!Array.isArray(acceptedMfaAcr)||acceptedMfaAcr.length>12||acceptedMfaAcr.some(v=>!text(v,200))||
   !Array.isArray(acceptedMfaAmr)||acceptedMfaAmr.length>12||acceptedMfaAmr.some(v=>!text(v,200)))fail('OIDC_CONFIGURATION_INVALID');
 const endpointOrigins=allowedEndpointOrigins??[issuerUrl.origin];
 if(!Array.isArray(endpointOrigins)||endpointOrigins.length<1||endpointOrigins.length>8||
   endpointOrigins.some(v=>httpsUrl(v).origin!==v))fail('OIDC_CONFIGURATION_INVALID');
 for(const method of ['saveLoginTransaction','consumeLoginTransaction','resolveIdentity','saveSession','getSession','deleteSession','resolveMembership']){
  if(typeof store?.[method]!=='function')fail('DURABLE_AUTH_STORE_REQUIRED');
 }
 const trustedPublisher=publisherId.toLowerCase(),expected=originUrl.origin;
 let discoveryCache=null,keyCache=null;
 async function request(url,options={}){
  let response;try{response=await fetchImpl(url,{...options,redirect:'manual',signal:AbortSignal.timeout(10000)})}catch{fail('OIDC_PROVIDER_UNAVAILABLE')}
  return readJson(response);
 }
 function endpoint(value){const url=httpsUrl(value);if(!endpointOrigins.includes(url.origin))fail('OIDC_ENDPOINT_FORBIDDEN');return url.href;}
 async function discovery(){
  const at=clock(now);if(discoveryCache&&at<discoveryCache.expiresAt)return discoveryCache.value;
  const value=await request(issuer.replace(/\/$/,'')+'/.well-known/openid-configuration',{headers:{accept:'application/json'}});
  if(value.issuer!==issuer||!Array.isArray(value.response_types_supported)||!value.response_types_supported.includes('code')||
   !Array.isArray(value.id_token_signing_alg_values_supported)||!value.id_token_signing_alg_values_supported.includes('RS256')||
   (value.code_challenge_methods_supported!==undefined&&(!Array.isArray(value.code_challenge_methods_supported)||!value.code_challenge_methods_supported.includes('S256')))||
   (value.token_endpoint_auth_methods_supported!==undefined&&(!Array.isArray(value.token_endpoint_auth_methods_supported)||!value.token_endpoint_auth_methods_supported.includes(tokenEndpointAuthMethod))))fail('OIDC_DISCOVERY_INVALID');
  const normalized={issuer:value.issuer,authorizationEndpoint:endpoint(value.authorization_endpoint),tokenEndpoint:endpoint(value.token_endpoint),jwksUri:endpoint(value.jwks_uri)};
  discoveryCache={value:normalized,expiresAt:at+300000};return normalized;
 }
 async function signingKey(kid,metadata){
  const at=clock(now);
  // A bounded JWKS cache permits one refresh for legitimate key rotation. Each
  // accepted token still needs the provider signature; kid never controls a URL.
  if(!keyCache||keyCache.uri!==metadata.jwksUri||at>=keyCache.expiresAt||(!keyCache.keys.some(k=>k.kid===kid)&&at-keyCache.fetchedAt>=30000)){
   const keys=await request(metadata.jwksUri,{headers:{accept:'application/json'}});
   if(!Array.isArray(keys.keys)||keys.keys.length<1||keys.keys.length>30)fail('OIDC_JWKS_INVALID');
   keyCache={uri:metadata.jwksUri,keys:keys.keys,fetchedAt:at,expiresAt:at+300000};
  }
  const matches=keyCache.keys.filter(k=>record(k)&&k.kid===kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&
   (!k.alg||k.alg==='RS256')&&(!k.key_ops||(Array.isArray(k.key_ops)&&k.key_ops.includes('verify')))&&!k.d);
  if(matches.length!==1)fail('OIDC_SIGNING_KEY_UNAVAILABLE');
  let key;try{key=createPublicKey({key:matches[0],format:'jwk'})}catch{fail('OIDC_JWKS_INVALID')}
  if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails?.modulusLength<2048)fail('OIDC_JWKS_INVALID');return key;
 }
 async function verifyIdToken(raw,transaction,metadata,{code,accessToken}){
  if(typeof raw!=='string'||raw.length>24000)fail('ID_TOKEN_INVALID');
  const parts=raw.split('.');if(parts.length!==3||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))fail('ID_TOKEN_INVALID');
  const header=jwtPart(parts[0]),claims=jwtPart(parts[1]);
  if(header.alg!=='RS256'||!text(header.kid,200)||header.crit!==undefined||header.jku!==undefined||header.x5u!==undefined||header.jwk!==undefined||header.b64!==undefined)fail('ID_TOKEN_ALGORITHM_FORBIDDEN');
  const key=await signingKey(header.kid,metadata);
  if(!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))fail('ID_TOKEN_SIGNATURE_INVALID');
  const seconds=Math.floor(clock(now)/1000),aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==issuer||aud.length<1||aud.length>10||aud.some(a=>!text(a))||!aud.includes(clientId)||
    (aud.length>1&&claims.azp!==clientId)||(claims.azp!==undefined&&claims.azp!==clientId)||!text(claims.sub,255)||
    !same(claims.nonce,transaction.nonce))fail('ID_TOKEN_CLAIMS_INVALID');
  if(!Number.isSafeInteger(claims.exp)||claims.exp<=seconds||!Number.isSafeInteger(claims.iat)||claims.iat>seconds+30||
    claims.iat<Math.floor(transaction.createdAt/1000)-30||claims.exp<=claims.iat||claims.exp-claims.iat>86400||
    (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>seconds+30))||
    !Number.isSafeInteger(claims.auth_time)||claims.auth_time<0||claims.auth_time>seconds+30||seconds-claims.auth_time>600)fail('ID_TOKEN_TIME_INVALID');
  for(const [claim,value] of [['c_hash',code],['at_hash',accessToken]]){
   if(claims[claim]!==undefined&&(!text(value,16000)||!same(claims[claim],createHash('sha256').update(value).digest().subarray(0,16).toString('base64url'))))fail('ID_TOKEN_HASH_INVALID');
  }
  if(claims.amr!==undefined&&(!Array.isArray(claims.amr)||claims.amr.length>20||claims.amr.some(a=>!text(a,200))))fail('ID_TOKEN_CLAIMS_INVALID');
  const mfa=acceptedMfaAcr.includes(claims.acr)||(claims.amr??[]).some(a=>acceptedMfaAmr.includes(a));
  if(transaction.requireMfa&&!mfa)fail('MFA_REQUIRED');
  return {subject:claims.sub,mfaVerifiedAt:mfa?Math.min(claims.auth_time*1000,clock(now)):null};
 }
 async function currentSession(cookieHeader){
  const sid=readCookie(cookieHeader,SESSION_COOKIE),sessionHash=hash(sid),at=clock(now);
  const session=await store.getSession({sessionHash,publisherId:trustedPublisher});
  if(!session||session.publisherId!==trustedPublisher||!UUID.test(session.userId??'')||
   !Number.isSafeInteger(session.issuedAt)||session.issuedAt>at||!Number.isSafeInteger(session.expiresAt)||at>=session.expiresAt||
   session.expiresAt-session.issuedAt>SESSION_TTL)fail('SESSION_EXPIRED');
  const role=await store.resolveMembership({userId:session.userId,publisherId:trustedPublisher});
  if(!ROLES.has(role))fail('MEMBERSHIP_REVOKED');
  const recentMfa=Number.isSafeInteger(session.mfaVerifiedAt)&&at>=session.mfaVerifiedAt&&at-session.mfaVerifiedAt<=MFA_TTL;
  return {session,sessionHash,role,recentMfa};
 }
 return Object.freeze({
  kind:'oidc',publisherId:trustedPublisher,
  async beginLogin({requestOrigin,cookieHeader,returnTo='/admin',requireMfa=false}={}){
   if(requestOrigin!==expected)fail('ORIGIN_FORBIDDEN');
   if(typeof requireMfa!=='boolean')fail('OIDC_REQUEST_INVALID');
   const path=returnPath(returnTo),metadata=await discovery(),state=random(),binding=random(),nonce=random(),verifier=random(),at=clock(now);
   let previousSessionHash=null;
   if(cookieHeader){try{previousSessionHash=hash(readCookie(cookieHeader,SESSION_COOKIE))}catch(error){if(!(error instanceof AuthError))throw error;}}
   await store.saveLoginTransaction({publisherId:trustedPublisher,stateHash:hash(state),bindingHash:hash(binding),nonce,verifier,createdAt:at,expiresAt:at+LOGIN_TTL,returnTo:path,requireMfa,previousSessionHash});
   const target=new URL(metadata.authorizationEndpoint);
   for(const [name,value] of Object.entries({client_id:clientId,response_type:'code',scope:'openid',redirect_uri:redirect.href,
    state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',max_age:'600',
    claims:JSON.stringify({id_token:{auth_time:{essential:true},amr:null,acr:acceptedMfaAcr.length?{essential:requireMfa,values:acceptedMfaAcr}:null}})}))target.searchParams.set(name,value);
   if(requireMfa){target.searchParams.set('prompt','login');if(acceptedMfaAcr.length)target.searchParams.set('acr_values',acceptedMfaAcr.join(' '));}
   return {location:target.href,setCookies:[cookie(LOGIN_COOKIE,binding,300,'Lax')]};
  },
  async finishLogin({callbackUrl,cookieHeader}={}){
   let url;try{url=new URL(callbackUrl)}catch{fail('OIDC_CALLBACK_INVALID')}
   if(url.origin!==redirect.origin||url.pathname!==redirect.pathname||url.hash||url.href.length>12000)fail('OIDC_CALLBACK_INVALID');
   for(const key of url.searchParams.keys())if(url.searchParams.getAll(key).length!==1||!['code','state','iss','session_state','error','error_description','error_uri'].includes(key))fail('OIDC_CALLBACK_INVALID');
   if(url.searchParams.has('error'))fail('OIDC_LOGIN_DENIED');
   const state=url.searchParams.get('state'),code=url.searchParams.get('code');
   if(!TOKEN.test(state??'')||!text(code,8192)||(url.searchParams.has('iss')&&url.searchParams.get('iss')!==issuer))fail('OIDC_CALLBACK_INVALID');
   const binding=readCookie(cookieHeader,LOGIN_COOKIE),at=clock(now);
   const transaction=await store.consumeLoginTransaction({stateHash:hash(state),bindingHash:hash(binding),publisherId:trustedPublisher,now:at});
   if(!transaction||transaction.publisherId!==trustedPublisher||transaction.expiresAt<=at||transaction.createdAt>at||
    transaction.expiresAt-transaction.createdAt>LOGIN_TTL||!TOKEN.test(transaction.verifier??'')||!TOKEN.test(transaction.nonce??''))fail('OIDC_STATE_INVALID');
   const metadata=await discovery(),body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect.href,client_id:clientId,code_verifier:transaction.verifier});
   const headers={'content-type':'application/x-www-form-urlencoded',accept:'application/json'};
   const formEncode=value=>new URLSearchParams([['',value]]).toString().slice(1);
   if(tokenEndpointAuthMethod==='client_secret_basic')headers.authorization='Basic '+Buffer.from(formEncode(clientId)+':'+formEncode(clientSecret)).toString('base64');
   if(tokenEndpointAuthMethod==='client_secret_post')body.set('client_secret',clientSecret);
   const tokens=await request(metadata.tokenEndpoint,{method:'POST',headers,body:body.toString()});
   const identity=await verifyIdToken(tokens.id_token,transaction,metadata,{code,accessToken:tokens.access_token});
   const member=await store.resolveIdentity({issuer,subject:identity.subject,publisherId:trustedPublisher});
   if(!member||!UUID.test(member.userId??'')||!ROLES.has(member.role))fail('PUBLISHER_NOT_ENROLLED');
   // Rotate on every sign-in, including MFA step-up, and revoke the old session.
   if(transaction.previousSessionHash){
    if(!/^[a-f0-9]{64}$/.test(transaction.previousSessionHash))fail('OIDC_STATE_INVALID');
    await store.deleteSession({sessionHash:transaction.previousSessionHash,publisherId:trustedPublisher});
   }else{try{const oldSid=readCookie(cookieHeader,SESSION_COOKIE);await store.deleteSession({sessionHash:hash(oldSid),publisherId:trustedPublisher})}catch(error){if(!(error instanceof AuthError))throw error;}}
   const sid=random(),csrf=random(),issuedAt=clock(now);
   await store.saveSession({sessionHash:hash(sid),publisherId:trustedPublisher,userId:member.userId.toLowerCase(),identityHash:hash(JSON.stringify([issuer,identity.subject])),csrfHash:hash(csrf),issuedAt,expiresAt:issuedAt+SESSION_TTL,mfaVerifiedAt:identity.mfaVerifiedAt});
   return {location:returnPath(transaction.returnTo),setCookies:[secureSessionCookie(sid),cookie(CSRF_COOKIE,csrf,1800),cookie(LOGIN_COOKIE,'',0,'Lax')]};
  },
  async getContext({cookieHeader}={}){
   const {session,role,recentMfa}=await currentSession(cookieHeader),csrfToken=readCookie(cookieHeader,CSRF_COOKIE);
   if(!same(hash(csrfToken),session.csrfHash))fail('CSRF_FORBIDDEN');
   return Object.freeze({userId:session.userId,publisherId:trustedPublisher,role,recentMfa,csrfToken,expiresAt:session.expiresAt});
  },
  async authorize({cookieHeader,csrfToken,requestOrigin,method,action,publisherId:requested=trustedPublisher}={}){
   if(requested!==trustedPublisher)fail('PUBLISHER_FORBIDDEN');
   if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))fail('METHOD_INVALID');
   const {session,role,recentMfa}=await currentSession(cookieHeader);
   if(!['GET','HEAD'].includes(method)){
    if(requestOrigin!==expected)fail('ORIGIN_FORBIDDEN');
    if(!TOKEN.test(csrfToken??'')||!same(hash(csrfToken),session.csrfHash))fail('CSRF_FORBIDDEN');
   }else if(action!=='view')fail('METHOD_NOT_ALLOWED');
   if(!publisherActionAllowed(role,action,recentMfa))fail(['publish','withdraw','invite','manage-members'].includes(action)&&role!=='viewer'&&!recentMfa?'MFA_REQUIRED':'ACTION_FORBIDDEN');
   return Object.freeze({publisherId:trustedPublisher,userId:session.userId,role,action,freshMembershipVerified:true,mfaVerifiedByTrustedServer:recentMfa});
  },
  async logout(request={}){
   await this.authorize({...request,method:'POST',action:'view'});
   const sid=readCookie(request.cookieHeader,SESSION_COOKIE);
   await store.deleteSession({sessionHash:hash(sid),publisherId:trustedPublisher});
   return {setCookies:[clearSessionCookie(),cookie(CSRF_COOKIE,'',0),cookie(LOGIN_COOKIE,'',0,'Lax')]};
  }
 });
}
