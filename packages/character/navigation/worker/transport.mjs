/** AB-067/068: only serialize a freshly validated client-measured traversal graph. */
import {buildTraversalGraph} from '../graph.mjs';
/** Never post graph.reachable or any model/DOM-owned callback to a Worker. */
export function buildWorkerTraversalGraph(input){
 const graph=buildTraversalGraph(input);
 const nodes=Object.freeze(graph.nodes.map(n=>Object.freeze({id:n.id,x:n.x,y:n.y})));
 const edges=Object.freeze(graph.edges.map(e=>Object.freeze({from:e.from,to:e.to,cost:e.cost})));
 return Object.freeze({versionId:graph.versionId,layoutRevision:graph.layoutRevision,nodes,edges});
}
