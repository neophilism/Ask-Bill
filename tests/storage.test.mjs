import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {StorageError,corsOrigin,sniffUpload,createCapabilityService,testNonceRegistry,publicPackReference} from '../packages/storage/index.mjs';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const buf=Buffer.from('%PDF-1.7\n1 0 obj');
let time=10000;
const make=()=>createCapabilityService({secret:Buffer.alloc(32,7),now:()=>time,nonceRegistry:testNonceRegistry()});
const data=sniffUpload(buf,'application/pdf');
const key=a+'/bill.pdf';
function denied(code,fn){assert.throws(fn,e=>e instanceof StorageError&&e.code===code)}
test('short-lived upload ticket binds to exact publisher, key, bytes, hash and MIME',()=>{
 const c=make();const ticket=c.issueUpload({publisherId:a,key,sha256:data.sha256,size:data.bytes,mime:data.mime});
 assert.equal(c.verifyUpload({ticket,publisherId:a,key,content:buf,mime:'application/pdf'}).scope,'quarantine');
 denied('TICKET_REPLAY',()=>c.verifyUpload({ticket,publisherId:a,key,content:buf,mime:'application/pdf'}));
});
test('tampering, tenant substitutions and guessed filenames fail closed',()=>{
 const c=make();const ticket=c.issueUpload({publisherId:a,key,sha256:data.sha256,size:data.bytes,mime:data.mime});
 denied('INVALID_SIGNATURE',()=>c.verifyUpload({ticket:ticket.slice(0,-1)+(ticket.endsWith('X')?'Y':'X'),publisherId:a,key,content:buf,mime:data.mime}));
 denied('OBJECT_FORBIDDEN',()=>c.verifyUpload({ticket,publisherId:b,key:b+'/bill.pdf',content:buf,mime:data.mime}));
 denied('OBJECT_FORBIDDEN',()=>c.verifyUpload({ticket,publisherId:a,key:a+'/new.pdf',content:buf,mime:data.mime}));
 denied('OBJECT_INTEGRITY_FAILED',()=>c.verifyUpload({ticket,publisherId:a,key,content:Buffer.from('%PDF-1.7\n2 0 obj'),mime:data.mime}));
});
test('expired and future-issue tickets are rejected',()=>{
 const c=make(),ticket=c.issueUpload({publisherId:a,key,sha256:data.sha256,size:data.bytes,mime:data.mime,ttlMs:1000});
 time=11000;denied('TICKET_EXPIRED',()=>c.verifyUpload({ticket,publisherId:a,key,content:buf,mime:data.mime}));
 time=9000;denied('TICKET_EXPIRED',()=>c.verifyUpload({ticket,publisherId:a,key,content:buf,mime:data.mime}));time=10000;
});
test('upload size, MIME spoofing, ZIP and XML active entities fail closed',()=>{
 denied('MIME_MISMATCH',()=>sniffUpload(Buffer.from('not PDF'),'application/pdf'));
 denied('MIME_MISMATCH',()=>sniffUpload(Buffer.from('bad'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
 denied('UNSAFE_XML',()=>sniffUpload(Buffer.from('<!DOCTYPE x [<!ENTITY foo SYSTEM "file:///etc/passwd">]><x/>'),'application/xml'));
 denied('MIME_FORBIDDEN',()=>sniffUpload(Buffer.from('1'),'text/html'));
 denied('MIME_MISMATCH',()=>sniffUpload(Buffer.from([0x61,0,0x62]),'text/plain'));
 denied('UPLOAD_LIMIT',()=>sniffUpload(Buffer.alloc(0),'text/plain'));
 denied('UPLOAD_LIMIT',()=>sniffUpload(Buffer.alloc(25*1024*1024+1),'text/plain'));
});
test('object keys cannot escape their assigned publisher',()=>{
 const c=make();for(const unsafe of ['../bill.pdf',a+'/../private',b+'/bill.pdf',a+'/%2fetc',a+'/bad\\path']){
  denied('UNSAFE_OBJECT_KEY',()=>c.issueUpload({publisherId:a,key:unsafe,sha256:data.sha256,size:data.bytes,mime:data.mime}));
 }
});
test('origin policies refuse wildcard, insecure and undeclared origins',()=>{
 assert.equal(corsOrigin('https://askbill.example',['https://askbill.example']),'https://askbill.example');
 denied('ORIGIN_FORBIDDEN',()=>corsOrigin('https://evil.example',['https://askbill.example']));
 denied('INVALID_ORIGIN',()=>corsOrigin('http://askbill.example',['http://askbill.example']));
 denied('INVALID_ORIGIN',()=>corsOrigin('https://askbill.example/x',['https://askbill.example/x']));
 denied('INVALID_ORIGIN',()=>corsOrigin('https://evil.example',['*']));
});
test('private/quarantine object references are never public links',()=>{
 denied('NOT_PUBLIC',()=>publicPackReference({scope:'private-source',publisherId:a,key,sha256:data.sha256}));
 denied('NOT_PUBLIC',()=>publicPackReference({scope:'quarantine',publisherId:a,key,sha256:data.sha256}));
 const ref=publicPackReference({scope:'public-packs',publisherId:a,key,sha256:data.sha256});
 assert.equal(ref.sha256,data.sha256);assert(Object.isFrozen(ref));
});
test('cannot initialize signer without a trusted key and replay database',()=>{
 denied('SIGNING_KEY_REQUIRED',()=>createCapabilityService({secret:Buffer.from('too-short')}));
 denied('NONCE_STORE_REQUIRED',()=>createCapabilityService({secret:randomBytes(32)}));
 const asyncNonce=createCapabilityService({secret:randomBytes(32),nonceRegistry:{consume:async()=>true}});
 const ticket=asyncNonce.issueUpload({publisherId:a,key,sha256:data.sha256,size:data.bytes,mime:data.mime});
 denied('TICKET_REPLAY',()=>asyncNonce.verifyUpload({ticket,publisherId:a,key,content:buf,mime:data.mime}));
});
