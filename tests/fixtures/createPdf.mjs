/** Deterministic test-only PDF, not legislation or a filing. */
export function makePdf(pageTexts){
 if(!Array.isArray(pageTexts)||!pageTexts.length)throw Error('pages required');
 const escape=s=>String(s).replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,'\\$&');
 const count=3+pageTexts.length*2,objects=new Array(count+1);
 objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
 objects[2]='<< /Type /Pages /Kids ['+pageTexts.map((_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+pageTexts.length+' >>';
 objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
 pageTexts.forEach((value,i)=>{
  const n=4+i*2,stream=value===null?'':'BT /F1 18 Tf 72 710 Td ('+escape(value)+') Tj ET\n';
  objects[n]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(n+1)+' 0 R >>';
  objects[n+1]='<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream';
 });
 let result='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n',pos=Buffer.byteLength(result,'latin1'),offsets=[0];
 for(let i=1;i<=count;i++){
  offsets[i]=pos;const str=i+' 0 obj\n'+objects[i]+'\nendobj\n';
  result+=str;pos+=Buffer.byteLength(str,'latin1');
 }
 const xref=pos;result+='xref\n0 '+(count+1)+'\n0000000000 65535 f \n';
 for(let i=1;i<=count;i++)result+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 result+='trailer\n<< /Size '+(count+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(result,'latin1');
}
