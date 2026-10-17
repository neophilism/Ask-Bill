/** Local preview server only. It does not publish a complete bill or use any provider. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { assertIncompleteFixture, renderPreview } from './reader.mjs';
import { createHealthMonitor, healthHttpResponse } from '../health/monitor.mjs';
const fixturePath = new URL('../../../fixtures/electronic-filing-excerpt.json', import.meta.url);
const routeFiles = new Map([
  ['/preview.css', {file: new URL('./preview.css', import.meta.url), type:'text/css; charset=utf-8'}],
  ['/preview.js', {file: new URL('./preview.js', import.meta.url), type:'text/javascript; charset=utf-8'}],
  ['/characters', {file: new URL('./characters.html', import.meta.url), type:'text/html; charset=utf-8'}],
  ['/characters.html', {file: new URL('./characters.html', import.meta.url), type:'text/html; charset=utf-8'}],
  ['/compare.html', {file: new URL('./compare.html', import.meta.url), type:'text/html; charset=utf-8'}],
  ['/compare.js', {file: new URL('./compare.js', import.meta.url), type:'text/javascript; charset=utf-8'}],
  ['/compare.css', {file: new URL('./compare.css', import.meta.url), type:'text/css; charset=utf-8'}],
  ['/packages/character/gallery/shortlist.mjs', {file: new URL('../../../packages/character/gallery/shortlist.mjs', import.meta.url), type:'text/javascript; charset=utf-8'}],
  ['/characters.js', {file: new URL('./characters.js', import.meta.url), type:'text/javascript; charset=utf-8'}],
  ['/characters.css', {file: new URL('./characters.css', import.meta.url), type:'text/css; charset=utf-8'}],
  ['/packages/character/attention/option10-controller.cjs', {file: new URL('../../../packages/character/attention/option10-controller.cjs', import.meta.url), type:'text/javascript; charset=utf-8'}],
  ['/packages/character/animation/idle-director.mjs', {file: new URL('../../../packages/character/animation/idle-director.mjs', import.meta.url), type:'text/javascript; charset=utf-8'}]
]);
export async function createPreviewServer({healthMonitor=createHealthMonitor({stage:'local'})}={}) {
  const fixture = assertIncompleteFixture(JSON.parse(await readFile(fixturePath, 'utf8')));
  const html = renderPreview(fixture);
  const resources = new Map();
  for (const [path, item] of routeFiles) resources.set(path, {body:await readFile(item.file), type:item.type});
  return createServer((req,res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'none'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    let path;
    try {path = new URL(req.url ?? '/', 'http://localhost').pathname;} catch {res.writeHead(400);res.end();return;}
    if(path === '/health/live' || path === '/health/ready') {
      Promise.resolve(healthHttpResponse(healthMonitor,{method:req.method,pathname:path}))
        .then(({status,headers,body})=>{res.writeHead(status,headers);res.end(body);},
          ()=>{res.writeHead(503,{'Cache-Control':'no-store'});res.end();});
      return;
    }
    if(path === '/healthz') {res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(req.method==='HEAD'?undefined:JSON.stringify({product:'ask-bill',status:'preview',live:false,sourceComplete:false}));return;}
    // Immutable source-owned motion inventory; never use a client-supplied path.
    if(path==='/assets/bill/characters/animation-library.json'){
      readFile(new URL('../../../assets/bill/characters/animation-library.json',import.meta.url)).then(body=>{
        if(body.length>25000){res.writeHead(413);res.end();return;}
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length});
        res.end(req.method==='HEAD'?undefined:body);
      },()=>{res.writeHead(404);res.end();});
      return;
    }
    // Only exact catalog IDs are servable; never resolve client-supplied filesystem paths.
    const characterAsset = /^\/assets\/bill\/characters\/dist\/(manifest\.json|bill-(?:0[1-9]|1[0-9]|20)\.glb)$/.exec(path);
    if(characterAsset){
      const filename=characterAsset[1];
      const uri=new URL('../../../assets/bill/characters/dist/'+filename,import.meta.url);
      readFile(uri).then(body=>{
        if(body.length>16000000){res.writeHead(413);res.end();return;}
        res.writeHead(200,{'Content-Type':filename.endsWith('.glb')?'model/gltf-binary':'application/json; charset=utf-8','Content-Length':body.length});
        res.end(req.method==='HEAD'?undefined:body);
      },()=>{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end();});
      return;
    }
    if(path==='/characters'||path==='/characters.html'||path==='/compare.html'){
      // Scoped to the local-only audition, never relax the evidence/source reader CSP.
      res.setHeader('Content-Security-Policy',"default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; frame-ancestors 'none'");
      res.setHeader('X-Robots-Tag','noindex, nofollow');
      res.setHeader('X-Frame-Options','DENY');
    }
    // Audition-only face reference crops; never accept caller-controlled paths.
    const refFilename=path.slice(path.lastIndexOf('/')+1);
    const refMatch=path==='/assets/bill/characters/reference/'+refFilename &&
      Array.from({length:10},(_,i)=>'original-'+String(i+1).padStart(2,'0')+'.jpg').includes(refFilename);
    if(refMatch){
      const img=new URL('../../../assets/bill/characters/reference/'+path.slice(path.lastIndexOf('/')+1),import.meta.url);
      readFile(img).then(body=>{
        if(body.length>500000){res.writeHead(413);res.end();return;}
        res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':body.length});
        res.end(req.method==='HEAD'?undefined:body);
      },()=>{res.writeHead(404);res.end();});
      return;
    }
    const file = resources.get(path);
    if(file){res.writeHead(200,{'Content-Type':file.type});res.end(req.method==='HEAD'?undefined:file.body);return;}
    if(path==='/' || path==='/preview') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:html);return;}
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?undefined:'Not found');
  });
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href){
  const arg=process.env.PORT ?? '4100';
  if(!/^\d{1,5}$/.test(arg) || Number(arg)<1 || Number(arg)>65535)throw Error('Invalid preview PORT');
  const server=await createPreviewServer();
  server.listen(Number(arg),'127.0.0.1',()=>console.log(`Ask Bill local-only reader preview: http://127.0.0.1:${arg}`));
}
