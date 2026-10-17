import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {scanQuarantinedBytes,IntakeError,LIMITS} from '../packages/content/intake/index.mjs';
const scan=(s,m='text/plain')=>scanQuarantinedBytes(Buffer.from(s),m);
const bad=(src,m,code)=>assert.throws(()=>scanQuarantinedBytes(src,m),e=>e instanceof IntakeError&&e.code===code);
function crc32(a){let c=0xffffffff;for(const x of a){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
export function zip(entries,{method=8}={}){
 const files=[],dirs=[];let pos=0;
 for(const [name,value] of entries){
  const raw=Buffer.from(value),compressed=method===8?deflateRawSync(raw):raw,n=Buffer.from(name);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(crc32(raw),14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(n.length,26);
  files.push(local,n,compressed);
  const center=Buffer.alloc(46);center.writeUInt32LE(0x02014b50);center.writeUInt16LE(20,4);center.writeUInt16LE(20,6);center.writeUInt16LE(method,10);center.writeUInt32LE(crc32(raw),16);center.writeUInt32LE(compressed.length,20);center.writeUInt32LE(raw.length,24);center.writeUInt16LE(n.length,28);center.writeUInt32LE(pos,42);dirs.push(center,n);
  pos+=local.length+n.length+compressed.length;
 }
 const directory=Buffer.concat(dirs),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(pos,16);
 return Buffer.concat([...files,directory,end]);
}
const docx='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const entries=[['[Content_Types].xml','<Types/>'],['word/document.xml','<w:document>§ 😃</w:document>']];
test('text and XML remain quarantined; digest never grants publication',()=>{let r=scan('§ 😃');assert.equal(r.publishable,false);assert.equal(r.disposition,'quarantined');assert.equal(r.sha256.length,64);assert.equal(scan('<x>é</x>','application/xml').kind,'xml');});
test('unsupported MIME and oversize data rejected',()=>{bad(Buffer.alloc(0),'text/plain','INTAKE_SIZE');bad(Buffer.from('ok'),'text/html','INTAKE_MIME');bad(Buffer.alloc(LIMITS.source+1),'text/plain','INTAKE_SIZE');});
test('malformed UTF-8, controls, remote XML and entities rejected',()=>{bad(Buffer.from([0xc3,0x28]),'text/plain','TEXT_ENCODING');for(const x of ['<!DOCTYPE x [<!ENTITY a "x">]><x/>','<xi:include href="https://evil.test/x"/>','<?xml-stylesheet href="http://evil"/>'])bad(Buffer.from(x),'application/xml','ACTIVE_XML');});
test('valid bounded DOCX hashes and verifies compressed CRC',()=>{const good=zip(entries);assert.equal(scanQuarantinedBytes(good,docx).parts,2);let tampered=Buffer.from(good);tampered[tampered.readUInt32LE(tampered.length-6)+16]^=1;bad(tampered,docx,'ZIP_INTEGRITY');});
test('macro and active relationships are rejected',()=>{
 for(const extra of [['word/vbaProject.bin','binary'],['word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="External" Target="https://evil.test"/></Relationships>'],['word/embeddings/exploit.bin','evil']]){
  assert.throws(()=>scanQuarantinedBytes(zip([...entries,extra]),docx),IntakeError);
 }
});
test('ZIP traversal and bomb rejected',()=>{bad(zip([...entries,['../escape.xml','<x/>']]),docx,'ZIP_ENTRY_PATH');bad(zip([...entries,['word/huge.xml','A'.repeat(500000)]]),docx,'ZIP_BOMB');});
test('ZIP truncated directory and trailing bytes rejected',()=>{let a=zip(entries);bad(a.subarray(0,a.length-6),docx,'ZIP_DIRECTORY');bad(Buffer.concat([a,Buffer.from('tail')]),docx,'ZIP_DIRECTORY');bad(Buffer.from('PK\x03\x04'),docx,'DOCX_SIGNATURE');});
test('PDF signature and active actions rejected',()=>{bad(Buffer.from('XPDF-1.7\n%%EOF'),'application/pdf','PDF_SIGNATURE');bad(Buffer.from('%PDF-1.7\n1 0 obj /OpenAction << >> endobj\n%%EOF'),'application/pdf','ACTIVE_PDF');assert.equal(scan('%PDF-1.7\ntrailer\n%%EOF','application/pdf').requiresDedicatedParser,true);});
