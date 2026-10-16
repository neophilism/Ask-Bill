/** Public Ask Bill runtime settings only; never expose private env or provider tokens. */
export type Stage = 'local' | 'test' | 'production';
export type Capability = 'reading' | 'fixtureAnswers' | 'liveAnswers' | 'voice' | 'publisherWrites';
export type PublicSettings = Readonly<{
  product: 'ask-bill'; stage: Stage; siteOrigin: string;
  capabilities: Readonly<Record<Capability, boolean>>;
  sourcePolicy: 'published-only' | 'fixture-only';
}>;
export class ConfigError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ConfigError'; }
}
function origin(raw: string | undefined, stage: Stage): string {
  const value = raw || (stage === 'production' ? '' : 'http://127.0.0.1:4100');
  let url: URL;
  try { url = new URL(value); } catch { throw new ConfigError('INVALID_SITE_ORIGIN', 'Specify a valid site origin'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new ConfigError('INVALID_SITE_ORIGIN', 'Site origin cannot contain credentials, path, query or fragment');
  if (stage === 'production' && url.protocol !== 'https:')
    throw new ConfigError('PRODUCTION_HTTPS_REQUIRED', 'Public production origin must be HTTPS');
  if (stage !== 'production' && url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))
    throw new ConfigError('LOCAL_ORIGIN_NOT_LOOPBACK', 'Development HTTP must be bound to loopback');
  return url.origin;
}
/** Client-callable, explicitly allowlisted, serializable settings. */
export function createPublicSettings(stage: Stage, siteOrigin?: string): PublicSettings {
  if (!['local','test','production'].includes(stage)) throw new ConfigError('INVALID_STAGE', 'Unknown environment stage');
  return Object.freeze({product:'ask-bill',stage,siteOrigin:origin(siteOrigin,stage),
    capabilities:Object.freeze({reading:true,fixtureAnswers:stage!=='production',liveAnswers:false,voice:false,publisherWrites:false}),
    sourcePolicy: stage==='production'?'published-only':'fixture-only'});
}
/** Deliberately provides only nonauthoritative fixture answers, never fabricated legal advice. */
export type FixtureAnswer = Readonly<{kind:'fixture';support:'incomplete_source';documentStatus:'draft';text:string;citationLabel:string}>;
export function demoAnswer(question:string, fixture:{fixtureOnly:boolean;sourceComplete:boolean;status:string;expectedQuestion:string;provisionLabel:string;text:string}):FixtureAnswer {
  if(fixture.fixtureOnly!==true || fixture.sourceComplete!==false || fixture.status!=='draft')
    throw new ConfigError('FIXTURE_NOT_SAFE', 'Demo provider accepts only an incomplete local draft');
  if(question !== fixture.expectedQuestion) return {kind:'fixture',support:'incomplete_source',documentStatus:'draft',text:'I only have a short excerpt. I cannot confirm that answer from this incomplete draft.',citationLabel:fixture.provisionLabel};
  return {kind:'fixture',support:'incomplete_source',documentStatus:'draft',
    text:'This draft excerpt says receipt starts when the submission enters an authorized Federal intake system. Its final clause is missing, so I cannot infer what happens next or describe this as current law.',
    citationLabel:fixture.provisionLabel};
}
