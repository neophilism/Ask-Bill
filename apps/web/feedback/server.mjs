/** AB-043: user-initiated, privacy-minimizing feedback; no automatic transcript capture. */
import {createHash} from 'node:crypto';
export class FeedbackError extends Error{constructor(code){super(code);this.name='FeedbackError';this.code=code;}}
const deny=c=>{throw new FeedbackError(c)};
const sha=/^[a-f0-9]{64}$/,id=s=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(s);
const prepared=new WeakSet();
const normalize=s=>s.trim().replace(/\r\n?/g,'\n');
const patterns=[
 [/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email redacted]'],
 [/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,'[identifier redacted]'],
 [/\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g,'[phone redacted]'],
 [/\bsk-[a-zA-Z0-9_-]{12,}\b/g,'[secret redacted]'],
 [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[ip redacted]'],
 [/https?:\/\/[^\s<>"']+/gi,'[link redacted]']
];
export function previewFeedback({versionId,answerSha256,reason,comment,ageBand}={}){
 if(!id(versionId)||!sha.test(answerSha256)||!['incorrect_citation','wrong_status','missing_exception','privacy','other'].includes(reason)||
   typeof comment!=='string'||!comment.trim()||comment.length>1200||
   !['adult','13-17'].includes(ageBand))deny('FEEDBACK_INPUT');
 let text=normalize(comment),redactions=0;
 for(const [re,mark] of patterns){text=text.replace(re,()=>{redactions++;return mark;});}
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))deny('CONTROL_CONTENT');
 const result=Object.freeze({type:'private_feedback_preview',versionId,answerSha256,reason,
   redactedText:text,redactions,needsConfirmation:true,
   noRawQuestionCaptured:true,ageBandNotPersisted:true});
 prepared.add(result);return result;
}
export function submitReviewedFeedback({preview,explicitConsent=false,now=()=>Date.now()}={}){
 if(!preview||!prepared.has(preview)||explicitConsent!==true||typeof now!=='function')deny('FEEDBACK_CONSENT_REQUIRED');
 const time=now();if(!Number.isSafeInteger(time)||time<0)deny('FEEDBACK_CLOCK');
 prepared.delete(preview);
 return Object.freeze({eventType:'answer.feedback',versionId:preview.versionId,answerSha256:preview.answerSha256,
   reason:preview.reason,redactedComment:preview.redactedText,
   expiresAt:new Date(time+90*86400000).toISOString(),consentConfirmed:true,
   persistentSessionId:null,rawQuestionLogged:false});
}
