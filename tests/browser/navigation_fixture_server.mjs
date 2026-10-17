/** Local, read-only navigation acceptance fixture; never fetches legislative documents. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const paths={
 '/viewport.mjs':'../../packages/character/coordinates/viewport.mjs',
 '/graph.mjs':'../../packages/character/navigation/graph.mjs',
 '/planner.mjs':'../../packages/character/navigation/worker/planner.mjs',
 '/worker-entry.mjs':'../../packages/character/navigation/worker/worker-entry.mjs'
};
const root=new URL('./',import.meta.url);
const files=new Map();
for(const [route,path] of Object.entries(paths))files.set(route,await readFile(new URL(path,root),'utf8'));
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ask Bill bounded motion integration fixture</title>'+
'<style>body{margin:0;padding:0;font:16px system-ui}main{margin:24px 16px;max-width:500px}section{box-sizing:border-box;display:inline-block;width:100px;height:22px;vertical-align:top;margin-right:18px;border-bottom:2px solid #444}#stage{height:180px;width:100%;background:#f6f6f6}#question{margin:1rem 0}</style>'+
'<main id="reader"><h1>Source-only test document</h1><label>Question <input id="question" value="plain local test"></label><div id="stage"><section id="provision-alpha"><span>Alpha</span></section><section id="provision-beta"><span>Beta</span></section></div></main></html>';
const server=createServer((req,res)=>{
 const body=req.url==='/'?html:files.get(req.url);
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'||body===undefined){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':req.url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
 res.end(body);
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port:server.address().port})+'\n'));
