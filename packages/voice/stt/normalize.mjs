/** Decode a recording through a bounded pipe before any paid transcription request.
 * No filename/URL, client duration, metadata duration or inherited secrets are trusted.
 */
import {spawn} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {access,constants} from 'node:fs/promises';
const FORMATS=new Map([
  ['audio/webm','matroska,webm'],['audio/webm;codecs=opus','matroska,webm'],
  ['audio/ogg','ogg'],['audio/ogg;codecs=opus','ogg'],['audio/wav','wav'],
  ['audio/mp4','mov'],['audio/mpeg','mp3']
]);
const rate=16000,bytesPerSecond=rate*2;
export class RecordingError extends Error{constructor(code){super(code);this.name='RecordingError';this.code=code;}}
const fail=code=>{throw new RecordingError(code);};
function wave(pcm){
  const result=Buffer.alloc(44+pcm.length);
  result.write('RIFF',0);result.writeUInt32LE(result.length-8,4);result.write('WAVEfmt ',8);
  result.writeUInt32LE(16,16);result.writeUInt16LE(1,20);result.writeUInt16LE(1,22);
  result.writeUInt32LE(rate,24);result.writeUInt32LE(bytesPerSecond,28);result.writeUInt16LE(2,32);
  result.writeUInt16LE(16,34);result.write('data',36);result.writeUInt32LE(pcm.length,40);pcm.copy(result,44);
  return result;
}
export async function createRecordingNormalizer({ffmpegPath='/usr/bin/ffmpeg',maxSeconds=30,timeoutMs=15000,maxInputBytes=5*1024*1024,maxConcurrent=2}={}){
  if(!isAbsolute(ffmpegPath)||ffmpegPath.includes('\0')||!Number.isSafeInteger(maxSeconds)||maxSeconds<1||maxSeconds>30||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>20000||!Number.isSafeInteger(maxInputBytes)||maxInputBytes<44||maxInputBytes>5*1024*1024||
    !Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>16)fail('AUDIO_DECODER_CONFIGURATION');
  try{await access(ffmpegPath,constants.X_OK);}catch{fail('AUDIO_DECODER_UNAVAILABLE');}
  const maxOutputBytes=maxSeconds*bytesPerSecond;
  let active=0;
  const normalize=async function normalize({audio,mimeType,signal}={}){
    if(!(audio instanceof Uint8Array)||audio.byteLength<12||audio.byteLength>maxInputBytes||!FORMATS.has(mimeType))fail('AUDIO_INPUT_INVALID');
    if(signal!==undefined&&!(signal instanceof AbortSignal))fail('AUDIO_INPUT_INVALID');
    if(signal?.aborted)fail('REQUEST_ABORTED');
    if(active>=maxConcurrent)fail('AUDIO_DECODER_BUSY');
    active++;let launched=false,released=false;
    const release=()=>{if(!released){released=true;active--;}};
    let pcm;
    try{
      pcm=await new Promise((resolve,reject)=>{
        // Read slightly beyond the limit, so long compressed audio is rejected,
        // never silently truncated and billed as an accepted short recording.
        const args=['-nostdin','-hide_banner','-v','error','-xerror','-max_alloc','33554432',
          '-threads','1','-protocol_whitelist','pipe','-format_whitelist',FORMATS.get(mimeType),
          '-probesize','524288','-analyzeduration','1000000','-i','pipe:0','-map','0:a:0',
          '-vn','-sn','-dn','-threads','1','-ac','1','-ar',String(rate),'-t',String(maxSeconds+0.1),
          '-f','s16le','pipe:1'];
        const child=spawn(ffmpegPath,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],
          env:{PATH:'/usr/bin:/bin',LANG:'C',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
        launched=true;
        const chunks=[];let size=0,diagnostics=0,done=false;
        const finish=(error)=>{
          if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
          if(error){try{child.kill('SIGKILL');}catch{}for(const chunk of chunks)chunk.fill(0);reject(error);}
          else{const bytes=Buffer.concat(chunks,size);for(const chunk of chunks)chunk.fill(0);resolve(bytes);}
        };
        const cancel=()=>finish(new RecordingError('REQUEST_ABORTED'));
        const timer=setTimeout(()=>finish(new RecordingError('AUDIO_INPUT_INVALID')),timeoutMs);
        child.once('error',()=>{release();finish(new RecordingError('AUDIO_DECODER_UNAVAILABLE'));});
        // EPIPE also follows rejection/early EOF; only successful decoder exit can approve data.
        child.stdin.on('error',()=>{});
        child.stdout.on('data',chunk=>{
          if(done){chunk.fill(0);return;}size+=chunk.length;
          if(size>maxOutputBytes){chunk.fill(0);finish(new RecordingError('AUDIO_INPUT_DURATION_LIMIT'));}
          else chunks.push(chunk);
        });
        child.stderr.on('data',chunk=>{diagnostics+=chunk.length;chunk.fill(0);if(diagnostics>8192)finish(new RecordingError('AUDIO_INPUT_INVALID'));});
        // A rejected promise must not release capacity while its decoder still runs.
        child.once('close',code=>{release();finish(code===0&&size>=320&&size%2===0?null:new RecordingError('AUDIO_INPUT_INVALID'));});
        signal?.addEventListener('abort',cancel,{once:true});
        if(signal?.aborted)cancel();else child.stdin.end(audio);
      });
      if(signal?.aborted)fail('REQUEST_ABORTED');
      return {audio:wave(pcm),mimeType:'audio/wav',durationSeconds:pcm.length/bytesPerSecond};
    }finally{if(!launched)release();pcm?.fill(0);}
  };
  Object.defineProperty(normalize,'capacity',{value:()=>Object.freeze({active,limit:maxConcurrent})});
  return Object.freeze(normalize);
}
export function withBoundedRecordings(provider,normalize){
  if(typeof provider?.transcribe!=='function'||typeof normalize!=='function')fail('AUDIO_DECODER_CONFIGURATION');
  return Object.freeze({async transcribe(request){
    const decoded=await normalize(request);
    try{if(request.signal?.aborted)fail('REQUEST_ABORTED');return await provider.transcribe({...request,...decoded});}finally{decoded.audio.fill(0);}
  }});
}
