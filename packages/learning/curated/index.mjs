/** AB-090: static child-safe civic literacy; no unverified consent or chat. */
const questions=Object.freeze([
 Object.freeze({id:'proposal',question:'What is a bill?',answer:'A bill is a proposal for rules or changes to existing law. A proposal does not automatically become a law.'}),
 Object.freeze({id:'reading',question:'Where can I read its exact words?',answer:'Open a published source version and read the sections. The date and version help you tell different drafts apart.'}),
 Object.freeze({id:'exceptions',question:'What is an exception?',answer:'An exception describes situations where a rule may work differently. Read the full section before deciding what a bill means.'}),
 Object.freeze({id:'status',question:'How can I tell whether a rule is in effect?',answer:'A bill, a passed law, and an effective law are different things. Check the official source and its current status.'}),
 Object.freeze({id:'limits',question:'Can an animated guide decide what the law means for me?',answer:'No. A character can help you read public words, but it is not a government office, an attorney, or a source of personal legal advice.'})
]);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const childLearningPolicy=Object.freeze({mode:'curated-only',sessionRequired:false,
 freeTextEnabled:false,microphoneEnabled:false,liveAiEnabled:false,
 trackingEnabled:false,thirdPartyAnalyticsEnabled:false,
 parentalConsentClaimed:false,minimumData:'read-only server requests'});
export function curatedQuestions(){return questions;}
export function renderChildLearning(){
 const rows=questions.map(({question,answer})=>
   '<details><summary>'+escape(question)+'</summary><p>'+escape(answer)+'</p></details>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta name="robots" content="noindex,nofollow"><title>Learn about bills — Ask Bill</title><link rel="stylesheet" href="/public-reader.css"></head>'+
 '<body><a href="#questions">Skip to questions</a><header><strong>Ask Bill — learn the basics</strong></header>'+
 '<main id="questions"><h1>How do bills work?</h1><p>Explore a few general reading questions. No account, microphone, live conversation, or personal information is needed.</p>'+
 '<p>This page explains basic ideas. It does not give legal advice and is not a government website.</p>'+
 '<section aria-label="Curated reading questions"><h2>Choose a question to read</h2>'+rows+'</section>'+
 '<p>Want to inspect the exact wording? <a href="/bills">Open the published source catalog</a>. A proposed bill is not automatically an active law.</p>'+
 '<p>If you have a personal legal question, ask a trusted adult or a qualified legal professional. This page does not collect your question.</p></main>'+
 '<footer>No free-text or voice recording. No external advertising, profiling, or model calls are part of this page.</footer></body></html>';
}
