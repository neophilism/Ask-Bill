/** Same-origin API: scoped sessions, validated SSE and optional bounded speech. */
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {encodeSse} from '../../../packages/streaming/index.mjs';
import {validatePublishedReaderPack} from '../../../packages/ui/reader/index.mjs';
import {verifyValidatedSegment} from '../../../packages/contracts/dist/index.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const secureHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const MESSAGES={SESSION_REQUIRED:'Start a question session first.',SESSION_EXPIRED:'Your session expired. Start a new session.',
  AGE_RESTRICTED:'Use guided learning for this age group.',CSRF_REJECTED:'Reload this page and start a new session.',
  SOURCE_UNAVAILABLE:'This source version is unavailable. Return to the bill catalog.',STALE_EPOCH:'Start a new question or reload this session.',
  USAGE_LIMIT:'The question or speech limit has been reached. Reading and source search remain available.',
  PROVIDER_UNAVAILABLE:'This provider is unavailable. Reading remains available.',INVALID_REQUEST:'Check the request and try again.',
  REQUEST_TOO_LARGE:'This request exceeds the supported size.',SERVICE_BUSY:'Please wait briefly and try again.',
  SESSION_CAPACITY:'All question sessions are currently in use. Please try again shortly; reading remains available.',
  AUDIO_DECODER_BUSY:'Recording processing is busy. Please wait briefly and try again.',
  AUDIO_INPUT_DURATION_LIMIT:'Record a question of 30 seconds or less.',AUDIO_INPUT_INVALID:'This recording could not be read. Please record it again.'};
function json(res,status,value,headers={}) {const body=Buffer.from(JSON.stringify(value));res.writeHead(status,{...secureHeaders,'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,...headers});res.end(body);}
async function body(req,maxBytes) {
  if(Number(req.headers['content-length'])>maxBytes)fail('REQUEST_TOO_LARGE');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>maxBytes)fail('REQUEST_TOO_LARGE');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function jsonBody(req,maxBytes=8000) {
  if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))fail('INVALID_REQUEST');
  let value;try{value=JSON.parse((await body(req,maxBytes)).toString('utf8'));}catch(error){if(error.code)throw error;fail('INVALID_REQUEST');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_REQUEST');return value;
}
function onlyKeys(value,allowed) {if(Object.keys(value).some(key=>!allowed.includes(key)))fail('INVALID_REQUEST');}
function scope(value){if(!uuid.test(value.billId??'')||!uuid.test(value.versionId??''))fail('INVALID_REQUEST');}
export function createApplicationApi({publisherId,origin,stage='production',sessions,conversation,lookupPublishedPack,
  speech=null,transcription=null,authorizeSpeechSegment=()=>{},maxInflight=25,now=()=>Date.now()}={}) {
  if(!sessions?.get||!conversation?.answer||typeof origin!=='string'||!uuid.test(publisherId??'')||
    !Number.isSafeInteger(maxInflight)||maxInflight<1||maxInflight>50)fail('API_CONFIGURATION');
  const secure=stage==='production'||stage==='staging';
  const cookieName=secure?'__Host-ask-bill':'ask_bill_session';
  const cookie=token=>cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800'+(secure?'; Secure':'');
  const clearCookie=()=>cookieName+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(secure?'; Secure':'');
  const allowedAudio=new Set(['audio/webm','audio/webm;codecs=opus','audio/ogg','audio/ogg;codecs=opus','audio/wav','audio/mp4','audio/mpeg']);
  const controllers=new Map();let inflight=0,sessionCreates=0;
  const abortSession=(digest,except)=>{for(const controller of controllers.get(digest)??[])if(controller!==except)controller.abort();};
  const tokenHash=req=>{
    const matches=(req.headers.cookie??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(cookieName+'='));
    if(matches.length!==1)return null;const token=matches[0].slice(cookieName.length+1);
    return /^[A-Za-z0-9_-]{43}$/.test(token)?hash(token):null;
  };
  function sameOrigin(req){if(req.headers.origin!==origin||['cross-site','same-site'].includes(req.headers['sec-fetch-site']))fail('CSRF_REJECTED');}
  async function context(req){
    sameOrigin(req);const digest=tokenHash(req);if(!digest)fail('SESSION_REQUIRED');
    const session=await sessions.get(digest);if(!session)fail('SESSION_EXPIRED');
    const raw=req.headers['x-csrf-token'];if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw)||
      !timingSafeEqual(Buffer.from(hash(raw),'hex'),Buffer.from(session.csrfHash,'hex')))fail('CSRF_REJECTED');
    if(!['adult','13-17'].includes(session.ageBand))fail('AGE_RESTRICTED');return {session,digest};
  }
  async function published(input){scope(input);const pack=await lookupPublishedPack({publisherId,billId:input.billId,versionId:input.versionId});
    if(!pack||pack.publisherId!==publisherId||pack.billId!==input.billId||pack.versionId!==input.versionId)fail('SOURCE_UNAVAILABLE');
    validatePublishedReaderPack(pack);return pack;}
  async function handler(req,res){
    if(!req.url?.startsWith('/api/'))return false;
    if(req.url==='/api/capabilities'&&(req.method==='GET'||req.method==='HEAD')){
      json(res,200,{conversation:true,tts:Boolean(speech),stt:Boolean(transcription),mode:conversation.mode,sessionMinutes:30});return true;
    }
    try{
      if(req.url==='/api/session'&&req.method==='POST'){
        sameOrigin(req);const input=await jsonBody(req,256);onlyKeys(input,['ageBand']);
        if(!['adult','13-17','under-13'].includes(input.ageBand))fail('INVALID_REQUEST');
        const old=tokenHash(req);if(old){abortSession(old);await sessions.erase(old);}
        if(input.ageBand==='under-13'){json(res,200,{ageBand:'under-13',curatedOnly:true,learningUrl:'/learn'},{'Set-Cookie':clearCookie()});return true;}
        const token=randomBytes(32).toString('base64url'),csrfToken=randomBytes(32).toString('base64url');
        if(sessionCreates>=maxInflight)fail('SERVICE_BUSY');
        sessionCreates++;let created;
        try{created=await sessions.create({tokenHash:hash(token),csrfHash:hash(csrfToken),ageBand:input.ageBand,expiresAt:now()+1800000});}finally{sessionCreates--;}
        json(res,201,{csrfToken,ageBand:input.ageBand,expiresAt:new Date(created.expiresAt).toISOString(),conversationEpoch:0},{'Set-Cookie':cookie(token)});return true;
      }
      if(req.url==='/api/session'&&req.method==='DELETE'){
        const {digest}=await context(req);abortSession(digest);await sessions.erase(digest);
        json(res,200,{erased:true},{'Set-Cookie':clearCookie()});return true;
      }
      if(req.method!=='POST'||!['/api/conversation','/api/speech','/api/transcription'].includes(req.url)){
        json(res,404,{code:'NOT_FOUND',message:'This API route is unavailable.'});return true;
      }
      const {session,digest}=await context(req);
      if(inflight>=maxInflight)fail('SERVICE_BUSY');
      inflight++;
      const controller=new AbortController();
      const sessionControllers=controllers.get(digest)??new Set();sessionControllers.add(controller);controllers.set(digest,sessionControllers);
      const disconnected=()=>controller.abort();res.once('close',disconnected);req.once('aborted',disconnected);
      try{
        if(req.url==='/api/conversation'){
          const input=await jsonBody(req,32768);onlyKeys(input,['billId','versionId','question','readingLevel','selectedSpan','conversationEpoch']);
          if(input.selectedSpan){
            if(typeof input.selectedSpan!=='object'||Array.isArray(input.selectedSpan))fail('INVALID_REQUEST');
            onlyKeys(input.selectedSpan,['provisionId','start','end','quote']);
            if(typeof input.selectedSpan.quote!=='string'||Array.from(input.selectedSpan.quote).length>4000)fail('INVALID_REQUEST');
          }
          await published(input);
          if(typeof input.question!=='string'||input.question.length<3||input.question.length>2000||
            !['standard','simple','concise'].includes(input.readingLevel??'standard'))fail('INVALID_REQUEST');
          await sessions.begin({tokenHash:digest,conversationEpoch:input.conversationEpoch,kind:'conversation'});
          abortSession(digest,controller);
          res.writeHead(200,{...secureHeaders,'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'});
          let completed;
          const answer=await conversation.answer({...input,ageBand:session.ageBand,signal:controller.signal,
            isCurrent:()=>sessions.isCurrent(digest,input.conversationEpoch),onEvent:event=>{
              if(event.type==='answer.completed')completed=event;else res.write(encodeSse(event));
            }});
          if(answer.answerId&&answer.segments.length)await sessions.saveAnswer(digest,answer);
          if(completed&&!controller.signal.aborted)res.write(encodeSse(completed));res.end();return true;
        }
        if(req.url==='/api/speech'){
          if(!speech)fail('PROVIDER_UNAVAILABLE');
          const input=await jsonBody(req,1024);onlyKeys(input,['billId','versionId','answerId','segmentId','conversationEpoch']);
          const pack=await published(input);
          if(!uuid.test(input.answerId??'')||typeof input.segmentId!=='string')fail('INVALID_REQUEST');
          const answer=await sessions.getAnswer(digest,input.answerId);
          const segment=answer?.segments.find(item=>item.id===input.segmentId);
          if(!segment||answer.versionId!==input.versionId||answer.billId!==input.billId||
            answer.conversationEpoch!==input.conversationEpoch||!await sessions.isCurrent(digest,input.conversationEpoch))fail('STALE_EPOCH');
          await verifyValidatedSegment(segment,input.versionId,id=>pack.provisions.find(section=>section.id===id)?.text);
          await sessions.begin({tokenHash:digest,conversationEpoch:input.conversationEpoch,kind:'speech'});
          authorizeSpeechSegment(segment,pack);
          const audio=await speech.synthesize({segment,versionId:input.versionId,sessionId:session.id,conversationEpoch:input.conversationEpoch,signal:controller.signal});
          if(controller.signal.aborted||!await sessions.isCurrent(digest,input.conversationEpoch))fail('REQUEST_ABORTED');
          const stillPublished=await published(input);
          if(stillPublished.canonicalSha256!==pack.canonicalSha256)fail('SOURCE_UNAVAILABLE');
          const bytes=Buffer.from(audio.bytes??audio.audio??[]);
          if(bytes.length<44||bytes.length>10*1024*1024)fail('PROVIDER_UNAVAILABLE');
          res.writeHead(200,{...secureHeaders,'Content-Type':'audio/wav','Content-Length':bytes.length,
            'X-Source-Validated':'true','X-Voice-Licensed':'true','X-Text-Sha256':hash(segment.text),'X-Audio-Sha256':hash(bytes)});res.end(bytes);return true;
        }
        if(!transcription)fail('PROVIDER_UNAVAILABLE');
        if(session.ageBand!=='adult')fail('AGE_RESTRICTED');
        const input={billId:req.headers['x-bill-id'],versionId:req.headers['x-version-id'],conversationEpoch:Number(req.headers['x-conversation-epoch'])};
        await published(input);
        const mimeType=(req.headers['content-type']??'').toLowerCase();if(!allowedAudio.has(mimeType))fail('INVALID_REQUEST');
        const audio=await body(req,5*1024*1024);
        try{
          if(audio.length<12)fail('INVALID_REQUEST');
          await sessions.begin({tokenHash:digest,conversationEpoch:input.conversationEpoch,kind:'transcription'});
          const result=await transcription.transcribe({audio,mimeType,versionId:input.versionId,conversationEpoch:input.conversationEpoch,signal:controller.signal,language:'en'});
          if(controller.signal.aborted||!await sessions.isCurrent(digest,input.conversationEpoch))fail('REQUEST_ABORTED');
          await published(input);
          json(res,200,{text:result.text,editable:true,automaticallySubmitted:false,language:result.language??'en'});
        }finally{audio.fill(0);}return true;
      }finally{
        inflight--;sessionControllers.delete(controller);if(!sessionControllers.size)controllers.delete(digest);
        res.removeListener('close',disconnected);req.removeListener('aborted',disconnected);
      }
    }catch(error){
      if(res.destroyed||res.writableEnded)return true;
      if(res.headersSent){res.end();return true;}
      const code=Object.hasOwn(MESSAGES,error.code)?error.code:'PROVIDER_UNAVAILABLE';
      const status=['SESSION_REQUIRED','SESSION_EXPIRED'].includes(code)?401:code==='CSRF_REJECTED'||code==='AGE_RESTRICTED'?403:
        code==='SOURCE_UNAVAILABLE'?404:['USAGE_LIMIT','SERVICE_BUSY','SESSION_CAPACITY','AUDIO_DECODER_BUSY'].includes(code)?429:code==='REQUEST_TOO_LARGE'?413:
        ['INVALID_REQUEST','STALE_EPOCH','AUDIO_INPUT_DURATION_LIMIT','AUDIO_INPUT_INVALID'].includes(code)?400:503;
      json(res,status,{code,message:MESSAGES[code]});return true;
    }
  }
  return Object.freeze({handle:handler,drain(){for(const digest of controllers.keys())abortSession(digest);},capacity:()=>({active:inflight,limit:maxInflight})});
}
