/** Private publisher catalog readiness derived only from verified repository metadata.
 * Informational: this must never authorize publication or replace server-side gates.
 */
const HASH=/^[0-9a-f]{64}$/i;
export function catalogReadiness(version, {translations=[]}={}) {
 if (!version || typeof version!=='object') throw new TypeError('version metadata required');
 const sourceHash=version.canonicalTextSha256;
 const issues=[];
 if (version.sourceComplete!==true) issues.push('SOURCE_INCOMPLETE');
 if ((version.warnings??[]).length || (version.errors??[]).length) issues.push('SOURCE_REVIEW_REQUIRED');
 if (!Array.isArray(version.reviewChecks) || new Set(version.reviewChecks).size<6) issues.push('PUBLICATION_REVIEW_INCOMPLETE');
 if (version.indexStatus!=='ready') issues.push('SEARCH_INDEX_NOT_READY');
 if (!HASH.test(sourceHash??'')) issues.push('SOURCE_DIGEST_UNVERIFIED');
 const translationStatuses=translations.map(translation=>{
  const language=typeof translation?.language==='string'?translation.language:'unknown';
  const stale=!HASH.test(sourceHash??'') ||
    !HASH.test(translation?.sourceCanonicalSha256??'') ||
    translation.sourceCanonicalSha256!==sourceHash;
  return Object.freeze({language,status:stale?'STALE_SOURCE':'SOURCE_MATCH',
   caution:'Source match does not verify translation quality or publication permission'});
 });
 return Object.freeze({issues:Object.freeze(issues),
  informationalReady:issues.length===0,
  translations:Object.freeze(translationStatuses),
  canPublish:false});
}
