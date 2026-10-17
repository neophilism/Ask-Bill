import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createSpeechPreflight,inspectAudioCandidate,SpeechGateError} from '../packages/voice/tts/index.mjs';
const h=s=>createHash('sha256').update(s,'utf8').digest('hex');
const voice=JSON.parse(await readFile(new URL('../assets/bill/voice/direction.json',import.meta.url),'utf8'));
const raw='A proposed rule 😃 preserves the exact legal source.',versionId='v1';
const span={sourceVersionId:versionId,provisionId:'sec-1',start:0,end:Array.from(raw).length,
 quote:raw,quoteHash:h(raw),citationLabel:'Section 1',originalLocator:{}};
const claim={id:'c1',kind:'bill_text',text:raw,support:'supported',spans:[span],qualifications:[]};
const segment={id:'s1',text:raw,claimIds:['c1'],claims:[claim],versionId,
 validation:{schema:'v1',retrievalConfig:h('retrieval'),promptConfig:h('prompt'),validatorConfig:h('validator'),validatedAt:'2026-10-17T12:00:00Z'}};
const source={versionId,provisionId:'sec-1',text:raw,sha256:h(raw),publication:'published',sourceComplete:true};
const options=()=>({voiceCatalog:voice,lookupSource:async()=>source});
const request=()=>({segment,versionId,sessionId:'session-1',conversationEpoch:7,personaId:'classic-bill'});
const error=(code)=>e=>e instanceof SpeechGateError&&e.code===code;
test('approved verbatim text can be planned but NEVER sent to an unlicensed provider',async()=>{
 const gate=createSpeechPreflight(options()),result=await gate.prepare(request());
 assert.equal(result.kind,'speech_preflight_only');assert.equal(result.deliveryAuthorized,false);
 assert.equal(result.synthesisEnabled,false);assert.equal(result.publicAudioUrl,null);
 assert.equal(result.textFallback,raw);assert.equal(result.versionId,'v1');
 assert.equal(result.fingerprint,(await gate.prepare(request())).fingerprint);
 assert.equal(result.personaId,'classic-bill');assert(Object.isFrozen(result));
 await assert.rejects(gate.synthesize({enabled:true}),error('LICENSE_AND_PROVIDER_NOT_VERIFIED'));
 await assert.rejects(gate.deliver({url:'https://attacker.example/audio'}),error('LICENSE_AND_PROVIDER_NOT_VERIFIED'));
});
test('unreviewed model drafts, unsupported claims, or altered citations fail closed',async()=>{
 const gate=createSpeechPreflight(options());
 await assert.rejects(gate.prepare({...request(),segment:{type:'untrusted_draft',text:'unknown'}}),error('UNVALIDATED_SEGMENT'));
 await assert.rejects(gate.prepare({...request(),segment:{...segment,claims:[{...claim,support:'qualified'}]}}),error('NOT_INDEPENDENTLY_REVIEWED_VERBATIM'));
 await assert.rejects(gate.prepare({...request(),segment:{...segment,claims:[{...claim,text:'fabricated'}]}}),error('NOT_INDEPENDENTLY_REVIEWED_VERBATIM'));
 await assert.rejects(gate.prepare({...request(),segment:{...segment,text:'Paraphrased legal advice'}}),error('NOT_INDEPENDENTLY_REVIEWED_VERBATIM'));
});
test('actual authoritative version, quote, source hash and publication status must match',async()=>{
 for(const bad of [{...source,sha256:h('wrong')},{...source,versionId:'v2'},
                   {...source,publication:'reviewed'},{...source,sourceComplete:false},
                   {...source,text:raw.replace('😃','😠'),sha256:h(raw.replace('😃','😠'))}]){
  const gate=createSpeechPreflight({voiceCatalog:voice,lookupSource:async()=>bad});
  await assert.rejects(gate.prepare(request()),SpeechGateError);
 }
 await assert.rejects(createSpeechPreflight({voiceCatalog:voice,lookupSource:async()=>{throw Error('secret')}}).prepare(request()),error('SOURCE_UNAVAILABLE'));
});
test('abort, wrong session scope, budgets, unknown personas and malformed inputs stop admission',async()=>{
 const gate=createSpeechPreflight(options()),controller=new AbortController();controller.abort();
 await assert.rejects(gate.prepare({...request(),signal:controller.signal}),error('REQUEST_CANCELLED'));
 for(const value of [{...request(),sessionId:'--'}, {...request(),versionId:'v2'},
                     {...request(),personaId:'celebrity-clone'},{...request(),locale:'xx'},
                     {...request(),conversationEpoch:-1},{...request(),evilCode:'inject'}])
  await assert.rejects(gate.prepare(value),SpeechGateError);
 const tiny=createSpeechPreflight({...options(),maxCharacters:80,maxEstimatedSeconds:10});
 assert((await tiny.prepare(request())).estimatedSeconds<=10);
 assert.throws(()=>createSpeechPreflight({...options(),maxCharacters:0}),error('INVALID_BUDGET'));
});
test('audio candidate hash, length and codec are checked without enabling delivery',()=>{
 const bytes=Buffer.from('RIFF0000WAVEfmt ', 'utf8'),sum=h(bytes);
 const result=inspectAudioCandidate({bytes,codec:'audio/wav',durationSeconds:1,expectedSha256:sum,validatedTextHash:h(raw)});
 assert.equal(result.kind,'unreleased_audio_candidate');assert.equal(result.deliveryAuthorized,false);assert.equal(result.publicAudioUrl,null);
 assert.throws(()=>inspectAudioCandidate({bytes,codec:'audio/wav',durationSeconds:1,expectedSha256:h('wrong'),validatedTextHash:h(raw)}),error('AUDIO_DIGEST_MISMATCH'));
 assert.throws(()=>inspectAudioCandidate({bytes,codec:'video/mp4',durationSeconds:1,expectedSha256:sum,validatedTextHash:h(raw)}),error('AUDIO_CANDIDATE_INVALID'));
 assert.throws(()=>inspectAudioCandidate({bytes,codec:'audio/wav',durationSeconds:Infinity,expectedSha256:sum,validatedTextHash:h(raw)}),error('AUDIO_CANDIDATE_INVALID'));
});
