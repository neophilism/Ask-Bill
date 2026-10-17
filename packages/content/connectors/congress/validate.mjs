/** AB-020: fail-closed validation of official legislative version metadata. */
export class CongressMetadataError extends Error {constructor(code){super(code);this.code=code;this.name='CongressMetadataError';}}
const fail=code=>{throw new CongressMetadataError(code)};
export function validateCongressDate(raw){
 if(typeof raw!=='string'||raw.length>40||!/^(?:18|19|20)\d\d-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{1,3})?Z)?$/.test(raw))fail('TEXT_DATE_INVALID');
 const ms=Date.parse(raw);
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==raw.slice(0,10))fail('TEXT_DATE_INVALID');
 if(raw.includes('T')){
  const normalized=raw.replace(/(?:\.(\d{1,3}))?Z$/,(_m,f)=>'.'+(f??'').padEnd(3,'0')+'Z');
  if(new Date(ms).toISOString()!==normalized)fail('TEXT_DATE_INVALID');
 }
 return raw;
}
const printable=text=>typeof text==='string'&&text.trim()===text&&text.length>=1&&text.length<=120&&!/[\u0000-\u001f\u007f<>]/.test(text);
export function validateTextVersion(item){
 if(!item||typeof item!=='object'||Array.isArray(item)||!printable(item.type)||!Array.isArray(item.formats)||item.formats.length>16)fail('TEXT_VERSION_INVALID');
 validateCongressDate(item.date);
 for(const f of item.formats)if(!f||typeof f!=='object'||Array.isArray(f)||!printable(f.type))fail('TEXT_VERSION_INVALID');
 return item;
}
export function validatePaginationCount(count){
 if(count===undefined)return null;
 if(!Number.isSafeInteger(count)||count<0||count>4000)fail('TEXT_PAGINATION_INVALID');
 return count;
}
