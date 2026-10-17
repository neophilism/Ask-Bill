import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {previewPdf} from '../packages/content/pdf/index.mjs';
import {makePdf} from './fixtures/createPdf.mjs';
const tools=['pdfinfo','pdftotext','pdftoppm'],available=tools.every(t=>!spawnSync(t,['-v'],{encoding:'utf8'}).error);
if(process.env.ASK_BILL_REQUIRE_PDF_TOOLS==='1'&&!available)throw new Error('Dedicated PDF integration job requires installed Poppler utilities');
test('bad signatures and active PDF content are rejected before subprocess execution',async()=>{
 await assert.rejects(()=>previewPdf(Buffer.from('not a pdf')),e=>e.code==='PDF_SIGNATURE');
 await assert.rejects(()=>previewPdf(Buffer.from('%PDF-1.4\n1 0 obj /JavaScript <<>>\n%%EOF')),e=>e.code==='ACTIVE_PDF');
 await assert.rejects(()=>previewPdf(makePdf(['ok']),{maxPages:0}),e=>e.code==='PDF_OPTIONS');
});
test('native PDF text and private page hash proof extracted under bounded worker flow',{skip:!available},async()=>{
 const r=await previewPdf(makePdf(['Ask Bill receives a document.','Second page of test text.']),{maxPages:2,previewPages:[1],includePrivatePng:true});
 assert.equal(r.pages,2);assert.equal(r.processedPages,2);assert(r.pagesData[0].text.includes('Ask Bill receives a document.'));
 assert(r.pagesData[1].text.includes('Second page of test text.'));
 assert.equal(r.pagesData[0].thumbnail.sha256.length,64);assert.equal(r.privateImages.get(1).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(r.sourceComplete,false);assert.equal(r.publicationAllowed,false);
});
test('incomplete page processing produces a warning',{skip:!available},async()=>{
 const r=await previewPdf(makePdf(['First','Second','Third']),{maxPages:1,previewPages:[]});
 assert.deepEqual(r.warnings,['remaining_pages_unprocessed:2']);assert.equal(r.pagesData.length,1);
});
test('blank page requires review and is not hallucinated from OCR',{skip:!available},async()=>{
 const r=await previewPdf(makePdf([null]),{maxPages:1,previewPages:[1],ocr:false});
 assert.equal(r.pages,1);assert(r.pagesData[0].reviewRequired);assert(r.warnings.includes('scan_or_blank_page:1'));
});
