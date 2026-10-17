import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createS3PrivateStorage,signS3Request} from '../packages/storage/s3.mjs';
const P='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const auth={accessKeyId:'AKIAIOSFODNN7EXAMPLE',secretAccessKey:'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'};
const content=Buffer.from('A complete original source for a private draft.'),sha256=createHash('sha256').update(content).digest('hex');
function fixture({respond}={}){
 const objects=new Map(),calls=[];
 const store=createS3PrivateStorage({endpoint:'https://storage.askbill.example',region:'us-east-1',bucket:'askbill-private',publisherId:P,credentials:auth,now:()=>Date.UTC(2026,9,17,15),fetchImpl:async(url,init)=>{
  calls.push({url,init});assert.equal(init.redirect,'manual');assert(init.signal);assert.match(init.headers.authorization,/AWS4-HMAC-SHA256/);
  assert.equal(init.headers['x-amz-content-sha256'],createHash('sha256').update(init.body??Buffer.alloc(0)).digest('hex'));
  if(respond)return respond(url,init,objects);
  if(init.method==='PUT'){
   if(objects.has(url))return new Response(null,{status:412});
   objects.set(url,{bytes:Buffer.from(init.body),mime:init.headers['content-type']});return new Response(null,{status:200});
  }
  if(init.method==='GET'){
   const found=objects.get(url);return found?new Response(found.bytes,{headers:{'content-type':found.mime,'content-length':String(found.bytes.length)}}):new Response(null,{status:404});
  }
  if(init.method==='DELETE'){objects.delete(url);return new Response(null,{status:204});}
  throw new Error('Unexpected method');
 }});
 return {store,calls,objects,input:{publisherId:P,sha256,mime:'text/plain',content}};
}
test('SigV4 matches the published AWS S3 single-chunk GET example',()=>{
 const signed=signS3Request({method:'GET',url:'https://examplebucket.s3.amazonaws.com/test.txt',headers:{range:'bytes=0-9'},region:'us-east-1',credentials:auth,now:()=>Date.UTC(2013,4,24)});
 assert.equal(signed.authorization,'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});
test('private upload uses scoped content-addressed immutable keys, checksums and verified roundtrip',async()=>{
 const f=fixture(),receipt=await f.store.putQuarantine(f.input);
 assert.equal(receipt.objectStoredAndVerified,true);assert.equal(receipt.key,P+'/sha256/'+sha256);assert.equal(receipt.scope,'quarantine');
 assert.match(f.calls[0].url,new RegExp('/quarantine/'+P+'/sha256/'+sha256+'$'));assert.equal(f.calls[0].init.headers['if-none-match'],'*');
 assert.equal(f.calls[0].init.headers['x-amz-checksum-sha256'],Buffer.from(sha256,'hex').toString('base64'));
 const promoted=await f.store.promoteQuarantine({...f.input,content:undefined});assert.equal(promoted.scope,'private-source');
 const read=await f.store.getPrivateSource({publisherId:P,sha256,key:receipt.key});assert.deepEqual(read.content,content);
 await f.store.putPrivateSource(f.input);assert.equal(f.objects.size,2);
 await f.store.deleteQuarantine({publisherId:P,sha256});assert.equal(f.objects.size,1);
 assert.equal((await f.store.getPrivateSource({publisherId:P,sha256})).sha256,sha256);
});
test('tenant, key, digest, MIME and active-content attacks never reach storage',async()=>{
 const f=fixture();
 for(const input of [{...f.input,publisherId:other},{...f.input,key:P+'/../private'}, {...f.input,sha256:'b'.repeat(64)}])await assert.rejects(()=>f.store.putQuarantine(input));
 await assert.rejects(()=>f.store.putQuarantine({...f.input,mime:'text/html'}));
 const xml=Buffer.from('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x/>');
 await assert.rejects(()=>f.store.putQuarantine({...f.input,mime:'application/xml',content:xml,sha256:createHash('sha256').update(xml).digest('hex')}));
 assert.equal(f.calls.length,0);
});
test('stored corruption, provider redirects and oversized bodies are rejected',async()=>{
 const bad=fixture({respond:(_url,init)=>init.method==='PUT'?new Response(null):new Response('wrong')});
 await assert.rejects(()=>bad.store.putQuarantine(bad.input),e=>e.code==='OBJECT_INTEGRITY_FAILED');
 const redirect=fixture({respond:()=>new Response(null,{status:307,headers:{location:'https://attacker.example'}})});
 await assert.rejects(()=>redirect.store.putQuarantine(redirect.input),e=>e.code==='STORAGE_REDIRECT_BLOCKED');
 const large=fixture({respond:()=>new Response('long',{headers:{'content-length':'99999999'}})});
 await assert.rejects(()=>large.store.getPrivateSource({publisherId:P,sha256}),e=>e.code==='OBJECT_RESPONSE_LIMIT');
});
test('presigned private downloads bind exact scope/key, expiry and attachment disposition',()=>{
 const f=fixture(),ticket=f.store.signedDownload({scope:'private-source',publisherId:P,sha256,ttlSeconds:45}),url=new URL(ticket.url);
 assert.equal(url.searchParams.get('X-Amz-Expires'),'45');assert.equal(url.searchParams.get('response-content-disposition'),'attachment');
 assert.equal(url.searchParams.get('response-cache-control'),'private, no-store');assert.match(url.searchParams.get('X-Amz-Signature'),/^[a-f0-9]{64}$/);
 assert.equal(ticket.private,true);assert.equal(ticket.expiresAt,'2026-10-17T15:00:45.000Z');
 assert.throws(()=>f.store.signedDownload({scope:'public-packs',publisherId:P,sha256}),e=>e.code==='OBJECT_FORBIDDEN');
 assert.throws(()=>f.store.signedDownload({scope:'private-source',publisherId:P,sha256,ttlSeconds:301}),e=>e.code==='INVALID_EXPIRY');
 assert.doesNotMatch(ticket.url,/EXAMPLEKEY/);
});
