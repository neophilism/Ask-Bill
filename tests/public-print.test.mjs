import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const css=await readFile(new URL('../apps/web/source-only/public-reader.css',import.meta.url),'utf8');
test('print layout keeps original legal text readable and hides only controls',()=>{
 assert.match(css,/@page\s*\{[^}]*margin:18mm/);
 assert.match(css,/@media print\s*\{/);
 const print=css.slice(css.indexOf('@media print'));
 assert.match(print,/nav,form,button,input\{display:none!important\}/);
 assert.match(print,/pre\.statutory-text\{font:inherit;white-space:pre-wrap/);
 assert.match(print,/background:transparent/);
 assert(!/article\s*\{display:none/i.test(print));
 assert(!/pre\.statutory-text\s*\{display:none/i.test(print));
 assert.match(css,/@media \(forced-colors: active\)/);
 assert.match(css,/outline:3px solid Highlight/);
});
test('print CSS is served as a safe source-only resource without script dependency',async()=>{
 const server=await createPublishedSourceServer({publisherId:'11111111-1111-4111-8111-111111111111',lookupPublishedPack:async()=>{throw Error('not published')}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/public-reader.css');
 assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/script-src 'none'/);
 assert.match(r.headers.get('content-type'),/text\/css/);
 assert.equal(await r.text(),css);}
 finally{await new Promise(resolve=>server.close(resolve));}
});
