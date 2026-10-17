/** Pure offline XML preparation. Recognizing metadata never authenticates a source. */
const MAX_SOURCE=25*1024*1024,MAX_PROLOG=1024;
const DECLARATION='<?xml version="1.0"?>';
// Verified byte-for-byte in public BILLS-119hr123ih.xml (Congress.gov and GovInfo):
// https://www.govinfo.gov/content/pkg/BILLS-119hr123ih/xml/BILLS-119hr123ih.xml
// Original SHA-256: 6e28624dac5abaf462edd60e3c090291afa9280596b5dd93369f7297a54a2caf.
// These names are ignored metadata, never paths to load or authorities to trust.
const DOCTYPE='<!DOCTYPE bill PUBLIC "-//US Congress//DTDs/bill.dtd//EN" "bill.dtd">';
const STYLESHEET='<?xml-stylesheet type="text/xsl" href="billres.xsl"?>';
const XML_DECLARATION=/^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*\?>$/;
export class OfflineXmlPrologError extends Error {
  constructor(code){super(code);this.name='OfflineXmlPrologError';this.code=code;}
}
const fail=code=>{throw new OfflineXmlPrologError(code)};

/** Mask supported declarations without changing any source offset or original bytes. */
export function prepareOfflineXml(source,{allowCongressMetadata=false}={}) {
  if(typeof source!=='string'||source.length<1||source.length>MAX_SOURCE||typeof allowCongressMetadata!=='boolean')fail('XML_PROLOG_INPUT');
  const ranges=[];let at=0,declaration=null;
  if(source[0]==='\ufeff'){ranges.push([0,1]);at=1;}
  if(source.startsWith('<?xml',at)&&/[ \t\r\n?]/.test(source[at+5]??'')){
    const end=source.indexOf('?>',at);
    if(end<0||end+2>MAX_PROLOG)fail('XML_PROLOG_LIMIT');
    declaration=source.slice(at,end+2);
    if(!XML_DECLARATION.test(declaration))fail('XML_PROLOG_UNSUPPORTED');
    ranges.push([at,end+2]);at=end+2;
  }
  const skipWhitespace=()=>{
    while(/[ \t\r\n]/.test(source[at]??'')){if(++at>MAX_PROLOG)fail('XML_PROLOG_LIMIT');}
  };
  skipWhitespace();
  const ignored=new Set();
  for(let count=0;count<2;count++){
    const token=source.startsWith(DOCTYPE,at)?DOCTYPE:source.startsWith(STYLESHEET,at)?STYLESHEET:null;
    if(!token)break;
    if(!allowCongressMetadata||ignored.has(token))fail('XML_PROLOG_UNSUPPORTED');
    ignored.add(token);ranges.push([at,at+token.length]);at+=token.length;
    if(at>MAX_PROLOG)fail('XML_PROLOG_LIMIT');
    skipWhitespace();
  }
  if(ignored.size&&
    (declaration!==DECLARATION||ignored.size!==2||!/^<bill(?:[ \t\r\n]|\/?>)/.test(source.slice(at,at+16))))
    fail('XML_PROLOG_UNSUPPORTED');
  let xml='',position=0;
  for(const [start,end] of ranges){
    xml+=source.slice(position,start)+source.slice(start,end).replace(/[^\r\n]/g,' ');position=end;
  }
  xml+=source.slice(position);
  // Nothing else may carry processing instructions, declarations or entities.
  // Comments remain inert and are handled by the existing bounded tree parser.
  if(/<\?|<!(?!--)/.test(xml))fail('XML_PROLOG_UNSUPPORTED');
  return Object.freeze({xml,warnings:Object.freeze(ignored.size?
    ['known_bill_dtd_ignored_offline','known_bill_stylesheet_ignored_offline']:[])});
}
