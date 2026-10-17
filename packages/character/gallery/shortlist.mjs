/** Local-only character audition and opt-in shortlist helpers.
 * Never infer character choices from demographic traits or persist question text.
 * A shortlist is deliberately capped at seven, roughly the top third of twenty.
 */
export const MAX_SHORTLIST=7;
const ID=/^bill-(?:0[1-9]|1[0-9]|20)$/;

export function safeRoster(value) {
  if (!value || !Array.isArray(value.characters) || value.characters.length!==20) throw new TypeError('Expected 20 characters');
  const ids=new Set();
  for(const c of value.characters){
    if(!c || typeof c.id!=='string' || !ID.test(c.id) || ids.has(c.id) || typeof c.name!=='string' || c.name.length>120 || typeof c.personality!=='string'){
      throw new TypeError('Invalid character roster');
    }
    ids.add(c.id);
  }
  if(value.default!=='bill-10')throw new TypeError('Unexpected audition default');
  return value.characters;
}
export function normalizeShortlist(value, validIds) {
  const allowed=new Set(validIds);
  if(!Array.isArray(value))return [];
  const result=[];
  for(const id of value.slice(0,100)){
    if(typeof id==='string' && ID.test(id) && allowed.has(id) && !result.includes(id))result.push(id);
    if(result.length>=MAX_SHORTLIST)break;
  }
  return result;
}
export function toggleShortlist(current,id,validIds) {
  const allowed=new Set(validIds),list=normalizeShortlist(current,validIds);
  if(typeof id!=='string'||!ID.test(id)||!allowed.has(id))return {list,error:'Unknown character'};
  if(list.includes(id))return {list:list.filter(x=>x!==id),error:null};
  if(list.length===MAX_SHORTLIST)return {list,error:'Your shortlist already has seven characters. Remove one first.'};
  return {list:[...list,id],error:null};
}
export function feedbackJson(shortlist,roster,defaultId) {
  const items=roster.map(({id,name,form,personality})=>({id,name,form,personality}));
  const selected=normalizeShortlist(shortlist,items.map(x=>x.id));
  const chosen=items.some(x=>x.id===defaultId)?defaultId:'bill-10';
  // This contains ONLY character IDs and public style metadata, no identifiers,
  // demographic characteristics, spoken words, document text or tracking.
  return JSON.stringify({schemaVersion:1,product:'Ask Bill',experiment:'20-character-audition',
    chosenCharacter:chosen,shortlist:selected,candidates:items.filter(x=>selected.includes(x.id))},null,2)+'\n';
}
