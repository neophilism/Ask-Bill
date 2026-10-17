/** Launch only under the resource-isolated PDF Docker runner. */
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {previewPdf} from '../../../packages/content/pdf/index.mjs';
import {LIMITS} from '../../../packages/content/intake/index.mjs';
const path=process.argv[2];if(!path){process.stderr.write('INPUT_REQUIRED\n');process.exit(2);}
try{
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const st=await h.stat();if(!st.isFile()||st.size<1||st.size>LIMITS.source)throw Error('PDF_LIMIT');
  const doc=await previewPdf(await h.readFile(),{maxPages:20,previewPages:[1],ocr:false,includePrivatePng:false});
  // Avoid logging raw text, thumbnails or personal information from a private source.
  process.stdout.write(JSON.stringify({pages:doc.pages,processedPages:doc.processedPages,sourceSha256:doc.sourceSha256,
   reviewRequired:true,warnings:doc.warnings,publicationAllowed:false})+'\n');
 }finally{await h.close();}
}catch(e){process.stderr.write((e?.code&&/^[A-Z_]+$/.test(e.code)?e.code:'PDF_REJECTED')+'\n');process.exitCode=3;}
