import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const publisher='11111111-1111-4111-8111-111111111111';
test('reader observes capacity and begins idempotent drain',async()=>{
 const server=await createPublishedSourceServer({publisherId:publisher,lookupPublishedPack:async()=>null,maxInflight:2});
 assert.deepEqual(server.readerCapacity(),{active:0,limit:2,draining:false});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const done=new Promise(resolve=>server.once('close',resolve));
 server.beginReaderDrain();server.beginReaderDrain();
 assert.equal(server.readerCapacity().draining,true);
 await done;
});
