import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTextOrMarkdown,parseDocx,ParserError} from '../packages/content/parsers/index.mjs';
import {pack,docxFixture,docxMime} from './fixtures/createDocx.mjs';
test('text keeps source bytes and line locators across emoji and CRLF',()=>{
 const raw='§ One 😃\r\nTwo’s clause\r\n';
 const doc=parseTextOrMarkdown(Buffer.from(raw),'text/plain');
 assert.equal(doc.canonicalText,raw);assert.equal(doc.blocks[0].sourceEnd,7);assert.equal(doc.blocks[1].locator.line,2);assert.equal(doc.blocks[1].sourceStart,9);
 assert.equal(doc.sourceComplete,false);assert.equal(doc.publicationAllowed,false);
});
test('Markdown identifies headings, lists, footnotes and tables without rewriting wording',()=>{
 const raw='# Bill Title\n## Exceptions\n- Except when eligible\n| Name | Rule |\n[^a]: Source\n<script>bad</script>';
 const doc=parseTextOrMarkdown(Buffer.from(raw),'text/markdown');
 assert.deepEqual(doc.headings.map(x=>x.level),[1,2]);
 assert.deepEqual(doc.blocks.slice(2,5).map(x=>x.kind),['list','table','footnote']);
 assert.deepEqual(doc.warnings,['embedded_html_as_inert_text']);
 assert(doc.canonicalText.includes('<script>bad</script>')); // Inert source text, never inserted as HTML.
});
test('invalid formats or encodings are rejected by quarantine before parsing',()=>{
 assert.throws(()=>parseTextOrMarkdown(Buffer.from('x'),'text/html'),ParserError);
 assert.throws(()=>parseTextOrMarkdown(Buffer.from([0xc3,0x28]),'text/plain'));
});
test('DOCX preserves section text, Unicode, whitespace, tab and newline and heading style',()=>{
 const xml='<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Section 1</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">A 😃 </w:t></w:r><w:tab/><w:r><w:t>“quotes” &amp; &lt;law&gt;</w:t></w:r><w:br/></w:p></w:body></w:document>';
 const p=parseDocx(pack(xml));assert.equal(p.blocks[0].kind,'heading');assert.equal(p.blocks[0].text,'Section 1');
 assert.equal(p.blocks[1].text,'A 😃 \t“quotes” & <law>\n');assert.equal(p.publicationAllowed,false);assert.equal(p.sourceComplete,false);
});
test('tracked deletion and insertion are reported, never silently certified',()=>{
 const xml='<w:document><w:p><w:r><w:t>Keep </w:t></w:r><w:del><w:r><w:delText>removed</w:delText></w:r></w:del><w:ins><w:r><w:t>added</w:t></w:r></w:ins></w:p></w:document>';
 const d=parseDocx(pack(xml));assert.equal(d.canonicalText,'Keep added');assert(d.warnings.includes('tracked_changes_require_review'));
});
test('footnote source part stays attributable and unresolved notes are flagged',()=>{
 const xml='<w:document><w:p><w:r><w:t>Paragraph</w:t></w:r><w:footnoteReference w:id="3"/></w:p></w:document>';
 const f=parseDocx(pack(xml));assert(f.warnings.includes('unresolved_footnote'));
 const withNote=parseDocx(docxFixture([['[Content_Types].xml','<Types/>'],['word/document.xml',xml],['word/footnotes.xml','<w:footnotes><w:footnote><w:p><w:t>Note text</w:t></w:p></w:footnote></w:footnotes>']]));
 assert.equal(withNote.blocks.at(-1).kind,'footnote');assert.equal(withNote.blocks.at(-1).text,'Note text');
});
test('malicious remote XML, macro and corrupt compressed data rejected even during parsing',()=>{
 const basic='<w:document><w:p><w:t>Safe</w:t></w:p></w:document>';
 assert.throws(()=>parseDocx(docxFixture([['[Content_Types].xml','<!DOCTYPE x><Types/>'],['word/document.xml',basic]])));
 assert.throws(()=>parseDocx(docxFixture([['[Content_Types].xml','<Types/>'],['word/document.xml',basic],['word/vbaProject.bin','bad']])));
 assert.throws(()=>parseDocx(Buffer.from('PK')));assert.throws(()=>parseDocx('not bytes'),ParserError);
});
