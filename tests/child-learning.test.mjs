import test from 'node:test';import assert from 'node:assert/strict';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
import {renderChildLearning,curatedQuestions,childLearningPolicy} from '../packages/learning/curated/index.mjs';
test('civic glossary is static, neutral, and clearly distinguishes proposals and laws',()=>{
 const q=curatedQuestions();assert.equal(q.length,5);assert(Object.isFrozen(q));
 assert(q.some(x=>x.answer.includes('does not automatically become a law')));
 assert(q.some(x=>x.answer.includes('exception')));
 assert(q.some(x=>x.answer.includes('official source')));
 assert(q.every(x=>x.id&&x.question&&x.answer&&Object.isFrozen(x)));
});
test('child route claims no verification of consent and never enables free input or tracking',()=>{
 assert.equal(childLearningPolicy.mode,'curated-only');
 for(const k of ['sessionRequired','freeTextEnabled','microphoneEnabled','liveAiEnabled','trackingEnabled','thirdPartyAnalyticsEnabled','parentalConsentClaimed'])assert.equal(childLearningPolicy[k],false);
 const html=renderChildLearning();
 assert.match(html,/<details><summary>/);assert.match(html,/<main id="questions">/);
 assert(!/<(?:script|iframe|form|input|textarea|audio|video)\b/i.test(html));
 assert(!/https?:\/\//i.test(html));
 assert(html.includes('No free-text or voice recording'));
 assert(html.includes('proposed bill is not automatically'));
});
test('HTTP serves a no-JS accessible child learning page, no cookies or provider calls',async()=>{
 let calls=0;
 const server=await createPublishedSourceServer({publisherId:'11111111-1111-4111-8111-111111111111',lookupPublishedPack:async()=>{calls++;throw Error('private store')}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const url='http://127.0.0.1:'+server.address().port,res=await fetch(url+'/learn');
  assert.equal(res.status,200);assert.equal(res.headers.get('set-cookie'),null);
  assert.match(res.headers.get('content-security-policy'),/script-src 'none'/);
  assert.match(res.headers.get('cache-control'),/no-store/);
  assert((await res.text()).includes('How do bills work?'));
  assert.equal((await fetch(url+'/learn',{method:'HEAD'})).status,200);
  assert.equal((await fetch(url+'/learn',{method:'POST'})).status,405);
  for(const suffix of ['/learn?chat=yes','/learn%2F','/learn/record'])assert.equal((await fetch(url+suffix)).status,404);
  assert.equal(calls,0);
 } finally {await new Promise(ok=>server.close(ok));}
});
