import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parsePrRegistry } from '../registry/pr-contract.mjs';

export const REPOSITORY='neophilism/Ask-Bill';
const root=new URL('../',import.meta.url);
const read=async p=>readFile(new URL(p,root),'utf8');
const digest=v=>createHash('sha256').update(v).digest('hex');
export const scopeSnapshot=unit=>({id:unit.id,title:unit.title,origin:unit.origin,dependsOn:unit.dependsOn,externalDependencies:unit.externalDependencies,externalPrerequisites:unit.externalPrerequisites,paths:unit.paths,scope:unit.scope,acceptanceCriteria:unit.acceptanceCriteria,verification:unit.verification,rollback:unit.rollback,phase:unit.phase,gate:unit.gate,priority:unit.priority,releaseRequired:unit.releaseRequired});

export async function validateFiles(){
 const [body,retiredText,plan,hashText,baselineText,fixtureText]=await Promise.all([read('registry/prs.json'),read('registry/roadmap.json'),read('docs/DEVELOPMENT_PLAN.md'),read('docs/source/SHA256SUMS.json'),read('docs/source/BASELINE_SCOPE.sha256'),read('fixtures/electronic-filing-excerpt.json')]);
 const { document,items }=parsePrRegistry(body,REPOSITORY);
 const retired=JSON.parse(retiredText);
 assert.deepEqual({deprecated:retired.deprecated,repository:retired.repository,redirectTo:retired.redirectTo},{deprecated:true,repository:REPOSITORY,redirectTo:'registry/prs.json'});
 assert(!['units','milestones','plannedPrCount','pullRequests'].some(key=>Object.hasOwn(retired,key)),'retired roadmap cannot be an alternate plan');
 assert.equal(document.units.length,112,'All 112 original units must remain');
 assert.equal(document.units.reduce((n,u)=>n+u.dependsOn.length,0),490,'Original dependency graph cannot silently shrink');
 const ids=new Set(); const phaseCounts={};
 document.units.forEach((u,i)=>{
   assert.equal(u.id,'AB-'+String(i+1).padStart(3,'0'));
   assert(!ids.has(u.id));ids.add(u.id);
   assert.equal(u.origin,'original');
   assert.equal(u.acceptance,u.acceptanceCriteria,'Acceptance fields must agree');
   assert(typeof u.acceptance==='string'&&u.acceptance.length>20);
   assert(Array.isArray(u.scope)&&u.scope.length>0);
   assert(Array.isArray(u.verification)&&u.verification.length>0);
   assert(Array.isArray(u.paths)&&u.paths.length>0);
   assert(typeof u.rollback==='string'&&u.rollback.length>20);
   assert(u.source?.path==='docs/DEVELOPMENT_PLAN.md');
   assert(plan.includes('### '+u.id+' '+u.title),'Original unit is absent from narrative plan: '+u.id);
   assert.equal(u.releaseRequired,true);
   phaseCounts[u.phase]=(phaseCounts[u.phase]??0)+1;
 });
 assert.deepEqual(phaseCounts,{F1:12,F2:16,F3:16,F4:18,F5:16,F6:10,F7:12,F8:12});
 const graph=new Map(document.units.map(u=>[u.id,u.dependsOn]));
 const visited=new Set();const walk=id=>{for(const d of graph.get(id)){if(!visited.has(d)){visited.add(d);walk(d)}}};
 walk('AB-112');assert.equal(visited.size,111,'Final launch must transitively require all units');
 assert.equal(digest(JSON.stringify(document.units.map(scopeSnapshot))),baselineText.trim(),'Pinned original approved unit scope has changed');
 const hashes=JSON.parse(hashText);
 for(const [path,hash] of Object.entries(hashes)){assert.equal(digest(await readFile(new URL(path,root))),hash,'Changed approved source '+path);}
 const fixture=JSON.parse(fixtureText);
 assert.equal(fixture.sourceComplete,false);assert.equal(fixture.publicationAllowed,false);
 if(process.env.GITHUB_REPOSITORY)assert.equal(process.env.GITHUB_REPOSITORY,REPOSITORY,'Wrong CI repository');
 return {repository:REPOSITORY,planned:items.length,edges:490,phases:phaseCounts,prSnapshotCount:document.pullRequests.length,observation:document.observedAt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log('Validated active Ask Bill registry: '+JSON.stringify(await validateFiles()));
}
