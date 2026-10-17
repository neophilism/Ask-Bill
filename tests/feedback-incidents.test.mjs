import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {previewFeedback,submitReviewedFeedback,FeedbackError} from '../apps/web/feedback/server.mjs';
import {createIncidentLedger,IncidentError} from '../packages/grounding/incidents/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
const answerSha=sha('old answer'),pub='11111111-1111-4111-8111-111111111111';
const owner={userId:'22222222-2222-4222-8222-222222222222',publisherId:pub,
 role:'owner',authenticatedByTrustedServer:true,mfaRecentlyVerified:true};
const message={versionId:'v1',answerSha256:answerSha,reason:'wrong_status',
 comment:'Contact me at person@example.com or +1 (202) 555-0123. Token sk-secretExample12345678. https://example.org/private',ageBand:'adult'};
test('feedback is opt-in after reviewing redacted preview, not passive transcript capture',()=>{
 const draft=previewFeedback(message);
 assert.equal(draft.noRawQuestionCaptured,true);assert(draft.redactions>=3);
 assert(!draft.redactedText.includes('person@example.com'));assert(!draft.redactedText.includes('sk-secretExample'));
 assert.throws(()=>submitReviewedFeedback({preview:draft}),FeedbackError);
 const committed=submitReviewedFeedback({preview:draft,explicitConsent:true,now:()=>1000});
 assert.equal(committed.rawQuestionLogged,false);assert.equal(committed.persistentSessionId,null);
 assert.equal(committed.reason,'wrong_status');assert.equal(committed.consentConfirmed,true);
 assert.throws(()=>submitReviewedFeedback({preview:draft,explicitConsent:true}),FeedbackError);
});
test('under-13 or unknown-age live feedback is not transmitted and raw controls are rejected',()=>{
 for(const ageBand of ['under-13','unknown',null])assert.throws(()=>previewFeedback({...message,ageBand}),FeedbackError);
 assert.throws(()=>previewFeedback({...message,comment:'not allowed\u0000'}),FeedbackError);
 assert.throws(()=>previewFeedback({...message,answerSha256:'fake'}),FeedbackError);
});
test('an owner can suppress an answer without removing immutable evidence',()=>{
 const ledger=createIncidentLedger({publisherId:pub,now:()=>1000});
 const e=ledger.suppress({versionId:'v1',answerTemplateSha256:answerSha,reason:'wrong_enactment_status',evidenceSha256:sha('audit'),actor:owner});
 assert.equal(e.blocked,true);assert.equal(ledger.auditEvents().length,1);
 assert.equal(ledger.publicState({versionId:'v1',answerTemplateSha256:answerSha}).visibleOriginalAnswer,false);
 assert.equal(ledger.publicState({versionId:'v2',answerTemplateSha256:answerSha}).status,'no_incident_recorded');
 assert.equal(ledger.suppress({versionId:'v1',answerTemplateSha256:answerSha,reason:'wrong_enactment_status',evidenceSha256:sha('audit'),actor:owner}),e);
});
test('a visible correction links to its suppressed predecessor and old answer remains blocked',()=>{
 const ledger=createIncidentLedger({publisherId:pub,now:()=>1000});
 ledger.suppress({versionId:'v1',answerTemplateSha256:answerSha,reason:'fabricated_citation',evidenceSha256:sha('evidence'),actor:owner});
 const c=ledger.correct({versionId:'v1',answerTemplateSha256:answerSha,correctedTextSourceHash:sha('verified new text'),explanation:'An earlier summary cited the wrong provision; open the corrected source.',actor:owner});
 assert.equal(c.previousSequence,1);assert.equal(ledger.auditEvents().length,2);
 assert.match(ledger.publicState({versionId:'v1',answerTemplateSha256:answerSha}).correctionNotice,/wrong provision/);
 assert.equal(ledger.publicState({versionId:'v1',answerTemplateSha256:answerSha}).visibleOriginalAnswer,false);
 assert.throws(()=>ledger.correct({versionId:'v1',answerTemplateSha256:answerSha,correctedTextSourceHash:sha('new'),explanation:'Second',actor:owner}),IncidentError);
});
test('wrong role, forged trust flags and script-bearing corrections are denied',()=>{
 const ledger=createIncidentLedger({publisherId:pub});
 for(const actor of [{...owner,role:'viewer'}, {...owner,mfaRecentlyVerified:false},{...owner,publisherId:'33333333-3333-4333-8333-333333333333'}])
  assert.throws(()=>ledger.suppress({versionId:'v1',answerTemplateSha256:answerSha,reason:'privacy_incident',evidenceSha256:sha('evidence'),actor}),IncidentError);
 ledger.suppress({versionId:'v1',answerTemplateSha256:answerSha,reason:'privacy_incident',evidenceSha256:sha('evidence'),actor:owner});
 assert.throws(()=>ledger.correct({versionId:'v1',answerTemplateSha256:answerSha,correctedTextSourceHash:sha('new'),explanation:'<script>bad</script>',actor:owner}),IncidentError);
});
