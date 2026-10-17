/** Executed inside the built image, with networking disabled and no credentials. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {buildApplicationRuntime} from '../../apps/web/application/start.mjs';
import {demoPack} from '../../apps/web/application/demo.mjs';
const env={NODE_ENV:'test',ASK_BILL_STAGE:'test'};
const runtime=await buildApplicationRuntime({env,demo:true});
try{
  await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+runtime.server.address().port,pack=demoPack();
  const health=await fetch(base+'/health/ready');assert.equal(health.status,200);
  const catalog=await fetch(base+'/bills');assert.match(await catalog.text(),/synthetic/);
  const path='/bills/'+pack.billId+'/versions/'+pack.versionId;
  const reader=await fetch(base+path);assert.equal(reader.status,200);assert.match(await reader.text(),/reader-client\.mjs/);
  const capabilities=await (await fetch(base+'/api/capabilities')).json();assert.equal(capabilities.tts,false);assert.equal(capabilities.stt,false);
  const started=await fetch(base+'/api/session',{method:'POST',headers:{Origin:runtime.config.origin,'Content-Type':'application/json'},body:JSON.stringify({ageBand:'adult'})});
  assert.equal(started.status,201);const session=await started.json(),cookie=started.headers.get('set-cookie').split(';')[0];
  const answer=await fetch(base+'/api/conversation',{method:'POST',headers:{Origin:runtime.config.origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':session.csrfToken},
    body:JSON.stringify({billId:pack.billId,versionId:pack.versionId,question:'When would the reading room open?',conversationEpoch:1})});
  assert.equal(answer.status,200);assert.match(await answer.text(),/answer\.completed/);
  execFileSync('/usr/bin/ffmpeg',['-version'],{stdio:'ignore'});
  process.stdout.write('Built image: reader, session, validated conversation, health and FFmpeg smoke passed.\n');
}finally{await runtime.close();}
