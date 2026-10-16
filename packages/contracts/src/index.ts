/** Ask Bill independent runtime contracts. Never trust a model for source authority. */
export type JsonRecord = Record<string, unknown>;
export class ContractError extends Error {
  readonly code = 'INVALID_CONTRACT';
  constructor(readonly path: string, message: string) { super(`${path}: ${message}`); this.name = 'ContractError'; }
}
const fail = (path: string, message: string): never => { throw new ContractError(path, message); };
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
function record(v: unknown, path: string, required: readonly string[], optional: readonly string[] = []): JsonRecord {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return fail(path, 'expected object');
  const obj = v as JsonRecord;
  for (const name of required) if (!own(obj, name)) fail(`${path}.${name}`, 'missing required field');
  const keys = new Set([...required, ...optional]);
  for (const name of Object.keys(obj)) if (!keys.has(name)) fail(`${path}.${name}`, 'unknown field');
  return obj;
}
function string(v: unknown, path: string, max = 4096): string {
  if (typeof v !== 'string' || !v || v.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(v)) return fail(path, 'invalid string');
  return v;
}
function id(v: unknown, path: string): string {
  const result = string(v, path, 120);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(result)) fail(path, 'invalid identifier');
  return result;
}
function sha(v: unknown, path: string): string {
  const result = string(v, path, 64);
  if (!/^[a-f0-9]{64}$/i.test(result)) fail(path, 'expected SHA-256 hex');
  return result.toLowerCase();
}
function iso(v: unknown, path: string): string {
  const result = string(v, path, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result)) fail(path, 'expected UTC ISO timestamp');
  const d = new Date(result);
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== result.replace(/(?:\.(\d{1,3}))?Z$/, (_m, frac: string | undefined) => `.${(frac ?? '').padEnd(3, '0')}Z`)) fail(path, 'nonexistent calendar date');
  return result;
}
function enumValue<T extends string>(v: unknown, path: string, members: readonly T[]): T {
  if (typeof v !== 'string' || !members.includes(v as T)) return fail(path, 'invalid enum value');
  return v as T;
}
function unsigned(v: unknown, path: string, max = 100000000): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > max) return fail(path, 'invalid non-negative integer');
  return v as number;
}
function positive(v: unknown, path: string, max = 86400): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) return fail(path, 'invalid positive number');
  return v;
}
function flag(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') return fail(path, 'expected boolean');
  return v;
}
function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) return fail(path, 'invalid array or too many elements');
  return v;
}
function optional<T>(v: unknown, fn: (value: unknown) => T): T | undefined { return v === undefined ? undefined : fn(v); }
function url(v: unknown, path: string): string {
  const raw = string(v, path, 2000);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return fail(path, 'not an absolute URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname || parsed.hash || parsed.port || /^(?:localhost|.+\.localhost|.+\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::1\])$/i.test(parsed.hostname)) fail(path, 'only public canonical credential-free HTTPS URLs are allowed');
  return raw;
}
export const SOURCE_STATUSES = ['draft','introduced','amended','passed_one_chamber','enacted','effective','repealed','unknown'] as const;
export const PUBLICATION_STATES = ['private','reviewed','published','withdrawn'] as const;
export type SourceVersion = Readonly<{id:string;billId:string;publisherId:string;language:string;status:typeof SOURCE_STATUSES[number];rawByteHash:string;canonicalTextHash:string;canonicalizationVersion:string;sourceUrl?:string;retrievedAt:string;publishedAt?:string;effectiveAt?:string;sourceComplete:boolean;publication:typeof PUBLICATION_STATES[number]}>;
export function parseSourceVersion(v: unknown): SourceVersion {
  const o = record(v, 'version', ['id','billId','publisherId','language','status','rawByteHash','canonicalTextHash','canonicalizationVersion','retrievedAt','sourceComplete','publication'], ['sourceUrl','publishedAt','effectiveAt']);
  const language = string(o.language, 'version.language', 35);
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) fail('version.language', 'invalid language tag');
  const version: SourceVersion = {
    id:id(o.id,'version.id'),billId:id(o.billId,'version.billId'),publisherId:id(o.publisherId,'version.publisherId'),language,
    status:enumValue(o.status,'version.status',SOURCE_STATUSES),rawByteHash:sha(o.rawByteHash,'version.rawByteHash'),canonicalTextHash:sha(o.canonicalTextHash,'version.canonicalTextHash'),
    canonicalizationVersion:id(o.canonicalizationVersion,'version.canonicalizationVersion'),retrievedAt:iso(o.retrievedAt,'version.retrievedAt'),sourceComplete:flag(o.sourceComplete,'version.sourceComplete'),publication:enumValue(o.publication,'version.publication',PUBLICATION_STATES),
    ...(o.sourceUrl === undefined ? {} : {sourceUrl:url(o.sourceUrl,'version.sourceUrl')}),
    ...(o.publishedAt === undefined ? {} : {publishedAt:iso(o.publishedAt,'version.publishedAt')}),
    ...(o.effectiveAt === undefined ? {} : {effectiveAt:iso(o.effectiveAt,'version.effectiveAt')})
  };
  if (version.publication === 'published' && (!version.sourceComplete || !version.publishedAt)) fail('version.publication', 'publication requires complete verified text and time');
  if (version.effectiveAt && !['effective','repealed'].includes(version.status)) fail('version.effectiveAt', 'effective date contradicts version status');
  return Object.freeze(version);
}
export type SourceSpan = Readonly<{sourceVersionId:string;provisionId:string;start:number;end:number;quote:string;quoteHash:string;citationLabel:string;originalLocator:{page?:number;xmlId?:string;sourceRange?:string}}>;
export function parseSourceSpan(v: unknown, expectedVersion?: string): SourceSpan {
  const o = record(v,'span',['sourceVersionId','provisionId','start','end','quote','quoteHash','citationLabel','originalLocator']);
  const locator = record(o.originalLocator,'span.originalLocator',[],['page','xmlId','sourceRange']);
  const start = unsigned(o.start,'span.start'),end = unsigned(o.end,'span.end');
  if (end <= start || end - start > 20000) fail('span.end','range must be non-empty and bounded');
  const result:SourceSpan={sourceVersionId:id(o.sourceVersionId,'span.sourceVersionId'),provisionId:id(o.provisionId,'span.provisionId'),start,end,quote:string(o.quote,'span.quote',20000),quoteHash:sha(o.quoteHash,'span.quoteHash'),citationLabel:string(o.citationLabel,'span.citationLabel',250),originalLocator:{
    ...(locator.page === undefined ? {} : {page:positive(locator.page,'span.originalLocator.page',100000)}),
    ...(locator.xmlId === undefined ? {} : {xmlId:id(locator.xmlId,'span.originalLocator.xmlId')}),
    ...(locator.sourceRange === undefined ? {} : {sourceRange:string(locator.sourceRange,'span.originalLocator.sourceRange',250)})
  }};
  if (expectedVersion !== undefined && result.sourceVersionId !== expectedVersion) fail('span.sourceVersionId','wrong document version');
  return result;
}
export async function verifySourceSpan(v: unknown, context: {versionId:string;provisionId:string;text:string}): Promise<SourceSpan> {
  const span = parseSourceSpan(v, context.versionId);
  if (span.provisionId !== context.provisionId) fail('span.provisionId','not the selected provision');
  const codepoints=Array.from(context.text);
  if (span.end > codepoints.length) fail('span.end','source span exceeds Unicode code-point length');
  const exact=codepoints.slice(span.start,span.end).join('');
  if (exact !== span.quote) fail('span.quote','quote must match canonical source verbatim');
  const bytes=new TextEncoder().encode(exact);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  const hex=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(hex!==span.quoteHash) fail('span.quoteHash','quote hash mismatch');
  return span;
}
export const CLAIM_KINDS = ['bill_text','current_law','interpretation','hypothetical','prediction','attributed_position','unknown'] as const;
export const SUPPORT_STATES = ['supported','qualified','disputed','incomplete_source','unavailable'] as const;
export type Claim = Readonly<{id:string;kind:typeof CLAIM_KINDS[number];text:string;support:typeof SUPPORT_STATES[number];spans:SourceSpan[];qualifications:string[];attribution?:string;asOf?:string;jurisdiction?:string;estimateMethod?:{description:string;inputSpanIds:string[]}}>;
export function parseClaim(v:unknown, versionId:string):Claim {
  const o=record(v,'claim',['id','kind','text','support','spans','qualifications'],['attribution','asOf','jurisdiction','estimateMethod']);
  const kind=enumValue(o.kind,'claim.kind',CLAIM_KINDS),support=enumValue(o.support,'claim.support',SUPPORT_STATES);
  const spans=arr(o.spans,'claim.spans',40).map(s=>parseSourceSpan(s,versionId));
  const qualifications=arr(o.qualifications,'claim.qualifications',20).map((q,i)=>string(q,`claim.qualifications[${i}]`,500));
  if (support==='supported' && !spans.length) fail('claim.spans','supported material claim requires citations');
  if (kind==='unknown' && support==='supported') fail('claim.support','unknown cannot be supported');
  if (kind==='current_law' && (o.jurisdiction===undefined || o.asOf===undefined)) fail('claim','current law needs jurisdiction and dated independent sourcing');
  if (kind==='attributed_position' && o.attribution===undefined) fail('claim.attribution','attribution required');
  if (kind==='prediction' && o.estimateMethod===undefined) fail('claim.estimateMethod','prediction requires method and cited inputs');
  let estimateMethod:Claim['estimateMethod'];
  if (o.estimateMethod!==undefined){const method=record(o.estimateMethod,'claim.estimateMethod',['description','inputSpanIds']);estimateMethod={description:string(method.description,'claim.estimateMethod.description',500),inputSpanIds:arr(method.inputSpanIds,'claim.estimateMethod.inputSpanIds',40).map((x,i)=>id(x,`claim.estimateMethod.inputSpanIds[${i}]`))};if (!estimateMethod.inputSpanIds.length) fail('claim.estimateMethod.inputSpanIds','prediction needs sourced inputs');}
  return {id:id(o.id,'claim.id'),kind,text:string(o.text,'claim.text',10000),support,spans,qualifications,
    ...(o.attribution===undefined?{}:{attribution:string(o.attribution,'claim.attribution',250)}),
    ...(o.asOf===undefined?{}:{asOf:iso(o.asOf,'claim.asOf')}),
    ...(o.jurisdiction===undefined?{}:{jurisdiction:string(o.jurisdiction,'claim.jurisdiction',80)}),
    ...(estimateMethod===undefined?{}:{estimateMethod})};
}
export type ValidatedSegment=Readonly<{id:string;text:string;claimIds:string[];claims:Claim[];versionId:string;validation:{schema:string;retrievalConfig:string;promptConfig:string;validatorConfig:string;validatedAt:string}}>;
export function parseValidatedSegment(v:unknown, expectedVersion:string):ValidatedSegment {
  const o=record(v,'segment',['id','text','claimIds','claims','versionId','validation']);
  if (o.versionId!==expectedVersion) fail('segment.versionId','wrong document version');
  const claims=arr(o.claims,'segment.claims',30).map(c=>parseClaim(c,expectedVersion));
  const claimIds=arr(o.claimIds,'segment.claimIds',30).map((x,i)=>id(x,`segment.claimIds[${i}]`));
  const unique = new Set(claimIds);
  if (unique.size !== claimIds.length || unique.size !== claims.length || claims.some(c=>!unique.has(c.id))) fail('segment.claimIds','claims and ID index disagree');
  const validation=record(o.validation,'segment.validation',['schema','retrievalConfig','promptConfig','validatorConfig','validatedAt']);
  return {id:id(o.id,'segment.id'),text:string(o.text,'segment.text',20000),claimIds,claims,versionId:expectedVersion,validation:{schema:id(validation.schema,'segment.validation.schema'),retrievalConfig:sha(validation.retrievalConfig,'segment.validation.retrievalConfig'),promptConfig:sha(validation.promptConfig,'segment.validation.promptConfig'),validatorConfig:sha(validation.validatorConfig,'segment.validation.validatorConfig'),validatedAt:iso(validation.validatedAt,'segment.validation.validatedAt')}};
}
export type SemanticCue = Readonly<{type:'reference'|'emphasize'|'acknowledge'|'uncertain';segmentId:string;claimId?:string;spanIndex?:number}>;
export function parseSemanticCue(v:unknown, segment?:ValidatedSegment):SemanticCue {
  const base=record(v,'cue',['type','segmentId'],['claimId','spanIndex']);
  const type=enumValue(base.type,'cue.type',['reference','emphasize','acknowledge','uncertain'] as const);
  const segmentId=id(base.segmentId,'cue.segmentId');
  if (segment && segmentId!==segment.id) fail('cue.segmentId','cue targets the wrong validated segment');
  if (type==='acknowledge') {
    if (base.claimId!==undefined || base.spanIndex!==undefined) fail('cue','acknowledge cannot specify a claim/span');
    return {type,segmentId};
  }
  if (base.claimId===undefined) fail('cue.claimId','claim reference required');
  const claimId=id(base.claimId,'cue.claimId');
  const claim=segment?.claims.find(c=>c.id===claimId);
  if (segment && !claim) fail('cue.claimId','claim is not part of the validated segment');
  if (type==='reference') {
    if (base.spanIndex===undefined) fail('cue.spanIndex','span index required');
    const spanIndex=unsigned(base.spanIndex,'cue.spanIndex',39);
    if (claim && spanIndex>=claim.spans.length) fail('cue.spanIndex','citation span does not exist');
    return {type,segmentId,claimId,spanIndex};
  }
  if(base.spanIndex!==undefined) fail('cue.spanIndex','span index only valid on reference cue');
  return {type,segmentId,claimId};
}
export type AnswerEvent=Readonly<{schemaVersion:1;answerId:string;sequence:number;conversationEpoch:number;documentVersion:string;createdAt:string;type:string;segment?:ValidatedSegment;span?:SourceSpan;cue?:SemanticCue;audioId?:string;segmentId?:string;replacesSegmentId?:string;code?:string;recovery?:string}>;
export function parseAnswerEvent(v:unknown):AnswerEvent {
  const o=record(v,'event',['schemaVersion','answerId','sequence','conversationEpoch','documentVersion','createdAt','type'],['segment','span','cue','audioId','segmentId','replacesSegmentId','code','recovery']);
  if(o.schemaVersion!==1) fail('event.schemaVersion','unsupported contract version');
  const type=enumValue(o.type,'event.type',['answer.started','segment.validated','citation.ready','performance.cue','speech.ready','correction','answer.completed','answer.cancelled','answer.failed'] as const);
  const common={schemaVersion:1 as const,answerId:id(o.answerId,'event.answerId'),sequence:unsigned(o.sequence,'event.sequence'),conversationEpoch:unsigned(o.conversationEpoch,'event.conversationEpoch'),documentVersion:id(o.documentVersion,'event.documentVersion'),createdAt:iso(o.createdAt,'event.createdAt'),type};
  const declared:Record<typeof type,string[]>={
    'answer.started':[], 'segment.validated':['segment'], 'citation.ready':['span'], 'performance.cue':['cue'], 'speech.ready':['audioId','segmentId'], 'correction':['replacesSegmentId','segment'], 'answer.completed':[], 'answer.cancelled':[], 'answer.failed':['code','recovery']};
  const payload=new Set(declared[type]);
  for(const field of ['segment','span','cue','audioId','segmentId','replacesSegmentId','code','recovery']){
    if(payload.has(field) && (!own(o,field) || o[field]===undefined)) fail(`event.${field}`,'missing payload');
    if(!payload.has(field) && own(o,field)) fail(`event.${field}`,'field not allowed on event type');
  }
  return {...common,...(o.segment===undefined?{}:{segment:parseValidatedSegment(o.segment,common.documentVersion)}),
    ...(o.span===undefined?{}:{span:parseSourceSpan(o.span,common.documentVersion)}),
    ...(o.cue===undefined?{}:{cue:parseSemanticCue(o.cue)}),
    ...(o.audioId===undefined?{}:{audioId:id(o.audioId,'event.audioId')}),
    ...(o.segmentId===undefined?{}:{segmentId:id(o.segmentId,'event.segmentId')}),
    ...(o.replacesSegmentId===undefined?{}:{replacesSegmentId:id(o.replacesSegmentId,'event.replacesSegmentId')}),
    ...(o.code===undefined?{}:{code:id(o.code,'event.code')}),
    ...(o.recovery===undefined?{}:{recovery:string(o.recovery,'event.recovery',300)})};
}
export class AnswerStreamGuard {
  private last = -1;
  private complete = false;
  private readonly segments = new Map<string,ValidatedSegment>();
  constructor(readonly answerId:string,readonly versionId:string,readonly epoch:number) {}
  accept(raw:unknown):AnswerEvent {
    const e=parseAnswerEvent(raw);
    if(e.answerId!==this.answerId || e.documentVersion!==this.versionId || e.conversationEpoch!==this.epoch) fail('event','stale answer, epoch or document version');
    if(e.sequence<=this.last || this.complete) fail('event.sequence','replayed, unordered or terminal event');
    if(this.last===-1 && e.type!=='answer.started') fail('event.type','the first event must start the answer');
    if(this.last!==-1 && e.type==='answer.started') fail('event.type','an answer cannot be started twice');
    if(e.type==='segment.validated' && e.segment) this.segments.set(e.segment.id,e.segment);
    if(e.type==='correction' && e.segment && e.replacesSegmentId){if(!this.segments.has(e.replacesSegmentId))fail('event.replacesSegmentId','missing original segment');this.segments.set(e.segment.id,e.segment);}
    if(e.type==='performance.cue' && e.cue){const s=this.segments.get(e.cue.segmentId);if(!s)fail('event.cue','unvalidated segment');parseSemanticCue(e.cue,s);}
    if(e.type==='speech.ready' && e.segmentId && !this.segments.has(e.segmentId))fail('event.segmentId','speech requires validated segment');
    if(['answer.completed','answer.cancelled','answer.failed'].includes(e.type)) this.complete=true;
    this.last=e.sequence;
    return e;
  }
}
/** Server-side grounding must run this before publishing a structurally valid segment. */
export async function verifyValidatedSegment(
  v: unknown,
  versionId: string,
  lookup: (provisionId:string) => string | undefined
): Promise<ValidatedSegment> {
  const segment=parseValidatedSegment(v, versionId);
  for(const claim of segment.claims) {
    for(const span of claim.spans) {
      const text=lookup(span.provisionId);
      if(text===undefined)throw new ContractError('segment.claims.spans','unknown provision; cannot establish legal support');
      await verifySourceSpan(span,{versionId,provisionId:span.provisionId,text});
    }
  }
  return segment;
}
export const PUBLISHER_ROLES=['owner','editor','viewer'] as const;
export type PublisherRole=typeof PUBLISHER_ROLES[number];
export function parsePublisherRole(value:unknown):PublisherRole {return enumValue(value,'role',PUBLISHER_ROLES);}
export function rolePermits(role:unknown, action:'view'|'edit'|'publish'|'invite', mfaVerified:boolean):boolean {
  const r=parsePublisherRole(role);
  if(typeof mfaVerified!=='boolean')fail('role.mfaVerified','expected verified boolean');
  if(!['view','edit','publish','invite'].includes(action))fail('role.action','unknown action');
  if(action==='view')return true;
  if(r==='viewer')return false;
  if(action==='edit')return true;
  if(!mfaVerified)return false;
  return action==='publish' || (action==='invite'&&r==='owner');
}
export const REQUIRED_CLIPS=['Idle','WalkFunny','Talk','Wave','Point','Laugh','Celebrate'] as const;
export type CharacterManifest=Readonly<{assetVersion:string;sourceBlenderHash:string;toolchainHash:string;compatibility:{minContractVersion:number;maxContractVersion:number};lods:{name:'low'|'medium'|'high';uri:string;hash:string;transferBytes:number;triangles:number;materialCount:number}[];clips:{name:string;duration:number;loop:boolean;contacts:{time:number;foot:'left'|'right';down:boolean}[];nominalStride?:number;upperBodyMask?:string}[];morphs:string[];mouthMappingVersion:string;poster:{uri:string;hash:string};provenanceFile:string}>;
function assetUri(value:unknown,path:string):string {
  const valueString=string(value,path,300);
  if(!/^\/assets\/[a-zA-Z0-9/_-]+\.(?:glb|webp|png|jpg|json)$/.test(valueString)||valueString.includes('..')) fail(path,'asset must be a versioned same-origin path');
  return valueString;
}
export function parseCharacterManifest(value:unknown):CharacterManifest {
  const o=record(value,'manifest',['assetVersion','sourceBlenderHash','toolchainHash','compatibility','lods','clips','morphs','mouthMappingVersion','poster','provenanceFile']);
  const compat=record(o.compatibility,'manifest.compatibility',['minContractVersion','maxContractVersion']);
  const min=unsigned(compat.minContractVersion,'manifest.compatibility.minContractVersion',100),max=unsigned(compat.maxContractVersion,'manifest.compatibility.maxContractVersion',100);
  if(min>max || min>1 || max<1)fail('manifest.compatibility','schema v1 not supported');
  const lods=arr(o.lods,'manifest.lods',3).map((entry,i)=>{const p=`manifest.lods[${i}]`,v=record(entry,p,['name','uri','hash','transferBytes','triangles','materialCount']);return {name:enumValue(v.name,`${p}.name`,['low','medium','high'] as const),uri:assetUri(v.uri,`${p}.uri`),hash:sha(v.hash,`${p}.hash`),transferBytes:positive(v.transferBytes,`${p}.transferBytes`,50000000),triangles:unsigned(v.triangles,`${p}.triangles`,200000),materialCount:unsigned(v.materialCount,`${p}.materialCount`,128)};});
  if(!lods.length || new Set(lods.map(x=>x.name)).size!==lods.length)fail('manifest.lods','must include unique tiers');
  const clips=arr(o.clips,'manifest.clips',30).map((entry,i)=>{const p=`manifest.clips[${i}]`,v=record(entry,p,['name','duration','loop','contacts'],['nominalStride','upperBodyMask']);const duration=positive(v.duration,`${p}.duration`);const contacts=arr(v.contacts,`${p}.contacts`,200).map((c,j)=>{const q=`${p}.contacts[${j}]`,w=record(c,q,['time','foot','down']);const time=typeof w.time==='number'?w.time:NaN;if(!Number.isFinite(time)||time<0||time>duration)fail(`${q}.time`,'outside clip');return {time,foot:enumValue(w.foot,`${q}.foot`,['left','right'] as const),down:flag(w.down,`${q}.down`)};});return {name:string(v.name,`${p}.name`,40),duration,loop:flag(v.loop,`${p}.loop`),contacts,...(v.nominalStride===undefined?{}:{nominalStride:positive(v.nominalStride,`${p}.nominalStride`,10)}),...(v.upperBodyMask===undefined?{}:{upperBodyMask:id(v.upperBodyMask,`${p}.upperBodyMask`)})};});
  if(new Set(clips.map(x=>x.name)).size!==clips.length || REQUIRED_CLIPS.some(name=>!clips.some(c=>c.name===name)))fail('manifest.clips','required unique named animations are missing');
  if(clips.find(c=>c.name==='WalkFunny')?.loop!==true)fail('manifest.clips','WalkFunny must loop in place');
  const morphs=arr(o.morphs,'manifest.morphs',100).map((m,i)=>id(m,`manifest.morphs[${i}]`));
  if(!morphs.length || new Set(morphs).size!==morphs.length)fail('manifest.morphs','required distinct expression controls missing');
  const poster=record(o.poster,'manifest.poster',['uri','hash']);
  return {assetVersion:id(o.assetVersion,'manifest.assetVersion'),sourceBlenderHash:sha(o.sourceBlenderHash,'manifest.sourceBlenderHash'),toolchainHash:sha(o.toolchainHash,'manifest.toolchainHash'),compatibility:{minContractVersion:min,maxContractVersion:max},lods,clips,morphs,mouthMappingVersion:id(o.mouthMappingVersion,'manifest.mouthMappingVersion'),poster:{uri:assetUri(poster.uri,'manifest.poster.uri'),hash:sha(poster.hash,'manifest.poster.hash')},provenanceFile:assetUri(o.provenanceFile,'manifest.provenanceFile')};
}
