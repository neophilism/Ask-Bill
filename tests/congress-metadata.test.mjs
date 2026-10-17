import test from 'node:test';
import assert from 'node:assert/strict';
import {CongressMetadataError,validateCongressDate,validateTextVersion,validatePaginationCount} from '../packages/content/connectors/congress/validate.mjs';
const error=code=>e=>e instanceof CongressMetadataError&&e.code===code;
test('valid calendar leap day and strict UTC values are preserved',()=>{
 for(const raw of ['2024-02-29','2025-10-17','2025-10-17T12:34:56Z','2025-10-17T12:34:56.12Z'])assert.equal(validateCongressDate(raw),raw);
});
test('calendar overflow, non-ISO locale input and impossible times fail closed',()=>{
 for(const raw of ['2025-02-29','2025-02-31','2025-13-01','2025-00-10','2025-10-17T25:00:00Z','2025/10/17','2025-10-17 01:00:00','not-a-date','0025-01-01',null])
  assert.throws(()=>validateCongressDate(raw),error('TEXT_DATE_INVALID'),String(raw));
});
test('official text-version labels never carry markup or control bytes',()=>{
 const data={type:'Introduced in House',date:'2025-01-02',formats:[{type:'Formatted XML',url:'https://www.congress.gov/119/bills/hr1/example.xml'}]};
 assert.equal(validateTextVersion(data),data);
 for(const type of ['', '<script>alert(1)</script>', 'Improper\ncontrol', 'T'.repeat(121)])
  assert.throws(()=>validateTextVersion({...data,type}),error('TEXT_VERSION_INVALID'));
 assert.throws(()=>validateTextVersion({...data,formats:[{type:'PDF\rheader'}]}),error('TEXT_VERSION_INVALID'));
 assert.throws(()=>validateTextVersion({...data,formats:Array.from({length:17},()=>({type:'PDF'}))}),error('TEXT_VERSION_INVALID'));
});
test('pagination counts bound the complete source listing to 4000 versions',()=>{
 assert.equal(validatePaginationCount(undefined),null);assert.equal(validatePaginationCount(0),0);
 assert.equal(validatePaginationCount(4000),4000);
 for(const value of [-1,4001,10.5,'250',Infinity,NaN,null])assert.throws(()=>validatePaginationCount(value),error('TEXT_PAGINATION_INVALID'));
});
