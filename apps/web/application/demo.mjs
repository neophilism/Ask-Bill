/** Entirely synthetic complete document for explicit local demo mode only. */
import {createHash} from 'node:crypto';
export const demoPublisherId='11111111-1111-4111-8111-111111111111';
const hash=text=>createHash('sha256').update(text).digest('hex');
export function demoPack(){
  const provisions=[
    {id:'section1',heading:'Section 1. Public reading room',text:'This synthetic proposal would establish a public reading room. Published documents would be available to read without an account or a fee.'},
    {id:'section2',heading:'Section 2. Opening times and exception',text:'The reading room would open each weekday from 9 a.m. to 5 p.m., except when emergency repairs require the building to close.'},
    {id:'section3',heading:'Section 3. Status of this demonstration',text:'This document is made-up demonstration text, not a real bill, enacted law, or an official government publication. Its three sections are the entire demonstration document.'}
  ].map(section=>Object.freeze({...section,sha256:hash(section.text)}));
  return Object.freeze({schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId:demoPublisherId,
    billId:'22222222-2222-4222-8222-222222222222',versionId:'33333333-3333-4333-8333-333333333333',
    title:'Reading room demonstration — synthetic, not a real bill',jurisdiction:'Local demonstration',language:'en',status:'draft',
    publication:'published',sourceComplete:true,retrievedAt:'2026-10-17T00:00:00.000Z',publishedAt:'2026-10-17T00:00:00.000Z',
    canonicalSha256:hash(provisions.map(section=>section.text).join('\n\n')),provisions:Object.freeze(provisions)});
}
