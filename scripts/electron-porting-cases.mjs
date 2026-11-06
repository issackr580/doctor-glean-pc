import {syntheticEntryClock} from './electron-entry-clock.mjs';
import {session} from 'electron';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AutomationPage} from '../src/automation-page.js';
import {electronCatalogPage} from '../src/electron-catalog-page.js';
import {CatalogRunner} from '../src/catalog-runner.js';
import {CatalogStore} from '../src/catalog-store.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {EntryRunner} from '../src/entry-runner.js';
import {LocalState} from '../src/local-state.js';
import {remotePreferences} from '../src/security.js';
import {kstDate,kstInstant} from '../src/schedule.js';
import {initialSettings} from '../vendor/engine/core.js';
import {watchManualEntry} from '../src/manual-entry-watch.js';
import {docpleCard,docpleList,docpleDetail} from '../test/fixtures/docple-webinar.js';

export async function portingCases(check){
 const root=mkdtempSync(join(tmpdir(),'pc-v139-electron-')),date=kstDate(),at=kstInstant(date,'13:00'),title='검증용 닥플 웨비나',profile=initialSettings().profiles.docple;
 const card=(id='701',patch={})=>docpleCard({id,date:date.replaceAll('-','.'),...patch});
 const detail=patch=>docpleDetail({date:date.replaceAll('-','.'),...patch});
 const baseJob={site:'docple',key:'e'.repeat(64),id:'701',url:'https://docple-plus.com/webinar/701?category=C01&mode=LIVE&sort=START_ASC',date,time:'13:00',title,due:at-1800000,deadline:at+600000,slot:0};
 const pages=[];let partitionIndex=0;
 async function provider(body,{route='/webinar/701',width=1100,nextPage=false}={}){
  const partition='pc-v139-'+randomUUID(),prefs={...remotePreferences('docple'),partition},controller=new AbortController(),state={posts:0,gets:0,nextClicks:0};
  const protocol=session.fromPartition(partition).protocol;
  await protocol.handle('https',async request=>{
   const u=new URL(request.url);if(request.method!=='GET'){state.posts++;return new Response('{}',{headers:{'content-type':'application/json'}});}state.gets++;
   const content=typeof body==='function'?body(u):body;
   const script=`Date.now=()=>${at};document.querySelectorAll('button.gtm-webinar-detail-primary').forEach(b=>b.addEventListener('click',()=>{window.clicks=(window.clicks||0)+1;fetch('/synthetic-entry',{method:'POST'});history.pushState({},'',location.pathname+'/watch');}));`;
   return new Response('<!doctype html><meta charset="utf-8"><body>'+content+'<script>'+script+'</script></body>',{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  const page=syntheticEntryClock(new AutomationPage('docple',controller.signal,prefs),()=>at);page.root.setSize(width,1800);await page.load('https://docple-plus.com'+route);pages.push(page);
  return {page,state,prefs,controller,protocol};
 }
 try{
  check('v139 Docple catalog profile uses the exact reviewed LIVE route',profile.url==='https://docple-plus.com/webinar?category=C01&mode=LIVE&sort=START_ASC');
  for(const width of [384,1240]){
   const s=await provider(docpleList({cards:card()+card('702')+card('703')}),{route:'/webinar?category=C01&mode=LIVE&sort=START_ASC',width});
   const catalog=new CatalogStore(join(root,'catalog-'+width+'.json'));
   const runner=new CatalogRunner({store:catalog,now:()=>at,createPage:(p,signal)=>electronCatalogPage(p,signal,s.prefs)});
   await runner.start(date,['docple']);const result=catalog.view(date).results.docple;
   check('Docple '+width+' PC catalog preserves three simultaneous public identities and registration',result.events.length===3&&result.events.every(e=>e.registrationStatus==='registered')&&new Set(result.events.map(e=>e.id)).size===3);
   check('Docple '+width+' proves complete LIVE scope without submitting',result.coverage&&result.scope==='list_checked'&&s.state.posts===0);
   s.page.close();
  }
  {
   const body=docpleList({cards:card(),next:true})+`<script>window.pageClicks=0;document.querySelector('button[aria-label="다음 페이지"]').onclick=function(){window.pageClicks++;document.querySelector('ul').innerHTML=${JSON.stringify(card('702'))};this.disabled=true;};</script>`;
   const s=await provider(body,{route:'/webinar?category=C01&mode=LIVE&sort=START_ASC'}),page=electronCatalogPage(profile,s.controller.signal,s.prefs);await page.open();
   let first;for(let i=0;i<30;i++){first=await page.read(date,null);if(first.state)break;await new Promise(r=>setTimeout(r,50));}
   if(!first.action)console.log('PC_DOCPLE_PAGING_STATE:'+JSON.stringify({status:first.status,done:first.done,events:first.events?.length,pages:first.state?.pages,unknown:first.state?.unknown}));
   check('Docple pagination returns only the original reviewed next control',first.action?.selector==='button[aria-label="다음 페이지"]'&&first.done===false);
   check('Docple pagination refuses a changed control signature',await page.act({...first.action,signature:'임의 변경'},first.state)===false);
   check('Docple original next button executes once after signature validation',await page.act(first.action,first.state)===true);
   const second=await page.read(date,first.state);check('Docple paged catalog retains prior rows and proves exhausted scope',second.done&&second.coverage&&second.events.length===2&&new Set(second.events.map(e=>e.id)).size===2&&second.state.pages===2);
   const third=await page.read(date,second.state);check('Docple repeated signature cannot issue another page action',!third.action&&third.status==='review'&&s.state.posts===0);page.close();s.page.close();
  }
  for(const [name,body,route] of [
   ['disabled entry',detail({disabled:true})],['not registered',detail({registered:false})],['label changed',detail({label:'신청하기'})],
   ['different date',detail({date:'2020.01.01'})],['different clock',detail({time:'14:00'})],
   ['duplicate primary',detail({button:'<button class="gtm-webinar-detail-primary">입장하기</button><button class="gtm-webinar-detail-primary">입장하기</button>'})],
   ['entry in form',detail({button:'<form><button class="gtm-webinar-detail-primary">입장하기</button></form>'})],
   ['unknown modal',detail({extra:'<div role="dialog" aria-modal="true">동의가 필요합니다</div>'})],['login return query','<input type="password">','/auth/login?returnTo=opaque-synthetic'],
   ['different public id',detail(),'/webinar/702'],['watch is not an entry control','<h1>검증용 닥플 웨비나</h1>','/webinar/701/watch'],
  ]){
   const {page,state}=await provider(body,{route});const result=await page.call('auto-entry.js',[baseJob,'inspect']);
   check('Docple refuses '+name,result.status!=='ready');check('Docple '+name+' has no submission',state.posts===0);page.close();
  }
  for(const [name,body,query] of [
   ['missing broadcast date',docpleList({cards:card().replace('aria-label="방송일 ','aria-label="포스터 ')}),'category=C01&mode=LIVE'],
   ['class versus href conflict',docpleList({cards:card('701',{url:'/webinar/702'})}),'category=C01&mode=LIVE'],
   ['search filter',docpleList({cards:card()}),'category=C01&mode=LIVE&keyword=synthetic'],
   ['VOD filter',docpleList({cards:card()}),'category=C01&mode=VOD'],
   ['replay only',docpleList({cards:card('701',{replay:true})}),'category=C01&mode=LIVE'],
  ]){
   const s=await provider(body,{route:'/webinar?'+query}),catalog=new CatalogStore(join(root,'bad-'+partitionIndex+++'.json'));
   const page=electronCatalogPage({...profile,url:'https://docple-plus.com/webinar?'+query},s.controller.signal,s.prefs);await page.open();let row;for(let i=0;i<30;i++){row=await page.read(date,null);if(row.state)break;await new Promise(r=>setTimeout(r,50));}page.close();check('Docple catalog rejects '+name,row.events.length===0&&!(row.status==='ok'&&row.coverage));s.page.close();
  }
  {
   const s=await provider(detail()),first=await s.page.call('auto-entry.js',[baseJob,'inspect']);check('Docple original detail binds ID, full date, clock and registered title',first.status==='ready'&&first.targetMatched);
   await s.page.call('auto-entry.js',[baseJob,'click'],{navigation:true});await new Promise(r=>setTimeout(r,100));
   const second=await s.page.call('auto-entry.js',[baseJob,'click']);check('Docple original entry posts once and moves to watch',s.state.posts===1&&s.page.url.includes('/701/watch'));check('Docple watch never reauthorizes a second click',second.status!=='clicked');s.page.close();
  }
  {
   const s=await provider(detail()),observed=[];s.page.root.show();s.page.root.focus();
   const stop=watchManualEntry(s.page.root,'docple',{jobs:()=>[baseJob],onClick:key=>observed.push(key),interval:20});
   await new Promise(r=>setTimeout(r,120));await s.page.current.webContents.executeJavaScript('document.querySelector("button").click()');await new Promise(r=>setTimeout(r,120));
   check('Docple passive observer ignores script-generated clicks',observed.length===0);
   await s.page.load('https://docple-plus.com/webinar/701');await new Promise(r=>setTimeout(r,120));
   const point=await s.page.current.webContents.executeJavaScript('(()=>{const r=document.querySelector("button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
   await s.page.current.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
   await s.page.current.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
   for(let i=0;i<40&&!observed.length;i++)await new Promise(r=>setTimeout(r,30));
   if(observed.length!==1||s.state.posts!==2)console.log('PC_MANUAL_DOCPLE_STATE:'+JSON.stringify({observed:observed.length,posts:s.state.posts,observer:await s.page.current.webContents.executeJavaScriptInIsolatedWorld(1001,[{code:'!!window.__doctorGleanManualObserver'}])}));
   check('Docple trusted original manual entry is observed without an observer-generated submit',observed.length===1&&observed[0]===baseJob.key&&s.state.posts===2);stop();s.page.close();
  }
  {
   const s=await provider(u=>u.pathname==='/webinar'?docpleList({cards:card()}):detail(),{route:'/webinar?category=C01&mode=LIVE&sort=START_ASC'}),ledger=new LocalState(join(root,'host-state.json')),store=new WorkflowStore(join(root,'host-workflows.json'));ledger.setPaused(false);store.setFeature('entry',true);store.setEntrySites(['docple']);let clock=at;
   const runner=new EntryRunner({ledger,store,now:()=>clock,sleep:async ms=>{clock+=ms;await new Promise(r=>setTimeout(r,Math.min(ms,100)));},createPage:async()=>s.page});runner.reserveCatalog(date,{docple:{status:'ok',stale:false,events:[{...baseJob,registrationStatus:'registered'}]}});
   const job=store.entries()[0];await runner.run(job);check('PC Docple host dispatches only after durable attempt',s.state.posts===1&&Object.values(ledger.snapshot().jobs)[0]?.state==='unknown');
   const row=store.entries()[0];check('PC Docple host records click independently from playback/credit',row.status==='clicked'&&row.receipt.attempted&&row.receipt.navigationObserved&&row.receipt.watchObserved===true&&row.receipt.playback===undefined);
   const before=s.state.posts;runner.ledger=new LocalState(join(root,'host-state.json'));runner.reserveCatalog(date,{docple:{status:'ok',stale:false,events:[{...baseJob,title:'표제 변경',registrationStatus:'registered'}]}});check('PC Docple catalog rename does not clear consumed identity',store.entries().length===1&&store.entries()[0].key===job.key&&s.state.posts===before);
  }
  {
   const partition='pc-v139-external-'+randomUUID(),prefs={...remotePreferences('medigate'),partition},controller=new AbortController();let allowed=false,posts=0,bodyPreserved=false;
   await session.fromPartition(partition).protocol.handle('https',async request=>{
    const u=new URL(request.url);if(u.hostname==='entry.example.com'&&request.method==='POST'){posts++;bodyPreserved=await request.text()==='synthetic=1';return new Response('<h1>합성 외부 강의창</h1>',{headers:{'content-type':'text/html'}});}
    return new Response('<form method="POST" action="https://entry.example.com/original"><input name="synthetic" value="1"><button type="submit">입장하기</button></form>',{headers:{'content-type':'text/html'}});
   });
   const page=new AutomationPage('medigate',controller.signal,prefs,{externalEntryAllowed:(site,url)=>allowed&&site==='medigate'&&new URL(url).origin==='https://entry.example.com'});pages.push(page);await page.load('https://new.medigate.net/symposium');
   await page.current.webContents.executeJavaScript('document.querySelector("button").click()');await new Promise(r=>setTimeout(r,150));check('external entry before dispatch/settings is blocked without forwarding POST',posts===0);
   allowed=true;await new Promise(r=>setTimeout(r,100));check('changing settings never replays a blocked original POST',posts===0);
   page.armEntryDispatch();await page.current.webContents.executeJavaScript('document.querySelector("button").click()');await new Promise(r=>setTimeout(r,250));check('owned original external entry preserves POST method/body once',posts===1&&bodyPreserved&&page.url.startsWith('https://entry.example.com/'));
   page.close();
  }
  for(const [site,url] of [['whodadoc','https://hcp.whodadoc.com/hcp/main'],['dtalks','https://www.dtalks.kr/websim/vodList.do']]){
   const partition='pc-v139-manual-'+randomUUID(),prefs={...remotePreferences(site),partition},controller=new AbortController(),observed=[];let posts=0;
   await session.fromPartition(partition).protocol.handle('https',request=>{if(request.method==='POST'){posts++;return new Response('{}');}return new Response(`<section><h1>${title}</h1><p class="date">${date}</p><p class="time">13:00</p><button type="button" onclick="fetch('/synthetic-manual',{method:'POST'})">강의 입장하기</button></section><script>Date.now=()=>${at};</script>`,{headers:{'content-type':'text/html; charset=utf-8'}});});
   const page=new AutomationPage(site,controller.signal,prefs);pages.push(page);await page.load(url);page.root.show();page.root.focus();
   const stop=watchManualEntry(page.root,site,{jobs:()=>[{...baseJob,site,url,repeatSchema:1,repeatSlot:0}],onClick:key=>observed.push(key),interval:20});await new Promise(r=>setTimeout(r,120));
   await page.current.webContents.executeJavaScript('document.querySelector("button").click()');await new Promise(r=>setTimeout(r,100));check(site+' passive short-repeat observer ignores synthetic click',observed.length===0&&posts===1);
   const point=await page.current.webContents.executeJavaScript('(()=>{const r=document.querySelector("button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
   for(const type of ['mousePressed','mouseReleased'])await page.current.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
   for(let i=0;i<40&&!observed.length;i++)await new Promise(r=>setTimeout(r,30));check(site+' passive short-repeat observer binds a trusted original control',observed.length===1&&observed[0]===baseJob.key&&posts===2);stop();page.close();
  }
 }finally{for(const page of pages)page.close();rmSync(root,{recursive:true,force:true});}
}
