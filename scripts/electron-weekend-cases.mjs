// Weekend acceptance against the actual selected PC app, synthetic HTTPS only.
// No user report, DOM, account, cookie or external submit is replayed here.
import {BrowserWindow,session} from 'electron';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
export async function weekendCases({application,temporary,check}){
 const source=path=>import(pathToFileURL(join(application,path)).href);
 const [{CatalogPage},{initialSettings},{remotePreferences},{CatalogStore},{WorkflowStore},{LocalState},{EntryRunner},{AutomationController},{kstInstant,nextLoungePreparation}]=await Promise.all(['src/catalog-page.js','vendor/engine/core.js','src/security.js','src/catalog-store.js','src/workflow-store.js','src/local-state.js','src/entry-runner.js','src/automation-controller.js','src/schedule.js'].map(source));
 const saturday='2026-11-07',sunday='2026-11-08',monday='2026-11-09',base=kstInstant(saturday,'13:00'),url='https://www.dtalks.kr/websim/vodList.do';
 const profile={...initialSettings().profiles.dtalks,networkPatienceMs:45000},pages=[];
 const card=title=>`<div class="day_box"><div class="time">13:00</div><div class="memo">${title}</div></div>`;
 const stamp=d=>d.toISOString().slice(0,10);
 const weekdays=[];for(let d=new Date('2026-10-26T00:00:00Z');d<=new Date('2026-12-06T00:00:00Z');d.setUTCDate(d.getUTCDate()+1))if(![0,6].includes(d.getUTCDay()))weekdays.push(stamp(d));
 function calendar({single=false,bare=false,header='월,화,수,목,금',missing=false,duplicate=false,busy=false,month='2026.11',entry='SYNTHETIC_WEEKDAY_LECTURE'}={}){
  let dates=single?[saturday]:[...weekdays];if(missing)dates.splice(8,1);if(duplicate)dates[8]=dates[7];
  return `<div class="calendar_wrap" ${busy?'aria-busy="true"':''}><div class="btn_month_wrap active"><span class="date_txt">${month}</span></div><div class="calendar_box active"><div class="day_wrap">${header.split(',').map(d=>'<div class="day">'+d+'</div>').join('')}</div><div class="calendar_grid">${dates.map(d=>`<div class="day ${d<'2026-11'?'last_month':d>='2026-12'?'next_month':''}" ${single?'data-date="'+d+'"':''}><div class="day_txt">${+d.slice(8)}</div>${!bare&&!single&&[monday,'2026-11-02'].includes(d)?card(entry):''}</div>`).join('')}</div></div></div>`;
 }
 async function harness(body,target=saturday){
  let now=base,gets=0,posts=0,generation=0;const controller=new AbortController(),partition='pc-weekend-'+randomUUID(),prefs={...remotePreferences('dtalks'),partition};
  await session.fromPartition(partition).protocol.handle('https',request=>{if(request.method!=='GET'){posts++;return new Response('{}');}gets++;return new Response('<!doctype html><meta charset="utf-8"><body>'+body+'</body>',{headers:{'content-type':'text/html; charset=utf-8'}});});
  const window=new BrowserWindow({show:false,width:1100,height:1800,webPreferences:prefs});pages.push(window);
  const transport={snapshot:()=>({url:window.webContents.getURL(),version:generation,loading:window.webContents.isLoadingMainFrame()}),load:async destination=>{await window.loadURL(destination);generation++;for(let i=0;i<100&&window.webContents.isLoadingMainFrame();i++)await new Promise(resolve=>setTimeout(resolve,10));},evaluate:async script=>{await window.webContents.executeJavaScript(`Date.now=()=>${now};void 0;`);return window.webContents.executeJavaScript(script,false);},close:()=>{if(!window.isDestroyed())window.destroy();}};
  const reader=new CatalogPage(profile,transport,controller.signal);await reader.open();let previous;
  return {window,reader,target,set:delta=>{now=base+delta;},read:async()=>{const result=await reader.read(target,previous);previous=result.state;return result;},act:action=>reader.act(action,previous),get gets(){return gets;},get posts(){return posts;},close:()=>reader.close()};
 }
 async function stableEmpty(h){
  h.set(0);const first=await h.read();check('weekend empty is unconfirmed on its first observation',!first.done&&first.diagnostics?.calendarChecked!==true);
  h.set(44000);const early=await h.read();check('weekend empty waits its full first 45s window',!early.done&&!early.action&&h.gets===1);
  h.set(45000);const reload=await h.read();check('weekend empty offers one original observed GET',reload.action?.kind==='navigate'&&reload.action.url===url&&h.gets===1);
  check('weekend original reload passes the PC catalog navigation boundary',await h.act(reload.action)===true);await h.read();
  h.set(89000);const second=await h.read();check('weekend empty waits its full second 45s window',!second.done&&!second.action&&h.gets===2);
  h.set(90000);const result=await h.read();check('weekend two-window check never submits or reloads twice',h.gets===2&&h.posts===0&&!result.action);return result;
 }
 try{
  for(const date of [saturday,sunday]){
   const h=await harness(calendar(),date),r=await stableEmpty(h);
   check(date+' complete weekday grid proves no selected weekend lecture',r.done&&r.coverage&&r.events.length===0&&r.diagnostics.calendarChecked&&r.diagnostics.calendarEmpty&&r.diagnostics.calendarReason==='complete_weekday_grid');
   const file=join(temporary,'weekend-cache-'+date+'.json'),cache=new CatalogStore(file);cache.record('dtalks',date,r,base);const saved=new CatalogStore(file).view(date).results.dtalks;
   check(date+' empty evidence survives native cache storage',saved.scope==='calendar_checked'&&saved.events.length===0&&!saved.stale);
   const ledger=new LocalState(join(temporary,'weekend-ledger-'+date+'.json'));ledger.setPaused(false);const store=new WorkflowStore(join(temporary,'weekend-workflows-'+date+'.json'),{now:()=>kstInstant(date,'13:00')});store.setFeature('entry',true);store.setEntrySites(['dtalks']);let creates=0;
   const runner=new EntryRunner({ledger,store,now:()=>kstInstant(date,'13:00'),createPage:async()=>{creates++;throw Error('empty calendar cannot open entry');}});runner.reserveCatalog(date,{dtalks:saved});
   check(date+' native entry scheduler creates no phantom weekend reservation',store.entries(date).length===0&&runner.due()===null&&creates===0&&Object.keys(ledger.snapshot().jobs).length===0);h.close();
  }
  for(const [name,options] of [['missing weekday cell',{missing:true}],['duplicate weekday cell',{duplicate:true}],['wrong weekday header',{header:'일,월,화,수,목'}]]){
   const h=await harness(calendar(options));await h.read();h.set(44000);await h.read();h.set(45000);const r=await h.read();
   check(name+' cannot certify an absent weekend or request an empty-proof GET',r.coverage===false&&r.diagnostics.calendarChecked===false&&!r.action&&h.gets===1&&h.posts===0);h.close();
  }
  {
   const h=await harness(calendar({bare:true})),r=await stableEmpty(h);check('a completely bare month stays unconfirmed after two windows',r.done&&!r.diagnostics.calendarChecked&&!r.diagnostics.calendarEmpty&&r.diagnostics.calendarStatus==='unconfirmed');h.close();
  }
  {
   const h=await harness(calendar({busy:true}));await h.read();h.set(90000);const r=await h.read();check('visible loading cannot become an empty weekend',!r.done&&!r.coverage&&!r.action&&h.gets===1&&h.posts===0);h.close();
  }
  for(const [name,body,status] of [['login',calendar()+'<input type="password">','login'],['security',calendar()+'<p>Verify you are human</p>','blocked']]){
   const h=await harness(body);const r=await h.read();check(name+' does not become no weekend lectures',r.status===status&&!r.coverage&&!r.action&&h.posts===0);h.close();
  }
  for(const afterReload of [false,true]){
   const h=await harness(calendar({single:true}));await h.read();
   if(afterReload){h.set(44000);await h.read();h.set(45000);const r=await h.read();await h.act(r.action);await h.read();}
   h.set(afterReload?70000:20000);await h.window.webContents.executeJavaScript(`document.querySelector('.calendar_grid>.day').insertAdjacentHTML('beforeend',${JSON.stringify(card('SYNTHETIC_LATE_WEEKEND_LECTURE'))});`);await h.read();h.set(afterReload?71000:21000);await h.read();h.set(afterReload?72000:22000);const r=await h.read();
   check('late weekend lecture '+(afterReload?'after recheck':'before recheck')+' is retained as a lecture',r.done&&r.events.length===1&&r.events[0].date===saturday&&r.diagnostics.calendarChecked&&!r.diagnostics.calendarEmpty&&h.posts===0&&h.gets===(afterReload?2:1));
   const store=new WorkflowStore(join(temporary,'weekend-late-'+afterReload+'.json'),{now:()=>base});store.setFeature('entry',true);store.setEntrySites(['dtalks']);const ledger=new LocalState(join(temporary,'weekend-late-ledger-'+afterReload+'.json'));ledger.setPaused(false);const runner=new EntryRunner({ledger,store,now:()=>base,createPage:async()=>{throw Error('synthetic reserve only');}});runner.reserveCatalog(saturday,{dtalks:r});
   check('v156 disabled Dtalks preserves the real weekend listing and user selection without auto reservation',store.entries(saturday).length===0&&runner.due()===null&&store.entrySites().includes('dtalks')&&r.events.length===1);h.close();
  }
  {
   const h=await harness(calendar(),monday);await h.read();h.set(1000);await h.read();h.set(2000);const r=await h.read();check('next Monday keeps its actual lecture and skips the empty-day reload',r.done&&r.events.length===1&&r.events[0].date===monday&&r.diagnostics.calendarChecked&&!r.diagnostics.calendarEmpty&&h.gets===1&&h.posts===0);h.close();
  }
  {
   const ledger=new LocalState(join(temporary,'weekend-controller-ledger.json'));ledger.setPaused(false);const controller=new AutomationController({file:join(temporary,'weekend-controller.json'),ledger,now:()=>base,createPage:async()=>{throw Error('no real page');},isManualOpen:()=>false,catalog:()=>({}),catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){}});clearInterval(controller.timer);
   check('weekday lounge skips Saturday and Sunday to next Monday',controller.loungeAt===kstInstant(monday,'00:00:03')&&nextLoungePreparation(kstInstant(sunday,'23:59'))===kstInstant(monday,'00:00:03'));
   check('daily morning check remains scheduled on Sunday',controller.morningAt===kstInstant(sunday,'08:10'));
   check('weekend test does not enable any default automatic feature',Object.values(controller.store.features()).every(value=>value===false));controller.close();
  }
 }finally{for(const window of pages)if(!window.isDestroyed())window.destroy();}
}
