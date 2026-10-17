import {deflateRawSync} from 'node:zlib';
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
export function docxFixture(parts,method=8){
 const locals=[],dirs=[];let offset=0;
 for(const [name,source] of parts){
  const raw=Buffer.from(source),body=method===8?deflateRawSync(raw):raw,n=Buffer.from(name);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(crc32(raw),14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(n.length,26);
  locals.push(local,n,body);
  const h=Buffer.alloc(46);h.writeUInt32LE(0x02014b50);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt16LE(method,10);h.writeUInt32LE(crc32(raw),16);h.writeUInt32LE(body.length,20);h.writeUInt32LE(raw.length,24);h.writeUInt16LE(n.length,28);h.writeUInt32LE(offset,42);
  dirs.push(h,n);offset+=local.length+n.length+body.length;
 }
 const dir=Buffer.concat(dirs),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(parts.length,8);end.writeUInt16LE(parts.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dir,end]);
}
export const docxMime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const pack=xml=>docxFixture([['[Content_Types].xml','<Types/>'],['word/document.xml',xml]]);
