/** AB-014: quarantined document preflight. No extraction, publication or external I/O. */
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
const MiB=1024*1024;
export const LIMITS=Object.freeze({source:25*MiB,entries:350,entry:12*MiB,expanded:40*MiB,ratio:80,filename:240});
export class IntakeError extends Error{constructor(code){super(code);this.name='IntakeError';this.code=code;}}
const fail=code=>{throw new IntakeError(code)};
const ALLOWED=new Set(['text/plain','text/markdown','application/xml','text/xml','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const control=/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u;
function checkXml(s){
 if(control.test(s)||/<!DOCTYPE\b|<!ENTITY\b|<\?xml-stylesheet\b|<\s*xi:include\b|(?:\b(?:href|src|schemaLocation)\s*=\s*["']\s*(?:https?:|file:|\/\/))/i.test(s)||/<\s*(?:script|iframe|object|embed)\b/i.test(s))fail('ACTIVE_XML');
}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
const u16=(b,n)=>b.readUInt16LE(n),u32=(b,n)=>b.readUInt32LE(n);
function inspectDocxZip(b){
 if(b.length<22||u32(b,0)!==0x04034b50)fail('DOCX_SIGNATURE');
 let end=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--){if(u32(b,i)===0x06054b50&&i+22+u16(b,i+20)===b.length){end=i;break;}}
 if(end<0||u16(b,end+4)||u16(b,end+6)||u16(b,end+8)!==u16(b,end+10))fail('ZIP_DIRECTORY');
 const count=u16(b,end+10),offset=u32(b,end+16),size=u32(b,end+12);
 if(count<2||count>LIMITS.entries||size>2*MiB||offset+size!==end)fail('ZIP_LIMIT');
 let at=offset,total=0;const seen=new Set(),regions=[];
 for(let i=0;i<count;i++){
  if(at+46>end||u32(b,at)!==0x02014b50)fail('ZIP_DIRECTORY');
  const flags=u16(b,at+8),method=u16(b,at+10),checksum=u32(b,at+16),compressed=u32(b,at+20),expanded=u32(b,at+24);
  const len=u16(b,at+28),extra=u16(b,at+30),comment=u16(b,at+32),local=u32(b,at+42),external=u32(b,at+38);
  if(!len||len>LIMITS.filename||at+46+len+extra+comment>end)fail('ZIP_DIRECTORY');
  const nameBytes=b.subarray(at+46,at+46+len),name=nameBytes.toString('utf8');
  if(!Buffer.from(name).equals(nameBytes)||!(/^[\x20-\x7e]+$/).test(name)||name.includes('..')||name.startsWith('/')||name.includes('\\')||name.endsWith('/')||name.includes('//')||seen.has(name))fail('ZIP_ENTRY_PATH');
  seen.add(name);
  if(flags&1||flags&0x40||flags&0x20||flags&0x100||!(method===0||method===8)||compressed===0xffffffff||expanded===0xffffffff||local===0xffffffff)fail('ZIP_FEATURE_UNSUPPORTED');
  if(((external>>>16)&0xf000)===0xa000)fail('ZIP_SYMLINK');
  if(expanded>LIMITS.entry||compressed>LIMITS.source||expanded>Math.max(1,compressed)*LIMITS.ratio)fail('ZIP_BOMB');
  total+=expanded;if(total>LIMITS.expanded)fail('ZIP_BOMB');
  if(local+30>offset||u32(b,local)!==0x04034b50)fail('ZIP_LOCAL_HEADER');
  const localLen=u16(b,local+26),localExtra=u16(b,local+28),dataAt=local+30+localLen+localExtra;
  if(u16(b,local+6)!==flags||u16(b,local+8)!==method||dataAt+compressed>offset||localLen!==len||!b.subarray(local+30,local+30+len).equals(nameBytes))fail('ZIP_LOCAL_HEADER');
  for(const [a,z] of regions)if(dataAt<z&&dataAt+compressed>a)fail('ZIP_OVERLAP');
  regions.push([dataAt,dataAt+compressed]);
  let raw;
  try{raw=method===0?b.subarray(dataAt,dataAt+compressed):inflateRawSync(b.subarray(dataAt,dataAt+compressed),{maxOutputLength:LIMITS.entry+1});}
  catch{fail('ZIP_DECOMPRESSION');}
  if(raw.length!==expanded||crc32(raw)!==checksum)fail('ZIP_INTEGRITY');
  if(/(?:^|\/)(?:vbaProject(?:Signature)?\.bin|activeX|embeddings|externalLinks)(?:\/|$)/i.test(name)||/\.(?:exe|dll|js|vbs|ps1|cmd|bat|html?|svg)$/i.test(name))fail('ACTIVE_DOCX');
  if(/\.(?:xml|rels)$/i.test(name)){
   const xml=raw.toString('utf8');if(!Buffer.from(xml).equals(raw))fail('ZIP_UTF8');
   checkXml(xml);
   if(/TargetMode\s*=\s*["']External["']/i.test(xml))fail('ACTIVE_DOCX');
  }
  at+=46+len+extra+comment;
 }
 if(at!==end||!seen.has('[Content_Types].xml')||!seen.has('word/document.xml'))fail('DOCX_REQUIRED_PARTS');
 return Object.freeze({parts:seen.size,uncompressedBytes:total});
}
export function scanQuarantinedBytes(source,mime){
 if(!(source instanceof Uint8Array)||source.byteLength<1||source.byteLength>LIMITS.source)fail('INTAKE_SIZE');
 if(!ALLOWED.has(mime))fail('INTAKE_MIME');
 const b=Buffer.from(source.buffer,source.byteOffset,source.byteLength);
 const sha256=createHash('sha256').update(b).digest('hex');
 let metadata={kind:'text'};
 if(mime==='application/pdf'){
  if(!b.subarray(0,8).toString('ascii').startsWith('%PDF-')||!b.subarray(Math.max(0,b.length-2048)).toString('latin1').includes('%%EOF'))fail('PDF_SIGNATURE');
  if(/\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|XFA|SubmitForm|ImportData|GoToR)\b/i.test(b.toString('latin1')))fail('ACTIVE_PDF');
  metadata={kind:'pdf',requiresDedicatedParser:true};
 }else if(mime.includes('wordprocessingml')){
  metadata={kind:'docx',...inspectDocxZip(b)};
 }else{
  const text=b.toString('utf8');
  if(!Buffer.from(text).equals(b)||control.test(text))fail('TEXT_ENCODING');
  if(mime.includes('xml')){if(!text.trimStart().startsWith('<'))fail('XML_SIGNATURE');checkXml(text);}
  else if(text.includes('\u0000'))fail('TEXT_ENCODING');
  metadata={kind:mime.includes('xml')?'xml':mime==='text/markdown'?'markdown':'text'};
 }
 return Object.freeze({sha256,bytes:b.length,mime,...metadata,disposition:'quarantined',publishable:false});
}
