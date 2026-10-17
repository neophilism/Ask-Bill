/** Synthetic published source + real application routes. No live provider credentials. */
import {createHash} from 'node:crypto';
import {createAskBillApplication} from '../../apps/web/application/server.mjs';
import {createMemorySessionStore} from '../../packages/sessions/store.mjs';

const publisherId='11111111-1111-4111-8111-111111111111',billId='22222222-2222-4222-8222-222222222222',versionId='33333333-3333-4333-8333-333333333333';
const sha=text=>createHash('sha256').update(text).digest('hex');
const texts=['The proposed receipt rule 😃 requires a recorded receipt for each application.',
 'Exception: this synthetic proposal excludes diplomatic applications. <script>not executable</script>'];
const provisions=texts.map((text,index)=>({id:'section-'+(index+1),heading:index?'Section 2. Exceptions':'Section 1. Receipt',text,sha256:sha(text)}));
const pack={schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId,billId,versionId,
 title:'Synthetic Example Bill',language:'en-US',jurisdiction:'United States',status:'introduced',publication:'published',sourceComplete:true,
 retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',canonicalSha256:sha(texts.join('\n\n')),provisions};
const port=Number(process.env.PORT);if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Fixture PORT required');
const wav=()=>{
 const sampleRate=24000,frames=6000,bytes=Buffer.alloc(44+frames*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);
 bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*2,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);return bytes;
};
const server=await createAskBillApplication({publisherId,origin:'http://127.0.0.1:'+port,stage:'test',
 sessions:createMemorySessionStore({stage:'test'}),
 lookupPublishedPack:async input=>input.publisherId===publisherId&&input.billId===billId&&input.versionId===versionId?pack:null,
 lookupPublishedCatalog:async({page})=>({items:page===1?[{publisherId,billId,versionId,title:pack.title,status:pack.status,publication:'published',sourceComplete:true}]:[],hasNext:false}),
 // Valid codec fixtures exercise API/transport, not speech accuracy or live licensing.
 speech:{synthesize:async()=>({bytes:wav()})},
 transcription:{transcribe:async()=>({text:'What does the receipt rule say?',language:'en'})}
});
server.listen(port,'127.0.0.1');
process.on('SIGTERM',()=>server.beginReaderDrain());
