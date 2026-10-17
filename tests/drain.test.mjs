import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerDrainController,WorkerDrainError} from '../apps/worker/drain.mjs';
test('beginDrain stops new tasks and resolves only after all active work completes',async()=>{
 const c=createWorkerDrainController();const finish1=c.acquire();const finish2=c.acquire();
 assert.equal(c.state().active,2);c.beginDrain();
 assert.throws(()=>c.acquire(),e=>e.code==='WORKER_DRAINING');
 const pending=c.waitForDrain({timeoutMs:200});
 finish1();finish1();assert.equal(c.state().active,1);
 finish2();assert.equal(await pending,true);assert.equal(c.state().active,0);
});
test('drain times out without destroying in-flight work',async()=>{
 const c=createWorkerDrainController(),finish=c.acquire();c.beginDrain();
 assert.equal(await c.waitForDrain({timeoutMs:15}),false);
 assert.equal(c.state().active,1);finish();assert.equal(await c.waitForDrain(),true);
});
test('run helper releases lease even when task fails',async()=>{
 const c=createWorkerDrainController();
 await assert.rejects(()=>c.run(async()=>{throw Error('failure')}),/failure/);
 assert.equal(c.state().active,0);
 assert.equal(await c.run(async()=>42),42);
 await assert.rejects(()=>c.waitForDrain(),WorkerDrainError);
 c.beginDrain();assert.equal(await c.waitForDrain(),true);
});
test('drain configuration and runnable values validated',async()=>{
 const c=createWorkerDrainController();
 await assert.rejects(()=>c.run('not a function'),WorkerDrainError);
 c.beginDrain();await assert.rejects(()=>c.waitForDrain({timeoutMs:300001}),WorkerDrainError);
});
