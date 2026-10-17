import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sniffUpload,StorageError} from '../packages/storage/index.mjs';
const prolog='<?xml version="1.0"?>\n<!DOCTYPE bill PUBLIC "-//US Congress//DTDs/bill.dtd//EN" "bill.dtd">\n<?xml-stylesheet type="text/xsl" href="billres.xsl"?>\n';
test('legacy XML intake preserves exact original bytes under the shared known inert prolog policy',()=>{
 const bytes=Buffer.from(prolog+'<bill><section><text>Public synthetic source.</text></section></bill>');
 for(const mime of ['application/xml','text/xml']){
  const result=sniffUpload(bytes,mime);assert.equal(result.bytes,bytes.length);assert.equal(result.mime,mime);
  assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
 }
});
test('legacy XML intake continues to reject external entities, unknown declarations and altered prologs',()=>{
 for(const xml of [
  '<!DOCTYPE x [<!ENTITY foo SYSTEM "file:///etc/passwd">]><x>&foo;</x>',
  '<!DOCTYPE bill SYSTEM "https://attacker.example/evil.dtd"><bill/>',
  prolog.replace('bill.dtd">','https://attacker.example/bill.dtd">')+'<bill/>',
  prolog.replace('href="billres.xsl"','href="https://attacker.example/style.xsl"')+'<bill/>',
  prolog+'<!ENTITY extra "expanded"><bill/>',prolog+'<other/>',
  '<bill><script>active()</script></bill>'
 ])assert.throws(()=>sniffUpload(Buffer.from(xml),'application/xml'),error=>error instanceof StorageError&&error.code==='UNSAFE_XML');
});
