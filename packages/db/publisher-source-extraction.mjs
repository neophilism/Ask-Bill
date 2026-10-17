/** Bounded extraction process boundary. Hosted containment is explicitly configured by the operator. */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {scanQuarantinedBytes} from '../content/intake/index.mjs';
const MIME = new Set(['text/plain','text/markdown','application/xml','text/xml','application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class SourceExtractionError extends Error {
  constructor(code) { super(code); this.name='SourceExtractionError'; this.code=code; }
}
const fail = code => { throw new SourceExtractionError(code); };

/** Probe the configured OS boundary before a hosted worker accepts any private source. */
export async function probePublisherSourceSandbox({sandboxCommand,sandboxArgs=[]}={}) {
  if(typeof sandboxCommand!=='string'||!isAbsolute(sandboxCommand)||!Array.isArray(sandboxArgs)||sandboxArgs.length>30||
    sandboxArgs.some(x=>typeof x!=='string'||x.length>2000||x.includes('\0')))fail('EXTRACTOR_CONFIGURATION_INVALID');
  const output=await new Promise((resolve,reject)=>{
    const child=spawn(sandboxCommand,[...sandboxArgs,'--probe'],{shell:false,windowsHide:true,
      env:{PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
    let finished=false,size=0,errors=0;const chunks=[];
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);
      if(error){child.kill('SIGKILL');reject(error);}else resolve(value);};
    const timer=setTimeout(()=>finish(new SourceExtractionError('PARSER_SANDBOX_PROBE_FAILED')),15000);
    child.once('error',()=>finish(new SourceExtractionError('PARSER_SANDBOX_PROBE_FAILED')));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>8192)finish(new SourceExtractionError('PARSER_SANDBOX_PROBE_FAILED'));else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{errors+=chunk.length;if(errors>8192)finish(new SourceExtractionError('PARSER_SANDBOX_PROBE_FAILED'));});
    child.once('close',code=>finish(code===0?null:new SourceExtractionError('PARSER_SANDBOX_PROBE_FAILED'),Buffer.concat(chunks)));
  });
  let proof;try{proof=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output));}catch{fail('PARSER_SANDBOX_PROBE_FAILED');}
  const caps={cpuSeconds:90,addressBytes:1073741824,dataBytes:402653184,fileBytes:33554432,processes:32,
    openFiles:64,tmpBytes:67108864,wallSeconds:115};
  if(proof?.schema!=='ask-bill-source-sandbox-v1'||proof.isolated!==true||
    ['network','filesystem','environment','limits'].some(key=>proof.checks?.[key]!==true)||
    Object.entries(caps).some(([key,max])=>!Number.isSafeInteger(proof.limits?.[key])||proof.limits[key]<1||proof.limits[key]>max))
    fail('PARSER_SANDBOX_PROBE_FAILED');
  return Object.freeze({schema:proof.schema,isolated:true,checks:Object.freeze({...proof.checks}),limits:Object.freeze({...proof.limits})});
}

export function createPublisherSourceExtractor({sandboxCommand,sandboxArgs=[],sandboxVerified=false,
  allowUncontainedForTests=false,timeoutMs=120000} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000 ||
      !Array.isArray(sandboxArgs) || sandboxArgs.length > 30 || sandboxArgs.some(x => typeof x !== 'string' || x.length > 2000 || x.includes('\0')) ||
      (sandboxCommand !== undefined && (typeof sandboxCommand !== 'string' || !isAbsolute(sandboxCommand)))) fail('EXTRACTOR_CONFIGURATION_INVALID');
  if (sandboxVerified !== true && allowUncontainedForTests !== true) fail('PARSER_SANDBOX_REQUIRED');
  if (sandboxVerified === true && !sandboxCommand) fail('PARSER_SANDBOX_REQUIRED');
  if (allowUncontainedForTests && process.env.NODE_ENV === 'production') fail('PARSER_SANDBOX_REQUIRED');
  const entry = fileURLToPath(new URL('../../apps/worker/source-import/extract.mjs',import.meta.url));
  return async function extractSource({bytes,mime,versionId,signal} = {}) {
    if (!(bytes instanceof Uint8Array) || !MIME.has(mime) || !UUID.test(versionId ?? '')) fail('EXTRACTION_INPUT_INVALID');
    if (signal !== undefined && !(signal instanceof AbortSignal)) fail('EXTRACTION_INPUT_INVALID');
    if (signal?.aborted) fail('EXTRACTION_CANCELLED');
    scanQuarantinedBytes(bytes,mime);
    const workspace = await mkdtemp(join(tmpdir(),'ask-bill-extract-'));
    try {
      const output = await new Promise((resolve,reject) => {
        const command = sandboxCommand ?? process.execPath;
        const args = [...sandboxArgs,'--max-old-space-size=192',entry,mime,versionId];
        const child = spawn(command,args,{shell:false,cwd:workspace,windowsHide:true,
          stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH ?? '/usr/bin:/bin',LANG:'C.UTF-8',TMPDIR:workspace}});
        let finished = false,size = 0,stderrSize = 0; const chunks = [];
        const finish = (error,value) => {
          if (finished) return; finished = true; clearTimeout(timer);
          signal?.removeEventListener('abort',cancel);
          if (error) { child.kill('SIGKILL'); reject(error); } else resolve(value);
        };
        const cancel = () => finish(new SourceExtractionError('EXTRACTION_CANCELLED'));
        const timer = setTimeout(() => finish(new SourceExtractionError('EXTRACTION_TIMEOUT')),timeoutMs);
        signal?.addEventListener('abort',cancel,{once:true});
        if (signal?.aborted) cancel();
        child.once('error',() => finish(new SourceExtractionError('EXTRACTION_PROCESS_UNAVAILABLE')));
        child.stdin.once('error',() => finish(new SourceExtractionError('EXTRACTION_PROCESS_REJECTED')));
        child.stdout.on('data',chunk => {
          size += chunk.length;
          if (size > 6500000) finish(new SourceExtractionError('EXTRACTION_OUTPUT_LIMIT'));
          else chunks.push(chunk);
        });
        // Parser diagnostics may contain source data. They are bounded and discarded, never logged.
        child.stderr.on('data',chunk => {
          stderrSize += chunk.length;
          if (stderrSize > 8192) finish(new SourceExtractionError('EXTRACTION_OUTPUT_LIMIT'));
        });
        child.once('close',code => finish(code === 0 ? null : new SourceExtractionError('EXTRACTION_PROCESS_REJECTED'),Buffer.concat(chunks)));
        child.stdin.end(bytes);
      });
      try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output)); }
      catch { fail('EXTRACTION_OUTPUT_INVALID'); }
    } finally { await rm(workspace,{recursive:true,force:true}); }
  };
}
