/** AB-023: immutable, tenant-and-version-pinned lexical search generations. */
import {createHash} from 'node:crypto';
export class SearchError extends Error { constructor(code){ super(code);this.name='SearchError';this.code=code; } }
const deny=c=>{throw new SearchError(c);};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const tokens=text=>Array.from(text.normalize('NFKC').toLocaleLowerCase('en-US').matchAll(/[\p{L}\p{N}]+/gu),m=>m[0]);
const normalize=text=>text.normalize('NFKC').toLocaleLowerCase('en-US');
const clean=(text,max)=>{if(typeof text!=='string'||Array.from(text).length>max)deny('INVALID_TEXT');for(const c of text){let n=c.codePointAt(0);if(n>=0xd800&&n<=0xdfff)deny('INVALID_UNICODE');}return text};
function id(input){if(typeof input!=='string'||!UUID.test(input))deny('INVALID_ID');return input.toLowerCase()}
function trimHash(h){if(typeof h!=='string'||!HASH.test(h))deny('INVALID_HASH');return h}
export function buildSearchGeneration({publisherId,versionId,provisions,sourceHash}={}){
 const pub=id(publisherId),version=id(versionId);trimHash(sourceHash);
 if(!Array.isArray(provisions)||provisions.length<1||provisions.length>20000)deny('PROVISION_COUNT');
 const ids=new Set();
 const entries=provisions.map(p=>{
  if(!p||typeof p!=='object'||id(p.publisherId)!==pub||id(p.versionId)!==version)deny('SOURCE_SCOPE');
  const provisionId=id(p.provisionId);
  if(ids.has(provisionId))deny('DUPLICATE_PROVISION');
  ids.add(provisionId);
  const text=clean(p.text,500000);
  if(!text.trim())deny('EMPTY_PROVISION');
  const originalHash=sha(text);
  if(p.textSha256!==originalHash)deny('SOURCE_HASH_MISMATCH');
  return Object.freeze({provisionId,publisherId:pub,versionId:version,textSha256:originalHash,
   text,normalizedText:normalize(text),terms:Object.freeze(tokens(text))});
 }).sort((a,b)=>a.provisionId.localeCompare(b.provisionId,'en'));
 const key=sha(JSON.stringify({publisherId:pub,versionId:version,sourceHash,entries:entries.map(e=>[e.provisionId,e.textSha256])}));
 return Object.freeze({generationHash:key,publisherId:pub,versionId:version,sourceHash,entries:Object.freeze(entries),
  state:'complete',entryCount:entries.length,publicationAllowed:false});
}
export function searchGeneration(generation,{publisherId,versionId,query,limit=15}={}){
 if(!generation||generation.state!=='complete'||generation.publisherId!==id(publisherId)||generation.versionId!==id(versionId))deny('INDEX_SCOPE');
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)deny('QUERY_LIMIT');
 const raw=clean(query,200).trim();
 if(raw.length<2)deny('QUERY_EMPTY');
 const q=normalize(raw),wordList=tokens(raw);
 if(wordList.length>30||(!wordList.length&&/^[\p{P}\p{Z}\s]+$/u.test(raw)))deny('QUERY_INVALID');
 const output=[];
 for(const entry of generation.entries){
  const exact=entry.normalizedText.includes(q),frequency=wordList.reduce((n,w)=>n+entry.terms.filter(t=>t===w).length,0);
  if(!exact&&frequency===0)continue;
  const all=wordList.every(w=>entry.terms.includes(w)),score=(exact?1000:0)+(all?100:0)+frequency;
  const pos=exact?entry.normalizedText.indexOf(q):-1;
  output.push({provisionId:entry.provisionId,sourceHash:entry.textSha256,
    score,matchedExactPhrase:exact,matchedAllTerms:all,normalizedPosition:pos,
    // The exact original source text remains authoritative; offsets from normalized text cannot be used as citations.
    text:entry.text,versionId:generation.versionId});
 }
 output.sort((a,b)=>b.score-a.score||a.provisionId.localeCompare(b.provisionId,'en'));
 return Object.freeze({generationHash:generation.generationHash,versionId:generation.versionId,publisherId:generation.publisherId,
  query:raw,results:Object.freeze(output.slice(0,limit).map(x=>Object.freeze(x))),truncated:output.length>limit,
  citationOffsetPolicy:'reverify-against-original-unicode-text'});
}
/** In-memory test-only pointer. Real durable activation uses PG transactional compare-and-swap. */
export class FixtureIndexPointer {
 #active=new Map();
 #token(p,v){return id(p)+':'+id(v)}
 get(publisherId,versionId){return this.#active.get(this.#token(publisherId,versionId))??null}
 swap(generation,{expectedPrevious=null}={}){
  const k=this.#token(generation.publisherId,generation.versionId),prior=this.#active.get(k)??null;
  if(generation.state!=='complete'||(prior?.generationHash??null)!==expectedPrevious)deny('INDEX_ACTIVATION_CONFLICT');
  this.#active.set(k,generation);
  return Object.freeze({previous:prior?.generationHash??null,current:generation.generationHash,versionId:generation.versionId});
 }
}
export function sqlSearchQuery({publisherId,versionId,query,limit=15}={}){
 const pub=id(publisherId),version=id(versionId),words=clean(query,200).trim();
 if(words.length<2||!Number.isSafeInteger(limit)||limit<1||limit>50)deny('QUERY_INVALID');
 return Object.freeze({sql:"SELECT e.provision_id, e.canonical_text, e.text_sha256, ts_rank(e.search_vector, plainto_tsquery('english',$3::text)) AS rank FROM ask_bill.search_active a JOIN ask_bill.search_entries e ON e.publisher_id=a.publisher_id AND e.version_id=a.version_id AND e.generation_id=a.generation_id WHERE a.publisher_id=$1::uuid AND a.version_id=$2::uuid AND e.search_vector @@ plainto_tsquery('english',$3::text) ORDER BY rank DESC,e.provision_id ASC LIMIT $4::integer",
  params:Object.freeze([pub,version,words,limit])});
}
