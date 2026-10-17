/** Client-only path planner Worker entry. Main thread supplies already measured geometry. */
import {createWorkerPlanner} from './planner.mjs';
if(typeof self!=='undefined'&&typeof self.addEventListener==='function'&&typeof self.postMessage==='function'){
 const planner=createWorkerPlanner({postMessage:message=>self.postMessage(message)});
 self.addEventListener('message',event=>{try{planner.receive(event.data);}catch{
  const id=event.data?.requestId;
  if(typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_:-]{0,119}$/.test(id))self.postMessage({type:'result',requestId:id,result:{kind:'dock',reason:'INVALID_WORKER_REQUEST'}});
 }});
}
