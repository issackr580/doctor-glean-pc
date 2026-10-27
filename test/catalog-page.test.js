import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSettings} from '../vendor/engine/core.js';
import {CatalogPage,safeCatalogNavigation} from '../src/catalog-page.js';
const profiles=initialSettings().profiles;
test('catalog navigation rejects lecture, login and foreign destinations',()=>{
 const profile=profiles.doctorville;
 assert.equal(safeCatalogNavigation(profile,{kind:'navigate',url:profile.url+'?page=2'},{}),true);
 for(const url of ['https://evil.test/', 'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=1','https://www.doctorville.co.kr/login','https://www.doctorville.co.kr/seminar/main?authToken=secret'])assert.equal(safeCatalogNavigation(profile,{kind:'navigate',url},{}),false,url);
});
test('late read from an old document is ignored even at the same URL',async()=>{
 let version=1;const page=new CatalogPage(profiles.doctorville,{snapshot:()=>({url:profiles.doctorville.url,version}),evaluate:async()=>{version++;return '{"status":"ok","done":true,"events":[]}';},close(){}},new AbortController().signal);
 await assert.rejects(()=>page.read('2026-10-26',null),error=>error.code==='navigation_changed');
});
test('one list click may navigate without being clicked or loaded twice',async()=>{
 let version=1,clicks=0,loads=0;
 const page=new CatalogPage(profiles.doctorville,{snapshot:()=>({url:profiles.doctorville.url,version}),evaluate:async()=>{clicks++;version++;throw Error('document replaced');},load:async()=>loads++,close(){}},new AbortController().signal);
 assert.equal(await page.act({kind:'click',selector:'#more',signature:'더보기'},{}),true);assert.equal(clicks,1);assert.equal(loads,0);
});
test('unexpected lecture navigation cannot be accepted as catalog progress',async()=>{
 let version=1,url=profiles.doctorville.url;
 const page=new CatalogPage(profiles.doctorville,{snapshot:()=>({url,version}),evaluate:async()=>{version++;url='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=1';return true;},close(){}},new AbortController().signal);
 await assert.rejects(()=>page.act({kind:'click',selector:'#more',signature:'더보기'},{}));
});
test('cancelled page cannot evaluate, navigate or reopen',async()=>{
 const controller=new AbortController();let calls=0;
 const page=new CatalogPage(profiles.doctorville,{snapshot:()=>({url:profiles.doctorville.url,version:1}),evaluate:async()=>calls++,load:async()=>calls++,close(){}},controller.signal);
 controller.abort();await assert.rejects(()=>page.read('2026-10-26',null));await assert.rejects(()=>page.act({kind:'scroll'},{}));await assert.rejects(()=>page.open());assert.equal(calls,0);
});
test('reviewed fixed PC entry failures read only their original login GET without weakening TLS',async()=>{
 for(const site of ['whodadoc','dtalks'])for(const failure of ['load_failed','certificate_error','dns_error','offline','time_limit','navigation_cancelled']){
  const loads=[],profile=profiles[site];let url=profile.url;
  const page=new CatalogPage(profile,{snapshot:()=>({url,version:1}),load:async target=>{loads.push(target);if(loads.length===1)throw Object.assign(Error(),{code:'network_error',failure});url=target;},close(){}},new AbortController().signal);
  if(failure==='load_failed'){await page.open();assert.deepEqual(loads,[profile.url,site==='dtalks'?'https://www.dtalks.kr/login.do':'https://hcp.whodadoc.com/auth/login']);assert.equal((await page.read('2026-10-27',null)).status,'login');}
  else{await assert.rejects(page.open());assert.deepEqual(loads,[profile.url]);}
 }
});
test('Dtalks fallback stops when the fixed login GET also fails or collection is cancelled',async()=>{
 for(const cancelled of [false,true]){
  const controller=new AbortController(),loads=[],profile=profiles.dtalks;
  const page=new CatalogPage(profile,{snapshot:()=>({url:profile.url,version:1}),load:async url=>{loads.push(url);if(cancelled)controller.abort();throw Object.assign(Error(),{code:'network_error',failure:'load_failed'});},close(){}},controller.signal);
  await assert.rejects(page.open());assert.deepEqual(loads,cancelled?[profile.url]:[profile.url,'https://www.dtalks.kr/login.do']);
 }
});
test('a replaced Dtalks profile entry never turns a failed arbitrary URL into a login attempt',async()=>{
 const loads=[],profile={...profiles.dtalks,url:'https://www.dtalks.kr/other.do'};
 const page=new CatalogPage(profile,{snapshot:()=>({url:profile.url,version:1}),load:async url=>{loads.push(url);throw Object.assign(Error(),{code:'network_error',failure:'load_failed'});},close(){}},new AbortController().signal);
 await assert.rejects(page.open());assert.deepEqual(loads,[profile.url]);
});
