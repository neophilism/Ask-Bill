/** Exact publisher attestations shared by catalog reporting and durable release checks. */
export const PUBLISHER_REVIEW_CHECKS=Object.freeze(['source_complete','extraction_verified','citations_exact',
  'exceptions_reviewed','index_complete','rights_verified']);
export function completePublisherReview(value){
  return Array.isArray(value)&&value.length===PUBLISHER_REVIEW_CHECKS.length&&
    PUBLISHER_REVIEW_CHECKS.every(check=>value.includes(check));
}

