import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderPublishedReader} from '../packages/ui/reader/index.mjs';

const sha = text => createHash('sha256').update(text,'utf8').digest('hex');
const publisherId='11111111-1111-4111-8111-111111111111';
const billId='22222222-2222-4222-8222-222222222222';
const versionId='33333333-3333-4333-8333-333333333333';
function makePack(version=versionId){
 const provisions=[{id:'sec-1',heading:'Section <1>',text:'A proposed rule 😃.',sha256:sha('A proposed rule 😃.')},
                   {id:'sec-2',heading:'Exception',text:'There is an exception.',sha256:sha('There is an exception.')}];
 return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',
   publisherId,billId,versionId:version,title:'Draft Bill',jurisdiction:'United States',language:'en-US',
   status:'introduced',publication:'published',sourceComplete:true,
   retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',
   canonicalSha256:sha(provisions.map(p=>p.text).join('\n\n')),provisions};
}
test('SSR source reader publishes trustworthy provision IDs and exact version metadata',()=>{
 const html=renderPublishedReader(makePack());
 assert.equal((html.match(/data-source-version="33333333-3333-4333-8333-333333333333"/g)||[]).length,2);
 assert.equal((html.match(/data-provision-id="sec-[12]"/g)||[]).length,2);
 assert.match(html,/id="provision-sec-1" data-source-version="33333333-3333-4333-8333-333333333333" data-provision-id="sec-1"/);
 assert.match(html,/id="provision-sec-2" data-source-version="33333333-3333-4333-8333-333333333333" data-provision-id="sec-2"/);
 assert.match(html,/Section &lt;1&gt;/);
 assert(!html.includes('<script'));
});
test('source version switches cannot reuse previous provision geometry identity',()=>{
 const v2='44444444-4444-4444-8444-444444444444';
 const one=renderPublishedReader(makePack());
 const two=renderPublishedReader(makePack(v2));
 assert(one.includes('data-source-version="'+versionId+'"'));
 assert(!two.includes('data-source-version="'+versionId+'"'));
 assert(two.includes('data-source-version="'+v2+'"'));
});
test('no graphics, script or generated citation is required for published source reading',()=>{
 const html=renderPublishedReader(makePack());
 assert(html.includes('aria-label="Legislation"'));
 assert(html.includes('href="#provision-sec-1"'));
 assert(html.includes('statutory-text'));
 assert(!html.includes('src="/Bill.glb"'));
});
