/** AB-026: generated stress corpus and official-source discovery; no synthetic law is publishable. */
import {createHash} from 'node:crypto';
export class FixtureError extends Error {constructor(code){super(code);this.name='FixtureError';this.code=code;}}
const fail=c=>{throw new FixtureError(c)};
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const templates=Object.freeze({
 'division-section':'DIVISION TITLE — synthetic rules',
 'article-clause':'ARTICLE — synthetic administrative rules'
});
const targets=Object.freeze([
 Object.freeze({congress:119,type:'hr',number:1,source:'https://api.congress.gov/v3/bill/119/hr/1/text',
   sourceRetrieved:false,complete:false,publicationAllowed:false,structure:'unverified'}),
 Object.freeze({congress:117,type:'hr',number:1319,source:'https://api.congress.gov/v3/bill/117/hr/1319/text',
   sourceRetrieved:false,complete:false,publicationAllowed:false,structure:'unverified'})
]);
/** Official import targets are locators only; no text/status is invented from identifier metadata. */
export function officialReferenceTargets(){return targets.map(t=>Object.freeze({...t}));}
export function validateOfficialImportTarget(target){
 if(!target||typeof target!=='object'||target.complete!==false||target.sourceRetrieved!==false||
   target.publicationAllowed!==false||target.structure!=='unverified'||
   !Number.isSafeInteger(target.congress)||target.congress<1||target.congress>999||
   !['hr','s','hjres','sjres'].includes(target.type)||!Number.isSafeInteger(target.number)||
   target.number<1||target.number>999999)fail('OFFICIAL_TARGET_INCOMPLETE');
 const expected='https://api.congress.gov/v3/bill/'+target.congress+'/'+target.type+'/'+target.number+'/text';
 if(target.source!==expected)fail('OFFICIAL_SOURCE_URL');
 return Object.freeze({...target});
}
/** Deterministic non-legal document for stress-testing source offsets and nested navigation. */
export function generateSyntheticStressPack({sections=1000,structure='division-section',unicode=true}={}){
 if(!Number.isSafeInteger(sections)||sections<1||sections>2000||
   !Object.hasOwn(templates,structure)||typeof unicode!=='boolean')fail('STRESS_INPUT');
 const paths=[],entries=[],parts=[];
 parts.push('SYNTHETIC DEVELOPMENT FIXTURE — NOT FEDERAL LEGISLATION OR CURRENT LAW.');
 let cursor=Array.from(parts[0]).length+1;
 for(let n=1;n<=sections;n++){
  const lead=structure==='division-section'?'Division '+Math.ceil(n/50)+' / Section '+n:
    'Article '+Math.ceil(n/30)+' / Clause '+n;
  const path=structure==='division-section'?'division-'+Math.ceil(n/50)+'/section-'+n:
    'article-'+Math.ceil(n/30)+'/clause-'+n;
  const excerpt=lead+'. Synthetic clause '+n+' applies only to this test corpus.'+
    (unicode?' Emoji 💡 combines with é and ñ.':'')+
    ' Exception: simulated outage in subsection (b).';
  parts.push(excerpt);paths.push(path);
  const length=Array.from(excerpt).length;
  entries.push(Object.freeze({path,ordinal:n,text:excerpt,sha256:hash(excerpt),start:cursor,end:cursor+length}));
  cursor+=length+1;
 }
 const content=parts.join('\n');
 return Object.freeze({kind:'synthetic_stress_fixture',sourceComplete:false,
   publicationAllowed:false,sourceStatus:'synthetic_not_legislation',structure,
   sections,sha256:hash(content),text:content,paths:Object.freeze(paths),
   entries:Object.freeze(entries)});
}
export function assertPublishableStressPack(pack){
 if(!pack||pack.kind==='synthetic_stress_fixture'||pack.sourceStatus==='synthetic_not_legislation'||
   pack.publicationAllowed!==true)fail('SYNTHETIC_PACK_NEVER_PUBLIC');
 return false;
}
