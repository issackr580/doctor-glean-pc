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
test('Whodadoc fixed PC entry load failure reads its original login GET once without weakening TLS',async()=>{
 for(const failure of ['load_failed','certificate_error','dns_error']){
  const loads=[],profile=profiles.whodadoc;let url=profile.url;
  const page=new CatalogPage(profile,{snapshot:()=>({url,version:1}),load:async target=>{loads.push(target);if(loads.length===1)throw Object.assign(Error(),{code:'network_error',failure});url=target;},close(){}},new AbortController().signal);
  if(failure==='load_failed'){await page.open();assert.deepEqual(loads,[profile.url,'https://hcp.whodadoc.com/auth/login']);assert.equal((await page.read('2026-10-27',null)).status,'login');}
  else{await assert.rejects(page.open());assert.deepEqual(loads,[profile.url]);}
 }
});
