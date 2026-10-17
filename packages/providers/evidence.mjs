import {createHash} from 'node:crypto';
import {failProvider as fail} from './errors.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/;
export const safeText = (value, limit) => typeof value === 'string' && value.trim().length > 0 &&
  value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) && value.isWellFormed();
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function knownKeys(value, keys, code = 'PROVIDER_OUTPUT_INVALID') {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key))) fail(code);
}
export function freezeProviderValue(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeProviderValue(child);
    Object.freeze(value);
  }
  return value;
}

/** Server-granted scope, complete public sources, and content hashes precede every model call. */
export function providerEvidence(request, {strict = false, questionRequired = true} = {}) {
  const route = request?.route;
  if (!route || route.status !== 'allowed' || route.notLegalAdvice !== true ||
      route.sourcePublished !== true || route.noModelToolExecution !== true ||
      !Array.isArray(route.allowedVersionIds) || route.allowedVersionIds.length !== 1 ||
      route.allowedVersionIds[0] !== route.versionId || typeof route.publisherId !== 'string' ||
      !UUID.test(route.publisherId) || typeof route.versionId !== 'string' || !UUID.test(route.versionId) ||
      !Array.isArray(route.allowedReadTools) || !route.allowedReadTools.includes('read_selected_version') ||
      (strict && (route.sourceComplete !== true || route.allowedReadTools.some(x => x !== 'read_selected_version')))) fail('ROUTE_NOT_APPROVED');
  if (route.category === 'current_law') fail('CURRENT_LAW_EVIDENCE_REQUIRED');
  if (questionRequired && (!safeText(request.question, 2000) || request.question.trim().length < 3 ||
      sha256(request.question.trim()) !== route.questionSha256)) fail('QUESTION_MISMATCH');
  const bundle = request.bundle;
  if (!bundle || bundle.publisherId !== route.publisherId || bundle.versionId !== route.versionId ||
      bundle.isPublished !== true || !Array.isArray(bundle.sources) || bundle.sources.length < 1 ||
      bundle.sources.length > 30 || (strict && (bundle.truncated === true ||
        (bundle.unresolvedReferences !== undefined && (!Array.isArray(bundle.unresolvedReferences) || bundle.unresolvedReferences.length > 0))))) fail('EVIDENCE_NOT_APPROVED');
  let total = 0; const sources = [], ids = new Set();
  for (const source of bundle.sources) {
    if (!source || !safeText(source.text, 5000) || typeof source.provisionId !== 'string' ||
        !SOURCE_ID.test(source.provisionId) || source.versionId !== route.versionId ||
        !/^[a-f0-9]{64}$/.test(source.sha256 ?? '') || sha256(source.text) !== source.sha256 ||
        ids.has(source.provisionId)) fail('EVIDENCE_INVALID');
    ids.add(source.provisionId); total += source.text.length;
    if (total > 40000) fail('EVIDENCE_LIMIT');
    sources.push(Object.freeze({provisionId:source.provisionId, sha256:source.sha256, text:source.text}));
  }
  const exceptionSourceIds = bundle.exceptionSourceIds ?? [];
  if (!Array.isArray(exceptionSourceIds) || exceptionSourceIds.length > 30 ||
      exceptionSourceIds.some(id => !ids.has(id)) || new Set(exceptionSourceIds).size !== exceptionSourceIds.length) fail('EVIDENCE_INVALID');
  const sourceStatus = bundle.sourceStatus ?? 'unknown';
  if (!['draft','introduced','amended','passed_one_chamber','enacted','effective','repealed','unknown'].includes(sourceStatus)) fail('EVIDENCE_INVALID');
  return Object.freeze({route:Object.freeze({versionId:route.versionId,publisherId:route.publisherId,
    category:route.category, readingLevel:route.readingLevel ?? 'standard'}),
  question:questionRequired ? request.question.trim() : undefined,
  sources:Object.freeze(sources), sourceStatus, exceptionSourceIds:Object.freeze([...exceptionSourceIds])});
}

const CLAIM_KEYS = ['kind','sourceId','quote','occurrence','claimText','attribution'];
const KINDS = ['bill_text','interpretation','hypothetical','attributed_position','unknown'];

/** This verifies source candidates, not the truth of paraphrases; semantic review remains required. */
export function normalizeProviderCandidate(candidate, sources) {
  knownKeys(candidate, ['text','claims']);
  if (!safeText(candidate.text, 5000) || !Array.isArray(candidate.claims) ||
      candidate.claims.length < 1 || candidate.claims.length > 20) fail('PROVIDER_OUTPUT_INVALID');
  const claims = candidate.claims.map(claim => {
    knownKeys(claim, CLAIM_KEYS);
    if (!KINDS.includes(claim.kind) || !safeText(claim.claimText, 4000)) fail('PROVIDER_CLAIM_INVALID');
    const normalized = {kind:claim.kind, claimText:claim.claimText};
    if (claim.kind === 'unknown') {
      if (['sourceId','quote','occurrence','attribution'].some(key => claim[key] !== undefined && claim[key] !== null)) fail('PROVIDER_CLAIM_INVALID');
      return Object.freeze(normalized);
    }
    const source = sources.find(row => row.provisionId === claim.sourceId);
    if (!source || !safeText(claim.quote, 4000) || !source.text.includes(claim.quote)) fail('PROVIDER_CITATION_INVALID');
    normalized.sourceId = claim.sourceId; normalized.quote = claim.quote;
    if (claim.occurrence !== undefined && claim.occurrence !== null) {
      if (!Number.isSafeInteger(claim.occurrence) || claim.occurrence < 0 || claim.occurrence > 1000) fail('PROVIDER_CITATION_INVALID');
      normalized.occurrence = claim.occurrence;
    }
    if (claim.kind === 'attributed_position') {
      if (!safeText(claim.attribution, 200)) fail('PROVIDER_CLAIM_INVALID');
      normalized.attribution = claim.attribution;
    } else if (claim.attribution !== undefined && claim.attribution !== null) fail('PROVIDER_CLAIM_INVALID');
    return Object.freeze(normalized);
  });
  // Ensures every displayed sentence belongs to an independently reviewed claim.
  if (candidate.text !== claims.map(claim => claim.claimText).join('\n\n')) fail('PROVIDER_UNACCOUNTED_TEXT');
  return Object.freeze({text:candidate.text, claims:Object.freeze(claims)});
}

/** Hash the full values, including scope and metadata; callers use the same helpers before emission. */
export function hashProviderDraft(draft) {
  try { return sha256(JSON.stringify(draft)); } catch { fail('PROVIDER_REVIEW_INPUT'); }
}
export function hashProviderEvidence(bundle) {
  try { return sha256(JSON.stringify(bundle)); } catch { fail('PROVIDER_REVIEW_INPUT'); }
}
