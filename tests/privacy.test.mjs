import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {safeOperationalEvent,childLiveInputAllowed,PrivacyError} from '../packages/privacy/index.mjs';
const inventory=JSON.parse(await readFile(new URL('../docs/privacy/DATA_FLOWS.json',import.meta.url),'utf8'));
const flows=inventory.flows;
const sensitive=['publisher_auth_session','signed_upload_ticket','publisher_upload_quarantine','private_source_store','private_original_download','official_source_import',
 'anonymous_question_session','visitor_question','conversation_replay','anonymous_usage_aggregate','microphone_audio','synthesized_speech',
 'browser_reading_state','browser_history_and_exports','child_curated','child_live_input','feedback_submission','publisher_audit','minimal_security_log','background_job','outbox_delivery'];
test('all privacy-sensitive pathways name existing owners and acceptance cases, without asserting live deployment',async()=>{
 assert.equal(inventory.schemaVersion,2);assert.equal(inventory.product,'Ask Bill');
 assert.equal(inventory.defaultRawContentLogging,false);assert.equal(inventory.defaultLiveProviderTransfers,false);assert.equal(inventory.defaultUnder13FreeInput,false);
 assert.equal(inventory.deploymentAcceptance,'not_verified');assert.match(inventory.implementationMeaning,/does not assert a deployed service/);
 assert.equal(new Set(flows.map(f=>f.id)).size,flows.length);
 for(const id of sensitive)assert(flows.some(f=>f.id===id),'Missing sensitive flow: '+id);
 const registry=JSON.parse(await readFile(new URL('../registry/prs.json',import.meta.url),'utf8'));
 for(const f of flows){
  assert.match(f.ownerUnit,/^AB-\d{3}$/);
  assert(registry.units.some(unit=>unit.id===f.ownerUnit),'Unregistered owner: '+f.id);
  assert.match(f.ownerModule,/^[a-zA-Z0-9/._-]+$/);
  assert(f.ownerModule.startsWith('apps/')||f.ownerModule.startsWith('packages/'));
  assert((await stat(new URL('../'+f.ownerModule,import.meta.url))).isFile(),'Missing owning module: '+f.id);
  assert(f.dataClasses.length>0&&f.retention.category.length>0);
  assert(['implemented','partial','fixture_only','disabled'].includes(f.implementation));
  assert(['access_expiry_cleanup','periodic_cleanup','request_lifetime','browser_session','operator_policy_pending','fixture_only','not_applicable'].includes(f.retention.enforcement));
  assert(f.retention.ttlMeaning.length>5&&f.securityNotes.length>25);
  assert(['none','disabled','disabled_by_default'].includes(f.thirdPartyTransfer));
  assert(['not_verified','not_applicable'].includes(f.liveAcceptance));
  assert.equal(typeof f.enabledByDefault,'boolean');assert.equal(typeof f.persistentApplicationData,'boolean');
  assert(Array.isArray(f.possibleRecipients));assert(f.verificationCases.length>0);
  for(const path of f.verificationCases){assert.match(path,/^tests\/[a-zA-Z0-9/_-]+\.(?:test\.mjs|mjs|sql|py)$/);
   assert((await stat(new URL('../'+path,import.meta.url))).isFile(),'Missing verification: '+path);}
  assert(f.requiredBeforeEnable.length>0);
 }
});
test('implemented provider paths stay separate from default enablement and external acceptance',()=>{
 for(const id of ['publisher_auth_session','publisher_upload_quarantine','private_source_store','official_source_import','microphone_audio','synthesized_speech']){
  const f=flows.find(x=>x.id===id);assert.equal(f.implementation,'implemented');assert.equal(f.enabledByDefault,false);
  assert.equal(f.thirdPartyTransfer,'disabled_by_default');assert.equal(f.liveAcceptance,'not_verified');
 }
 const question=flows.find(f=>f.id==='visitor_question');assert.equal(question.implementation,'implemented');assert.equal(question.enabledByDefault,true);
 assert.match(question.securityNotes,/default source-only path/);assert.equal(question.thirdPartyTransfer,'disabled_by_default');
 assert.equal(flows.find(f=>f.id==='child_live_input').implementation,'disabled');
 assert.equal(flows.find(f=>f.id==='child_live_input').thirdPartyTransfer,'disabled');
 assert.equal(flows.find(f=>f.id==='feedback_submission').enabledByDefault,false);
 assert.equal(flows.find(x=>x.id==='child_curated').retention.ttlSeconds,0);
});
test('request-only questions/audio and encrypted session replay match implemented persistence boundaries',()=>{
 const limits={publisher_auth_session:1800,signed_upload_ticket:300,publisher_upload_quarantine:604800,anonymous_question_session:1800,
  visitor_question:0,conversation_replay:1800,microphone_audio:0,synthesized_speech:0,feedback_submission:7776000,publisher_audit:31536000};
 for(const [id,ttl] of Object.entries(limits))assert.equal(flows.find(f=>f.id===id)?.retention.ttlSeconds,ttl);
 for(const id of ['visitor_question','microphone_audio','synthesized_speech']){
  const f=flows.find(x=>x.id===id);assert.equal(f.persistentApplicationData,false);assert.equal(f.retention.enforcement,'request_lifetime');
 }
 const replay=flows.find(f=>f.id==='conversation_replay');assert.equal(replay.persistentApplicationData,true);
 assert(!replay.dataClasses.includes('question_text'));assert(!replay.dataClasses.includes('transcript'));assert(!replay.dataClasses.includes('voice_input'));
 assert.match(replay.securityNotes,/AES-256-GCM/);assert.equal(replay.retention.ttlMeaning,'maximum_access_lifetime');
 assert.match(flows.find(f=>f.id==='anonymous_question_session').securityNotes,/cleanup is delayed/);
 assert.equal(flows.find(f=>f.id==='background_job').retention.ttlSeconds,null);
 for(const id of ['publisher_upload_quarantine','publisher_audit','minimal_security_log'])assert.equal(flows.find(f=>f.id===id).retention.enforcement,'operator_policy_pending');
 const exported=flows.find(f=>f.id==='browser_history_and_exports');assert.equal(exported.retention.ttlMeaning,'user_controlled');assert.equal(exported.thirdPartyTransfer,'none');
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
