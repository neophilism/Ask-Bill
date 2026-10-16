import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command,args) {
  const r = spawnSync(command,args,{cwd:root,stdio:'inherit',shell:false});
  if(r.error) throw r.error;
  if(r.status !== 0) process.exit(r.status ?? 1);
}
const major=Number(process.versions.node.split('.')[0]);
if (major < 22 || major > 24) throw Error('Node 22-24 is required for this source-only foundation; CI pins Node 24.19.0');
for(const d of ['scripts','registry','tests']){
 for(const p of await readdir(new URL('../'+d+'/',import.meta.url),{recursive:true})){
  if(p.endsWith('.mjs')) run(process.execPath,['--check',d+'/'+p]);
 }
}
run(process.execPath,['scripts/validate-pr-registry.mjs']);
run(process.execPath,['--test','tests/registry.test.mjs']);
console.log('Foundation-only checks passed. This does not prove a deployed or functioning app.');
