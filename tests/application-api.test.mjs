import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApplicationApi} from '../apps/web/application/api.mjs';
import {createConversationService} from '../apps/web/application/conversation.mjs';
import {createMemorySessionStore} from '../packages/sessions/store.mjs';
import {publicPack,publisherId,billId,versionId} from './fixtures/public-pack.mjs';
const origin='http://127.0.0.1:4100',pack=publicPack();
async function fixture(options={}){
  const sessions=createMemorySessionStore({stage:'test',...options});
  const lookup=async()=>pack;
  const api=createApplicationApi({publisherId,origin,stage:'test',sessions,lookupPublishedPack:lookup,
    conversation:createConversationService({publisherId,lookupPublishedPack:lookup})});
  const server=createServer((req,res)=>api.handle(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=(path,body,headers={},method='POST')=>fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const start=async(ageBand='adult')=>{const res=await request('/api/session',{ageBand});return {res,session:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};
  return {request,start,base,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('real HTTP session-to-answer journey and explicit erasure',async()=>{
  const app=await fixture();try{
    const started=await app.start();assert.equal(started.res.status,201);assert.match(started.res.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const headers={Cookie:started.cookie,'X-CSRF-Token':started.session.csrfToken};
    const result=await app.request('/api/conversation',{billId,versionId,question:'reading room',conversationEpoch:1},headers);
    assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/event-stream/);
    const text=await result.text();assert.match(text,/segment.validated/);assert.match(text,/answer.completed/);
    const stale=await app.request('/api/conversation',{billId,versionId,question:'reading room',conversationEpoch:1},headers);assert.equal(stale.status,400);
    const erased=await app.request('/api/session',undefined,headers,'DELETE');assert.equal(erased.status,200);
    const denied=await app.request('/api/conversation',{billId,versionId,question:'reading room',conversationEpoch:2},headers);assert.equal(denied.status,401);
  }finally{await app.close();}
});
test('forged origins/cookies/CSRF and under-13 free input are denied',async()=>{
  const app=await fixture();try{
    assert.equal((await app.request('/api/session',{ageBand:'adult'},{Origin:'https://foreign.example'})).status,403);
    const child=await app.start('under-13');assert.equal(child.session.curatedOnly,true);assert.ok(!child.session.csrfToken);
    const started=await app.start();
    assert.equal((await app.request('/api/conversation',{billId,versionId,question:'reading room',conversationEpoch:1},{Cookie:started.cookie})).status,403);
    assert.equal((await app.request('/api/conversation',{billId,versionId,question:'reading room',conversationEpoch:1})).status,401);
  }finally{await app.close();}
});
test('request limits survive session erasure and reading capabilities remain available',async()=>{
  const app=await fixture({maxPerDay:1});try{
    let started=await app.start(),headers={Cookie:started.cookie,'X-CSRF-Token':started.session.csrfToken};
    await (await app.request('/api/conversation',{billId,versionId,question:'reading room',conversationEpoch:1},headers)).text();
    await app.request('/api/session',undefined,headers,'DELETE');started=await app.start();headers={Cookie:started.cookie,'X-CSRF-Token':started.session.csrfToken};
    assert.equal((await app.request('/api/conversation',{billId,versionId,question:'reading room',conversationEpoch:1},headers)).status,429);
    const capabilities=await fetch(app.base+'/api/capabilities');assert.equal(capabilities.status,200);assert.equal((await capabilities.json()).mode,'source');
  }finally{await app.close();}
});
