import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {safeOperationalEvent,childLiveInputAllowed,PrivacyError} from '../packages/privacy/index.mjs';
const inventory=JSON.parse(await readFile(new URL('../docs/privacy/DATA_FLOWS.json',import.meta.url),'utf8'));
const flows=inventory.flows;
const sensitive=['publisher_auth_session','signed_upload_ticket','publisher_upload_quarantine','private_source_store','official_source_import','visitor_question','conversation_replay','microphone_audio','synthesized_speech','child_curated','child_live_input','feedback_submission','publisher_audit','minimal_security_log','background_job','outbox_delivery'];
test('all privacy-sensitive pathways are represented, with explicit ownership and retention gates',()=>{
 assert.equal(inventory.schemaVersion,1);assert.equal(inventory.product,'Ask Bill');
 assert.equal(inventory.defaultRawContentLogging,false);assert.equal(inventory.defaultLiveProviderTransfers,false);assert.equal(inventory.defaultUnder13FreeInput,false);
 assert.equal(new Set(flows.map(f=>f.id)).size,flows.length);
 for(const id of sensitive)assert(flows.some(f=>f.id===id),'Missing sensitive flow: '+id);
 for(const f of flows){
  assert.match(f.ownerUnit,/^AB-\d{3}$/);
  assert.match(f.ownerModule,/^[a-zA-Z0-9/._-]+$/);
  assert(f.ownerModule.startsWith('apps/')||f.ownerModule.startsWith('packages/'));
  assert(f.dataClasses.length>0&&f.retention.category.length>0);
  assert(['pending','fixture_only','active'].includes(f.retention.enforcement));
  assert(f.verificationCase.length>5&&f.securityNotes.length>25);
  assert.equal(f.thirdPartyTransfer,'disabled');
  assert(f.requiredBeforeEnable.length>0);
 }
});
test('no disabled provider or under-13 live route is falsely called operational',()=>{
 for(const id of ['visitor_question','microphone_audio','synthesized_speech','child_live_input','feedback_submission','publisher_upload_quarantine']){
  const f=flows.find(x=>x.id===id);assert.equal(f.implementation,'disabled');assert.equal(f.retention.enforcement,'pending');
 }
 assert.equal(flows.find(x=>x.id==='child_curated').retention.ttlSeconds,0);
});
test('data retention values match published engineering targets and do not invent indefinite private records',()=>{
 const limits={publisher_auth_session:1800,signed_upload_ticket:300,publisher_upload_quarantine:604800,visitor_question:1800,conversation_replay:1800,microphone_audio:3600,feedback_submission:7776000,publisher_audit:31536000};
 for(const [id,ttl] of Object.entries(limits))assert.equal(flows.find(f=>f.id===id)?.retention.ttlSeconds,ttl);
 assert.equal(flows.find(f=>f.id==='background_job').retention.ttlSeconds,null);
});
test('safe telemetry rejects transcripts, uploads, secrets, identifiers and raw exception stacks',()=>{
 const permitted={event:'queue_dead_letter',traceId:'a'.repeat(32),durationMs:8.3,mode:'local',errorCode:'JOB_EXPIRED'};
 const result=safeOperationalEvent(permitted);
 assert.equal(result.durationMs,8);assert(Object.isFrozen(result));
 for(const key of ['rawQuestion','email','prompt','ip','accessToken','providerKey','microphoneBytes','documentText','payload','stack']){
  assert.throws(()=>safeOperationalEvent({...permitted,[key]:'private information'}),PrivacyError);
 }
 for(const value of ['Some personal information','<script>','invalid error',null,20]){
  assert.throws(()=>safeOperationalEvent({...permitted,errorCode:value}),PrivacyError);
 }
 assert.throws(()=>safeOperationalEvent({...permitted,traceId:'malicious'}),PrivacyError);
 assert.throws(()=>safeOperationalEvent({...permitted,errorCode:'SECRET_LOGIN_TOKEN_7777'}),PrivacyError);
});
test('child live data remains blocked without independently verified provider and parental safeguards',()=>{
 const base={featureEnabled:true,ageBand:'under13',verifiedParentConsent:true,providerRetentionVerified:true,providerChildAgreementVerified:true};
 assert.equal(childLiveInputAllowed(base),false, 'Fixture booleans cannot enable child data collection before real consent adapter');
 for(const key of ['featureEnabled','verifiedParentConsent','providerRetentionVerified','providerChildAgreementVerified'])assert.equal(childLiveInputAllowed({...base,[key]:false}),false);
 assert.equal(childLiveInputAllowed({...base,ageBand:'adult'}),false);
 assert.throws(()=>childLiveInputAllowed({...base,ageBand:'not specified'}),PrivacyError);
});
