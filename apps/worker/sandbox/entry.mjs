/** Run via the network-disabled Docker sandbox, not inside the public API. */
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {scanQuarantinedBytes,LIMITS} from '../../../packages/content/intake/index.mjs';
const target=process.argv[2],mime=process.env.ASK_BILL_INPUT_MIME;
if(!target||!mime){process.stderr.write('INVALID_INPUT\n');process.exit(2);}
try{
 const fd=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const st=await fd.stat();
  if(!st.isFile()||st.size<1||st.size>LIMITS.source)throw Error('INTAKE_SIZE');
  const data=await fd.readFile();
  process.stdout.write(JSON.stringify(scanQuarantinedBytes(data,mime))+'\n');
 }finally{await fd.close();}
}catch(e){process.stderr.write((e?.code&&/^[A-Z_]+$/.test(e.code)?e.code:'INTAKE_REJECTED')+'\n');process.exitCode=3;}
