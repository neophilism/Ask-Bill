/** Ask Bill: narrow operational telemetry and live-feature privacy gates.
 * This module intentionally cannot enable child chat or transmit private content.
 */
export class PrivacyError extends Error {
  constructor(code){super(code);this.code=code;this.name='PrivacyError';}
}
const ERROR=/^[A-Z][A-Z0-9_]{1,63}$/;
const SAFE_ERROR_CODES=new Set(['JOB_EXPIRED','SOURCE_INCOMPLETE','CITATION_INVALID','QUOTA_EXCEEDED','PROVIDER_UNAVAILABLE','VERSION_CHANGED','PUBLISHER_FORBIDDEN','SESSION_INVALID','OBJECT_FORBIDDEN','UPLOAD_LIMIT','INTERNAL_ERROR']);
const TRACE=/^[a-f0-9]{32}$/;
const EVENTS=new Set(['source_validation_failed','reader_error','queue_dead_letter','auth_denied','provider_disabled','quota_exceeded','object_rejected']);
const MODES=new Set(['local','staging','production']);
function deny(code){throw new PrivacyError(code)}
const isPlain=x=>x!==null && typeof x==='object' && !Array.isArray(x) && Object.getPrototypeOf(x)===Object.prototype;
/** Builds an immutable allowlisted event. Unrecognized fields fail closed instead of being logged. */
export function safeOperationalEvent(input){
 if(!isPlain(input))deny('EVENT_INVALID');
 const allowed=new Set(['event','traceId','durationMs','errorCode','mode']);
 if(Object.keys(input).some(key=>!allowed.has(key)))deny('UNSAFE_LOG_FIELD');
 if(!EVENTS.has(input.event))deny('EVENT_NOT_ALLOWED');
 if(typeof input.traceId!=='string'||!TRACE.test(input.traceId))deny('TRACE_INVALID');
 if(typeof input.durationMs!=='number'||!Number.isFinite(input.durationMs)||input.durationMs<0||input.durationMs>86400000)deny('LATENCY_INVALID');
 if(!MODES.has(input.mode))deny('MODE_INVALID');
 if(input.errorCode!==undefined&&!(typeof input.errorCode==='string'&&ERROR.test(input.errorCode)&&SAFE_ERROR_CODES.has(input.errorCode)))deny('ERROR_CODE_INVALID');
 return Object.freeze({event:input.event,traceId:input.traceId,durationMs:Math.round(input.durationMs),mode:input.mode,...(input.errorCode===undefined?{}:{errorCode:input.errorCode})});
}
/** Privacy-safest default: no live child free-text or audio until every external gate is verified. */
export function childLiveInputAllowed({featureEnabled=false,ageBand,verifiedParentConsent=false,providerRetentionVerified=false,providerChildAgreementVerified=false}={}){
 if(typeof featureEnabled!=='boolean'||typeof verifiedParentConsent!=='boolean'||typeof providerRetentionVerified!=='boolean'||typeof providerChildAgreementVerified!=='boolean')deny('GATE_INVALID');
 if(!['under13','13to17','adult'].includes(ageBand))deny('AGE_BAND_INVALID');
 if(ageBand==='under13')return false; // AB-090 must validate signed consent/provider proof before replacing this closed stub
 return false; // other age paths require separate policies; never reuse this child-specific gate
}
