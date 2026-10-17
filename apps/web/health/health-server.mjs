/** Health-only service entrypoint for staging scaffolding: no legislative data or chat. */
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHealthMonitor,healthHttpResponse} from './monitor.mjs';
export function createHealthOnlyServer(monitor=createHealthMonitor({stage:'staging'})){
 return createServer(async(req,res)=>{
  let pathname;
  try{pathname=new URL(req.url??'/', 'http://localhost').pathname;}
  catch{res.writeHead(400);res.end();return;}
  const result=await healthHttpResponse(monitor,{method:req.method,pathname});
  res.writeHead(result.status,result.headers);res.end(result.body);
 });
}
function parsePort(value){
 if(typeof value!=='string'||!/^[0-9]{1,5}$/.test(value)||Number(value)<1||Number(value)>65535)throw Error('Invalid PORT');
 return Number(value);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const stage=process.env.ASK_BILL_STAGE??'staging';
 const monitor=createHealthMonitor({stage,buildSha:process.env.ASK_BILL_BUILD_SHA??'unknown',schemaVersion:0,expectedSchemaVersion:1});
 const server=createHealthOnlyServer(monitor);
 const host=stage==='local'?'127.0.0.1':'0.0.0.0';
 server.listen(parsePort(process.env.PORT??'4101'),host,()=>console.log('Ask Bill health-only staging service; readiness remains disabled until real providers and schema are verified'));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{monitor.beginDrain();server.close(()=>process.exitCode=0);});
}
