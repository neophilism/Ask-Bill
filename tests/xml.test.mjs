import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLegislativeXml,XmlSourceError} from '../packages/content/xml/index.mjs';
const xml='<?xml version="1.0"?><bill><legis-body><section id="sec1"><num>SEC. 1.</num><header>Purpose</header><text>This bill defines “access” &amp; review 😃.</text><subsection id="subA"><num>(a)</num><text>Except as provided in section 2.</text><paragraph id="p1"><num>(1)</num><text>Nested exception.</text></paragraph></subsection></section><section id="sec2"><num>SEC. 2.</num><text>Second rule.</text></section></legis-body></bill>';
const parse=(x,options={versionId:'v1'})=>parseLegislativeXml(Buffer.from(x),options);
test('valid legislation retains ordered nested sections and source text',()=>{
 const x=parse(xml);assert.equal(x.provisions.length,4);
 assert.deepEqual(x.provisions.map(p=>p.id),['sec1','sec1/subA','sec1/subA/p1','sec2']);
 assert.deepEqual(x.provisions.map(p=>p.parentId),[null,'sec1','sec1/subA',null]);
 assert.equal(x.provisions[0].heading,'Purpose');assert.equal(x.provisions[0].label,'SEC. 1.');
 assert(x.provisions[0].text.includes('review 😃'));assert(x.provisions[1].text.includes('Except as provided'));
 assert.equal(x.sourceComplete,false);assert.equal(x.publicationAllowed,false);
 assert.equal(x.provisions[0].hash.length,64);
});
test('same XML under a different version pins identifiers separately',()=>{
 const a=parse(xml),b=parse(xml,{versionId:'v2'});
 assert.equal(a.provisions[0].text,b.provisions[0].text);
 assert.equal(b.provisions[0].versionId,'v2');
 assert.equal(a.xmlSha256,b.xmlSha256);
 assert.throws(()=>parse(xml,{versionId:'../../bad'}),XmlSourceError);
});
test('unrecognized tags produce warning but preserve paragraph content',()=>{
 let x=parse('<bill><section id="s1"><text>Hello <novel-element>new wording</novel-element>.</text></section></bill>');
 assert(x.warnings.includes('unsupported_tag:novel-element'));assert(x.provisions[0].text.includes('new wording'));
});
test('ambiguous IDs, duplicate XML attributes and multiple roots fail closed',()=>{
 for(const x of ['<bill><section id="dupe"/><section id="dupe"/></bill>','<bill><section id="x" id="y"/></bill>','<bill/><bill/>','<bill><section id="../secret"/></bill>'])
 assert.throws(()=>parse(x),XmlSourceError);
});
test('hostile XML entity, DTD, external reference and stylesheet blocked',()=>{
 for(const x of ['<!DOCTYPE bill [<!ENTITY x SYSTEM "file:///etc/passwd">]><bill/>','<bill><section id="s1"><text>&hack;</text></section></bill>','<?xml-stylesheet href="https://evil.test/x"?><bill/>','<bill><xi:include href="https://evil.test"/></bill>'])
 assert.throws(()=>parse(x));
});
test('unbalanced markup, invalid Unicode and invalid depth do not parse',()=>{
 for(const x of ['<bill><section></bill>','<bill>open','<bill></bill>literal','<bill><section></section></bill><',''])
 assert.throws(()=>parse(x));
 let nested='<bill>'+Array.from({length:80},()=>'<section>').join('')+'text'+Array.from({length:80},()=>'</section>').join('')+'</bill>';
 assert.throws(()=>parse(nested),XmlSourceError);
 assert.throws(()=>parseLegislativeXml(Buffer.from([0xc3,0x28]),{versionId:'v1'}));
});
test('empty recognized hierarchy is a warning and never publishable',()=>{
 const x=parse('<bill><text>Unstructured bill</text></bill>');
 assert.equal(x.provisions.length,0);assert(x.warnings.includes('no_recognized_provisions'));
});
test('native namespace prefixes work while preserving original identifiers',()=>{
 const x=parse('<uslm:bill xmlns:uslm="urn:uslm"><uslm:section xml:id="s_1"><uslm:num>Sec. 1.</uslm:num><uslm:text>Budget.</uslm:text></uslm:section></uslm:bill>');
 assert.equal(x.provisions[0].identifier,'s_1');assert.equal(x.provisions[0].label,'Sec. 1.');
});
