/** Deterministic regression tests for asynchronous API authority and cancellation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createApplicationApi} from '../apps/web/application/api.mjs';
import {createConversationService} from '../apps/web/application/conversation.mjs';
import {createMemorySessionStore} from '../packages/sessions/store.mjs';
import {createPgSessionStore} from '../packages/sessions/pg-store.mjs';
import {approveModelReviewedSegment} from '../packages/grounding/entailment/reviewed.mjs';
import {buildReaderEvidence} from '../packages/grounding/reader-evidence.mjs';
import {validateClaimDraft} from '../packages/grounding/claims/index.mjs';
import {publicPack,publisherId,billId,versionId} from './fixtures/public-pack.mjs';
const origin='https://askbill.example',pack=publicPack();
const hash=value=>createHash('sha256').update(value).digest('hex');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
class ResponseCapture extends EventEmitter{
 constructor(){super();this.headers={};this.chunks=[];this.statusCode=200;this.headersSent=false;this.writableEnded=false;this.destroyed=false;}
 writeHead(status,headers){this.statusCode=status;this.headers={...this.headers,...headers};this.headersSent=true;return this;}
 write(chunk){this.chunks.push(Buffer.from(chunk));return true;}
 end(chunk){if(chunk)this.write(chunk);this.writableEnded=true;this.emit('finish');}
 text(){return Buffer.concat(this.chunks).toString('utf8');}
 json(){return JSON.parse(this.text());}
}
async function fixture({speech=null,transcription=null,maxInflight=25}={}){
 let published=true;const sessions=createMemorySessionStore({stage:'test'});
 const lookup=async()=>published?pack:null,conversation=createConversationService({publisherId,lookupPublishedPack:lookup});
 const api=createApplicationApi({publisherId,origin,stage:'test',sessions,conversation,lookupPublishedPack:lookup,speech,transcription,maxInflight});
 async function call(path,{method='POST',body,headers={}}={}){
  const content=Buffer.isBuffer(body)?body:body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body));
  const req=Readable.from([content]);req.method=method;req.url=path;req.headers={origin,'content-type':'application/json','content-length':String(content.length),...headers};
  const res=new ResponseCapture();await api.handle(req,res);return res;
 }
 const issued=await call('/api/session',{body:{ageBand:'adult'}});assert.equal(issued.statusCode,201);
 const session=issued.json(),cookie=issued.headers['Set-Cookie'].split(';')[0],tokenHash=hash(cookie.split('=')[1]);
 const headers={cookie,'x-csrf-token':session.csrfToken};
 const request=(path,input={})=>call(path,{...input,headers:{...headers,...input.headers}});
 async function answer(){
  const response=await request('/api/conversation',{body:{billId,versionId,question:'reading room',conversationEpoch:1}});
  assert.equal(response.statusCode,200);const events=response.text().split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5)));
  const event=events.find(item=>item.type==='segment.validated');assert(event,'Expected a source-validated segment');return {answerId:event.answerId,segmentId:event.segment.id,conversationEpoch:1,billId,versionId};
 }
 const stt=(epoch=0)=>request('/api/transcription',{body:Buffer.from('RIFFfixture-audio-bytes'),headers:{'content-type':'audio/wav','x-bill-id':billId,'x-version-id':versionId,'x-conversation-epoch':String(epoch)}});
 return {api,sessions,request,stt,answer,tokenHash,withdraw:()=>{published=false;}};
}
test('clearing a session aborts all pending transcriptions and suppresses their late text',{timeout:5000},async()=>{
 const entered=deferred(),release=deferred();let signal,audio;
 const app=await fixture({transcription:{async transcribe(request){signal=request.signal;audio=request.audio;entered.resolve();await release.promise;return {text:'PRIVATE LATE TRANSCRIPT'};}}});
 const pending=app.stt();await entered.promise;
 const clear=await app.request('/api/session',{method:'DELETE'});assert.equal(clear.statusCode,200);assert.equal(signal.aborted,true);
 release.resolve();const response=await pending;assert.notEqual(response.statusCode,200);assert.doesNotMatch(response.text(),/PRIVATE LATE TRANSCRIPT/);
 assert(audio.every(byte=>byte===0));assert.equal(app.api.capacity().active,0);
});
test('a new question aborts a pending transcription from the earlier conversation epoch',{timeout:5000},async()=>{
 const entered=deferred(),release=deferred();let signal;
 const app=await fixture({transcription:{async transcribe(request){signal=request.signal;entered.resolve();await release.promise;return {text:'OLD EPOCH WORDS'};}}});
 const pending=app.stt();await entered.promise;
 const newer=await app.request('/api/conversation',{body:{billId,versionId,question:'reading room',conversationEpoch:1}});assert.equal(newer.statusCode,200);assert.equal(signal.aborted,true);
 release.resolve();const response=await pending;assert.notEqual(response.statusCode,200);assert.doesNotMatch(response.text(),/OLD EPOCH WORDS/);
});
test('application drain aborts both speech and transcription for the same session',{timeout:5000},async()=>{
 const enteredSpeech=deferred(),enteredText=deferred(),release=deferred();let speechSignal,textSignal;
 const app=await fixture({speech:{async synthesize(request){speechSignal=request.signal;enteredSpeech.resolve();await release.promise;return {bytes:Buffer.alloc(44,1)};}},
  transcription:{async transcribe(request){textSignal=request.signal;enteredText.resolve();await release.promise;return {text:'AFTER DRAIN'};}}});
 const answer=await app.answer(),speech=app.request('/api/speech',{body:answer}),text=app.stt(1);
 await Promise.all([enteredSpeech.promise,enteredText.promise]);assert.equal(app.api.capacity().active,2);
 app.api.drain();assert.equal(speechSignal.aborted,true);assert.equal(textSignal.aborted,true);release.resolve();
 const [spoken,transcribed]=await Promise.all([speech,text]);assert.notEqual(spoken.statusCode,200);assert.notEqual(transcribed.statusCode,200);assert.doesNotMatch(transcribed.text(),/AFTER DRAIN/);assert.equal(app.api.capacity().active,0);
});
test('source withdrawal during synthesis withholds the resulting audio',{timeout:5000},async()=>{
 const entered=deferred(),release=deferred();
 const app=await fixture({speech:{async synthesize(){entered.resolve();await release.promise;return {bytes:Buffer.alloc(44,1)};}}});
 const answer=await app.answer(),pending=app.request('/api/speech',{body:answer});await entered.promise;app.withdraw();release.resolve();
 const response=await pending;assert.equal(response.statusCode,404);assert.equal(response.json().code,'SOURCE_UNAVAILABLE');assert.notEqual(response.headers['Content-Type'],'audio/wav');
});
test('speech/transcription reject future and stale epochs before spending provider capacity',async()=>{
 let calls=0;const app=await fixture({transcription:{async transcribe(){calls++;return {text:'Unexpected'};}}});
 assert.equal((await app.stt(1)).statusCode,400);assert.equal(calls,0);
 await app.answer();assert.equal((await app.stt(0)).statusCode,400);assert.equal(calls,0);
 assert.equal((await app.stt(2)).statusCode,400);assert.equal(calls,0);
 const current=await app.stt(1);assert.equal(current.statusCode,200);assert.equal(calls,1);assert.equal(current.json().automaticallySubmitted,false);
});
test('memory and durable session factories reject non-finite or unbounded safety caps',()=>{
 for(const bad of [NaN,Infinity,0,-1,100001]){
  assert.throws(()=>createMemorySessionStore({stage:'test',maxPerDay:bad}),error=>error.code==='INVALID_SESSION_LIMIT');
  assert.throws(()=>createPgSessionStore({pool:{connect(){}},publisherId,encryptionKey:Buffer.alloc(32,1).toString('base64'),maxSessions:bad}),error=>error.code==='INVALID_SESSION_LIMIT');
 }
 for(const bad of [NaN,Infinity,0,-1,51])assert.throws(()=>createApplicationApi({publisherId,origin,sessions:{get(){}},conversation:{answer(){}},maxInflight:bad}),error=>error.code==='API_CONFIGURATION');
});
test('conversation delivery rechecks publisher, bill and version identity even with identical text',async()=>{
 for(const changed of [{publisherId:'ffffffff-1111-4111-8111-111111111111'},{billId:'ffffffff-2222-4222-8222-222222222222'},{versionId:'ffffffff-3333-4333-8333-333333333333'}]){
  let reads=0;const events=[];
  const service=createConversationService({publisherId,lookupPublishedPack:async()=>++reads===1?pack:{...pack,...changed}});
  await assert.rejects(()=>service.answer({billId,versionId,question:'reading room',ageBand:'adult',conversationEpoch:1,onEvent:event=>events.push(event)}),error=>error.code==='SOURCE_WITHDRAWN');
  assert.deepEqual(events.map(event=>event.type),['answer.started']);
 }
});
test('the deterministic semantic gate rejects an approval that tries to repair missing caveats',async()=>{
 const {evidence,bundle}=buildReaderEvidence({pack,question:'reading room'});
 const route={status:'allowed',sourcePublished:true,noModelToolExecution:true,publisherId,versionId,questionSha256:hash('reading room')};
 const draft={type:'untrusted_draft',provider:'test',versionId,text:pack.provisions[0].text,
  claims:[{kind:'interpretation',sourceId:pack.provisions[0].id,quote:pack.provisions[0].text,claimText:pack.provisions[0].text}],verificationRequired:true,noCitationAuthority:true};
 const held=await validateClaimDraft({route,evidence,draft,validatedAt:new Date().toISOString(),promptConfigSha256:hash('security regression')});
 const review={status:'model_review',versionId,draftSha256:hash(JSON.stringify(draft)),evidenceSha256:hash(JSON.stringify(bundle)),allMaterialTextSupported:true,exceptionsPreserved:true,statusAccurate:true,claims:[{index:0,supported:true,caveats:['The answer omitted a material exception.']}],reasonCodes:[]};
 await assert.rejects(()=>approveModelReviewedSegment({held,evidence,draft,bundle,review}),error=>error.code==='CLAIM_REVIEW_REJECTED');
 review.claims[0].caveats=[];const approved=await approveModelReviewedSegment({held,evidence,draft,bundle,review});assert.equal(approved.segment.claims[0].support,'supported');
});
