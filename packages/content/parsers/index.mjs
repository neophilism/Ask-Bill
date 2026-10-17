/** AB-015: conservative source-preserving local text, Markdown and DOCX previews. */
import {inflateRawSync} from 'node:zlib';
import {scanQuarantinedBytes,IntakeError,LIMITS} from '../intake/index.mjs';

export class ParserError extends Error{constructor(code){super(code);this.name='ParserError';this.code=code;}}
const fail=code=>{throw new ParserError(code)};
const cp=s=>Array.from(s).length;
const decodeEntities=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#(?:x[0-9a-fA-F]+|[0-9]+));/g,x=>{
 const vals={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
 if(x in vals)return vals[x];
 const n=x.startsWith('&#x')?parseInt(x.slice(3,-1),16):parseInt(x.slice(2,-1),10);
 return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';
});
function assertText(src,mime){
 const scan=scanQuarantinedBytes(src,mime);
 if(!['text','markdown'].includes(scan.kind))fail('NOT_TEXT');
 return Buffer.from(src).toString('utf8');
}
export function parseTextOrMarkdown(bytes,mime){
 if(!['text/plain','text/markdown'].includes(mime))fail('MIME_NOT_SUPPORTED');
 const raw=assertText(bytes,mime);const lines=raw.split(/\r\n|\n|\r/);
 let position=0;const blocks=[],warnings=[],headings=[];
 const lineBreaks=Array.from(raw.matchAll(/\r\n|\n|\r/g),m=>m[0]);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const m=mime==='text/markdown'?line.match(/^(#{1,6})[ \t]+(.+?)\s*#*\s*$/):null;
  const kind=m?'heading':mime==='text/markdown'&&/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)?'list':
   mime==='text/markdown'&&/^\s*\[\^[a-z0-9_-]{1,50}\]:/i.test(line)?'footnote':
   mime==='text/markdown'&&/^\s*\|.+\|\s*$/.test(line)?'table':'paragraph';
  if(m)headings.push({line:i+1,level:m[1].length,text:m[2]});
  blocks.push(Object.freeze({kind,text:line,headingLevel:m?m[1].length:null,locator:Object.freeze({line:i+1}),sourceStart:position,sourceEnd:position+cp(line)}));
  position+=cp(line)+(lineBreaks[i] ? cp(lineBreaks[i]) : 0);
 }
 if(mime==='text/markdown'&&/<\s*(?:script|style|iframe|object|embed)\b/i.test(raw))warnings.push('embedded_html_as_inert_text');
 return Object.freeze({format:mime==='text/markdown'?'markdown':'text',canonicalText:raw,sourceComplete:false,publicationAllowed:false,
  blocks:Object.freeze(blocks),headings:Object.freeze(headings),warnings:Object.freeze(warnings),sourceCodePoints:cp(raw)});
}
const u16=(b,n)=>b.readUInt16LE(n),u32=(b,n)=>b.readUInt32LE(n);
function verifiedDocxParts(bytes){
 scanQuarantinedBytes(bytes,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 const b=Buffer.from(bytes);const end=b.length-22;
 let e=-1;for(let i=end;i>=Math.max(0,b.length-65557);i--)if(u32(b,i)===0x06054b50&&i+22+u16(b,i+20)===b.length){e=i;break;}
 if(e<0)fail('DOCX_DIRECTORY');
 let at=u32(b,e+16);const parts=new Map();
 for(let i=0;i<u16(b,e+10);i++){
  const nameLen=u16(b,at+28),extra=u16(b,at+30),comment=u16(b,at+32);
  const name=b.subarray(at+46,at+46+nameLen).toString('utf8');
  if(name==='word/document.xml'||name==='word/footnotes.xml'||name==='word/endnotes.xml'){
   const loc=u32(b,at+42),start=loc+30+u16(b,loc+26)+u16(b,loc+28);
   const packed=b.subarray(start,start+u32(b,at+20));
   const data=u16(b,at+10)===0?packed:inflateRawSync(packed,{maxOutputLength:LIMITS.entry});
   parts.set(name,data.toString('utf8'));
  }
  at+=46+nameLen+extra+comment;
 }
 return parts;
}
function xmlParagraphText(fragment){
 let value='',deleted=0;
 const parts=fragment.match(/<[^>]*>|[^<]+/g)||[];
 let inText=false;
 for(const token of parts){
  if(/^<w:del(?:\s|>)/.test(token))deleted++;
  else if(/^<\/w:del>/.test(token))deleted=Math.max(0,deleted-1);
  else if(/^<w:t(?:\s|>)/.test(token))inText=true;
  else if(/^<\/w:t>/.test(token))inText=false;
  else if(!deleted&&/^<w:tab(?:\s|\/|>)/.test(token))value+='\t';
  else if(!deleted&&/^<w:(?:br|cr)(?:\s|\/|>)/.test(token))value+='\n';
  else if(inText&&!deleted&&!token.startsWith('<'))value+=decodeEntities(token);
 }
 return value;
}
function paragraphBlocks(xml,part){
 const blocks=[],regex=/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
 for(const m of xml.matchAll(regex)){
  const fragment=m[0];
  const text=xmlParagraphText(fragment);
  const style=fragment.match(/<w:pStyle\b[^>]*\bw:val=["']([^"']+)["']/);
  const heading=style?.[1]?.match(/^Heading([1-6])$/i);
  const kind=heading?'heading':/<w:numPr\b/.test(fragment)?'list':'paragraph';
  blocks.push(Object.freeze({kind,text,headingLevel:heading?Number(heading[1]):null,locator:Object.freeze({part,xmlOffset:m.index})}));
 }
 return blocks;
}
export function parseDocx(bytes){
 if(!(bytes instanceof Uint8Array))fail('INVALID_BYTES');
 const parts=verifiedDocxParts(bytes),main=parts.get('word/document.xml');
 if(!main)fail('DOCX_DOCUMENT_MISSING');
 let blocks=paragraphBlocks(main,'word/document.xml'),warnings=[];
 if(/<w:(?:del|ins|moveFrom|moveTo)\b/.test(main))warnings.push('tracked_changes_require_review');
 if(/<w:(?:drawing|object|pict|altChunk|fldChar|instrText)\b/.test(main))warnings.push('unsupported_embedded_or_field_content');
 for(const name of ['word/footnotes.xml','word/endnotes.xml']){
  const xml=parts.get(name);if(xml)blocks.push(...paragraphBlocks(xml,name).map(b=>Object.freeze({...b,kind:name.includes('footnotes')?'footnote':'endnote'})));
 }
 if(!parts.has('word/footnotes.xml')&&/footnoteReference\b/.test(main))warnings.push('unresolved_footnote');
 if(!parts.has('word/endnotes.xml')&&/endnoteReference\b/.test(main))warnings.push('unresolved_endnote');
 // The source text is never silently declared complete, even if all visible paragraphs parse.
 const canonicalText=blocks.map(b=>b.text).join('\n');
 return Object.freeze({format:'docx',canonicalText,sourceComplete:false,publicationAllowed:false,
  blocks:Object.freeze(blocks),headings:Object.freeze(blocks.filter(b=>b.kind==='heading')),
  warnings:Object.freeze(warnings),sourceCodePoints:cp(canonicalText)});
}
