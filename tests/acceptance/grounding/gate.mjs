/** AB-044: release-candidate evidence gate. Unknown and missing are failures, never green. */
import {createHash} from 'node:crypto';
export class GroundingGateError extends Error{constructor(code){super(code);this.name='GroundingGateError';this.code=code;}}
const deny=c=>{throw new GroundingGateError(c)};
const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
export function assessGroundingRelease({candidate,cases=[],results=[],providerEvidence,minimumSupported=0.95}={}){
 if(typeof candidate!=='string'||!/^[a-f0-9]{40}$/.test(candidate))deny('CANDIDATE_SHA_REQUIRED');
 if(!Array.isArray(cases)||cases.length<240||!Array.isArray(results)||!Number.isFinite(minimumSupported)||minimumSupported<.95||minimumSupported>1)deny('INSUFFICIENT_CORPUS');
 const ids=new Set(),mustPass=new Set();for(const c of cases){
  if(!c||typeof c.id!=='string'||ids.has(c.id)||!c.versionId||!c.sourceHash||!['must_pass','held_out','train'].includes(c.partition))deny('INVALID_CASE');
  ids.add(c.id);if(c.partition==='must_pass')mustPass.add(c.id);
 }
 if(mustPass.size===0||cases.filter(c=>c.partition==='held_out').length===0)deny('MISSING_INDEPENDENT_SET');
 const seen=new Set();let supported=0;let assessed=0;const failures=[];
 for(const r of results){
  if(!r||!ids.has(r.id)||seen.has(r.id)||r.candidate!==candidate||typeof r.supported!=='boolean'||typeof r.citationIntegrity!=='boolean'||typeof r.correctStatus!=='boolean'||typeof r.exceptionPreserved!=='boolean'||typeof r.crossPublisherLeak!=='boolean'||typeof r.seriousMisstatement!=='boolean')deny('INVALID_RESULT');
  seen.add(r.id);assessed++;
  const passed=r.supported&&r.citationIntegrity&&r.correctStatus&&r.exceptionPreserved&&!r.crossPublisherLeak&&!r.seriousMisstatement;
  if(passed)supported++;else failures.push(r.id);
 }
 const omitted=[...ids].filter(id=>!seen.has(id));
 const mustFailed=[...mustPass].filter(id=>!seen.has(id)||failures.includes(id));
 const live=providerEvidence?.mode==='live_staging'&&providerEvidence.candidate===candidate&&providerEvidence.reviewed===true&&typeof providerEvidence.reportSha256==='string'&&/^[a-f0-9]{64}$/.test(providerEvidence.reportSha256);
 const passing=omitted.length===0&&mustFailed.length===0&&supported/assessed>=minimumSupported&&failures.length===0&&live;
 return Object.freeze({candidate,approved:passing,liveProviderVerified:Boolean(live),caseCount:cases.length,evaluated:assessed,supported,supportRate:assessed?supported/assessed:0,missing:omitted.length,mustPassFailures:mustFailed.length,materialFailures:failures.length,releaseAction:passing?'eligible_for_review':'keep_live_generation_disabled',reportDigest:hash(JSON.stringify({candidate,supported,assessed,omitted,mustFailed,failures,live}))});
}
