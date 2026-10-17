import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createRecordingNormalizer,withBoundedRecordings,RecordingError} from '../packages/voice/stt/normalize.mjs';

const ffmpegPath='/usr/bin/ffmpeg',available=existsSync(ffmpegPath);
if(!available&&process.env.ASK_BILL_REQUIRE_FFMPEG==='1')throw Error('A real FFmpeg executable is required for recording normalization acceptance');
const realTest=available?test:test.skip;
function wav(seconds,rate=48000){
 const frames=Math.round(seconds*rate),bytes=Buffer.alloc(44+frames*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
 bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(6000*Math.sin(i/rate*880*Math.PI)),44+i*2);
 return bytes;
}
function ogg(seconds){
 const result=spawnSync(ffmpegPath,['-nostdin','-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=mono',
  '-t',String(seconds),'-threads','1','-c:a','libopus','-f','ogg','pipe:1'],{timeout:10000,maxBuffer:2000000,
   env:{PATH:'/usr/bin:/bin',LANG:'C',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
 assert.equal(result.status,0,'Real fixture encoder failed: '+result.stderr?.toString());
 assert(result.stdout.byteLength>12);return result.stdout;
}
async function emptyCapacity(normalize){
 for(let attempt=0;attempt<100;attempt++){
  if(normalize.capacity().active===0)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.equal(normalize.capacity().active,0,'Decoder capacity was not released after its child exited');
}

test('recording decoder configuration rejects missing executables, unbounded budgets and fake signals',async()=>{
 await assert.rejects(()=>createRecordingNormalizer({ffmpegPath:'ffmpeg'}),error=>error.code==='AUDIO_DECODER_CONFIGURATION');
 await assert.rejects(()=>createRecordingNormalizer({ffmpegPath:'/nonexistent/ask-bill-ffmpeg'}),error=>error.code==='AUDIO_DECODER_UNAVAILABLE');
 for(const option of [{maxSeconds:31},{maxInputBytes:6*1024*1024},{timeoutMs:25000},{maxConcurrent:0},{maxConcurrent:17}])
  await assert.rejects(()=>createRecordingNormalizer({...option,ffmpegPath}),error=>error.code==='AUDIO_DECODER_CONFIGURATION');
});

realTest('actual FFmpeg normalizes the entire 30-second recording to canonical mono 16 kHz PCM WAV',async()=>{
 const normalize=await createRecordingNormalizer({ffmpegPath});
 const input=wav(30),result=await normalize({audio:input,mimeType:'audio/wav'});
 assert.equal(result.durationSeconds,30);assert.equal(result.mimeType,'audio/wav');
 assert.equal(result.audio.byteLength,44+30*16000*2);
 assert.equal(result.audio.toString('ascii',0,4),'RIFF');assert.equal(result.audio.toString('ascii',8,12),'WAVE');
 assert.equal(result.audio.readUInt32LE(24),16000);assert.equal(result.audio.readUInt16LE(22),1);
 assert.equal(result.audio.readUInt16LE(34),16);assert.equal(result.audio.readUInt32LE(40),960000);
 assert(result.audio.subarray(44).some(value=>value!==0));
 assert.equal(input.toString('ascii',0,4),'RIFF');assert.equal(normalize.capacity().active,0);
 result.audio.fill(0);input.fill(0);
});

realTest('small compressed recordings over 30 seconds are rejected before provider billing instead of truncated',async()=>{
 const normalize=await createRecordingNormalizer({ffmpegPath});
 const short=ogg(0.5),accepted=await normalize({audio:short,mimeType:'audio/ogg'});
 assert(Math.abs(accepted.durationSeconds-0.5)<0.002);accepted.audio.fill(0);
 const long=ogg(31.5);assert(long.byteLength<100000,'Fixture must remain small despite its excessive duration');
 let providerCalls=0;
 const wrapped=withBoundedRecordings({transcribe:async()=>{providerCalls++;return {text:'must not happen'};}},normalize);
 await assert.rejects(()=>wrapped.transcribe({audio:long,mimeType:'audio/ogg',durationSeconds:1}),error=>error.code==='AUDIO_INPUT_DURATION_LIMIT');
 assert.equal(providerCalls,0);await emptyCapacity(normalize);
});

realTest('malformed inputs, oversize bodies, incorrect MIME and invented abort objects fail without private diagnostics',async()=>{
 const normalize=await createRecordingNormalizer({ffmpegPath,maxConcurrent:1});
 for(const request of [
  {audio:Buffer.from('not audio: personal recording contents'),mimeType:'audio/webm'},
  {audio:wav(0.1),mimeType:'text/plain'},
  {audio:Buffer.alloc(6*1024*1024),mimeType:'audio/wav'},
  {audio:wav(0.1),mimeType:'audio/wav',signal:{aborted:false,addEventListener(){}}},
  {audio:Buffer.alloc(11),mimeType:'audio/ogg'}
 ]){
  await assert.rejects(()=>normalize(request),error=>error instanceof RecordingError&&error.code==='AUDIO_INPUT_INVALID'&&!error.message.includes('personal'));
  await emptyCapacity(normalize);
 }
});

realTest('an abort terminates an actual decoder, releases capacity and never calls transcription',async()=>{
 const normalize=await createRecordingNormalizer({ffmpegPath,maxConcurrent:1});
 let calls=0;
 const wrapped=withBoundedRecordings({transcribe:async()=>{calls++;}},normalize);
 const controller=new AbortController();
 const pending=wrapped.transcribe({audio:wav(30),mimeType:'audio/wav',signal:controller.signal});
 assert.equal(normalize.capacity().active,1);controller.abort();
 await assert.rejects(()=>pending,error=>error.code==='REQUEST_ABORTED');
 assert.equal(calls,0);await emptyCapacity(normalize);
 await assert.rejects(()=>normalize({audio:wav(0.1),mimeType:'audio/wav',signal:controller.signal}),error=>error.code==='REQUEST_ABORTED');
 assert.equal(normalize.capacity().active,0);
 const resumed=await normalize({audio:wav(0.1),mimeType:'audio/wav'});assert.equal(resumed.durationSeconds,0.1);resumed.audio.fill(0);
});

realTest('decoder admission is bounded independently of the HTTP request limit',async()=>{
 const normalize=await createRecordingNormalizer({ffmpegPath,maxConcurrent:2});
 const audio=wav(5);
 const first=normalize({audio,mimeType:'audio/wav'}),second=normalize({audio,mimeType:'audio/wav'});
 assert.deepEqual(normalize.capacity(),{active:2,limit:2});
 await assert.rejects(()=>normalize({audio,mimeType:'audio/wav'}),error=>error.code==='AUDIO_DECODER_BUSY');
 const results=await Promise.all([first,second]);
 for(const result of results)result.audio.fill(0);assert.equal(normalize.capacity().active,0);
});

realTest('container sniffing cannot follow a local file reference masquerading as accepted audio',async()=>{
 const normalize=await createRecordingNormalizer({ffmpegPath});
 const dir=await mkdtemp(join(tmpdir(),'ask-bill-audio-reference-'));
 try{
  const file=join(dir,'private-audio.wav');await writeFile(file,wav(0.5));
  const playlist=Buffer.from("ffconcat version 1.0\nfile 'file:"+file+"'\n");
  for(const mimeType of ['audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4']){
   await assert.rejects(()=>normalize({audio:playlist,mimeType}),error=>error.code==='AUDIO_INPUT_INVALID'&&!error.message.includes(file));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

realTest('container sniffing cannot contact HTTP referenced by a malicious playlist',async context=>{
 const normalize=await createRecordingNormalizer({ffmpegPath});let requests=0;
 const server=createServer((_request,response)=>{requests++;response.writeHead(200,{'Content-Type':'audio/wav'});response.end(wav(0.5));});
 try{
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
  catch(error){if(error.code==='EPERM'&&process.env.ASK_BILL_REQUIRE_FFMPEG!=='1'){context.skip('Loopback network references require a socket-enabled test run');return;}throw error;}
  const url='http://127.0.0.1:'+server.address().port+'/private-audio.wav';
  for(const payload of ['#EXTM3U\n#EXTINF:1\n'+url+'\n',"ffconcat version 1.0\nfile '"+url+"'\n"]){
   await assert.rejects(()=>normalize({audio:Buffer.from(payload),mimeType:'audio/mpeg'}),error=>error.code==='AUDIO_INPUT_INVALID');
  }
  assert.equal(requests,0,'Decoder attempted an unauthorized network read');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

realTest('normalized private audio is cleared after provider success and failure',async()=>{
 const normalize=await createRecordingNormalizer({ffmpegPath});let held;
 const provider={async transcribe(request){held=request.audio;assert.equal(request.mimeType,'audio/wav');assert(request.audio.some(value=>value!==0));return {text:'review this transcript'};}};
 const wrapped=withBoundedRecordings(provider,normalize);
 assert.equal((await wrapped.transcribe({audio:ogg(0.1),mimeType:'audio/ogg'})).text,'review this transcript');
 assert(held.every(value=>value===0));
 const providerError=Object.assign(new Error('PROVIDER_UNAVAILABLE'),{code:'PROVIDER_UNAVAILABLE'});
 const failing=withBoundedRecordings({async transcribe(request){held=request.audio;throw providerError;}},normalize);
 await assert.rejects(()=>failing.transcribe({audio:wav(0.1),mimeType:'audio/wav'}),error=>error===providerError&&error.code==='PROVIDER_UNAVAILABLE');
 assert(held.every(value=>value===0));
});

test('cancellation after decoding and before handoff still clears bytes and prevents a provider request',async()=>{
 const controller=new AbortController(),audio=Buffer.from('decoded private audio');let calls=0;
 const wrapped=withBoundedRecordings({transcribe:async()=>{calls++;}},async()=>{controller.abort();return {audio,mimeType:'audio/wav'};});
 await assert.rejects(()=>wrapped.transcribe({signal:controller.signal}),error=>error.code==='REQUEST_ABORTED');
 assert.equal(calls,0);assert(audio.every(value=>value===0));
});
