import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationService} from '../apps/web/application/conversation.mjs';
import {buildReaderEvidence} from '../packages/grounding/reader-evidence.mjs';
import {publicPack,publisherId,billId,versionId,hash} from './fixtures/public-pack.mjs';
import {answerView} from '../packages/ui/citations/index.mjs';

const pack=publicPack(), lookup=async({versionId:v})=>v===versionId?pack:null;
const input={billId,versionId,question:'What does the reading room provide?',ageBand:'adult',conversationEpoch:1};
function providers({badReview=false,badQuote=false,extraText=false}={}){
  return {provider:{async generate(){const claims=[{kind:'interpretation',sourceId:'section1',quote:badQuote?'Invented law':pack.provisions[0].text,
    claimText:'The proposal would give readers free access to published documents in a public reading room.'}];
    return {type:'untrusted_draft',provider:'test',versionId,text:claims.map(x=>x.claimText).join('\n\n')+(extraText?' UNREVIEWED SECRET':''),claims,verificationRequired:true,noCitationAuthority:true};}},
    reviewer:{async review({draft,bundle}){return {status:'model_review',versionId,draftSha256:hash(JSON.stringify(draft)),evidenceSha256:hash(JSON.stringify(bundle)),
      allMaterialTextSupported:!badReview,exceptionsPreserved:true,statusAccurate:true,claims:draft.claims.map((_c,index)=>({index,supported:true,caveats:[]})),reasonCodes:[]};}}};
}
test('integrated source fallback streams source-verified excerpts and citations',async()=>{
  const service=createConversationService({publisherId,lookupPublishedPack:lookup});
  const result=await service.answer(input);
  assert.equal(result.events[0].type,'answer.started');assert.equal(result.events.at(-1).type,'answer.completed');
  assert.equal(result.segments[0].claims[0].support,'supported');
  assert.ok(result.segments[0].text.includes('except when'));
});
test('independently reviewed explanation displays only with exact valid source spans',async()=>{
  const service=createConversationService({publisherId,lookupPublishedPack:lookup,...providers()});
  const result=await service.answer(input);assert.equal(result.events.at(-1).type,'answer.completed');
  const view=await answerView({events:result.events,versionId,answerId:result.answerId,epoch:1,allowModelReviewed:true,
    sourceLookup:id=>({versionId,publication:'published',sourceComplete:true,...pack.provisions.find(item=>item.id===id)})});
  assert.equal(view[0].label,'AI explanation — check the cited source');
  assert.equal(view[0].citations[0].quote,pack.provisions[0].text);
  await assert.rejects(()=>answerView({events:result.events,versionId,answerId:result.answerId,epoch:1,sourceLookup:()=>null}));
});
for(const [label,options] of [['review rejection',{badReview:true}],['invented quote',{badQuote:true}],['unclaimed material text',{extraText:true}]]){
  test(label+' cannot leak a draft into the stream',async()=>{
    const result=await createConversationService({publisherId,lookupPublishedPack:lookup,...providers(options)}).answer(input);
    assert.equal(result.events.at(-1).type,'answer.failed');assert.equal(result.segments.length,0);
    assert.ok(!JSON.stringify(result.events).includes('UNREVIEWED SECRET'));
  });
}
test('unknown/under-13 age and personal legal questions never call providers',async()=>{
  let calls=0;const service=createConversationService({publisherId,lookupPublishedPack:lookup,provider:{generate(){calls++;}},reviewer:{}});
  for(const request of [{...input,ageBand:'under-13'},{...input,ageBand:'unknown'},{...input,question:'Should I sue?'}]){
    const result=await service.answer(request);assert.equal(result.events.at(-1).type,'answer.failed');
  }assert.equal(calls,0);
});
test('selected Unicode spans are rechecked against canonical source',()=>{
  assert.throws(()=>buildReaderEvidence({pack,question:input.question,selectedSpan:{provisionId:'section1',start:0,end:3,quote:'bad'}}),/SELECTION_INVALID/);
  assert.throws(()=>buildReaderEvidence({pack,question:input.question,selectedSpan:{provisionId:'foreign',start:0,end:3,quote:'The'}}),/SELECTION_INVALID/);
});
test('a source withdrawn during generation cannot be emitted',async()=>{
  let count=0;const service=createConversationService({publisherId,lookupPublishedPack:async()=>++count===1?pack:null,...providers()});
  const events=[];await assert.rejects(()=>service.answer({...input,onEvent:event=>events.push(event)}),/SOURCE_WITHDRAWN/);
  assert.deepEqual(events.map(event=>event.type),['answer.started']);
});
