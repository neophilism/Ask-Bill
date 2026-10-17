/** AB-004 follow-up: source-only renderer, never a publication authority. */
import {createHash} from 'node:crypto';
export class PublicReaderError extends Error {constructor(code){super(code);this.code=code;this.name='PublicReaderError';}}
const fail=code=>{throw new PublicReaderError(code)};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/, ANCHOR=/^[A-Za-z][A-Za-z0-9_-]{0,100}$/,LANG=/^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const STATES={draft:'Draft',introduced:'Introduced',amended:'Amended',passed_one_chamber:'Passed one chamber',enacted:'Enacted',effective:'Effective',repealed:'Repealed',unknown:'Unknown'};
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textOK=(s,n)=>typeof s==='string'&&s.trim()&&s.length<=n&&!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\r]/.test(s);
const timeOK=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s.replace(/(?:\.(\d{1,3}))?Z$/,(_m,f)=>'.'+(f??'').padEnd(3,'0')+'Z');
function officialUrl(value){
  if(value===undefined)return null;
  if(typeof value!=='string'||value.length>2048)fail('UNTRUSTED_SOURCE_URL');
  let u;try{u=new URL(value);}catch{fail('UNTRUSTED_SOURCE_URL')}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||!['congress.gov','www.congress.gov','govinfo.gov','www.govinfo.gov','gpo.gov','www.gpo.gov'].includes(u.hostname.toLowerCase()))fail('UNTRUSTED_SOURCE_URL');
  return u.href;
}
export function publicBillLink({billId,versionId,provisionId}={}){
  if(!UUID.test(billId??'')||!UUID.test(versionId??'')||(provisionId!==undefined&&!ANCHOR.test(provisionId)))fail('INVALID_PUBLIC_LINK');
  return '/bills/'+billId.toLowerCase()+'/versions/'+versionId.toLowerCase()+(provisionId===undefined?'':'#provision-'+provisionId);
}
/** Integrity validation; database release authority is a separate trusted concern. */
export function validatePublishedReaderPack(pack){
  if(!pack||typeof pack!=='object'||Array.isArray(pack)||pack.schema!=='ask-bill-reader-v1'||
    pack.canonicalizationVersion!=='reader-canon-v1'||!UUID.test(pack.publisherId??'')||
    !UUID.test(pack.billId??'')||!UUID.test(pack.versionId??'')||pack.publication!=='published'||
    pack.sourceComplete!==true||!timeOK(pack.publishedAt)||!timeOK(pack.retrievedAt)||
    pack.retrievedAt>pack.publishedAt||!textOK(pack.title,300)||!textOK(pack.jurisdiction,100)||
    !LANG.test(pack.language??'')||!Object.hasOwn(STATES,pack.status)||!HEX.test(pack.canonicalSha256??'')||
    !Array.isArray(pack.provisions)||pack.provisions.length<1||pack.provisions.length>500)
    fail('PUBLIC_RELEASE_NOT_VERIFIED');
  const sections=[],seen=new Set();let bytes=0;
  for(const section of pack.provisions){
    if(!section||typeof section!=='object'||Array.isArray(section)||!ANCHOR.test(section.id??'')||
      seen.has(section.id)||!textOK(section.heading,250)||!textOK(section.text,150000)||
      !HEX.test(section.sha256??''))fail('INVALID_PUBLIC_PROVISION');
    seen.add(section.id);bytes+=Buffer.byteLength(section.text,'utf8');
    if(bytes>1500000||hash(section.text)!==section.sha256)fail('SOURCE_INTEGRITY_FAILURE');
    sections.push(Object.freeze({id:section.id,heading:section.heading,text:section.text,sha256:section.sha256}));
  }
  if(hash(sections.map(s=>s.text).join('\n\n'))!==pack.canonicalSha256)fail('CANONICAL_TEXT_HASH_MISMATCH');
  return Object.freeze({publisherId:pack.publisherId.toLowerCase(),billId:pack.billId.toLowerCase(),
    versionId:pack.versionId.toLowerCase(),title:pack.title,jurisdiction:pack.jurisdiction,
    language:pack.language,status:pack.status,retrievedAt:pack.retrievedAt,
    publishedAt:pack.publishedAt,sourceUrl:officialUrl(pack.sourceUrl),
    canonicalSha256:pack.canonicalSha256,provisions:Object.freeze(sections)});
}
export function renderPublishedReader(pack){
  const p=validatePublishedReaderPack(pack);
  const warning=p.status==='effective'?'Verify the current legal status with the authoritative source.':
    'This version is not verified as currently effective law. Proposals, enactments and effective law are distinct.';
  const links=p.provisions.map(s=>'<li><a href="#provision-'+escape(s.id)+'">'+escape(s.heading)+'</a></li>').join('');
  const sections=p.provisions.map(s=>'<section id="provision-'+escape(s.id)+'" tabindex="-1"><h2>'+escape(s.heading)+'</h2><pre class="statutory-text">'+escape(s.text)+'</pre><a href="'+escape(publicBillLink({billId:p.billId,versionId:p.versionId,provisionId:s.id}))+'">Link to this exact version and section</a></section>').join('');
  const origin=p.sourceUrl?'<a rel="noopener noreferrer" href="'+escape(p.sourceUrl)+'">Official source</a>':'Official source URL not recorded';
  return '<!doctype html><html lang="'+escape(p.language)+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>'+escape(p.title)+' — Ask Bill</title><style>body{font-family:system-ui;line-height:1.65;max-width:75rem;margin:1.5rem auto;padding:0 1rem;color:#18263b}a:focus-visible{outline:3px solid #135baa}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;padding:1rem;background:#f5f7fb;border-left:3px solid #325f91}section{margin:2rem 0}nav{padding:1rem;border:1px solid #ccd4df}footer{border-top:1px solid #ddd;margin-top:3rem}</style></head><body><a href="#reader">Skip to legislation</a><header><strong>Ask Bill — source-only reading</strong></header><main id="reader"><h1>'+escape(p.title)+'</h1><p role="status">Document status: <strong>'+escape(STATES[p.status])+'</strong>. '+escape(warning)+'</p><p>Jurisdiction: '+escape(p.jurisdiction)+' · Version '+escape(p.versionId)+'</p><p>Retrieved '+escape(p.retrievedAt)+' · Published '+escape(p.publishedAt)+'</p><p>'+origin+'</p><nav aria-label="Sections"><h2>Contents</h2><ol>'+links+'</ol></nav><article aria-label="Legislation">'+sections+'</article></main><footer>Independent website; not a government service or legal advice. No AI, audio or graphics are required to read this source.</footer></body></html>';
}
export function renderPublishedPlainText(pack){
  const p=validatePublishedReaderPack(pack);
  return [p.title,'Status: '+STATES[p.status],'Jurisdiction: '+p.jurisdiction,
    'Version: '+p.versionId,'Retrieved: '+p.retrievedAt,'Published: '+p.publishedAt,
    'Official source: '+(p.sourceUrl??'not recorded'),'Not legal advice; confirm current effect.',
    ...p.provisions.flatMap(s=>['',s.heading,s.text])].join('\n')+'\n';
}
/** The injected lookup must independently authenticate active publication and publisher scope. */
export function createPublicReader({lookupPublishedPack}={}){
  if(typeof lookupPublishedPack!=='function')fail('TRUSTED_LOOKUP_REQUIRED');
  return Object.freeze({async read({publisherId,billId,versionId,format='html'}={}){
    if(!UUID.test(publisherId??'')||!UUID.test(billId??'')||!UUID.test(versionId??'')||
      !['html','text'].includes(format))fail('INVALID_PUBLIC_READ');
    let result;
    try{result=await lookupPublishedPack(Object.freeze({publisherId:publisherId.toLowerCase(),billId:billId.toLowerCase(),versionId:versionId.toLowerCase()}))}
    catch{fail('PUBLIC_RELEASE_UNAVAILABLE')}
    if(!result||result.publisherId?.toLowerCase()!==publisherId.toLowerCase()||
      result.billId?.toLowerCase()!==billId.toLowerCase()||result.versionId?.toLowerCase()!==versionId.toLowerCase())fail('PUBLIC_RELEASE_UNAVAILABLE');
    try{return format==='html'?renderPublishedReader(result):renderPublishedPlainText(result)}
    catch{fail('PUBLIC_RELEASE_UNAVAILABLE')}
  }});
}
