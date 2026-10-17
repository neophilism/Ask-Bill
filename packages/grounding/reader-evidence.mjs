/** AB-031/091: bridge immutable public reader anchors to bounded retrieval. */
import {createHash} from 'node:crypto';
import {validatePublishedReaderPack} from '../ui/reader/index.mjs';
import {buildRelationGraph, expandEvidenceGraph} from '../content/references/index.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const stop = new Set('a an and are as at be bill by can do does for from how i in is it of on or that the this to what when which who will with would'.split(' '));
const words = text => [...new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => !stop.has(word)))].slice(0,60);
export function buildReaderEvidence({pack, question, selectedSpan = null, maxSources = 20, maxCharacters = 38000} = {}) {
  const source = validatePublishedReaderPack(pack);
  if (typeof question !== 'string' || question.length > 2000) throw Error('QUESTION_LIMIT');
  let selected = null;
  if (selectedSpan) {
    selected = source.provisions.find(section => section.id === selectedSpan.provisionId);
    if (!selected || !Number.isSafeInteger(selectedSpan.start) || !Number.isSafeInteger(selectedSpan.end) ||
        selectedSpan.start < 0 || selectedSpan.end <= selectedSpan.start || selectedSpan.end > Array.from(selected.text).length ||
        Array.from(selected.text).slice(selectedSpan.start, selectedSpan.end).join('') !== selectedSpan.quote) throw Error('SELECTION_INVALID');
  }
  const terms = words(question);
  const ranked = source.provisions.map((section, index) => {
    const body = section.text.normalize('NFKC').toLowerCase(), heading = section.heading.toLowerCase();
    const tokens = new Set(words(section.text));
    const score = (selected?.id === section.id ? 10000 : 0) + terms.reduce((sum, term) => sum +
      (tokens.has(term) ? 5 : body.includes(term) ? 1 : 0) + (heading.includes(term) ? 8 : 0), 0);
    return {section, score, index};
  }).filter(item => item.score > 0).sort((a,b) => b.score - a.score || a.index - b.index);
  const overview = /\b(?:summary|summarize|overview|purpose|main (?:changes|points)|what (?:does|is) (?:this|the) bill)\b/i.test(question);
  const seeds = ranked.slice(0,5).map(item => item.section.id);
  if (!seeds.length && overview) seeds.push(...source.provisions.slice(0,5).map(section => section.id));
  if (!seeds.length) return {status:'no_evidence', versionId:source.versionId};
  // A short bill's complete context is cheap and prevents lexical ranking from
  // hiding an exception stated in a different, otherwise nonmatching section.
  const wholeFits=source.provisions.length<=maxSources&&source.provisions.every(section=>section.text.length<=5000)&&
    source.provisions.reduce((total,section)=>total+section.text.length,0)<=maxCharacters;
  const critical=source.provisions.filter(section=>/\b(?:except\w*|exclus\w*|excludes?|unless|notwithstanding|does not apply|shall not apply|subject to|limitations?|definitions?)\b/i.test(section.heading+'\n'+section.text));
  for(const section of (wholeFits?source.provisions:critical))if(!seeds.includes(section.id))seeds.push(section.id);
  if(seeds.length>maxSources)return {status:'no_evidence',reason:'EXCEPTION_CONTEXT_LIMIT',versionId:source.versionId};
  const graph = buildRelationGraph({versionId:source.versionId, provisions:source.provisions.map(section => ({
    id:section.id, versionId:source.versionId, text:section.text, label:section.heading, heading:section.heading, kind:'section'
  }))});
  // Include sections that point back to a selected rule as well as its outbound
  // references; amendments and limitations often use this shape.
  for(const edge of graph.edges)if(seeds.includes(edge.to)&&!seeds.includes(edge.from))seeds.push(edge.from);
  if(seeds.length>maxSources)return {status:'no_evidence',reason:'REFERENCE_CONTEXT_LIMIT',versionId:source.versionId};
  const expanded = expandEvidenceGraph(graph, seeds, {maxDepth:3, maxNodes:maxSources});
  let count = 0, truncated = expanded.truncated;
  const included = [];
  for (const node of expanded.sources) {
    // Never silently clip a section or remove a decisive exception to fit a prompt.
    if (node.text.length > 5000 || count + node.text.length > maxCharacters) { truncated = true; continue; }
    count += node.text.length;
    included.push(Object.freeze({provisionId:node.id, versionId:source.versionId, text:node.text, sha256:hash(node.text)}));
  }
  if (!included.length) return {status:'no_evidence', reason:'SOURCE_WINDOW_REQUIRES_SELECTION', versionId:source.versionId};
  const evidence = Object.freeze({status:'source_evidence', publisherId:source.publisherId, versionId:source.versionId,
    included:Object.freeze(included), exceptionMarkers:expanded.exceptions, unresolvedReferences:expanded.unresolved,
    truncated, configSha256:hash('ask-bill:reader-evidence:lexical-and-references:v1')});
  const bundle = Object.freeze({publisherId:source.publisherId, versionId:source.versionId, isPublished:true,
    sources:Object.freeze(included.map(item => Object.freeze({...item}))), sourceStatus:source.status});
  return {status:'source_evidence', evidence, bundle};
}
