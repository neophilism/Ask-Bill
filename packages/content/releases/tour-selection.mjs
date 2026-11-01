/** Snapshot only verified source IDs. Private wording never enters a tour release. */
export function snapshotTourSteps(draft,{versionId,canonicalSha256,provisions}){
 if(!draft)return undefined;
 if(draft.source_sha256!==canonicalSha256||!Array.isArray(draft.step_ids)||
    draft.step_ids.length<1||draft.step_ids.length>12||
    new Set(draft.step_ids).size!==draft.step_ids.length)throw new Error('TOUR_SOURCE_INVALID');
 const allowed=new Set(provisions.map(p=>p.id));
 if(!Array.from(draft.step_ids).every(id=>typeof id==='string'&&allowed.has(id)))throw new Error('TOUR_SOURCE_INVALID');
 return Object.freeze(draft.step_ids.map(id=>'s'+id.replaceAll('-','').toLowerCase()));
}
export function validatedPublishedTourSteps(value,provisions){
 if(!Array.isArray(value)||value.length<1||value.length>12||
    new Set(value).size!==value.length)return undefined;
 const allowed=new Set(provisions.map(p=>p.id));
 if(!Array.from(value).every(id=>typeof id==='string'&&allowed.has(id)))return undefined;
 return Object.freeze([...value]);
}
