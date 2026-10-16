/** Ask Bill's worker composition root; requires a server-owned PostgreSQL pool.
 * No background process or external service is started merely by importing this file.
 */
import { createJobWorker, createOutboxWorker } from '@ask-bill/jobs';
import { createPgJobStore } from '@ask-bill/jobs/pg-store';
export function composeAskBillWorkers({pool,trustedPublisherId,workerId,handleJob,deliver,leaseSeconds=30}) {
  const store=createPgJobStore({pool,trustedPublisherId});
  return Object.freeze({
    jobs:createJobWorker({store,publisherId:trustedPublisherId,workerId,leaseSeconds,handleJob}),
    outbox:createOutboxWorker({store,publisherId:trustedPublisherId,workerId,leaseSeconds,deliver})
  });
}
if(process.argv[1]?.endsWith('/jobs.mjs')){
  if(process.argv.length===3 && process.argv[2]==='--help'){
    console.log('Ask Bill job worker: provide a trusted PostgreSQL pool, publisher identity, handlers and idempotent delivery through composeAskBillWorkers(). No standalone live service is configured.');
  }else{
    console.error('The production pool and identity adapter are not configured. Run jobs.mjs --help.');
    process.exitCode=2;
  }
}
