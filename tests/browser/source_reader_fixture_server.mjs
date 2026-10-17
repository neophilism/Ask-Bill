/** Browser-only synthetic published release. Never a production publisher or live document. */
import {createHash} from 'node:crypto';
import {createPublishedSourceServer} from '../../apps/web/source-only/server.mjs';
const pub='11111111-1111-4111-8111-111111111111';
const bill='22222222-2222-4222-8222-222222222222';
const version='33333333-3333-4333-8333-333333333333';
const sha=t=>createHash('sha256').update(t,'utf8').digest('hex');
const texts=['First section: this is only a SYNTHETIC PROPOSAL, not enacted law. 😃',
 'Second section: <script>not executable</script> and an exception to the proposal.'];
const provisions=texts.map((text,i)=>({id:'section-'+(i+1),
 heading:i===0?'Section 1':'Exception — Section 2',text,sha256:sha(text)}));
const pack={schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',
 publisherId:pub,billId:bill,versionId:version,title:'Synthetic Example Bill',
 language:'en-US',jurisdiction:'United States',status:'introduced',
 publication:'published',sourceComplete:true,
 retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',
 canonicalSha256:sha(texts.join('\n\n')),provisions};
const port=Number(process.env.PORT);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Valid PORT required for fixture server');
const server=await createPublishedSourceServer({
 publisherId:pub,
 lookupPublishedPack:async ({publisherId,billId,versionId})=>
  publisherId===pub&&billId===bill&&versionId===version?pack:null,
 lookupPublishedCatalog:async ({publisherId,page})=>{
  if(publisherId!==pub)throw new Error('Invalid publisher');
  return {items:page===1?[{publisherId:pub,billId:bill,versionId:version,
   title:pack.title,status:pack.status,publication:'published',sourceComplete:true}]:[],hasNext:false};
 }
});
server.listen(port,'127.0.0.1');
