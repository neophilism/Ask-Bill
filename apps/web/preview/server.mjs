/** Local preview server only. It does not publish a complete bill or use any provider. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { assertIncompleteFixture, renderPreview } from './reader.mjs';
const fixturePath = new URL('../../../fixtures/electronic-filing-excerpt.json', import.meta.url);
const routeFiles = new Map([
  ['/preview.css', {file: new URL('./preview.css', import.meta.url), type:'text/css; charset=utf-8'}],
  ['/preview.js', {file: new URL('./preview.js', import.meta.url), type:'text/javascript; charset=utf-8'}]
]);
export async function createPreviewServer() {
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
    if(path === '/healthz') {res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(req.method==='HEAD'?undefined:JSON.stringify({product:'ask-bill',status:'preview',live:false,sourceComplete:false}));return;}
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
