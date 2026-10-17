/** Operational gate: a failed or unavailable namespace is a failure, never a fallback. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isAbsolute,resolve} from 'node:path';

export class SourceSandboxSmokeError extends Error {
  constructor(code) { super(code); this.name='SourceSandboxSmokeError'; this.code=code; }
}

export function runSourceSandboxSmoke(command=fileURLToPath(new URL('../../infra/run-source-sandbox.sh',import.meta.url))) {
  if (typeof command!=='string'||!isAbsolute(command)) throw new SourceSandboxSmokeError('SOURCE_SANDBOX_COMMAND_INVALID');
  const result=spawnSync(command,['--probe'],{
    encoding:'utf8',timeout:15000,maxBuffer:16384,stdio:['ignore','pipe','pipe'],
    // Deliberately inject harmless canaries. None may exist in the parser environment.
    env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:'/tmp/host-home-must-not-be-mounted',
      ASK_BILL_SANDBOX_SECRET_SENTINEL:'probe-only-not-a-real-secret',
      AWS_SECRET_ACCESS_KEY:'probe-only-not-a-real-secret',
      NODE_OPTIONS:'--require=/tmp/ask-bill-forbidden-preload.cjs'}
  });
  if (result.error||result.signal||result.status!==0) throw new SourceSandboxSmokeError('SOURCE_SANDBOX_UNAVAILABLE');
  let report;
  try { report=JSON.parse(result.stdout); } catch { throw new SourceSandboxSmokeError('SOURCE_SANDBOX_PROBE_INVALID'); }
  const expected={schema:'ask-bill-source-sandbox-v1',isolated:true,
    checks:{network:true,filesystem:true,environment:true,limits:true},
    limits:{cpuSeconds:90,addressBytes:1073741824,dataBytes:402653184,fileBytes:33554432,
      processes:32,openFiles:64,tmpBytes:67108864,wallSeconds:115}};
  if (JSON.stringify(report)!==JSON.stringify(expected)) throw new SourceSandboxSmokeError('SOURCE_SANDBOX_PROBE_INVALID');
  return Object.freeze(report);
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length>3) throw new SourceSandboxSmokeError('SOURCE_SANDBOX_COMMAND_INVALID');
    process.stdout.write(JSON.stringify(runSourceSandboxSmoke(process.argv[2]))+'\n');
  } catch (error) {
    // Do not echo parser diagnostics, environment values or private source data.
    process.stderr.write((error instanceof SourceSandboxSmokeError?error.code:'SOURCE_SANDBOX_UNAVAILABLE')+
      ': upload parsing must remain disabled on this host.\n');
    process.exitCode=1;
  }
}
