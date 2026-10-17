/** Tracks worker in-flight operations for a cooperative shutdown; no signal handlers or jobs start on import. */
export class WorkerDrainError extends Error {constructor(code){super(code);this.name='WorkerDrainError';this.code=code;}}
export function createWorkerDrainController(){
 let draining=false,active=0;
 const waiters=new Set();
 function settle(){if(active!==0)return;for(const done of waiters)done();waiters.clear();}
 function beginDrain(){draining=true;settle();}
 function acquire(){
  if(draining)throw new WorkerDrainError('WORKER_DRAINING');
  active++;
  let released=false;
  return ()=>{if(released)return;released=true;active--;settle();};
 }
 async function run(operation){
  if(typeof operation!=='function')throw new WorkerDrainError('WORK_INVALID');
  const release=acquire();try{return await operation();}finally{release();}
 }
 async function waitForDrain({timeoutMs=15000}={}){
  if(!draining)throw new WorkerDrainError('DRAIN_NOT_STARTED');
  if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>300000)throw new WorkerDrainError('INVALID_DRAIN_TIMEOUT');
  if(active===0)return true;
  return new Promise(resolve=>{
   let timer;
   const done=()=>{clearTimeout(timer);waiters.delete(done);resolve(true);};
   waiters.add(done);
   timer=setTimeout(()=>{waiters.delete(done);resolve(false);},timeoutMs);
  });
 }
 const state=()=>Object.freeze({draining,active});
 return Object.freeze({acquire,run,beginDrain,waitForDrain,state});
}
