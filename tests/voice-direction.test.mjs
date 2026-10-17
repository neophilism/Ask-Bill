import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateVoiceDirection,selectPersona,speechCapability,deliveryPolicy,VoiceDirectionError} from '../packages/voice/direction/index.mjs';
const catalog=JSON.parse(await readFile(new URL('../assets/bill/voice/direction.json',import.meta.url)));
const broken=(mutate,code)=>{
 const obj=structuredClone(catalog);mutate(obj);
 assert.throws(()=>validateVoiceDirection(obj),e=>e instanceof VoiceDirectionError&&e.code===code);
};
test('all approved voice-direction personas remain text-only and original',()=>{
 const p=validateVoiceDirection(catalog);
 assert.equal(p.profiles.length,3);
 assert(p.profiles.every(x=>x.identityReference==='original-character'));
 assert.equal(selectPersona(catalog).id,'classic-bill');
 assert.equal(selectPersona(catalog,'curious-bill').tone,'playful');
 assert(Object.isFrozen(p));assert(Object.isFrozen(p.profiles));
});
test('selecting personas never authorizes TTS or model-created legal facts',()=>{
 const status=speechCapability(catalog);
 assert.equal(status.enabled,false);
 assert.equal(status.fallback,'display-exact-validated-text');
 const pol=deliveryPolicy({catalog,personaId:'plain-bill'});
 assert.equal(pol.contentAuthority,'validated-source-text-only');
 assert.equal(pol.allowClaimsWithoutEvidence,false);
 assert.equal(pol.allowUnlicensedSpeech,false);
 assert.equal(pol.allowImplicitMicrophone,false);
 assert.throws(()=>selectPersona(catalog,'celebrity-clone'),e=>e.code==='UNKNOWN_PERSONA');
});
test('licenses and provider can never be faked by changing static config fields',()=>{
 broken(x=>{x.voiceProviderStatus='enabled'},'UNLICENSED_VOICE_MUST_STAY_OFF');
 broken(x=>{x.licensedVoiceAsset={provider:'xyz'}},'UNLICENSED_VOICE_MUST_STAY_OFF');
 broken(x=>{x.characterId='other-person'},'UNLICENSED_VOICE_MUST_STAY_OFF');
 broken(x=>{x.schemaVersion=2},'UNLICENSED_VOICE_MUST_STAY_OFF');
});
test('profile impersonation, unsafe free-form instructions and arbitrary fields fail',()=>{
 broken(x=>{x.profiles[0].identityReference='famous-actor'},'INVALID_PROFILE');
 broken(x=>{x.profiles[0].styleHint='<script>alert(1)</script>'},'INVALID_PROFILE');
 broken(x=>{x.profiles[0].voiceId='external-account-id'},'UNEXPECTED_FIELD');
 broken(x=>{x.profiles[0].rate=20},'INVALID_PROFILE');
 broken(x=>{x.profiles[0].presentation='impersonation'},'INVALID_PROFILE');
});
test('only one explicitly selected default with unique persona IDs',()=>{
 broken(x=>{x.profiles[1].id=x.profiles[0].id},'PROFILE_ID_INVALID');
 broken(x=>{x.profiles[1].isDefault=true},'DEFAULT_PROFILE_REQUIRED');
 broken(x=>{x.profiles[0].isDefault=false},'DEFAULT_PROFILE_REQUIRED');
 broken(x=>{x.profiles=[]},'PROFILE_LIMIT');
});
test('test passages must cover citations, exceptions and uncertainty without executable content',()=>{
 broken(x=>{delete x.testLines.uncertainty},'INVALID_TEST_LINES');
 broken(x=>{x.testLines.source=''},'INVALID_TEST_LINES');
 broken(x=>{x.testLines.source='<img onerror=alert(1)>'},'INVALID_TEST_LINES');
 const x=selectPersona(catalog);assert.equal(x.isDefault,true);
});
