/** Real PostgreSQL workflow acceptance. Only an explicitly selected disposable loopback DB is allowed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {createApplicationPool} from '../../packages/db/pool.mjs';
import {createPublisherWorkflow,PUBLISHER_REVIEW_CHECKS} from '../../packages/db/publisher-workflow.mjs';
import {createPublisherSourceExtractor} from '../../packages/db/publisher-source-extraction.mjs';
import {createActiveReleaseLookup} from '../../packages/db/public-release.mjs';
import {createActiveCatalogLookup} from '../../packages/db/public-catalog.mjs';
import {createPgJobStore} from '../../packages/jobs/pg-store.mjs';
import {prepareExtractionCorrection} from '../../packages/content/audit/index.mjs';
import {congressBillIdentity} from '../../packages/content/connectors/congress/index.mjs';
import {createWorkerApplication} from '../../apps/worker/application.mjs';
import {makePdf} from '../fixtures/createPdf.mjs';
const {Pool}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('pg');
const databaseUrl=process.env.ASK_BILL_TEST_DATABASE_URL;
const PUB='ac0a0001-1111-4111-8111-111111111111',OTHER='ac0a0002-2222-4222-8222-222222222222';
const OWNER='aaaa0001-3333-4333-8333-333333333333',EDITOR='aaaa0002-3333-4333-8333-333333333333',VIEWER='aaaa0003-3333-4333-8333-333333333333';
const hash=value=>createHash('sha256').update(value).digest('hex');
const actor=(role='owner',action='view')=>({publisherId:PUB,userId:{owner:OWNER,editor:EDITOR,viewer:VIEWER}[role],role,action,
  freshMembershipVerified:true,mfaVerifiedByTrustedServer:true});
const rejected=(operation,code)=>assert.rejects(operation,error=>error?.code===code);
function fixtureStorage(){
  const objects=new Map();let corrupt=false;
  function receipt(content,mime){const sha256=hash(content);return {scope:'private-source',publisherId:PUB,key:PUB+'/sha256/'+sha256,
    sha256,bytes:content.length,mime,objectStoredAndVerified:true};}
  return {kind:'explicit-test-memory-storage',objects,
    seed(content,mime='text/plain'){const r=receipt(content,mime);objects.set(r.sha256,{...r,content:Buffer.from(content)});return r;},
    setCorrupt(value){corrupt=value;},
    async getPrivateSource(input){const object=objects.get(input.sha256);if(!object)throw Object.assign(Error('OBJECT_NOT_FOUND'),{code:'OBJECT_NOT_FOUND'});
      return {...object,content:corrupt?Buffer.from('wrong bytes'):Buffer.from(object.content)};},
    async putQuarantine({content,mime}){return this.seed(content,mime);},
    async promoteQuarantine({sha256}){const {content,...r}=objects.get(sha256);return r;}
  };
}

test('durable publisher intake, exact release, corrections, and lease fences with real FORCE RLS', {skip:!databaseUrl}, async t=>{
  const url=new URL(databaseUrl);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'tests require a disposable loopback database');
  const admin=new Pool({connectionString:databaseUrl,max:3});let pool;
  try{
    await admin.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ask_bill_workflow_test') THEN
      CREATE ROLE ask_bill_workflow_test LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD 'ephemeral_workflow_test_only';
      END IF; END $$`);
    await admin.query(`ALTER ROLE ask_bill_workflow_test NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA ask_bill TO ask_bill_workflow_test;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ask_bill TO ask_bill_workflow_test;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ask_bill TO ask_bill_workflow_test;
      REVOKE INSERT,UPDATE,DELETE ON ask_bill.publishers,ask_bill.publisher_memberships,ask_bill.publisher_auth_identities FROM ask_bill_workflow_test;
      REVOKE UPDATE,DELETE ON ask_bill.audit_events FROM ask_bill_workflow_test`);
    await admin.query(`INSERT INTO ask_bill.publishers(id,slug,display_name) VALUES
      ($1::uuid,'publisher-workflow-test','Publisher workflow test'),($2::uuid,'publisher-workflow-other','Other workflow test') ON CONFLICT(id) DO NOTHING`,[PUB,OTHER]);
    await admin.query(`INSERT INTO ask_bill.publisher_memberships(publisher_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner'),
      ($1::uuid,$3::uuid,'editor'),($1::uuid,$4::uuid,'viewer') ON CONFLICT(publisher_id,user_id) DO UPDATE SET role=EXCLUDED.role`,[PUB,OWNER,EDITOR,VIEWER]);
    // Prior failed local runs use this same isolated fixture tenant, never a deployed database.
    await admin.query("UPDATE ask_bill.jobs SET status='dead',lease_until=NULL WHERE publisher_id=$1::uuid AND status IN ('queued','retry','leased')",[PUB]);
    url.username='ask_bill_workflow_test';url.password='ephemeral_workflow_test_only';
    pool=await createApplicationPool({connectionString:url.href,hosted:false,max:4});
    const storage=fixtureStorage(),nativeExtract=createPublisherSourceExtractor({allowUncontainedForTests:true});
    let extractionCalls=0;
    const extractSource=async input=>{extractionCalls++;return nativeExtract(input);};
    const workflow=createPublisherWorkflow({pool,publisherId:PUB,storage,extractSource});
    const lookup=createActiveReleaseLookup({pool,publisherId:PUB}),catalog=createActiveCatalogLookup({pool,publisherId:PUB});
    const store=createPgJobStore({pool,trustedPublisherId:PUB}),workerId=randomUUID();
    const leaseContext={publisherId:PUB,workerId,leaseSeconds:120};
    const claim=()=>store.claimJob(leaseContext);
    const scope=job=>({...job,workerId,heartbeat:()=>store.heartbeatJob({...leaseContext,jobId:job.jobId,fence:job.fence})});
    const complete=(job,event)=>store.completeJobAndEnqueue({...leaseContext,jobId:job.jobId,fence:job.fence,event});
    let billId,versionId,version,firstRelease;

    await t.test('fresh tenant membership gates CRUD and viewer reads',async()=>{
      await rejected(()=>workflow.createBill({actor:actor('viewer','upload'),title:'Forbidden',jurisdiction:'US'}),'ACTION_FORBIDDEN');
      await rejected(()=>workflow.listBills({actor:{...actor(),publisherId:OTHER}}),'PUBLISHER_FORBIDDEN');
      await rejected(()=>workflow.listBills({actor:{...actor(),userId:randomUUID()}}),'MEMBERSHIP_REVOKED');
      billId=(await workflow.createBill({actor:actor('owner','upload'),title:'Workflow source fixture',jurisdiction:'US Congress'})).id;
      const bill=await workflow.getBill({actor:actor('viewer'),billId});
      assert.equal(bill.id,billId);assert.equal(bill.activeReleaseId,null);assert.deepEqual(bill.versions,[]);
      assert.ok((await workflow.listBills({actor:actor('viewer')})).some(b=>b.id===billId));
      const foreign=randomUUID();await admin.query('INSERT INTO ask_bill.bills(id,publisher_id,title,jurisdiction) VALUES($1::uuid,$2::uuid,$3,$4)',[foreign,OTHER,'Other private title','US']);
      await rejected(()=>workflow.getBill({actor:actor(),billId:foreign}),'NOT_FOUND');
      await rejected(()=>workflow.getVersion({actor:actor(),billId:foreign,versionId:randomUUID()}),'NOT_FOUND');
    });
    await t.test('real text extraction persists original bytes, ordered UUID provisions, and activated exact index privately',async()=>{
      const text='SEC. 1. Source fixture.\nThe program shall open after review.\n\n'+
        Array.from({length:80},(_,i)=>`Paragraph ${i+1}. Assistance is available, except for a person outside the defined eligibility conditions.`).join('\n\n')+'\n';
      const receipt=storage.seed(Buffer.from(text)),queued=await workflow.recordUpload({actor:actor('owner','upload'),billId,object:receipt});
      assert.equal((await workflow.recordUpload({actor:actor('owner','upload'),billId,object:receipt})).jobId,queued.jobId);
      const job=await claim();assert.equal(job.jobId,queued.jobId);
      await rejected(()=>workflow.handleImportJob({...scope(job),fence:job.fence+1}),'STALE_JOB_LEASE');assert.equal(extractionCalls,0);
      const event=await workflow.handleImportJob(scope(job));versionId=event.payload.versionId;assert.equal(extractionCalls,1);
      assert.deepEqual(await workflow.handleImportJob(scope(job)),event);assert.equal(extractionCalls,1,'completion retry must not re-extract');
      assert.equal(await complete(job,event),true);
      version=await workflow.getVersion({actor:actor(),billId,versionId});
      assert.equal(version.publication,'private');assert.equal(version.sourceComplete,false);assert.equal(version.status,'unknown');
      assert.equal(version.indexStatus,'complete');assert.ok(version.provisions.length>=2);
      assert.equal(version.canonicalText,version.provisions.map(p=>p.text).join('\n\n'));
      assert.equal(version.rawByteSha256,receipt.sha256);assert.equal(hash(version.canonicalText),version.canonicalTextSha256);
      assert.equal(await lookup({publisherId:PUB,billId,versionId}),null);
      const original=await workflow.getOriginal({actor:actor('viewer'),billId,versionId});
      assert.equal(original.content.toString(),text);assert.equal(original.sha256,receipt.sha256);assert.equal(original.bytes,receipt.bytes);
      assert.equal(original.mime,'text/plain');assert.equal(original.publisherId,PUB);
      const metadata=(await admin.query('SELECT * FROM ask_bill.source_objects WHERE publisher_id=$1::uuid AND sha256=$2',[PUB,receipt.sha256])).rows[0];
      assert.equal(Number(metadata.byte_length),receipt.bytes);assert.equal(metadata.storage_key,receipt.key);
      const list=await workflow.getBill({actor:actor(),billId});assert.equal(list.imports[0].state,'completed');assert.equal(list.imports[0].jobStatus,'completed');
    });
    await t.test('tour curation is private, source-pinned, MFA-gated and tenant-scoped',async()=>{
      assert.equal((await workflow.getVersion({actor:actor('viewer'),billId,versionId})).tourDraft,null);
      const stepIds=version.provisions.slice(0,2).map(p=>p.id),input={billId,versionId,stepIds,expectedCanonicalSha256:version.canonicalTextSha256};
      await rejected(()=>workflow.saveTourDraft({actor:actor('viewer','publish'),...input}),'ACTION_FORBIDDEN');
      await rejected(()=>workflow.saveTourDraft({actor:{...actor('owner','publish'),mfaVerifiedByTrustedServer:false},...input}),'MFA_REQUIRED');
      await rejected(()=>workflow.saveTourDraft({actor:actor('owner','publish'),...input,expectedCanonicalSha256:'0'.repeat(64)}),'VERSION_CONFLICT');
      await rejected(()=>workflow.saveTourDraft({actor:actor('owner','publish'),...input,stepIds:[randomUUID()]}),'TOUR_INVALID');
      const saved=await workflow.saveTourDraft({actor:actor('owner','publish'),...input});assert.equal(saved.stepCount,2);
      const visible=await workflow.getVersion({actor:actor('viewer'),billId,versionId});
      assert.deepEqual(visible.tourDraft.stepIds,stepIds);assert.equal(visible.tourDraft.stale,false);
      const client=await pool.connect();try{
        await client.query('BEGIN');await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[OTHER]);
        const rows=await client.query('SELECT version_id FROM ask_bill.publisher_tour_drafts WHERE version_id=$1::uuid',[versionId]);
        assert.equal(rows.rows.length,0);await client.query('ROLLBACK');
      }finally{client.release();}
    });
    await t.test('review checks, exact canonical pin, MFA, original storage, and release compare-and-swap all gate publication',async()=>{
      await rejected(()=>workflow.reviewVersion({actor:{...actor('owner','publish'),mfaVerifiedByTrustedServer:false},billId,versionId,
        checks:PUBLISHER_REVIEW_CHECKS,expectedCanonicalSha256:version.canonicalTextSha256}),'MFA_REQUIRED');
      await rejected(()=>workflow.reviewVersion({actor:actor('owner','publish'),billId,versionId,checks:PUBLISHER_REVIEW_CHECKS.slice(0,5),
        expectedCanonicalSha256:version.canonicalTextSha256}),'REVIEW_INCOMPLETE');
      await rejected(()=>workflow.reviewVersion({actor:actor('owner','publish'),billId,versionId,checks:PUBLISHER_REVIEW_CHECKS,
        expectedCanonicalSha256:'0'.repeat(64)}),'VERSION_CONFLICT');
      await rejected(()=>workflow.publishRelease({actor:actor('owner','publish'),billId,versionId}),'SOURCE_NOT_REVIEWED');
      await workflow.reviewVersion({actor:actor('owner','publish'),billId,versionId,checks:PUBLISHER_REVIEW_CHECKS,expectedCanonicalSha256:version.canonicalTextSha256});
      await rejected(()=>workflow.publishRelease({actor:actor('editor','publish'),billId,versionId}),'SOURCE_NOT_REVIEWED');
      assert.equal((await workflow.publishRelease({actor:actor('owner','publish'),billId,versionId,expectedReleaseId:randomUUID()})).published,false);
      storage.setCorrupt(true);await rejected(()=>workflow.publishRelease({actor:actor('owner','publish'),billId,versionId}),'SOURCE_INTEGRITY_FAILED');
      await rejected(()=>workflow.getOriginal({actor:actor('viewer'),billId,versionId}),'SOURCE_INTEGRITY_FAILED');
      storage.setCorrupt(false);assert.equal(await lookup({publisherId:PUB,billId,versionId}),null);
      firstRelease=await workflow.publishRelease({actor:actor('owner','publish'),billId,versionId});assert.equal(firstRelease.published,true);
      const publicPack=await lookup({publisherId:PUB,billId,versionId});assert.equal(publicPack.canonicalSha256,version.canonicalTextSha256);
      assert.ok(publicPack.provisions.every(p=>/^s[a-f0-9]{32}$/.test(p.id)&&hash(p.text)===p.sha256));
      assert.equal(publicPack.provisions.map(p=>p.text).join('\n\n'),version.canonicalText);
      const stored=(await admin.query('SELECT pack_bytes FROM ask_bill.publisher_public_packs WHERE publisher_id=$1::uuid AND version_id=$2::uuid AND sha256=$3',[PUB,versionId,firstRelease.packSha256])).rows[0];
      assert.deepEqual(JSON.parse(stored.pack_bytes.toString()),publicPack);
      const listings=await catalog({publisherId:PUB});assert.ok(listings.items.some(b=>b.billId===billId));
      assert.equal((await workflow.publishRelease({actor:actor('owner','publish'),billId,versionId})).published,false);
      assert.equal((await workflow.getBill({actor:actor(),billId})).activeReleaseId,firstRelease.releaseId);
    });
    await t.test('immutable correction retains old source and release, invalidates review, and activates only after new review',async()=>{
      const original=await workflow.getVersion({actor:actor(),billId,versionId}),provision=original.provisions[0];
      const start=Array.from(original.canonicalText.slice(0,original.canonicalText.indexOf('shall'))).length;
      const proposal=prepareExtractionCorrection({publisherId:PUB,versionId,newVersionId:randomUUID(),provisionId:provision.id,
        source:{publisherId:PUB,versionId,billId,rawByteSha256:original.rawByteSha256,canonicalSha256:original.canonicalTextSha256,
          publication:original.publication,text:original.canonicalText,legalStatus:original.status},oldText:original.canonicalText,
        expectedQuote:'shall',start,end:start+5,replacement:'must',actor:actor('owner','publish')});
      const tampered=structuredClone(proposal);tampered.audit.newSpanSha256='0'.repeat(64);
      await rejected(()=>workflow.saveCorrection({actor:actor('owner','publish'),billId,proposal:tampered}),'CORRECTION_INVALID');
      const corrected=await workflow.saveCorrection({actor:actor('owner','publish'),billId,proposal});
      const next=await workflow.getVersion({actor:actor(),billId,versionId:corrected.versionId});
      assert.equal(next.publication,'private');assert.equal(next.sourceComplete,false);assert.equal(next.indexStatus,'complete');
      assert.deepEqual(next.reviewChecks,[]);assert.equal(next.previousVersionId,versionId);assert.equal(next.rawByteSha256,original.rawByteSha256);
      assert.notEqual(next.canonicalTextSha256,original.canonicalTextSha256);assert.equal(next.canonicalText,proposal.newVersion.canonicalText);
      assert.ok(next.provisions.every(p=>!original.provisions.some(old=>p.id===old.id)));
      assert.equal((await lookup({publisherId:PUB,billId,versionId})).canonicalSha256,original.canonicalTextSha256);
      assert.equal(await lookup({publisherId:PUB,billId,versionId:next.id}),null);
      await rejected(()=>workflow.publishRelease({actor:actor('owner','publish'),billId,versionId:next.id,expectedReleaseId:firstRelease.releaseId}),'SOURCE_NOT_REVIEWED');
      await workflow.reviewVersion({actor:actor('owner','publish'),billId,versionId:next.id,checks:PUBLISHER_REVIEW_CHECKS,expectedCanonicalSha256:next.canonicalTextSha256});
      const second=await workflow.publishRelease({actor:actor('owner','publish'),billId,versionId:next.id,expectedReleaseId:firstRelease.releaseId});
      assert.equal(second.published,true);assert.equal(await lookup({publisherId:PUB,billId,versionId}),null);
      assert.equal((await lookup({publisherId:PUB,billId,versionId:next.id})).canonicalSha256,next.canonicalTextSha256);
      await rejected(()=>workflow.withdrawRelease({actor:actor('editor','withdraw'),billId,releaseId:second.releaseId}),'ACTION_FORBIDDEN');
      assert.equal((await workflow.withdrawRelease({actor:actor('owner','withdraw'),billId,releaseId:firstRelease.releaseId})).withdrawn,false);
      assert.equal((await workflow.withdrawRelease({actor:actor('owner','withdraw'),billId,releaseId:second.releaseId})).withdrawn,true);
      assert.equal(await lookup({publisherId:PUB,billId,versionId:next.id}),null);
      assert.equal((await workflow.getVersion({actor:actor(),billId,versionId:next.id})).publication,'withdrawn');
      const after=await workflow.getVersion({actor:actor(),billId,versionId});assert.equal(after.canonicalText,original.canonicalText);
    });
    await t.test('immutable metadata triggers and forced tenant policies hold for the runtime role',async()=>{
      const client=await pool.connect();
      try{
        assert.equal((await client.query("SELECT has_table_privilege(current_user,'ask_bill.publisher_memberships','UPDATE') AS permitted")).rows[0].permitted,false);
        await client.query('BEGIN');await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[OTHER]);
        assert.equal((await client.query('SELECT id FROM ask_bill.bill_versions WHERE id=$1::uuid',[versionId])).rows.length,0);
        await assert.rejects(()=>client.query('SELECT ask_bill.lock_publisher_membership($1::uuid,$2::uuid)',[PUB,OWNER]),e=>e.code==='42501');
        await client.query('ROLLBACK');
        for(const table of ['publisher_version_extractions','publisher_version_reviews','publisher_public_packs']){
          await client.query('BEGIN');await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[PUB]);
          await assert.rejects(()=>client.query('DELETE FROM ask_bill.'+table+' WHERE publisher_id=$1::uuid AND version_id=$2::uuid',[PUB,versionId]),e=>e.code==='23514');
          await client.query('ROLLBACK');
        }
      }finally{client.release();}
      await admin.query('DELETE FROM ask_bill.publisher_memberships WHERE publisher_id=$1::uuid AND user_id=$2::uuid',[PUB,EDITOR]);
      await rejected(()=>workflow.getBill({actor:actor('editor'),billId}),'MEMBERSHIP_REVOKED');
      await rejected(()=>workflow.getOriginal({actor:actor('editor'),billId,versionId}),'MEMBERSHIP_REVOKED');
      await admin.query("INSERT INTO ask_bill.publisher_memberships(publisher_id,user_id,role) VALUES($1::uuid,$2::uuid,'editor')",[PUB,EDITOR]);
    });
    await t.test('lease loss during extraction cannot persist a new version or complete another worker claim',async()=>{
      const receipt=storage.seed(Buffer.from('SEC. 2. A stale worker must not publish any private source.'));
      const queued=await workflow.recordUpload({actor:actor('owner','upload'),billId,object:receipt}),job=await claim();assert.equal(job.jobId,queued.jobId);
      const stale=createPublisherWorkflow({pool,publisherId:PUB,storage,extractSource:async input=>{
        const result=await nativeExtract(input);
        await admin.query("UPDATE ask_bill.jobs SET fence=fence+1,lease_owner=$3::uuid WHERE publisher_id=$1::uuid AND id=$2::uuid",[PUB,job.jobId,randomUUID()]);
        return result;
      }});
      await rejected(()=>stale.handleImportJob({...job,workerId}),'STALE_JOB_LEASE');
      const persisted=await admin.query('SELECT id FROM ask_bill.bill_versions WHERE publisher_id=$1::uuid AND raw_byte_sha256=$2',[PUB,receipt.sha256]);
      assert.equal(persisted.rows.length,0);
      assert.equal(await complete(job,{type:'source.imported',idempotencyKey:'stale-test',payload:{}}),false);
      await admin.query("UPDATE ask_bill.jobs SET status='dead' WHERE publisher_id=$1::uuid AND id=$2::uuid",[PUB,job.jobId]);
    });
    await t.test('official connector metadata selects only a fixed Congress edition URL and persists exact provenance',async()=>{
      const identity=congressBillIdentity({congress:119,billType:'hr',billNumber:123});
      const sourceUrl='https://www.congress.gov/119/bills/hr123/BILLS-119hr123ih.xml';
      const xml=Buffer.from('<?xml version="1.0"?><bill><enacting-clause>Be it enacted by the Congress.</enacting-clause><section><num>1.</num><header>Program.</header><text>Support may be provided, except for ineligible applicants.</text></section></bill>');
      let fetches=0;
      const official=createPublisherWorkflow({pool,publisherId:PUB,storage,extractSource:nativeExtract,
        congressClient:{async textVersions(){return {identity,isOfficialMetadata:true,versions:[{type:'Introduced in House',date:'2025-01-10T00:00:00Z',formats:[{type:'Formatted Text',url:sourceUrl.replace('.xml','.htm')},{type:'XML',url:sourceUrl}]}]};}},
        fetchImpl:async(url,options)=>{fetches++;assert.equal(url,sourceUrl);assert.equal(options.redirect,'manual');return new Response(xml,{headers:{'content-type':'application/xml','content-length':String(xml.length)}});}});
      const queued=await official.requestOfficialImport({actor:actor('owner','upload'),billId,identity}),job=await claim();assert.equal(job.jobId,queued.jobId);
      const event=await official.handleImportJob(scope(job));assert.equal(await complete(job,event),true);assert.equal(fetches,1);
      const imported=await official.getVersion({actor:actor(),billId,versionId:event.payload.versionId});
      const request=(await official.getBill({actor:actor(),billId})).imports.find(item=>item.jobId===queued.jobId);
      assert.deepEqual(request.identity,identity);
      assert.equal(imported.status,'unknown');assert.equal(imported.sourceComplete,false);assert.equal(imported.publication,'private');
      assert.match(imported.canonicalText,/Be it enacted by the Congress\./);assert.match(imported.canonicalText,/1\.\nProgram\./);
      const provenance=(await admin.query('SELECT origin,source_url FROM ask_bill.source_import_events WHERE publisher_id=$1::uuid AND version_id=$2::uuid',[PUB,imported.id])).rows[0];
      assert.deepEqual(provenance,{origin:'official',source_url:sourceUrl});
    });
    await t.test('official imports choose XML with the verified inert Congress header pair and retain the original bytes',async()=>{
      const identity=congressBillIdentity({congress:119,billType:'hr',billNumber:124});
      const base='https://www.congress.gov/119/bills/hr124/BILLS-119hr124ih';
      const xml=Buffer.from('<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="billres.xsl"?>\n<!DOCTYPE bill PUBLIC "-//US Congress//DTDs/bill.dtd//EN" "bill.dtd">\n<bill><section><num>1.</num><text>A synthetic official edition for format selection.</text></section></bill>');
      let requested;
      const official=createPublisherWorkflow({pool,publisherId:PUB,storage,extractSource:nativeExtract,
        congressClient:{async textVersions(){return {identity,isOfficialMetadata:true,versions:[{type:'Introduced in House',date:'2025-01-10T00:00:00Z',
          formats:[{type:'XML',url:base+'.xml'},{type:'PDF',url:base+'.pdf'}]}]};}},
        fetchImpl:async url=>{requested=url;return new Response(url.endsWith('.xml')?xml:makePdf(['SEC. 1. An alternate rendition.']));}});
      const queued=await official.requestOfficialImport({actor:actor('owner','upload'),billId,identity}),job=await claim();assert.equal(job.jobId,queued.jobId);
      const event=await official.handleImportJob(scope(job));assert.equal(await complete(job,event),true);assert.equal(requested,base+'.xml');
      const imported=await official.getVersion({actor:actor(),billId,versionId:event.payload.versionId});
      assert.match(imported.canonicalText,/A synthetic official edition/);assert.equal(imported.publication,'private');
      assert.equal(imported.rawByteSha256,hash(xml));assert.doesNotMatch(imported.canonicalText,/DOCTYPE|xml-stylesheet/);
      assert.ok(imported.warnings.includes('known_bill_dtd_ignored_offline'));
      const provenance=(await admin.query('SELECT source_url FROM ask_bill.source_import_events WHERE publisher_id=$1::uuid AND version_id=$2::uuid',[PUB,imported.id])).rows[0];
      assert.equal(provenance.source_url,base+'.xml');
    });
    await t.test('unsafe imports fail privately with fixed diagnostics and no raw source in audit/outbox',async()=>{
      const bad=storage.seed(Buffer.from('<!DOCTYPE bill [<!ENTITY leak SYSTEM "file:///private">]><bill>&leak;</bill>'),'application/xml');
      const queued=await workflow.recordUpload({actor:actor('owner','upload'),billId,object:bad}),job=await claim();assert.equal(job.jobId,queued.jobId);
      await rejected(()=>workflow.handleImportJob(scope(job)),'SOURCE_BYTES_REJECTED');
      await store.failJob({...leaseContext,jobId:job.jobId,fence:job.fence,retry:false,errorCode:'SOURCE_BYTES_REJECTED'});
      const request=(await workflow.getBill({actor:actor(),billId})).imports.find(r=>r.jobId===job.jobId);
      assert.equal(request.state,'failed');assert.equal(request.errorCode,'SOURCE_BYTES_REJECTED');
      const auditText=(await admin.query('SELECT detail::text FROM ask_bill.audit_events WHERE publisher_id=$1::uuid',[PUB])).rows.map(r=>r.detail).join('');
      assert.doesNotMatch(auditText,/The program shall|Assistance is available|file:\/\/\/private/);
      const events=(await admin.query('SELECT payload::text FROM ask_bill.outbox_events WHERE publisher_id=$1::uuid',[PUB])).rows.map(r=>r.payload).join('');
      assert.doesNotMatch(events,/The program shall|Assistance is available|file:\/\/\/private/);
    });
    await t.test('executable worker composition claims, extracts, persists, completes, and preserves undelivered outbox events',async()=>{
      const receipt=storage.seed(Buffer.from('SEC. 3. The concrete worker imports this complete synthetic source.'));
      const queued=await workflow.recordUpload({actor:actor('owner','upload'),billId,object:receipt});
      const environment={ASK_BILL_STAGE:'test',ASK_BILL_PUBLISHER_ID:PUB,ASK_BILL_DATABASE_URL:url.href,
        ASK_BILL_STORAGE_URL:'https://storage.fixture.invalid',ASK_BILL_STORAGE_BUCKET:'askbill-fixture',
        ASK_BILL_STORAGE_ACCESS_KEY_ID:'FIXTUREKEYONLY',ASK_BILL_STORAGE_SECRET_ACCESS_KEY:'fixture-secret-only'};
      const application=await createWorkerApplication({env:environment,pool,storage,extractSource:nativeExtract});
      const outcome=await application.runOnce();assert.equal(outcome.status,'completed');assert.equal(outcome.outboxStatus,'not-configured');
      const request=(await workflow.getBill({actor:actor(),billId})).imports.find(r=>r.jobId===queued.jobId);
      assert.equal(request.state,'completed');assert.equal(request.jobStatus,'completed');
      const pending=(await admin.query("SELECT status FROM ask_bill.outbox_events WHERE publisher_id=$1::uuid AND idempotency_key=$2",[PUB,'source-imported-'+queued.jobId])).rows[0];
      assert.equal(pending.status,'pending');assert.deepEqual(await application.stop(),{drained:true});
      assert.deepEqual(await application.runOnce(),{status:'draining'});

      let started;const entered=new Promise(resolve=>{started=resolve;});
      const cancelApplication=await createWorkerApplication({env:environment,pool,storage,extractSource:({signal})=>new Promise((_,reject)=>{
        started();signal.addEventListener('abort',()=>reject(Object.assign(Error('EXTRACTION_CANCELLED'),{code:'EXTRACTION_CANCELLED'})),{once:true});
      })});
      const secondReceipt=storage.seed(Buffer.from('SEC. 4. Cancelled extraction must return to the retry queue.'));
      const second=await workflow.recordUpload({actor:actor('owner','upload'),billId,object:secondReceipt});
      const running=cancelApplication.runOnce();await entered;
      const stopped=cancelApplication.stop();
      const cancelled=await running;assert.equal(cancelled.status,'retry');assert.equal(cancelled.errorCode,'SOURCE_IMPORT_CANCELLED');
      assert.deepEqual(await stopped,{drained:true});
      const job=(await admin.query('SELECT status FROM ask_bill.jobs WHERE publisher_id=$1::uuid AND id=$2::uuid',[PUB,second.jobId])).rows[0];
      assert.equal(job.status,'retry');
      await admin.query("UPDATE ask_bill.jobs SET status='dead' WHERE publisher_id=$1::uuid AND id=$2::uuid",[PUB,second.jobId]);
      const retried=await workflow.recordUpload({actor:actor('owner','upload'),billId,object:secondReceipt});
      assert.notEqual(retried.jobId,second.jobId,'explicit re-upload can recover a terminal worker failure without erasing its history');
      await admin.query("UPDATE ask_bill.jobs SET status='dead' WHERE publisher_id=$1::uuid AND id=$2::uuid",[PUB,retried.jobId]);
    });
  }finally{await pool?.end();await admin.end();}
});

