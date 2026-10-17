/** AB-017: offline, bounded legislative-XML hierarchy; no DTD, network, or publication. */
import {scanQuarantinedBytes} from '../intake/index.mjs';
import {createHash} from 'node:crypto';
import {prepareOfflineXml} from './prolog.mjs';
export class XmlSourceError extends Error{constructor(code){super(code);this.code=code;this.name='XmlSourceError';}}
const fail=c=>{throw new XmlSourceError(c);};
const SECTION=new Set(['section','subsection','paragraph','subparagraph','clause','subclause','item','subitem','part','title','chapter','article','division']);
const TOP=new Set(['bill','law','legislation','uslm','legis-body','body','title','chapter','part','section','subsection','paragraph','subparagraph','clause','subclause','num','header','text','term','definition','definitions','reference','xref','quoted-block','table','row','entry','p','list','list-item','date','effective-date','note','act','enacting-clause','chapeau']);
const cp=s=>Array.from(s).length;
const quoteDecode=s=>{
 if(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/.test(s))fail('XML_ENTITY');
 return s.replace(/&([^;]+);/g,(all,x)=>{
 if(x==='amp')return '&';if(x==='lt')return '<';if(x==='gt')return '>';if(x==='quot')return '"';if(x==='apos')return "'";
 const n=x.startsWith('#x')?parseInt(x.slice(2),16):x.startsWith('#')?parseInt(x.slice(1),10):NaN;
 if(!Number.isInteger(n)||n<1||n>0x10ffff||(n<32&&![9,10,13].includes(n))||
   (n>=0xd800&&n<=0xdfff)||n===0xfffe||n===0xffff)fail('XML_ENTITY');
 return String.fromCodePoint(n);
 });
};
function attrs(raw){
 const out={};let tail=raw.trim();
 while(tail.length){
  const m=tail.match(/^([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*/);
  if(!m)fail('XML_ATTRIBUTE');
  const name=m[1];if(Object.hasOwn(out,name))fail('XML_ATTRIBUTE_DUPLICATE');
  out[name]=quoteDecode(m[2]??m[3]);if(out[name].length>4000)fail('XML_ATTRIBUTE');
  tail=tail.slice(m[0].length);
 }
 return out;
}
function normalizeKind(tag){return tag.includes(':')?tag.slice(tag.lastIndexOf(':')+1):tag;}
function buildTree(xml){
 const root={tag:'#document',children:[],attrs:{},offset:0},stack=[root],seen=new Set(),warnings=new Set();
 let at=0,nodes=0,roots=0;
 const tokens=/<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g;
 for(const m of xml.matchAll(tokens)){
  if(m.index!==at)fail('XML_MALFORMED');at+=m[0].length;
  if(++nodes>260000)fail('XML_NODE_LIMIT');
  const token=m[0];
  if(!token.startsWith('<')){if(stack.length===1&&token.trim())fail('XML_OUTSIDE_ROOT');stack.at(-1).children.push({text:quoteDecode(token),offset:m.index});continue;}
  if(/^<!--/.test(token)){if(!token.endsWith('-->'))fail('XML_MALFORMED');continue;}
  if(/^<\?xml(?:\s|\?>)/.test(token)){if(m.index!==0||!token.endsWith('?>'))fail('XML_PROLOG');continue;}
  if(/^<\?|^<!/.test(token))fail('XML_DIRECTIVE');
  const close=token.startsWith('</'),self=/\/\s*>$/.test(token);
  const match=token.match(close?/^<\/([A-Za-z_][\w:.-]*)\s*>$/:/^<([A-Za-z_][\w:.-]*)([\s\S]*?)\/?>$/);
  if(!match)fail('XML_MALFORMED');
  const name=match[1],tag=normalizeKind(name).toLowerCase();
  if(close){if(stack.length<=1||stack.at(-1).name!==name)fail('XML_UNBALANCED');stack.pop();continue;}
  if(stack.length===1)roots++;
  if(roots>1)fail('XML_MULTIPLE_ROOTS');
  if(stack.length>72)fail('XML_DEPTH');
  const parsed=attrs((match[2]??'').replace(/\/\s*$/,''));
  const xmlId=parsed['xml:id']??parsed.identifier??parsed.id??null;
  if(xmlId!==null){
   if(typeof xmlId!=='string'||!(/^[A-Za-z_][A-Za-z0-9_.:-]{0,99}$/).test(xmlId)||seen.has(xmlId))fail('XML_ID');
   seen.add(xmlId);
  }
  if(!TOP.has(tag))warnings.add('unsupported_tag:'+tag.slice(0,48));
  const item={name,tag,attrs:parsed,xmlId,offset:m.index,children:[]};
  stack.at(-1).children.push(item);
  if(!self)stack.push(item);
 }
 if(at!==xml.length||stack.length!==1||roots!==1)fail('XML_UNBALANCED');
 return {root,warnings:[...warnings]};
}
function collectText(node){
 if(Object.hasOwn(node,'text'))return node.text;
 return node.children.map(x=>collectText(x)).join('');
}
function walk(node,parent,ancestorId,provisions,version,seenPaths){
 if(!node.tag){for(const child of node.children??[])if(child.tag)walk(child,node,ancestorId,provisions,version,seenPaths);return;}
 let currentId=ancestorId;
 if(SECTION.has(node.tag)){
  const siblings=parent.children.filter(x=>x.tag===node.tag),ordinal=siblings.indexOf(node)+1;
  if(ordinal<1)fail('XML_PATH');
  const segment=node.xmlId??(node.tag+'-'+ordinal);
  const id=(ancestorId?ancestorId+'/':'')+segment;
  if(seenPaths.has(id))fail('XML_ID');seenPaths.add(id);currentId=id;
  const num=node.children.find(x=>x.tag==='num');
  const header=node.children.find(x=>x.tag==='header');
  const text=collectText(node);
  if(cp(text)>500000)fail('XML_PROVISION_TOO_LARGE');
  provisions.push(Object.freeze({id,versionId:version,kind:node.tag,parentId:ancestorId||null,
    identifier:node.xmlId,label:num?collectText(num).trim():null,heading:header?collectText(header).trim():null,text,xmlOffset:node.offset,
    codePoints:cp(text),hash:createHash('sha256').update(text).digest('hex')}));
 }
 for(const child of node.children)if(child.tag)walk(child,node,currentId,provisions,version,seenPaths);
}
export function parseLegislativeXml(bytes,{versionId}={}){
 if(!(bytes instanceof Uint8Array))fail('XML_INPUT');
 scanQuarantinedBytes(bytes,'application/xml');
 if(typeof versionId!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/).test(versionId))fail('XML_VERSION');
 const prepared=prepareOfflineXml(Buffer.from(bytes).toString('utf8'),{allowCongressMetadata:true});
 const {root,warnings}=buildTree(prepared.xml),provisions=[];
 warnings.push(...prepared.warnings);
 walk(root,null,'',provisions,versionId,new Set());
 if(!provisions.length)warnings.push('no_recognized_provisions');
 return Object.freeze({versionId,sourceComplete:false,publicationAllowed:false,provisions:Object.freeze(provisions),
  warnings:Object.freeze(warnings),xmlSha256:createHash('sha256').update(bytes).digest('hex')});
}
