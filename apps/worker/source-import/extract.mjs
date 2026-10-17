/** Read a single bounded private upload on stdin. No application credentials are inherited. */
import {parseTextOrMarkdown,parseDocx} from '../../../packages/content/parsers/index.mjs';
import {parseLegislativeXml} from '../../../packages/content/xml/index.mjs';
import {prepareOfflineXml} from '../../../packages/content/xml/prolog.mjs';
import {previewPdf} from '../../../packages/content/pdf/index.mjs';
import {scanQuarantinedBytes} from '../../../packages/content/intake/index.mjs';

const MAX_BYTES = 25 * 1024 * 1024, MAX_TEXT = 1500000;
const reject = () => { throw new Error('EXTRACTION_REJECTED'); };
function decodeXmlEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#(?:x[0-9a-fA-F]+|[0-9]+));/g,value => {
    const known = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
    if (Object.hasOwn(known,value)) return known[value];
    const point = value.startsWith('&#x') ? parseInt(value.slice(3,-1),16) : parseInt(value.slice(2,-1),10);
    if (!Number.isSafeInteger(point) || point < 1 || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) reject();
    return String.fromCodePoint(point);
  });
}
function chunksFor(text,headingPrefix = 'Passage') {
  const canonical = text.replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');
  if (Buffer.byteLength(canonical) > MAX_TEXT || !canonical.trim() || !canonical.isWellFormed() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(canonical)) reject();
  const pieces = []; let position = 0;
  // Normalize display block boundaries explicitly; original bytes and source offsets remain retained.
  while (position < canonical.length) {
    let end = Math.min(position+3800,canonical.length);
    if (end < canonical.length) {
      const paragraph = canonical.lastIndexOf('\n\n',end);
      const line = canonical.lastIndexOf('\n',end), space = canonical.lastIndexOf(' ',end);
      if (paragraph > position+300) end=paragraph;
      else if (line > position+300) end=line;
      else if (space > position+300) end=space;
      if (end > position && /[\uD800-\uDBFF]/.test(canonical[end-1])) end--;
    }
    const sourceStart = position;
    const body = canonical.slice(position,end).trim(); position = end;
    while (/\s/.test(canonical[position] ?? '') && position < canonical.length) position++;
    if (!body) continue;
    const firstLine = body.split('\n',1)[0].replace(/^#{1,6}\s+/, '').trim();
    const heading = firstLine.length > 3 && firstLine.length <= 140 ? firstLine : headingPrefix+' '+(pieces.length+1);
    pieces.push({heading,text:body,originalLocator:{sourceRange:'utf16:'+sourceStart+'-'+end}});
    if (pieces.length > 500) reject();
  }
  return pieces;
}

try {
  const [mime,versionId] = process.argv.slice(2); let size = 0; const input = [];
  for await (const chunk of process.stdin) { size += chunk.length; if (size > MAX_BYTES) reject(); input.push(chunk); }
  const bytes = Buffer.concat(input,size); scanQuarantinedBytes(bytes,mime);
  let text,warnings = [];
  if (mime === 'text/plain' || mime === 'text/markdown') {
    const parsed = parseTextOrMarkdown(bytes,mime); text = parsed.canonicalText; warnings = [...parsed.warnings];
  } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const parsed = parseDocx(bytes); text = parsed.canonicalText; warnings = [...parsed.warnings];
  } else if (mime === 'application/xml' || mime === 'text/xml') {
    const parsed = parseLegislativeXml(bytes,{versionId}); warnings = [...parsed.warnings];
    // Keep every XML text node, including preambles outside recognized sections. Never concatenate
    // parent and child provision aggregates, which would duplicate source words.
    const prepared=prepareOfflineXml(bytes.toString('utf8'),{allowCongressMetadata:true});
    text = decodeXmlEntities(prepared.xml
      .replace(/<\/(?:[a-zA-Z_][\w.-]*:)?(?:num|header|text|p|section|subsection|paragraph|subparagraph|clause|subclause|title|chapter|part|division|row|entry|note|enacting-clause|chapeau)\s*>/gi,'\n')
      .replace(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g,''));
  } else if (mime === 'application/pdf') {
    const parsed = await previewPdf(bytes,{maxPages:300,previewPages:[],ocr:true,includePrivatePng:false});
    if (parsed.pages !== parsed.processedPages) reject();
    text = parsed.pagesData.map(page => page.text).join('\n\n'); warnings = [...parsed.warnings];
  } else reject();
  const provisions = chunksFor(text);
  const canonicalText = provisions.map(provision => provision.text).join('\n\n');
  if (Buffer.byteLength(canonicalText) > MAX_TEXT) reject();
  process.stdout.write(JSON.stringify({parserVersion:'publisher-extract-v1',canonicalText,provisions,
    warnings:[...new Set([...warnings,'canonical_block_boundaries_normalized'])].slice(0,64)}));
} catch {
  process.stderr.write('EXTRACTION_REJECTED\n'); process.exitCode = 2;
}
