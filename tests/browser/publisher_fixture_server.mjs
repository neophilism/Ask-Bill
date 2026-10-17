/** Explicitly local visual fixture; never a production login or source publisher. */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createPublisherHandler} from '../../apps/web/admin/server/index.mjs';
if(process.env.ASK_BILL_PUBLISHER_BROWSER_FIXTURE!=='1'||process.env.NODE_ENV==='production')throw Error('Explicit non-production browser fixture required');
const publisherId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',billId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',versionId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const text='This private visual fixture demonstrates exact source review.\n\nA proposed source version remains private until its extraction, citations and publication checks are complete.';
const version={id:versionId,billId,publisherId,title:'A clearer path through public information',status:'draft',publication:'private',sourceComplete:false,
 canonicalText:text,canonicalTextSha256:createHash('sha256').update(text).digest('hex'),rawByteSha256:'f'.repeat(64),createdAt:'2026-10-17T12:00:00Z',
 provisions:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',heading:'Source review and publication',text}],reviewChecks:[],indexStatus:'complete',activeReleaseId:null};
const bill={id:billId,publisherId,title:version.title,jurisdiction:'United States',versionCount:1,activeReleaseId:null,versions:[version],imports:[]};
const actor={publisherId,userId:'11111111-1111-4111-8111-111111111111',role:'owner',freshMembershipVerified:true,mfaVerifiedByTrustedServer:true};
const auth={
 async getContext(){return {...actor,csrfToken:'C'.repeat(43),recentMfa:true};},
 async authorize(){return {...actor,action:'view'};}
};
const handler=createPublisherHandler({auth,expectedOrigin:'https://askbill.example',publisherId,storage:{},officialImportsEnabled:true,
 repository:{async listBills(){return [bill];},async getBill(){return bill;},async getVersion(){return version;}}});
const server=createServer((req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.end('Read-only browser fixture');return;}
 handler(req,res).then(handled=>{if(!handled){res.statusCode=404;res.end();}}).catch(()=>{res.statusCode=500;res.end();});
});
server.listen(0,'127.0.0.1',()=>process.stdout.write('http://127.0.0.1:'+server.address().port+'\n'));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>process.exit(0)));
