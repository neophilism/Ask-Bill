/** AB-016: restricted Poppler preview adapter. Run only from a no-network sandbox. */
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scanQuarantinedBytes} from '../intake/index.mjs';
export class PdfPreviewError extends Error{constructor(code){super(code);this.name='PdfPreviewError';this.code=code;}}
const fail=c=>{throw new PdfPreviewError(c)};
const MAX_PAGE=300,MAX_TEXT=6*1024*1024,MAX_PNG=12*1024*1024,MAX_PREVIEWS=12;
const programs=new Set(['pdfinfo','pdftotext','pdftoppm','tesseract']);
async function run(program,args,{timeoutMs=12000,maxBytes=MAX_TEXT}={}){
 if(!programs.has(program)||!Array.isArray(args)||args.some(x=>typeof x!=='string'))fail('PDF_COMMAND');
 return await new Promise((resolve,reject)=>{
  const child=spawn(program,args,{shell:false,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8',HOME:'/nonexistent'},windowsHide:true});
  let done=false,count=0,out=[],errCount=0;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value)};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new PdfPreviewError('PDF_TOOL_TIMEOUT'))},timeoutMs);
  child.once('error',()=>finish(new PdfPreviewError('PDF_TOOL_UNAVAILABLE')));
  child.stdout.on('data',chunk=>{count+=chunk.length;if(count>maxBytes){child.kill('SIGKILL');finish(new PdfPreviewError('PDF_TOOL_OUTPUT_LIMIT'));}else out.push(chunk)});
  child.stderr.on('data',chunk=>{errCount+=chunk.length;if(errCount>4096){child.kill('SIGKILL');finish(new PdfPreviewError('PDF_TOOL_OUTPUT_LIMIT'));}});
  child.once('close',code=>finish(code===0?null:new PdfPreviewError('PDF_TOOL_REJECTED'),Buffer.concat(out)));
 });
}
function pageInfo(text){
 const count=text.match(/^Pages:\s*(\d+)\s*$/m),encrypted=text.match(/^Encrypted:\s*(\S+)/m);
 if(!count||!Number.isSafeInteger(Number(count[1]))||Number(count[1])<1||Number(count[1])>MAX_PAGE)fail('PDF_PAGE_LIMIT');
 if(encrypted?.[1]?.toLowerCase()==='yes')fail('PDF_ENCRYPTED');
 return Number(count[1]);
}
function meanOcrConfidence(tsv){
 const lines=tsv.trim().split('\n').slice(1),words=[];let sum=0,scored=0;
 for(const line of lines){
  const cols=line.split('\t');
  if(cols.length<12)continue;
  const conf=Number(cols[10]),word=cols.slice(11).join('\t').trim();
  if(!word)continue;
  if(Number.isFinite(conf)&&conf>=0){sum+=conf;scored++;}
  words.push(word);
 }
 return {text:words.join(' '),confidence:scored?sum/scored:0};
}
export async function previewPdf(bytes,{maxPages=20,previewPages=[1],ocr=false,includePrivatePng=false}={}){
 if(!(bytes instanceof Uint8Array))fail('PDF_INPUT');
 scanQuarantinedBytes(bytes,'application/pdf');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>MAX_PAGE||!Array.isArray(previewPages)||previewPages.length>MAX_PREVIEWS||previewPages.some(x=>!Number.isSafeInteger(x)||x<1||x>MAX_PAGE)||typeof ocr!=='boolean'||typeof includePrivatePng!=='boolean')fail('PDF_OPTIONS');
 const workspace=await mkdtemp(join(tmpdir(),'ask-bill-pdf-'));
 try{
  const filepath=join(workspace,'source.pdf');
  await writeFile(filepath,bytes,{mode:0o600,flag:'wx'});
  const info=(await run('pdfinfo',[filepath],{maxBytes:100000})).toString('utf8');
  const pages=pageInfo(info),bounded=Math.min(pages,maxPages);
  const selected=[...new Set(previewPages)].filter(x=>x<=bounded);
  const result=[],warnings=[],imageFiles=new Map();
  let allText=0;
  for(let page=1;page<=bounded;page++){
   let native=(await run('pdftotext',['-f',String(page),'-l',String(page),'-layout','-enc','UTF-8','-nopgbrk',filepath,'-'],{maxBytes:2*1024*1024})).toString('utf8').replace(/\f$/,'');
   allText+=Buffer.byteLength(native);if(allText>MAX_TEXT)fail('PDF_TEXT_LIMIT');
   if(!native.trim())warnings.push('scan_or_blank_page:'+page);
   if(selected.includes(page)||ocr&&native.trim().length<15){
    const out=join(workspace,'page-'+page);
    await run('pdftoppm',['-f',String(page),'-l',String(page),'-scale-to','1000','-singlefile','-png',filepath,out],{maxBytes:100000});
    const image=await readFile(out+'.png');
    if(image.length>MAX_PNG)fail('PDF_PREVIEW_LIMIT');
    imageFiles.set(page,image);
   }
   let alignment='native',confidence=null;
   if(ocr&&native.trim().length<15){
    const image=imageFiles.get(page);
    if(!image)fail('PDF_OCR_INPUT');
    const tsv=(await run('tesseract',[join(workspace,'page-'+page+'.png'),'stdout','-l','eng','--psm','3','tsv'],{timeoutMs:20000,maxBytes:2*1024*1024})).toString('utf8');
    const o=meanOcrConfidence(tsv);if(o.text){native=o.text;alignment='ocr';confidence=o.confidence;}
    if(o.confidence<90)warnings.push('ocr_needs_review:'+page);
   }
   const img=imageFiles.get(page);
   result.push(Object.freeze({page,text:native,characters:Array.from(native).length,alignment,confidence,
    reviewRequired:alignment==='ocr'||!native.trim(),thumbnail:img?Object.freeze({sha256:createHash('sha256').update(img).digest('hex'),bytes:img.length}):null}));
  }
  if(bounded<pages)warnings.push('remaining_pages_unprocessed:'+String(pages-bounded));
  return Object.freeze({format:'pdf',pages,processedPages:bounded,pagesData:Object.freeze(result),warnings:Object.freeze(warnings),
   sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceComplete:false,publicationAllowed:false,
   privateImages:includePrivatePng?new Map(imageFiles):null});
 }finally{await rm(workspace,{recursive:true,force:true});}
}
