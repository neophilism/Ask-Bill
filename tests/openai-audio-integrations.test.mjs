import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOpenAISpeechProvider,createOpenAITranscriptionProvider,inspectProviderWav,ProviderError} from '../packages/providers/index.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const options = {enabled:true,dataProtectionVerified:true,voiceRightsVerified:true,apiKey:'test-only-audio-key-000'};
const raw = 'An original may be required. The exact source includes an emoji 😃.';
const source = {versionId:'v1',provisionId:'sec-1',text:raw,sha256:sha(raw),publication:'published',sourceComplete:true};
const span = {sourceVersionId:'v1',provisionId:'sec-1',start:0,end:Array.from(raw).length,
  quote:raw,quoteHash:sha(raw),citationLabel:'Section 1',originalLocator:{}};
const baseSegment = () => ({id:'segment-1',versionId:'v1',text:raw,claimIds:['c1'],claims:[{id:'c1',
  kind:'bill_text',text:raw,support:'supported',spans:[{...span}],qualifications:[]}],
  validation:{schema:'v1',retrievalConfig:sha('r'),promptConfig:sha('p'),validatorConfig:sha('v'),validatedAt:'2026-10-17T15:00:00Z'}});
const request = extra => ({segment:baseSegment(),versionId:'v1',sessionId:'session-1',conversationEpoch:2,...extra});
const code = expected => error => error instanceof ProviderError && error.code === expected;
function wav(seconds = 1,sampleRate = 24000) {
  const dataBytes = seconds * sampleRate * 2;
  const result = Buffer.alloc(44+dataBytes);
  result.write('RIFF',0); result.writeUInt32LE(result.length-8,4); result.write('WAVEfmt ',8);
  result.writeUInt32LE(16,16); result.writeUInt16LE(1,20); result.writeUInt16LE(1,22);
  result.writeUInt32LE(sampleRate,24); result.writeUInt32LE(sampleRate*2,28);
  result.writeUInt16LE(2,32); result.writeUInt16LE(16,34); result.write('data',36); result.writeUInt32LE(dataBytes,40);
  return result;
}
const speech = fetchImpl => createOpenAISpeechProvider({...options,lookupSource:async () => source,fetchImpl});
const audioResponse = bytes => new Response(bytes,{headers:{'Content-Type':'audio/wav'}});

test('configured TTS sends exact validated source, returns scoped private WAV with real derived duration',async () => {
  let call;
  const provider = speech(async (url,opts) => { call = {url,opts}; return audioResponse(wav()); });
  const audio = await provider.synthesize(request());
  assert.equal(call.url,'https://api.openai.com/v1/audio/speech');
  assert.equal(call.opts.redirect,'manual');
  const payload = JSON.parse(call.opts.body);
  assert.equal(payload.input,raw); assert.equal(payload.response_format,'wav'); assert.equal(payload.stream_format,'audio');
  assert.equal(payload.voice,'alloy'); assert.equal(payload.model,'gpt-4o-mini-tts');
  assert.equal(payload.store,undefined); // Audio API has no Responses store parameter.
  assert.equal(audio.durationSeconds,1); assert.equal(audio.audioSha256,sha(wav()));
  assert.equal(audio.textSha256,sha(raw)); assert.equal(audio.sessionId,'session-1');
  assert.equal(audio.conversationEpoch,2); assert.equal(audio.requiresSessionAuthorization,true);
  assert.equal(audio.publicAudioUrl,null); assert.equal(audio.wordTimings,null);
  assert.equal(audio.syntheticVoice,true); assert.match(audio.disclosure,/AI-generated voice/);
  assert.equal(provider.capabilities().visemes,false); assert.equal(provider.capabilities().publicAudioCache,false);
});

test('no live voice without explicit privacy, rights, selected built-in voice and trusted source adapter',() => {
  assert.throws(() => createOpenAISpeechProvider({}),code('LIVE_PROVIDER_DISABLED'));
  assert.throws(() => createOpenAISpeechProvider({...options,dataProtectionVerified:false}),code('PROVIDER_DATA_PROTECTION_REQUIRED'));
  assert.throws(() => createOpenAISpeechProvider({...options,voiceRightsVerified:false}),code('VOICE_RIGHTS_NOT_VERIFIED'));
  assert.throws(() => createOpenAISpeechProvider({...options,voice:'celebrity-clone',lookupSource:async () => source}),code('PROVIDER_CONFIG'));
  assert.throws(() => createOpenAISpeechProvider({...options}),code('PROVIDER_CONFIG'));
});

test('paraphrases require original server-issued segment approval and every supporting quote is reverified',async () => {
  const paraphrase = baseSegment();
  paraphrase.text = 'The source says an original may sometimes be needed.';
  paraphrase.claims[0].text = paraphrase.text; paraphrase.claims[0].kind = 'interpretation';
  let calls = 0;
  const fetchImpl = async () => { calls++; return audioResponse(wav()); };
  await assert.rejects(speech(fetchImpl).synthesize(request({segment:paraphrase})),code('SPEECH_SEGMENT_NOT_AUTHORIZED'));
  const grants = new WeakSet([paraphrase]);
  const provider = createOpenAISpeechProvider({...options,lookupSource:async () => source,fetchImpl,
    authorizeSegment:({segment}) => grants.has(segment)});
  const audio = await provider.synthesize(request({segment:paraphrase}));
  assert.equal(audio.textFallback,paraphrase.text);
  await assert.rejects(provider.synthesize(request({segment:structuredClone(paraphrase)})),code('SPEECH_SEGMENT_NOT_AUTHORIZED'));
  assert.equal(calls,1);
});

test('unreviewed claims, forged sources and source withdrawal fail before paid synthesis',async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return audioResponse(wav()); };
  for (const badSource of [{...source,sourceComplete:false},{...source,publication:'withdrawn'},
    {...source,sha256:'f'.repeat(64)},{...source,versionId:'v2'},{...source,text:'Other text',sha256:sha('Other text')}]) {
    const provider = createOpenAISpeechProvider({...options,lookupSource:async () => badSource,fetchImpl});
    await assert.rejects(provider.synthesize(request()),code('SPEECH_SOURCE_INVALID'));
  }
  const invalid = baseSegment(); invalid.claims[0].support = 'qualified';
  await assert.rejects(speech(fetchImpl).synthesize(request({segment:invalid})),code('UNVALIDATED_SEGMENT'));
  await assert.rejects(speech(fetchImpl).synthesize(request({versionId:'v2'})),code('UNVALIDATED_SEGMENT'));
  await assert.rejects(speech(fetchImpl).synthesize(request({conversationEpoch:-1})),code('AUDIO_SCOPE_INVALID'));
  assert.equal(calls,0);
});

test('PCM structure, hash and real duration reject malformed or overlong TTS data',async () => {
  const malformed = [Buffer.from('RIFFnot-a-real-file'),wav().subarray(0,500),Buffer.from(wav()),Buffer.from(wav())];
  malformed[2].writeUInt32LE(1,28); // Byte rate must match frames.
  malformed[3].writeUInt32LE(0xfffffffe,40); // Huge chunk cannot point outside available bytes.
  for (const bytes of malformed) {
    await assert.rejects(speech(async () => audioResponse(bytes)).synthesize(request()),code('PROVIDER_AUDIO_INVALID'));
  }
  assert.throws(() => inspectProviderWav(wav(11),{maxDurationSeconds:10}),code('PROVIDER_AUDIO_DURATION_LIMIT'));
  const streamWav = wav(); streamWav.writeUInt32LE(0xffffffff,4); streamWav.writeUInt32LE(0xffffffff,40);
  assert.equal(inspectProviderWav(streamWav).durationSeconds,1);
  await assert.rejects(speech(async () => new Response('<script>evil</script>',{headers:{'Content-Type':'text/html'}}))
    .synthesize(request()),code('PROVIDER_CONTENT_TYPE'));
});

test('cancellation before or during TTS never returns late audio',async () => {
  const abort = new AbortController();
  const provider = speech(async () => { abort.abort(); return audioResponse(wav()); });
  await assert.rejects(provider.synthesize(request({signal:abort.signal})),code('REQUEST_ABORTED'));
  let calls = 0;
  await assert.rejects(speech(async () => { calls++; return audioResponse(wav()); })
    .synthesize(request({signal:abort.signal})),code('REQUEST_ABORTED'));
  assert.equal(calls,0);
});

test('STT uses bounded multipart upload, fixed filename and chosen language; text is editable only',async () => {
  let call;
  const input = wav(), originalHash = sha(input);
  const provider = createOpenAITranscriptionProvider({...options,fetchImpl:async (url,opts) => {
    call = {url,opts};
    const uploaded = opts.body.get('file');
    assert.equal(uploaded.name,'recording.wav'); assert.equal(uploaded.type,'audio/wav');
    assert.equal(sha(Buffer.from(await uploaded.arrayBuffer())),originalHash);
    return new Response(JSON.stringify({text:'  ¿Qué significa esta sección?  '}),{headers:{'Content-Type':'application/json'}});
  }});
  const result = await provider.transcribe({audio:input,mimeType:'audio/wav',versionId:'v1',conversationEpoch:4,language:'es'});
  assert.equal(call.url,'https://api.openai.com/v1/audio/transcriptions'); assert.equal(call.opts.redirect,'manual');
  assert.equal(call.opts.headers['Content-Type'],undefined); // FormData owns the boundary.
  assert.equal(call.opts.body.get('model'),'gpt-4o-mini-transcribe');
  assert.equal(call.opts.body.get('language'),'es'); assert.equal(call.opts.body.get('response_format'),'json');
  assert.equal(result.text,'¿Qué significa esta sección?'); assert.equal(result.language,'es');
  assert.equal(result.editable,true); assert.equal(result.automaticallySubmitted,false);
  assert.equal(result.questionSubmissionAuthorized,false); assert.equal(sha(input),originalHash);
});

test('Blob chunks from push-to-talk are supported without exposing names or keeping buffers',async () => {
  const bytes = wav(); let uploadedSize;
  const provider = createOpenAITranscriptionProvider({...options,fetchImpl:async (_url,opts) => {
    uploadedSize = opts.body.get('file').size;
    return new Response(JSON.stringify({text:'What does this mean?'}),{headers:{'Content-Type':'application/json'}});
  }});
  const result = await provider.transcribe({audio:[new Blob([bytes.subarray(0,50)]),new Blob([bytes.subarray(50)])],
    mimeType:'audio/x-wav',versionId:'v1',conversationEpoch:1});
  assert.equal(uploadedSize,bytes.length); assert.equal(result.language,'en');
});

test('STT refuses invalid containers, too many bytes, invalid duration and unexpected fields before call',async () => {
  let calls = 0;
  const provider = createOpenAITranscriptionProvider({...options,maxInputBytes:100000,fetchImpl:async () => {
    calls++; throw new Error('unexpected');
  }});
  const base = {audio:wav(),mimeType:'audio/wav',versionId:'v1',conversationEpoch:0};
  for (const [extra,expected] of [
    [{audio:Buffer.from('<html>not audio</html>'),mimeType:'audio/webm'},'AUDIO_INPUT_INVALID'],
    [{audio:Buffer.alloc(100001)},'AUDIO_INPUT_SIZE_LIMIT'],
    [{mimeType:'application/javascript'},'AUDIO_FORMAT_UNSUPPORTED'],
    [{durationSeconds:61},'AUDIO_INPUT_DURATION_LIMIT'],
    [{language:'xx'},'AUDIO_LOCALE_INVALID'],
    [{url:'https://untrusted.example/audio'},'AUDIO_REQUEST_INVALID']
  ]) await assert.rejects(provider.transcribe({...base,...extra}),code(expected));
  assert.equal(calls,0);
});

test('silence, control characters, oversized transcripts and failed requests do not become questions',async () => {
  for (const text of ['', ' ', 'invalid\u0000text', 'X'.repeat(4001)]) {
    const provider = createOpenAITranscriptionProvider({...options,fetchImpl:async () => new Response(JSON.stringify({text}),
      {headers:{'Content-Type':'application/json'}})});
    await assert.rejects(provider.transcribe({audio:wav(),mimeType:'audio/wav',versionId:'v1',conversationEpoch:0}),
      code('PROVIDER_TRANSCRIPT_INVALID'));
  }
  const provider = createOpenAITranscriptionProvider({...options,fetchImpl:async () => new Response('secret provider error',{status:429})});
  await assert.rejects(provider.transcribe({audio:wav(),mimeType:'audio/wav',versionId:'v1',conversationEpoch:0}),code('PROVIDER_RATE_LIMITED'));
});
