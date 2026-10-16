import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthError, FixtureSessionStore, publisherActionAllowed, secureSessionCookie, clearSessionCookie, isPublicReadingRoute } from '../packages/auth/server.mjs';

const ownerId='11111111-1111-4111-8111-111111111111';
const pubA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pubB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin='https://ask-bill.example';
function setup(role='editor') {
 let ms=1_000_000;let currentRole=role;
 const store=new FixtureSessionStore({mode:'test-fixture',expectedOrigin:origin,now:()=>ms});
 const issued=store.issueForTrustedFixture({userId:ownerId,publisherId:pubA,role});
 const cookieHeader=issued.setCookie.split(';')[0];
 const request=(action, extra={})=>store.authorize({cookieHeader,csrfToken:issued.csrfToken,requestOrigin:origin,method:'POST',action,publisherId:pubA,resolveMembership:()=>currentRole,...extra});
 return {store,issued,cookieHeader,request,advance:n=>{ms+=n},setRole:r=>{currentRole=r}};
}
function deny(code, fn) {assert.throws(fn, error=>error instanceof AuthError&&error.code===code);}
test('fixture auth cannot be instantiated in production mode',()=>{
 deny('LIVE_AUTH_NOT_CONFIGURED',()=>new FixtureSessionStore({mode:'production',expectedOrigin:origin}));
 deny('INVALID_ORIGIN',()=>new FixtureSessionStore({mode:'test-fixture',expectedOrigin:'http://example.com'}));
 deny('INVALID_ORIGIN',()=>new FixtureSessionStore({mode:'test-fixture',expectedOrigin:'https://evil.example/path'}));
});
test('opaque HTTP-only secure session cookies, no role or identities embedded',()=>{
 const x=setup(); assert.match(x.issued.setCookie,/; Secure; HttpOnly; SameSite=Strict; Max-Age=1800$/);
 assert.doesNotMatch(x.issued.setCookie,new RegExp(pubA));
 assert.match(clearSessionCookie(),/Max-Age=0/);
 assert.notEqual(setup().issued.setCookie,x.issued.setCookie);
 deny('SESSION_INVALID',()=>secureSessionCookie('invalid'));
});
test('role matrix denies escalation even when a request claims otherwise',()=>{
 for(const role of ['owner','editor','viewer']){
  assert.equal(publisherActionAllowed(role,'view',false),true);
  assert.equal(publisherActionAllowed(role,'upload',false),role!=='viewer');
  assert.equal(publisherActionAllowed(role,'publish',true),role!=='viewer');
  assert.equal(publisherActionAllowed(role,'invite',true),role==='owner');
 }
 deny('INVALID_AUTHORIZATION',()=>publisherActionAllowed('admin','publish',true));
});
test('publisher-scoped requests require valid session, fresh membership and real same-origin CSRF',()=>{
 const x=setup('editor');
 assert.equal(x.request('upload').publisherId,pubA);
 deny('PUBLISHER_FORBIDDEN',()=>x.request('upload',{publisherId:pubB}));
 deny('ORIGIN_FORBIDDEN',()=>x.request('upload',{requestOrigin:'https://evil.example'}));
 deny('ORIGIN_FORBIDDEN',()=>x.request('upload',{requestOrigin:undefined}));
 deny('CSRF_FORBIDDEN',()=>x.request('upload',{csrfToken:'x'.repeat(43)}));
 deny('CSRF_FORBIDDEN',()=>x.request('upload',{csrfToken:''}));
 deny('MEMBERSHIP_LOOKUP_REQUIRED',()=>x.request('upload',{resolveMembership:null}));
 deny('METHOD_NOT_ALLOWED',()=>x.request('upload',{method:'GET'}));
});
test('MFA is required and expires for privileged operations',()=>{
 const x=setup('editor');
 deny('ACTION_FORBIDDEN',()=>x.request('publish'));
 x.store.fixtureVerifyMfa({cookieHeader:x.cookieHeader});
 assert.equal(x.request('publish').action,'publish');
 deny('ACTION_FORBIDDEN',()=>x.request('invite'));
 x.advance(600001);
 deny('ACTION_FORBIDDEN',()=>x.request('publish'));
});
test('role revocation and downgrade apply to existing sessions immediately',()=>{
 const x=setup('owner');
 x.store.fixtureVerifyMfa({cookieHeader:x.cookieHeader});
 assert.equal(x.request('invite').action,'invite');
 x.setRole('viewer');
 deny('ACTION_FORBIDDEN',()=>x.request('invite'));
 deny('ACTION_FORBIDDEN',()=>x.request('upload'));
 assert.equal(x.request('view').role,'viewer');
 x.setRole(null);
 deny('MEMBERSHIP_REVOKED',()=>x.request('view'));
});
test('session expiration, revocation and duplicate cookie attack fail closed',()=>{
 const x=setup();
 deny('SESSION_INVALID',()=>x.request('view',{cookieHeader:x.cookieHeader+'; '+x.cookieHeader}));
 deny('SESSION_INVALID',()=>x.request('view',{cookieHeader:x.cookieHeader+'\r\nSet-Cookie: bad'}));
 x.advance(1800001);
 deny('SESSION_EXPIRED',()=>x.request('view'));
 const y=setup();
 const clear=y.store.revoke({cookieHeader:y.cookieHeader});
 assert.match(clear,/Max-Age=0/);
 deny('SESSION_INVALID',()=>y.request('view'));
});
test('unknown HTTP method, action and malformed identifiers fail closed',()=>{
 const x=setup();
 deny('ACTION_INVALID',()=>x.request('delete-all'));
 deny('METHOD_INVALID',()=>x.request('view',{method:'TRACE'}));
 deny('INVALID_ID',()=>x.request('view',{publisherId:"'; DROP TABLE ask_bill.bills; --"}));
 deny('ROLE_INVALID',()=>x.store.issueForTrustedFixture({userId:ownerId,publisherId:pubA,role:'superadmin'}));
});
test('public legislative reader is independent of authenticated publisher identity',()=>{
 assert.equal(isPublicReadingRoute('GET','/api/bills'),true);
 assert.equal(isPublicReadingRoute('GET','/preview'),true);
 assert.equal(isPublicReadingRoute('POST','/api/bills'),false);
 assert.equal(isPublicReadingRoute('GET','/admin/publish'),false);
});
