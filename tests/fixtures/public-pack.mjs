import {createHash} from 'node:crypto';
export const hash=text=>createHash('sha256').update(text).digest('hex');
export const publisherId='11111111-1111-4111-8111-111111111111';
export const billId='22222222-2222-4222-8222-222222222222';
export const versionId='33333333-3333-4333-8333-333333333333';
export function publicPack(){
  const provisions=[
    {id:'section1',heading:'Section 1. Public access',text:'The proposed bill requires a public reading room. The reading room must provide free access to published documents.'},
    {id:'section2',heading:'Section 2. Exception',text:'The reading room must remain open each weekday, except when the building is closed for emergency repairs.'}
  ].map(item=>({...item,sha256:hash(item.text)}));
  return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId,billId,versionId,
    title:'Synthetic reading-room demonstration — not a real bill',jurisdiction:'Test jurisdiction',language:'en',status:'draft',
    publication:'published',sourceComplete:true,retrievedAt:'2026-10-17T00:00:00.000Z',publishedAt:'2026-10-17T01:00:00.000Z',
    canonicalSha256:hash(provisions.map(item=>item.text).join('\n\n')),provisions};
}
