import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createPublisherWorkflow,PUBLISHER_REVIEW_CHECKS} from '../packages/db/publisher-workflow.mjs';
import {createPublisherSourceExtractor} from '../packages/db/publisher-source-extraction.mjs';
import {docxFixture,docxMime} from './fixtures/createDocx.mjs';
import {makePdf} from './fixtures/createPdf.mjs';
const publisherId='bc0a0001-1111-4111-8111-111111111111',userId='bbbb0001-3333-4333-8333-333333333333';
const versionId='cc0a0001-1111-4111-8111-111111111111',billId='dc0a0001-1111-4111-8111-111111111111';
const trusted={publisherId,userId,role:'editor',action:'upload',freshMembershipVerified:true,mfaVerifiedByTrustedServer:true};
const input={bytes:Buffer.from('SEC. 1. Synthetic source for an isolated test.'),mime:'text/plain',versionId};
const rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);

test('publisher repository rejects invalid authority and mutation fields before opening a database connection',async()=>{
  let calls=0;const pool={async connect(){calls++;throw Error('unreachable');}};
  const workflow=createPublisherWorkflow({pool,publisherId});
  await rejects(()=>workflow.createBill({actor:{...trusted,role:'viewer'},title:'Bill',jurisdiction:'US'}),'ACTION_FORBIDDEN');
  await rejects(()=>workflow.createBill({actor:{...trusted,freshMembershipVerified:false},title:'Bill',jurisdiction:'US'}),'MEMBERSHIP_REVOKED');
  await rejects(()=>workflow.listBills({actor:{...trusted,publisherId:billId}}),'PUBLISHER_FORBIDDEN');
  await rejects(()=>workflow.createBill({actor:trusted,title:'x\0leak',jurisdiction:'US'}),'INPUT_INVALID');
  await rejects(()=>workflow.publishRelease({actor:{...trusted,action:'publish',mfaVerifiedByTrustedServer:false},billId,versionId}),'MFA_REQUIRED');
  await rejects(()=>workflow.withdrawRelease({actor:{...trusted,action:'withdraw'},billId,releaseId:versionId}),'ACTION_FORBIDDEN');
  await rejects(()=>workflow.reviewVersion({actor:trusted,billId,versionId,checks:[...PUBLISHER_REVIEW_CHECKS.slice(1),'index_complete'],expectedCanonicalSha256:'0'.repeat(64)}),'REVIEW_INCOMPLETE');
  await rejects(()=>workflow.recordUpload({actor:trusted,billId,object:{scope:'private-source',publisherId,sha256:'a'.repeat(64),bytes:10,mime:'text/plain',
    key:'../other',objectStoredAndVerified:true}}),'SOURCE_OBJECT_INVALID');
  await rejects(()=>workflow.requestOfficialImport({actor:trusted,billId,identity:{congress:119,billType:'hr',billNumber:10}}),'SERVICE_NOT_CONFIGURED');
  assert.equal(calls,0);
});

test('source extraction requires explicit configured containment and rejects malformed setup',()=>{
  assert.throws(()=>createPublisherSourceExtractor(),e=>e.code==='PARSER_SANDBOX_REQUIRED');
  assert.throws(()=>createPublisherSourceExtractor({sandboxVerified:true}),e=>e.code==='PARSER_SANDBOX_REQUIRED');
  assert.throws(()=>createPublisherSourceExtractor({sandboxVerified:true,sandboxCommand:'node'}),e=>e.code==='EXTRACTOR_CONFIGURATION_INVALID');
  assert.throws(()=>createPublisherSourceExtractor({allowUncontainedForTests:true,timeoutMs:0}),e=>e.code==='EXTRACTOR_CONFIGURATION_INVALID');
  assert.throws(()=>createPublisherSourceExtractor({allowUncontainedForTests:true,sandboxArgs:['nul\0']}),e=>e.code==='EXTRACTOR_CONFIGURATION_INVALID');
});

test('actual text extraction keeps Unicode, bounded passages, all wording, and explicit canonicalization warnings',async()=>{
  const extract=createPublisherSourceExtractor({allowUncontainedForTests:true});
  const text='SEC. 1. Unicode source.\r\n'+('x'.repeat(3760))+'😃\r\nAn exception must remain.\r\n\r\n'+('Another paragraph. '.repeat(260));
  const result=await extract({...input,bytes:Buffer.from(text)});
  assert.ok(result.provisions.length>=2);assert.ok(result.provisions.every(p=>p.text.length<=3800&&p.text.isWellFormed()));
  assert.equal(result.canonicalText,result.provisions.map(p=>p.text).join('\n\n'));
  assert.match(result.canonicalText,/😃\n{1,2}An exception must remain\./);
  assert.equal(result.canonicalText.replace(/\s+/g,' '),text.trim().replace(/\s+/g,' '));
  assert.ok(result.warnings.includes('canonical_block_boundaries_normalized'));
});

test('actual DOCX extraction retains footnotes and never discards a tracked-change review warning',async()=>{
  const extract=createPublisherSourceExtractor({allowUncontainedForTests:true});
  const docx=docxFixture([['[Content_Types].xml','<Types/>'],['word/document.xml',
    '<w:document><w:body><w:p><w:r><w:t>SEC. 1. Benefits.</w:t></w:r></w:p><w:p><w:r><w:t>Eligible </w:t></w:r><w:ins><w:r><w:t>residents</w:t></w:r></w:ins><w:footnoteReference w:id="1"/></w:p></w:body></w:document>'],
    ['word/footnotes.xml','<w:footnotes><w:footnote><w:p><w:r><w:t>Except as stated in the eligibility rule.</w:t></w:r></w:p></w:footnote></w:footnotes>']]);
  const result=await extract({...input,bytes:docx,mime:docxMime});
  assert.match(result.canonicalText,/Eligible residents/);assert.match(result.canonicalText,/Except as stated in the eligibility rule\./);
  assert.ok(result.warnings.includes('tracked_changes_require_review'));
});

const pdfAvailable=existsSync('/usr/bin/pdfinfo')&&existsSync('/usr/bin/pdftotext');
if(process.env.ASK_BILL_REQUIRE_PDF_TOOLS==='1'&&!pdfAvailable)throw Error('PDF integration requires real Poppler tools');
test('actual PDF extraction covers every page and preserves the exception text',{skip:!pdfAvailable},async()=>{
  const extract=createPublisherSourceExtractor({allowUncontainedForTests:true});
  const result=await extract({...input,mime:'application/pdf',bytes:makePdf(['SEC. 1. A sample public benefit program.','Except for applicants outside the eligibility group.'])});
  assert.match(result.canonicalText,/SEC\. 1\. A sample public benefit program\./);
  assert.match(result.canonicalText,/Except for applicants outside the eligibility group\./);
});

test('malformed and unsafe bytes fail before a parser process, and cancellation returns a fixed code',async()=>{
  const extract=createPublisherSourceExtractor({allowUncontainedForTests:true});
  await rejects(()=>extract({...input,bytes:Buffer.from([0xc3,0x28])}),'TEXT_ENCODING');
  await assert.rejects(()=>extract({...input,mime:'application/xml',bytes:Buffer.from('<!DOCTYPE bill SYSTEM "https://private.invalid"><bill>private</bill>')}),e=>
    /^[A-Z_]+$/.test(e.code)&&!e.message.includes('private'));
  await rejects(()=>extract({...input,mime:'text/html'}),'EXTRACTION_INPUT_INVALID');
  await rejects(()=>extract({...input,signal:AbortSignal.abort()}),'EXTRACTION_CANCELLED');
});

test('parser subprocess receives only explicit environment names, with no application credentials',async()=>{
  // Explicit local test runner protocol; this command is not claimed to provide containment.
  process.env.ASK_BILL_EXTRACT_TEST_SECRET='synthetic-never-forward';
  try{
    const extract=createPublisherSourceExtractor({allowUncontainedForTests:true,sandboxCommand:process.execPath,
      sandboxArgs:['-e','process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))']});
    assert.deepEqual(await extract(input),['LANG','PATH','TMPDIR']);
  }finally{delete process.env.ASK_BILL_EXTRACT_TEST_SECRET;}
});

test('a hung parser and excessive stdout are terminated and expose no raw diagnostics',async()=>{
  const hang=createPublisherSourceExtractor({allowUncontainedForTests:true,sandboxCommand:process.execPath,timeoutMs:1000,
    sandboxArgs:['-e','setTimeout(()=>{},10000)']});
  await rejects(()=>hang(input),'EXTRACTION_TIMEOUT');
  const oversized=createPublisherSourceExtractor({allowUncontainedForTests:true,sandboxCommand:process.execPath,
    sandboxArgs:['-e','process.stdout.write("x".repeat(7000000))']});
  await rejects(()=>oversized(input),'EXTRACTION_OUTPUT_LIMIT');
});
