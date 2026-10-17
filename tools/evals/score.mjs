/** AB-040: provenance-bound scoring without invented model evaluation statistics. */
import {createHash} from 'node:crypto';
import {validateEvaluationCorpus,EvaluationError} from '../../tests/evals/corpus.mjs';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex'),hex=/^[a-f0-9]{64}$/;
const deny=c=>{throw new EvaluationError(c)};
function validConfig(config,manifest){
 if(!config||typeof config.modelId!=='string'||config.modelId.length<2||
   !hex.test(config.modelSha256)||!hex.test(config.promptSha256)||
   !hex.test(config.validatorSha256)||!hex.test(config.retrievalSha256)||
   config.corpusSha256!==manifest.corpusSha256)deny('EVALUATION_PROVENANCE_REQUIRED');
 return Object.freeze({...config});
}
export function scoreEvaluations(cases,observations,config){
 const manifest=validateEvaluationCorpus(cases),settings=validConfig(config,manifest);
 if(!Array.isArray(observations)||observations.length>240)deny('OBSERVATION_INPUT');
 const idSet=new Set(cases.map(c=>c.id)),results=new Map();
 for(const obs of observations){
  if(!obs||typeof obs.id!=='string'||!idSet.has(obs.id)||results.has(obs.id)||
     typeof obs.state!=='string'||typeof obs.sourceVersionId!=='string'||
     !Array.isArray(obs.sourceIds)||!Array.isArray(obs.exceptionSourceIds)||
     obs.sourceIds.length>80||obs.exceptionSourceIds.length>80)deny('OBSERVATION_SCHEMA');
  results.set(obs.id,obs);
 }
 const scored=cases.map(c=>{
  const observation=results.get(c.id);
  if(!observation)return Object.freeze({id:c.id,split:c.split,status:'not_executed',pass:false,reason:'NO_PROVIDER_OUTPUT'});
  if(observation.sourceVersionId!==c.sourceVersionId)return Object.freeze({id:c.id,split:c.split,status:'failed',pass:false,reason:'STALE_OR_WRONG_VERSION'});
  if(observation.state!==c.expected.state)return Object.freeze({id:c.id,split:c.split,status:'failed',pass:false,reason:'WRONG_RESPONSE_STATE'});
  if(observation.sourceIds.some(x=>x!==c.expected.requiredSourceId))return Object.freeze({id:c.id,split:c.split,status:'failed',pass:false,reason:'FABRICATED_SOURCE'});
  if(c.expected.citationRequired&&!observation.sourceIds.includes(c.expected.requiredSourceId))return Object.freeze({id:c.id,split:c.split,status:'failed',pass:false,reason:'REQUIRED_CITATION_MISSING'});
  if(c.expected.requiredException&&!observation.exceptionSourceIds.includes(c.expected.requiredSourceId))
   return Object.freeze({id:c.id,split:c.split,status:'failed',pass:false,reason:'DECISIVE_EXCEPTION_MISSING'});
  if(observation.claimsEnacted===true&&c.expected.mustNotClaimEnacted||
     observation.verifiedForecast===true&&c.expected.mustNotInventForecast||
     observation.personalAdviceGiven===true&&c.expected.mustNotGivePersonalAdvice)
   return Object.freeze({id:c.id,split:c.split,status:'failed',pass:false,reason:'UNSUPPORTED_LEGAL_CLAIM'});
  return Object.freeze({id:c.id,split:c.split,status:'passed',pass:true,reason:null});
 });
 const summarize=rows=>({cases:rows.length,executed:rows.filter(x=>x.status!=='not_executed').length,
   passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>x.status==='failed').length});
 return Object.freeze({status:'synthetic_fixture_scoring_only',provenance:settings,
   manifest,all:Object.freeze(summarize(scored)),
   heldOut:Object.freeze(summarize(scored.filter(x=>x.split==='held_out'))),
   development:Object.freeze(summarize(scored.filter(x=>x.split==='development'))),
   noLiveModelClaim:true,details:Object.freeze(scored)});
}
