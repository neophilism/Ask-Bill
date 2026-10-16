import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApiEvent } from '../apps/api/dist/index.js';
import { parseWebEvent, parseWebCue } from '../apps/web/dist/index.js';

const common={schemaVersion:1,answerId:'ans',sequence:0,conversationEpoch:0,documentVersion:'v1',createdAt:'2026-10-16T21:07:51Z',type:'answer.started'};
test('API and web reject malformed or wrong-version answer events consistently',()=>{
  for(const parse of [parseApiEvent,parseWebEvent]){
    assert.equal(parse(common).documentVersion,'v1');
    assert.throws(()=>parse({...common,schemaVersion:99}));
    assert.throws(()=>parse({...common,type:'citation.ready',span:{sourceVersionId:'v2'}}));
    assert.throws(()=>parse({...common,cssSelector:'#root'}));
  }
});
test('client rejects coordinates from model cue payloads',()=>{
  assert.throws(()=>parseWebCue({type:'reference',segmentId:'segment',claimId:'claim',spanIndex:0,x:10}));
});
