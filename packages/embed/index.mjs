/** AB-097: opt-in, source-only iframe publishing. No tools, messaging, microphone or graphics. */
import {validatePublishedReaderPack,renderPublishedReader} from '../ui/reader/index.mjs';
export class EmbedError extends Error {constructor(code){super(code);this.code=code;this.name='EmbedError';}}
const deny=c=>{throw new EmbedError(c)};
export function validateEmbedOrigins(origins){
 if(!Array.isArray(origins)||origins.length>10)deny('INVALID_EMBED_ORIGINS');
 const out=[],seen=new Set();
 for(const value of origins){
  if(typeof value!=='string'||value.length>250||value.includes('*'))deny('INVALID_EMBED_ORIGIN');
  let u;try{u=new URL(value);}catch{deny('INVALID_EMBED_ORIGIN')}
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||
     u.search||u.hash||u.port||!u.hostname||u.hostname==='localhost'||
     /^(?:\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(u.hostname)||
     !u.hostname.includes('.')||seen.has(u.origin)||value!==u.origin)deny('INVALID_EMBED_ORIGIN');
  seen.add(u.origin);out.push(u.origin);
 }
 return Object.freeze(out);
}
export function renderEmbeddablePublishedSource({pack,origins}={}){
 const allowed=validateEmbedOrigins(origins);
 if(!allowed.length)deny('EMBED_NOT_AUTHORIZED');
 try{validatePublishedReaderPack(pack);}catch{deny('PUBLISHED_SOURCE_REQUIRED');}
 return renderPublishedReader(pack);
}
export function embedSecurityHeaders(origins){
 const allowed=validateEmbedOrigins(origins);
 if(!allowed.length)deny('EMBED_NOT_AUTHORIZED');
 return Object.freeze({
  'Content-Security-Policy':"default-src 'none'; base-uri 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors "+allowed.join(' ')+"; sandbox allow-same-origin; style-src 'self'; img-src 'none'",
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'cross-origin',
  'Cache-Control':'no-store',
  'Permissions-Policy':'microphone=(), camera=(), geolocation=()'
 });
}
