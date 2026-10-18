/** Private publisher readiness is informational, never a publish authorization. */
const HASH=/^[0-9a-f]{64}$/i;
export function catalogReadiness(version,{translations=[]}={}) {
 if(!version||typeof version!=='object'||Array.isArray(version))throw new TypeError('version metadata required');
 if(!Array.isArray(translations)||translations.length>100)throw new TypeError('invalid translation catalog');
 const sourceHash=version.canonicalTextSha256,issues=[];
 if(version.sourceComplete!==true)issues.push('SOURCE_INCOMPLETE');
 if(!Array.isArray(version.warnings)||!Array.isArray(version.errors)||
    version.warnings.length||version.errors.length)issues.push('SOURCE_REVIEW_REQUIRED');
 if(!Array.isArray(version.reviewChecks)||new Set(version.reviewChecks).size<6)
    issues.push('PUBLICATION_REVIEW_INCOMPLETE');
 if(version.indexStatus!=='ready')issues.push('SEARCH_INDEX_NOT_READY');
 if(typeof sourceHash!=='string'||!HASH.test(sourceHash))issues.push('SOURCE_DIGEST_UNVERIFIED');
 const translationStatuses=translations.map(translation=>{
   const language=typeof translation?.language==='string'?translation.language:'unknown';
   const stale=typeof sourceHash!=='string'||!HASH.test(sourceHash)||
      typeof translation?.sourceCanonicalSha256!=='string'||
      !HASH.test(translation.sourceCanonicalSha256)||
      translation.sourceCanonicalSha256.toLowerCase()!==sourceHash.toLowerCase();
   return Object.freeze({language,status:stale?'STALE_SOURCE':'SOURCE_MATCH',
     caution:'Source match does not verify translation quality or publication permission'});
 });
 if(translationStatuses.some(t=>t.status==='STALE_SOURCE'))issues.push('TRANSLATION_SOURCE_STALE');
 return Object.freeze({issues:Object.freeze(issues),informationalReady:issues.length===0,
   translations:Object.freeze(translationStatuses),canPublish:false});
}
