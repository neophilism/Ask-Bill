/** AB-033: exact-source validation plus an independently configured model review.
 * A model review is fallible. Its approval is a server capability, never a client flag.
 */
import {createHash} from 'node:crypto';
import {verifyValidatedSegment} from '../../contracts/dist/index.js';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const REVIEWED_VALIDATOR = hash('ask-bill:ab033:exact-spans-and-independent-model-review:v1');
const issued = new WeakSet();
const spoken = new WeakSet();
export class SemanticReviewError extends Error {
  constructor(code) { super(code); this.name = 'SemanticReviewError'; this.code = code; }
}
const fail = code => { throw new SemanticReviewError(code); };
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function isReviewedGrant(value) { return issued.has(value); }
export function consumeReviewedGrant(value) { return issued.delete(value); }
export function isSpeakableReviewedSegment(value) { return spoken.has(value); }

/** No raw text, unreviewed introduction, or unsupported claim can be attached to a grant. */
export async function approveModelReviewedSegment({held, evidence, draft, bundle, review, segmentId = 'segment-1'} = {}) {
  if (!held || held.status !== 'awaiting_semantic_review' || held.sourcesVerified !== true ||
      held.displayAllowed !== false || !held.segment || held.documentVersion !== evidence?.versionId ||
      evidence.status !== 'source_evidence' || evidence.truncated || evidence.unresolvedReferences?.length ||
      !Array.isArray(evidence.included) || !evidence.included.length) fail('INCOMPLETE_REVIEW_CONTEXT');
  if (!review || review.status !== 'model_review' || review.versionId !== held.documentVersion ||
      review.draftSha256 !== hash(draft) || review.evidenceSha256 !== hash(bundle) ||
      review.allMaterialTextSupported !== true || review.exceptionsPreserved !== true || review.statusAccurate !== true ||
      !Array.isArray(review.claims) || review.claims.length !== held.segment.claims.length ||
      !Array.isArray(review.reasonCodes) || review.reasonCodes.length) fail('INDEPENDENT_REVIEW_REJECTED');
  const claims = held.segment.claims;
  if (draft.text !== claims.map(claim => claim.text).join('\n\n') || held.segment.text !== draft.text) fail('UNREVIEWED_MATERIAL_TEXT');
  const sources = new Map();
  for (const source of evidence.included) {
    if (source.versionId !== held.documentVersion || source.sha256 !== hash(source.text) || sources.has(source.provisionId)) fail('SOURCE_INTEGRITY');
    sources.set(source.provisionId, source.text);
  }
  const seen = new Set();
  for (const judgment of review.claims) {
    if (!Number.isSafeInteger(judgment.index) || judgment.index < 0 || judgment.index >= claims.length || seen.has(judgment.index) ||
        judgment.supported !== true || !Array.isArray(judgment.caveats) || judgment.caveats.length !== 0) fail('CLAIM_REVIEW_REJECTED');
    seen.add(judgment.index);
  }
  // Attributed viewpoints require separate publisher-reviewed position records; a
  // source-only model review cannot promote them or current-law/prediction claims.
  if (claims.some(claim => !['bill_text', 'interpretation', 'hypothetical'].includes(claim.kind) ||
      claim.support !== 'qualified' || claim.spans.length !== 1)) fail('CLAIM_TYPE_REQUIRES_OTHER_EVIDENCE');
  for (const marker of evidence.exceptionMarkers ?? []) {
    if (!sources.has(marker.sourceId) || !bundle.sources.some(source => source.provisionId === marker.sourceId && source.text === sources.get(marker.sourceId))) {
      fail('EXCEPTION_CONTEXT_MISSING');
    }
  }
  const segment = {...held.segment, id: segmentId,
    claims: claims.map((claim, index) => ({...claim, support: 'supported', qualifications: [
      'AI explanation checked against the cited version; the review can still be wrong. Inspect the exact source.',
      ...(claim.kind === 'hypothetical' ? ['Illustrative hypothetical, not a forecast or a statement of current law.'] : []),
      ...review.claims.find(judgment => judgment.index === index).caveats
    ]})), validation: {...held.segment.validation, validatorConfig: REVIEWED_VALIDATOR}};
  try { await verifyValidatedSegment(segment, held.documentVersion, id => sources.get(id)); }
  catch { fail('CITATION_REVALIDATION_FAILED'); }
  freeze(segment);
  const grant = Object.freeze({segment, versionId: held.documentVersion, reviewMethod: 'independent_model_with_exact_source_checks'});
  issued.add(grant); spoken.add(segment);
  return grant;
}
