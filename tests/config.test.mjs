import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicSettings,demoAnswer,ConfigError} from '../packages/config/dist/index.js';
import {validateServerSettings} from '../packages/config/dist/server.js';
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('../fixtures/electronic-filing-excerpt.json',import.meta.url),'utf8'));
test('local defaults never enable live or expose secrets',()=>{
  const pub=createPublicSettings('local');
  assert.equal(pub.siteOrigin,'http://127.0.0.1:4100');
  assert.equal(pub.capabilities.reading,true);
  assert.equal(pub.capabilities.fixtureAnswers,true);
  assert.equal(pub.capabilities.liveAnswers,false);
  const secret='super_private_key_do_not_serialize';
  const server=validateServerSettings({ASK_BILL_LLM_API_KEY:secret,ASK_BILL_DATABASE_URL:'postgres://secret'},'local');
  assert.equal(server.databaseReady,true);
  assert(!JSON.stringify(server).includes(secret));
  assert(!JSON.stringify(server).includes('postgres://secret'));
});
test('production must use HTTPS and forbids fake provider capabilities',()=>{
  assert.throws(()=>createPublicSettings('production'),e=>e.code==='INVALID_SITE_ORIGIN');
  assert.throws(()=>createPublicSettings('production','http://example.org'),e=>e.code==='PRODUCTION_HTTPS_REQUIRED');
  const prod=createPublicSettings('production','https://askbill.example');
  assert.equal(prod.capabilities.fixtureAnswers,false);
  assert.equal(prod.sourcePolicy,'published-only');
  assert.throws(()=>createPublicSettings('local','http://example.org'),e=>e.code==='LOCAL_ORIGIN_NOT_LOOPBACK');
});
test('legacy fixture preview cannot activate live providers; application runtime owns them',()=>{
  const base={ASK_BILL_PUBLIC_ORIGIN:'https://askbill.example'};
  const ai={...base,ASK_BILL_ALLOW_LIVE_AI:'true'};
  assert.throws(()=>validateServerSettings(ai,'production'),e=>e.code==='LLM_CREDENTIAL_MISSING');
  assert.throws(()=>validateServerSettings({...ai,ASK_BILL_LLM_API_KEY:'secret'},'production'),e=>e.code==='PROVIDER_DATA_PROTECTION_MISSING');
  assert.throws(()=>validateServerSettings({...ai,ASK_BILL_LLM_API_KEY:'secret',ASK_BILL_PROVIDER_DATA_PROTECTION:'verified'},'production'),e=>e.code==='APPLICATION_RUNTIME_REQUIRED');
  assert.throws(()=>validateServerSettings({...base,ASK_BILL_ALLOW_VOICE:'true'},'production'),e=>e.code==='VOICE_CREDENTIAL_MISSING');
  assert.throws(()=>validateServerSettings({...base,ASK_BILL_ALLOW_VOICE:'true',ASK_BILL_TTS_API_KEY:'secret'},'production'),e=>e.code==='APPLICATION_RUNTIME_REQUIRED');
  assert.throws(()=>validateServerSettings({...base,ASK_BILL_ALLOW_LIVE_AI:'yes'},'production'),e=>e.code==='INVALID_FLAG');
  assert.throws(()=>validateServerSettings({...base,ASK_BILL_DATABASE_URL:'file:///secrets'},'production'),e=>e.code==='DATABASE_SCHEME_INVALID');
  assert.throws(()=>validateServerSettings({...base,ASK_BILL_STORAGE_URL:'http://evil.example'},'production'),e=>e.code==='STORAGE_TLS_REQUIRED');
});
test('demo answers acknowledge incomplete text and cannot claim current law',()=>{
  const a=demoAnswer(fixture.expectedQuestion,fixture);
  assert.equal(a.support,'incomplete_source');
  assert.equal(a.documentStatus,'draft');
  assert.match(a.text,/cannot infer/);
  assert.notEqual(a.text,fixture.text);
  assert.equal(demoAnswer('Unrelated question',fixture).support,'incomplete_source');
  assert.throws(()=>demoAnswer(fixture.expectedQuestion,{...fixture,sourceComplete:true}),e=>e.code==='FIXTURE_NOT_SAFE');
});
