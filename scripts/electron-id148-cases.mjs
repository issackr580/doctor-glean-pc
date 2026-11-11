// Real PC injection/IPC boundary against synthetic HTTPS, never member accounts.
import {syntheticEntryClock} from './electron-entry-clock.mjs';
import {session} from 'electron';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {AutomationPage} from '../src/automation-page.js';
import {remotePreferences} from '../src/security.js';
import {parseOfficialIdentity,officialIdentity} from '../src/entry-identity.js';
import {CatalogStore} from '../src/catalog-store.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {EntryRunner} from '../src/entry-runner.js';
import {LocalState} from '../src/local-state.js';
import {createEntryJob} from '../src/entry-job.js';
import {kstInstant} from '../src/schedule.js';
import {docpleCard,docpleList,docpleDetail} from '../test/fixtures/docple-webinar.js';
import {watchManualEntry} from '../src/manual-entry-watch.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function id148Cases({root,date,title,clock,check,inspect,job,catalog}){
 const changed='공식 ID를 유지한 변경 제목',id='901',now=kstInstant(date,clock)+31000;
 const urls={doctorville:'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=901&viewType=1',medigate:'https://new.medigate.net/symposium/901',keymedi:'https://www.keymedi.com/meditv/live/ID_901',whodadoc:'https://hcp.whodadoc.com/webinar/webi/view?id=901',hmp:'https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm',docple:'https://docple-plus.com/webinar/901'};
 const click=`onclick="window.syntheticClicks=(window.syntheticClicks||0)+1;fetch('/synthetic-entry',{method:'POST'})"`;
 const cards={
  doctorville:`<a class="list_detail" href="/seminar/seminarDetail?seminarId=901&viewType=1"><strong class="tit">${changed}</strong><span>${date}</span><div class="time"><span class="start">${clock}</span> ~ 23:59</div><span>신청완료</span><button ${click}>입장하기</button></a>`,
  medigate:`<article><h3>${changed}</h3><p class="date">${date} ${clock} ~ 23:59</p><a href="/symposium/901">상세보기</a><span>신청완료</span><button ${click}>입장하기</button></article>`,
  keymedi:`<div data-gtm-event-name="content_click" data-gtm-content-category="메디 TV_메디TV Live" data-gtm-content-title="${changed}"><h3>${changed}</h3><p>${date} ${clock} ~ 23:59</p><span>합성 강사</span><div class="_3daYPVTCXASH39HyfXlu1A=="><svg></svg></div><a href="/meditv/live/ID_901">상세보기</a><span>신청완료</span><button ${click}>입장하기</button></div>`,
  whodadoc:`<nav><a href="/webinar/webi/list">웨비나</a></nav><a class="anchor-view" href="/webinar/webi/view?id=901"><h3>${changed}</h3><p class="date">${date}</p><p class="time">${clock} ~ 23:59</p><span>신청완료</span><button ${click}>강의 입장하기</button></a>`,
  hmp:`<div class="area"><a class="head" href="#" onclick="goDetail(901);return false;"><div class="top"><span class="date">${date}</span><span class="time">${clock} ~ 23:59</span></div><div class="subject">${changed}</div></a><div class="state"><span>신청완료</span><button ${click}>강의시청하기</button></div></div>`
 };
 const hmpMeta={schemaVersion:1,kind:'schedule',id,source:'hmp_go_detail'};
 // Actual collectors run in the PC transport; identity persists through cache and restart.
 for(const site of ['doctorville','medigate','keymedi','whodadoc','hmp','docple']){
  const listUrl=site==='docple'?'https://docple-plus.com/webinar?category=C01&mode=LIVE&sort=START_ASC':site==='whodadoc'?'https://hcp.whodadoc.com/webinar/webi/list':undefined;
  const body=site==='docple'?docpleList({cards:docpleCard({id,title:changed,date:date.replaceAll('-','.'),time:clock})}):cards[site];
  await inspect(site,body,{url:listUrl,work:async(page,posts)=>{
   const result=await catalog(page,site),event=result.events?.find(e=>e.lectureIdentity?.id===(site==='keymedi'?'ID_901':id));
   if(!event)console.log('ID148_COLLECTOR:'+JSON.stringify({site,status:result.status,events:result.events,reason:result.reason}));
   check('v148 actual injected '+site+' collector carries official identity',!!event&&!!officialIdentity(event));
   const file=join(root,'id148-cache-'+site+'.json'),cache=new CatalogStore(file);cache.record(site,date,{status:'review',events:[event]});const saved=new CatalogStore(file).view(date).results[site].events[0];
   check('v148 '+site+' cache restart preserves namespace/id without replacing synthetic event references',officialIdentity(saved)?.id===event.lectureIdentity.id&&posts()===0);
  }});
 }
 for(const site of ['doctorville','medigate','keymedi','hmp']){
  const identity=site==='hmp'?hmpMeta:parseOfficialIdentity(site,urls[site]),target={...job(site),url:urls[site],lectureIdentity:identity};
  await inspect(site,cards[site],{work:async(page,posts)=>{
   const ready=await page.call('pc-entry.js',[target,'inspect']);check('v148 '+site+' same official ID permits a renamed title',ready.status==='ready'&&ready.targetMatched&&ready.titleMatches===0&&ready.identityMatches>0);
   const binding=page.entryBinding();check('v148 '+site+' observation has an isolated document binding',!!binding?.tag);
   const clicked=await page.call('pc-entry.js',[target,'click'],{navigation:true,expectedDocument:binding});await sleep(40);check('v148 '+site+' original button dispatches once after the same ID recheck',clicked.status==='clicked'&&posts()===1);
   const again=await page.call('pc-entry.js',[target,'click'],{navigation:true,expectedDocument:binding}).catch(()=>({status:'blocked'}));check('v148 '+site+' same-document duplicate is refused',again.status!=='clicked'&&posts()===1);
  }});
  for(const [name,body] of [['other ID',cards[site].replaceAll(site==='keymedi'?'ID_901':'901',site==='keymedi'?'ID_902':'902').replaceAll(changed,title)],['wrong date',cards[site].replaceAll(date,'2020-01-01')],['wrong start',cards[site].replaceAll(clock,clock==='00:00'?'00:01':'00:00')],['disabled',cards[site].replace('<button ','<button disabled ')],['login',cards[site]+'<input type="password">'],['security',cards[site]+'<div role="dialog" aria-modal="true">확인</div>']]){
   await inspect(site,body,{work:async(page,posts)=>{const r=await page.call('pc-entry.js',[target,'inspect']);check('v148 '+site+' independent guard / '+name,r.status!=='ready'&&posts()===0);}});
  }
 }
 // The other actual v148 engine families are exercised through AutomationPage too.
 for(const site of ['docple','whodadoc']){
  const body=site==='docple'?docpleDetail({id,title:changed,date:date.replaceAll('-','.'),time:clock}).replace('>입장하기</button>',` ${click}>입장하기</button>`):`<section><h1>${changed}</h1><p class="date">${date}</p><p class="time">${clock} ~ 23:59</p><span>신청완료</span><button ${click}>강의 입장하기</button></section>`;
  await inspect(site,body,{url:urls[site],work:async(page,posts)=>{
   const target={...job(site),url:urls[site],lectureIdentity:parseOfficialIdentity(site,urls[site]),...(site==='docple'?{id,registrationStatus:'registered'}:{repeatSchema:1,repeatSlot:0})};
   const ready=await page.call('auto-entry.js',[target,'inspect']);if(ready.status!=='ready')console.log('ID148_ENGINE:'+JSON.stringify({site,ready}));check('v148 '+site+' actual engine accepts same ID renamed heading',ready.status==='ready'&&ready.targetMatched);
   const r=await page.call('auto-entry.js',[target,'click'],{navigation:true,expectedDocument:page.entryBinding()});await sleep(40);check('v148 '+site+' original engine control dispatches once',r.status==='clicked'&&posts()===1);
   await page.call('auto-entry.js',[target,'click'],{navigation:true});check('v148 '+site+' consumed engine marker remains set',posts()===1);
  }});
 }
 const target={...job('medigate'),url:urls.medigate,lectureIdentity:parseOfficialIdentity('medigate',urls.medigate)};
 for(const scenario of ['ID','root','handler','document','nonce','date','start','registration','disabled','account']){
  await inspect('medigate',cards.medigate,{work:async(page,posts)=>{
   check('v148 '+scenario+' begins with a fresh exact target',(await page.call('pc-entry.js',[target,'inspect'])).status==='ready');const binding=page.entryBinding();
   const mutate={ID:"document.querySelector('a').href='/symposium/902'",root:"document.querySelector('article').outerHTML=document.querySelector('article').outerHTML",handler:"document.querySelector('button').setAttribute('onclick','window.BAD=true')",date:"document.querySelector('.date').textContent='2020-01-01 "+clock+"'",start:"document.querySelector('.date').textContent='"+date+" 00:00'",registration:"document.querySelector('span').textContent='신청하기'",disabled:"document.querySelector('button').disabled=true",nonce:"window.__pcEntryDocument='SYNTHETIC_FORGED'"};
   if(scenario==='document')await page.load(page.url);else if(mutate[scenario])await page.current.webContents.executeJavaScript(mutate[scenario]);
   let sent;try{sent=await page.call('pc-entry.js',[target,'click'],{navigation:true,expectedDocument:binding,authorize:()=>scenario!=='account'});}catch{sent={status:'blocked'};}
   // A main-world nonce cannot alter the isolated value; the unchanged genuine control remains eligible.
   await sleep(30);check('v148 inspect-to-click rechecks '+scenario,scenario==='nonce'?sent.status==='clicked'&&posts()===1:sent.status!=='clicked'&&posts()===0);
  }});
 }
 // HMP parses bounded visible single literals, never executes the detail handler.
 for(const [name,handler] of [['expression','goDetail(900+1)'],['multiple','goDetail(901);goDetail(902)'],['member UUID',"goDetail('SYNTHETIC_UUID')"],['eval',"goDetail(eval('901'))"]]){
  const body=cards.hmp.replace('goDetail(901);return false;',handler+';');await inspect('hmp',body,{work:async(page,posts)=>{const result=await catalog(page,'hmp');check('v148 HMP refuses '+name+' as official ID',result.events.every(e=>!e.lectureIdentity)&&posts()===0);}});
 }
 // Main-process ledger -> workflow commit -> renderer dispatch -> restart.
 for(const scenario of ['normal','save_failure','lost_callback']){
  const dir=join(root,'id148-atomic-'+scenario),partition='id148-'+randomUUID(),controller=new AbortController();let posts=0,fail=false;
  await session.fromPartition(partition).protocol.handle('https',request=>{if(request.method!=='GET'){posts++;const ledger=JSON.parse(readFileSync(join(dir,'state.json')));check('v148 dispatch observes durable consumed state',Object.values(ledger.jobs).some(j=>['attempting','unknown'].includes(j.state)));return new Response('{}');}return new Response('<!doctype html><meta charset="utf-8"><body>'+cards.medigate+`<script>Date.now=()=>${now};</script></body>`,{headers:{'content-type':'text/html; charset=utf-8'}});});
  const {atomicJson}=await import('../src/atomic-json.js'),ledger=new LocalState(join(dir,'state.json'),{commit:(p,d)=>{if(fail)throw Error('storage failed');atomicJson(p,d);}});ledger.setPaused(false);const store=new WorkflowStore(join(dir,'workflows.json'));store.setFeature('entry',true);const j=createEntryJob({site:'medigate',date,time:clock,title,url:urls.medigate},now);store.putEntry(j);
  const page=syntheticEntryClock(new AutomationPage('medigate',controller.signal,{...remotePreferences('medigate'),partition}),()=>now),call=page.call.bind(page);
  if(scenario==='lost_callback')page.call=async(name,args,options)=>{const result=await call(name,args,options);if(args[1]==='click')throw Error('lost callback');return result;};
  if(scenario==='save_failure')fail=true;
  const runner=new EntryRunner({ledger,store,now:()=>now,sleep:async()=>{await sleep(30);},createPage:async()=>page});await runner.run(j);await sleep(40);check('v148 Electron atomic '+scenario,posts===(scenario==='save_failure'?0:1));
  if(scenario!=='save_failure'){const restored=new LocalState(join(dir,'state.json')),next=new EntryRunner({ledger:restored,store,now:()=>now,createPage:async()=>{throw Error('no resend');}});next.recover();check('v148 Electron restart after '+scenario+' has no runnable attempt',next.due()===null&&next.retryJob(j.key)===false);}
 }
 // Trusted manual input records the existing alias and immediately aborts its worker.
 await inspect('medigate',cards.medigate,{work:async(page,posts)=>{
  const dir=join(root,'id148-manual'),store=new WorkflowStore(join(dir,'workflows.json')),ledger=new LocalState(join(dir,'state.json'));const old=createEntryJob({site:'medigate',date,time:clock,title:changed,url:''},now);store.putEntry(old);store.bindIdentities('medigate',date,[{site:'medigate',date,time:clock,title:changed,url:urls.medigate}]);let aborted=false;
  const runner=new EntryRunner({ledger,store,now:()=>now});const worker=new AbortController();worker.signal.addEventListener('abort',()=>{aborted=true;});runner.active={job:store.entries()[0],controller:worker,page:{close(){}}};page.root.show();page.root.focus();
  const stop=watchManualEntry(page.root,'medigate',{jobs:()=>store.entries(),onClick:key=>runner.cancelJob(key,true),interval:20});await sleep(180);const point=await page.current.webContents.executeJavaScript('(()=>{const r=document.querySelector("button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  for(const type of ['mousePressed','mouseReleased'])await page.current.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  for(let i=0;i<60&&(store.entries()[0].status!=='manual_clicked'||posts()<1);i++)await sleep(25);
  check('v148 trusted manual ID alias notifies and cancels the original worker',store.entries()[0].key===old.key&&store.entries()[0].status==='manual_clicked'&&aborted&&posts()===1);stop();
 }});
}
