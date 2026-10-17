/** AB-081: reversible Unicode source-to-speech indexing; does not synthesize audio. */
import {createHash} from 'node:crypto';
export class AlignmentError extends Error {
 constructor(code){super(code);this.code=code;this.name='AlignmentError';}
}
const fail=code=>{throw new AlignmentError(code)};
const mappings=new WeakSet();
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const cps=s=>Array.from(s);
const pointOffset=(text,i)=>cps(text.slice(0,i)).length;
const ABBREVIATIONS=/(?<![\p{L}\p{N}])(?:Sec\.(?=\s*[0-9])|U\.S\.C\.(?![\p{L}])|§(?=\s*[0-9]))/gu;
function checked(text){
 if(typeof text!=='string'||!text.trim()||cps(text).length>8000||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)||
    cps(text).some(x=>x.length===1&&x.charCodeAt(0)>=0xd800&&x.charCodeAt(0)<=0xdfff))
   fail('INVALID_SOURCE_TEXT');
 return text;
}
function replacement(token){return token==='§'||token==='Sec.'?'Section':'United States Code';}
/**
 * Only typographical legal abbreviations are expanded; all numbers, exceptions,
 * dates and underlying claim text remain unchanged and point back to exact source.
 */
export function buildPronunciationMap({text,versionId,locale='en-US'}={}){
 checked(text);
 if(!ID.test(versionId??'')||!['en','en-US','es','es-ES'].includes(locale))fail('INVALID_SOURCE_SCOPE');
 const parts=[];let spoken='',cursor=0,sourcePos=0,spokenPos=0;
 const add=(kind,piece,original,start,end)=>{
  const size=cps(piece).length;
  parts.push(Object.freeze({kind,sourceStart:start,sourceEnd:end,spokenStart:spokenPos,spokenEnd:spokenPos+size,original,spoken:piece}));
  spoken+=piece;spokenPos+=size;
 };
 if(locale.startsWith('en')){
  for(const m of text.matchAll(ABBREVIATIONS)){
   const srcStart=pointOffset(text,m.index);
   if(m.index>cursor){
    const chunk=text.slice(cursor,m.index);
    add('verbatim',chunk,chunk,sourcePos,srcStart);
   }
   const original=m[0],srcEnd=srcStart+cps(original).length;
   add('pronunciation',replacement(original),original,srcStart,srcEnd);
   cursor=m.index+original.length;sourcePos=srcEnd;
  }
 }
 if(cursor<text.length){
  const rest=text.slice(cursor);
  add('verbatim',rest,rest,sourcePos,cps(text).length);
 }
 const map=Object.freeze({schemaVersion:1,versionId,locale,sourceTextSha256:sha(text),
  sourceCodePoints:cps(text).length,spokenCodePoints:cps(spoken).length,
  spokenText:spoken,parts:Object.freeze(parts)});
 mappings.add(map);
 return map;
}
/** Returns conservative exact-source bounds, expanding any transformed token as a unit. */
export function spokenRangeToSource({mapping,start,end}={}){
 if(!mappings.has(mapping)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
    start<0||end<=start||end>mapping.spokenCodePoints)fail('INVALID_SPOKEN_RANGE');
 const hits=mapping.parts.filter(p=>p.spokenEnd>start&&p.spokenStart<end);
 if(!hits.length)fail('UNMAPPABLE_SPEECH');
 const first=hits[0],last=hits[hits.length-1];
 const s=first.kind==='pronunciation'?first.sourceStart:first.sourceStart+(start-first.spokenStart);
 const e=last.kind==='pronunciation'?last.sourceEnd:last.sourceStart+(end-last.spokenStart);
 if(e<=s||s<0||e>mapping.sourceCodePoints)fail('UNMAPPABLE_SPEECH');
 return Object.freeze({versionId:mapping.versionId,start:s,end:e,sourceTextSha256:mapping.sourceTextSha256});
}
const allowedVisemes=new Set(['AA','EH','OH','OO','MBP','FV','L','S','REST']);
const allowedAlignment=new Set(['provider','forced_alignment','approximate','none']);
/**
 * Binds provider timing to this exact immutable pronunciation map. Does not
 * authenticate a provider, grant audio playback, or leak private recordings.
 */
export function normalizeSpeechTiming({mapping,textHash,durationSeconds,words=[],visemes=[],alignment='none'}={}){
 if(!mappings.has(mapping)||textHash!==mapping.sourceTextSha256||!HEX.test(textHash??'')||
    typeof durationSeconds!=='number'||!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>600||
    !allowedAlignment.has(alignment)||!Array.isArray(words)||words.length>1200||
    !Array.isArray(visemes)||visemes.length>2400)fail('INVALID_TIMING_ENVELOPE');
 if(alignment==='none'&&(words.length!==0||visemes.length!==0))fail('TIMING_WITHOUT_ALIGNMENT');
 const letters=cps(mapping.spokenText);
 let prevTime=0,prevEnd=0;
 const converted=[];
 for(const w of words){
  if(!w||Object.keys(w).some(k=>!['spokenStart','spokenEnd','text','from','to'].includes(k))||
    !Number.isSafeInteger(w.spokenStart)||!Number.isSafeInteger(w.spokenEnd)||
    w.spokenStart<prevEnd||w.spokenEnd<=w.spokenStart||w.spokenEnd>letters.length||
    typeof w.text!=='string'||letters.slice(w.spokenStart,w.spokenEnd).join('')!==w.text||
    typeof w.from!=='number'||typeof w.to!=='number'||!Number.isFinite(w.from)||!Number.isFinite(w.to)||
    w.from<prevTime||w.to<=w.from||w.to>durationSeconds)fail('WORD_TIMING_INVALID');
  const source=spokenRangeToSource({mapping,start:w.spokenStart,end:w.spokenEnd});
  converted.push(Object.freeze({...w,sourceStart:source.start,sourceEnd:source.end}));
  prevEnd=w.spokenEnd;prevTime=w.to;
 }
 prevTime=0;const safeVisemes=[];
 for(const v of visemes){
  if(!v||Object.keys(v).some(k=>!['label','from','to','weight'].includes(k))||
    !allowedVisemes.has(v.label)||typeof v.from!=='number'||typeof v.to!=='number'||
    !Number.isFinite(v.from)||!Number.isFinite(v.to)||v.from<prevTime||v.to<=v.from||v.to>durationSeconds||
    (v.weight!==undefined&&(typeof v.weight!=='number'||!Number.isFinite(v.weight)||v.weight<0||v.weight>1)))
    fail('VISEME_TIMING_INVALID');
  safeVisemes.push(Object.freeze({label:v.label,from:v.from,to:v.to,weight:v.weight??1}));
  prevTime=v.to;
 }
 return Object.freeze({versionId:mapping.versionId,sourceTextSha256:mapping.sourceTextSha256,
  spokenText:mapping.spokenText,durationSeconds,alignment,
  words:Object.freeze(converted),visemes:Object.freeze(safeVisemes),
  playbackAuthorized:false,validatedBy:'ask-bill-speech-timing-v1'});
}
