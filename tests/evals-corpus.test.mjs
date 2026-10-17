import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildEvaluationCorpus,validateEvaluationCorpus,EvaluationError} from './evals/corpus.mjs';
import {scoreEvaluations} from '../tools/evals/score.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
test('exactly 240 version-pinned cases include 80+ adversarial and a held-out subset',()=>{
 const cases=buildEvaluationCorpus(),m=validateEvaluationCorpus(cases);
 assert.equal(m.total,240);assert(m.adversarial>=80);assert.equal(m.heldOut,48);
 assert.equal(m.categories.length,12);assert.equal(m.development,192);
 assert.equal(new Set(cases.map(c=>c.id)).size,240);
 assert.equal(m.corpusSha256,sha(JSON.stringify(cases)));
});
test('corpus includes exceptions, draft-as-enacted, personal advice and hostile source cases',()=>{
 const cases=buildEvaluationCorpus();
 for(const name of ['exception','missing_source','version_switch','draft_as_enacted','unsupported_prediction','personal_application','source_prompt_injection'])
  assert.equal(cases.filter(c=>c.category===name).length,20);
 assert(cases.filter(c=>c.expected.requiredException).length>=20);
 assert(cases.every(c=>c.source.status==='draft'));
 assert.throws(()=>validateEvaluationCorpus(cases.slice(0,239)),EvaluationError);
});
test('scoring records missing provider executions instead of fabricated success',()=>{
 const cases=buildEvaluationCorpus(),m=validateEvaluationCorpus(cases);
 const config={modelId:'synthetic-offline-fixture',modelSha256:sha('model'),promptSha256:sha('prompt'),validatorSha256:sha('validator'),retrievalSha256:sha('retrieval'),corpusSha256:m.corpusSha256};
 const empty=scoreEvaluations(cases,[],config);
 assert.equal(empty.all.executed,0);assert.equal(empty.all.passed,0);
 assert.equal(empty.heldOut.executed,0);assert.equal(empty.noLiveModelClaim,true);
});
test('wrong versions, fabricated citations and omitted exceptions are explicit failures',()=>{
 const cases=buildEvaluationCorpus(),m=validateEvaluationCorpus(cases);
 const config={modelId:'test-only',modelSha256:sha('model'),promptSha256:sha('prompt'),validatorSha256:sha('validator'),retrievalSha256:sha('retrieval'),corpusSha256:m.corpusSha256};
 const target=cases.find(c=>c.category==='exception');
 const normal={id:target.id,state:target.expected.state,sourceVersionId:target.sourceVersionId,
   sourceIds:[target.source.id],exceptionSourceIds:[target.source.id]};
 assert.equal(scoreEvaluations(cases,[normal],config).all.passed,1);
 assert.equal(scoreEvaluations(cases,[{...normal,exceptionSourceIds:[]}],config).all.failed,1);
 assert.equal(scoreEvaluations(cases,[{...normal,sourceIds:['invented-source']}],config).all.failed,1);
 assert.equal(scoreEvaluations(cases,[{...normal,sourceIds:[]}],config).all.failed,1);
 assert.equal(scoreEvaluations(cases,[{...normal,sourceVersionId:'wrong-v2'}],config).all.failed,1);
 assert.throws(()=>scoreEvaluations(cases,[normal,normal],config),EvaluationError);
 assert.throws(()=>scoreEvaluations(cases,[normal],{...config,corpusSha256:sha('different')}),EvaluationError);
});
