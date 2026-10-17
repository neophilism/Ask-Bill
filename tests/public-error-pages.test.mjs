import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicErrorPageError,renderPublicError,formatPublicError,wantsHtml} from '../packages/ui/errors/index.mjs';
test('explicit browser HTML negotiation, not fetch wildcard or q=0',()=>{
 assert.equal(wantsHtml('text/html,application/xhtml+xml'),true);
 assert.equal(wantsHtml('text/html;q=0'),false);
 assert.equal(wantsHtml('text/plain, text/html;q=0.5'),true);
 assert.equal(wantsHtml('*/*'),false);
 assert.equal(wantsHtml('application/json'),false);
});
test('all public errors render semantic accessible HTML and never reflect input',()=>{
 for(const status of [404,405,503]){
  const text=renderPublicError(status);
  assert.match(text,/<!doctype html>/);
  assert.match(text,/<main id="error">/);
  assert.match(text,/<h1>/);
  assert.match(text,/name="robots" content="noindex,nofollow"/);
  assert.match(text,/Browse published bills/);
  assert.match(text,/Skip to message/);
  assert(!text.includes('<script'));
  assert(!text.includes('private token'));
 }
});
test('404 and unavailable version remain indistinguishable in plain fallback',()=>{
 const a=formatPublicError({status:404,accept:'*/*'});
 const b=formatPublicError({status:404,accept:'application/json'});
 assert.deepEqual(a,b);assert.equal(a.body,'Not found');
 assert.equal(a.contentType,'text/plain; charset=utf-8');
});
test('no wildcard HTML and no user-controlled reflected template content',()=>{
 const evil='<script>alert(1)</script>';
 assert(!formatPublicError({status:503,accept:'text/html,'+evil}).body.includes(evil));
 assert.equal(formatPublicError({status:405,accept:'text/html'}).contentType,'text/html; charset=utf-8');
 assert.equal(formatPublicError({status:503,accept:'*/*'}).body,'Reader temporarily busy');
});
test('unknown statuses fail before rendering or returning unvetted text',()=>{
 assert.throws(()=>renderPublicError(200),e=>e instanceof PublicErrorPageError&&e.code==='UNSUPPORTED_PUBLIC_STATUS');
 assert.throws(()=>formatPublicError({status:500,accept:'text/html'}),PublicErrorPageError);
});
