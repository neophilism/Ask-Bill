import test from 'node:test';
import assert from 'node:assert/strict';
import {newVersionSnapshot,appendVerifiedStatus,evaluateVersionStatus,switchPinnedVersion,VersionError} from '../packages/content/versions/index.mjs';
const HASH='a'.repeat(64),date='2026-10-16T19:00:00Z';
const init=()=>newVersionSnapshot({versionId:'119hr1-ih',billId:'119hr1',rawSha256:HASH,canonicalSha256:HASH,retrievedAt:date,sourceComplete:true});
const evidence={observedAt:'2026-10-16T20:00:00Z',actionDate:'2026-10-16T18:00:00Z',sourceUrl:'https://api.congress.gov/v3/bill/119/hr/1',evidenceSha256:HASH};
test('status changes are explicit append-only official events, not inferred from action text',()=>{
 const a=init();assert.equal(a.status,'unknown');assert.equal(a.lastVerifiedAt,null);
 const b=appendVerifiedStatus(a,{...evidence,status:'introduced'});
 assert.equal(a.status,'unknown');assert.equal(b.status,'introduced');assert.equal(b.revision,1);
 assert(Object.isFrozen(b.statusHistory));assert.equal(b.statusHistory.length,1);
 assert.equal(b.statusHistory[0].entryHash.length,64);
});
test('enactment and effective dates are always distinct and correct as-of',()=>{
 let v=init();
 v=appendVerifiedStatus(v,{...evidence,status:'enacted',enactedAt:'2026-10-16T18:00:00Z',effectiveAt:'2027-01-01T00:00:00Z'});
 const early=evaluateVersionStatus(v,{now:'2026-10-16T21:00:00Z'});
 assert.equal(early.displayLabel,'enacted but not effective');assert.equal(early.stale,false);
 assert.throws(()=>appendVerifiedStatus(v,{...evidence,status:'effective',actionDate:'2027-01-01T00:00:00Z',effectiveAt:'2027-01-01T00:00:00Z'}),e=>e.code==='STATUS_FUTURE_ACTION');
 v=appendVerifiedStatus(v,{...evidence,status:'effective',observedAt:'2027-01-02T00:00:00Z',actionDate:'2027-01-01T00:00:00Z',effectiveAt:'2027-01-01T00:00:00Z'});
 assert.equal(evaluateVersionStatus(v,{now:'2027-01-02T01:00:00Z'}).displayLabel,'effective');
});
test('stale status and incomplete text produce explicit warnings',()=>{
 const initial=newVersionSnapshot({versionId:'v1',billId:'b1',rawSha256:HASH,canonicalSha256:HASH,retrievedAt:date});
 const state=evaluateVersionStatus(initial,{now:'2026-10-16T22:00:00Z'});
 assert.equal(state.stale,true);assert(state.uncertainty.includes('incomplete_source'));assert(state.uncertainty.includes('status_unknown'));
 const verified=appendVerifiedStatus(initial,{...evidence,status:'introduced'});
 assert.equal(evaluateVersionStatus(verified,{now:'2026-10-18T23:00:00Z'}).stale,true);
});
test('wrong provenance, malformed dates and status shortcuts fail closed',()=>{
 assert.throws(()=>newVersionSnapshot({versionId:'v1',billId:'b1',rawSha256:HASH,canonicalSha256:HASH,retrievedAt:'2026-02-30T19:00:00Z'}),e=>e.code==='DATE_INVALID');
 assert.throws(()=>newVersionSnapshot({versionId:'v1',billId:'b1',rawSha256:HASH,canonicalSha256:HASH,retrievedAt:date,status:'enacted'}),e=>e.code==='VERSION_INPUT');
 for(const url of ['https://evil.test/v3/bill/119/hr/1','http://api.congress.gov/v3/bill/119/hr/1','https://api.congress.gov/v3/bill/119/hr/1?api_key=SECRET'])
 assert.throws(()=>appendVerifiedStatus(init(),{...evidence,sourceUrl:url,status:'introduced'}),e=>e.code==='STATUS_SOURCE');
 assert.throws(()=>appendVerifiedStatus(init(),{...evidence,status:'effective'}),e=>e.code==='STATUS_INVALID');
});
test('version switches invalidate stale citations, speech, tours and answer caches',()=>{
 const session={billId:'b1',versionId:'v1',epoch:4,answerIds:['answer-old'],audioId:'old-audio',tourPosition:2,selectedSpan:{start:1},cacheRevision:'old'};
 const target={billId:'b1',versionId:'v2'};
 const next=switchPinnedVersion(session,target);
 assert.equal(next.versionId,'v2');assert.equal(next.epoch,5);assert.deepEqual(next.answerIds,[]);
 assert.equal(next.audioId,null);assert.equal(next.selectedSpan,null);assert.equal(next.tourPosition,null);assert.equal(next.cacheRevision,null);
 assert.equal(session.versionId,'v1');assert.equal(switchPinnedVersion(session,{billId:'b1',versionId:'v1'}).switched,false);
 assert.throws(()=>switchPinnedVersion(session,{billId:'wrong',versionId:'v2'}),e=>e.code==='VERSION_SWITCH_INVALID');
});
test('illegal reversal and stale status evidence cannot override a verified event',()=>{
 const a=appendVerifiedStatus(init(),{...evidence,status:'introduced'});
 assert.throws(()=>appendVerifiedStatus(a,{...evidence,status:'draft'}),e=>e.code==='STATUS_INVALID');
 assert.throws(()=>appendVerifiedStatus(a,{...evidence,status:'amended',observedAt:'2026-10-15T00:00:00Z'}),e=>e.code==='STATUS_STALE_UPDATE');
});
