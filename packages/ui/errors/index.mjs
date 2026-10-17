/** AB-098: source-only, no-script, privacy-neutral error pages. */
export class PublicErrorPageError extends Error {constructor(code){super(code);this.name='PublicErrorPageError';this.code=code;}}
const info=Object.freeze({
  404:Object.freeze({title:'Source unavailable',heading:'This page is not available',summary:'We cannot display that public source or page. The link may be incorrect, or the publication may be unavailable.'}),
  405:Object.freeze({title:'Read-only website',heading:'This page is read-only',summary:'Ask Bill source pages support reading without submitting changes. Use a published document link instead.'}),
  503:Object.freeze({title:'Reader temporarily unavailable',heading:'The source reader is temporarily unavailable',summary:'No source text was changed. You can return to the published-document catalog and try again later.'})
});
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function wantsHtml(accept){
 if(typeof accept!=='string'||accept.length>1024)return false;
 // Do not transform wildcard-only API/fetch requests; only explicit HTML clients.
 return accept.split(',').some(entry=>{
  const m=/^\s*text\/html\s*(?:;\s*q\s*=\s*(0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?\s*$/i.exec(entry);
  return !!m&&Number(m[1]??1)>0;
 });
}
export function renderPublicError(status){
 const item=info[status];if(!item||!Number.isInteger(status))throw new PublicErrorPageError('UNSUPPORTED_PUBLIC_STATUS');
 // No reflected user URL, cookies, stack traces, private source IDs or provider errors.
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+escape(item.title)+' — Ask Bill</title><link rel="stylesheet" href="/public-reader.css"></head><body><a href="#error">Skip to message</a><header><strong>Ask Bill — source-only reading</strong></header><main id="error"><h1>'+escape(item.heading)+'</h1><p role="status">'+escape(item.summary)+'</p><p><a href="/bills">Browse published bills</a></p></main><footer>Independent website, not a government source, legal advice, or a filing service. Reading does not require login, a microphone, or animations.</footer></body></html>';
}
export function formatPublicError({status,accept}={}){
 if(!Number.isInteger(status)||!info[status])throw new PublicErrorPageError('UNSUPPORTED_PUBLIC_STATUS');
 return Object.freeze(wantsHtml(accept)?{body:renderPublicError(status),contentType:'text/html; charset=utf-8'}:{body:status===404?'Not found':status===405?'Method not allowed':'Reader temporarily busy',contentType:'text/plain; charset=utf-8'});
}
