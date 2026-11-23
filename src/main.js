import {bindPowerEvents} from './power-events.js';
import {guardSession} from './hidden-resources.js';
import {dailyTicket} from './task-ticket.js';
import {docpleTodayReceipt} from './docple-receipt.js';
import {DataAccess} from './data-access.js';
import {SiteWait,workerWait,observeSiteResponse} from './site-wait.js';
import {NativeCatalogRead} from './native-catalog.js';
import {configureUsage,changeUsage,flushUsage,resourceUse,trackPage} from './resource-use.js';
import {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,session,dialog,clipboard,powerMonitor,safeStorage,net,shell} from 'electron';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {readFileSync,mkdirSync} from 'node:fs';
import {release} from 'node:os';
import {snapshotIdentityState} from './identity-snapshot.js';
import {LocalState} from './local-state.js';
import {SITES} from './sites.js';
import {siteById,allowedNavigation,allowedPopup,remotePreferences,trustedControl} from './security.js';
import {kstDate} from './schedule.js';
import {kstInstant} from './schedule.js';
import {CatalogStore} from './catalog-store.js';
import {CatalogRunner} from './catalog-runner.js';
import {electronCatalogPage} from './electron-catalog-page.js';
import {BUILD_INFO} from './build-info.js';
import {formatPcSchedule} from './catalog-format.js';
import {resolveEdition} from './edition.js';
import {createDeveloperTools} from './developer-tools.js';
import {inspectLoginPage,safeLoginState,loadFailure,sessionWithDailyEvidence} from './login-status.js';
import {CatalogQueue} from './catalog-queue.js';
import {AutomationController} from './automation-controller.js';
import {AutomationPage} from './automation-page.js';
import {pageRole} from './page-role.js';
import {DAILY_TASKS} from './automation-policy.js';
import {watchManualEntry} from './manual-entry-watch.js';
import {CredentialManager} from './credential-manager.js';
import {credentialSite,safeCredentialStatus} from './credential-policy.js';
import {credentialPageState} from './credential-page-state.js';
import {manualLoadRecovery} from './site-load-policy.js';
import {RuntimeFaults,faultNotice} from './runtime-faults.js';
import {PcUpdater} from './update-manager.js';
import {downloadPrivateUpdate} from './private-update.js';
import {electronPatchDownload} from './update-electron-download.js';
import {RegistrationController,RegistrationStore,registrationKey} from './registration.js';
import {pcEntryPage,pcEntrySource} from './entry-page.js';
import {doctorvilleDetailNavigation} from './automation-policy.js';
import {boundedWork,waitFor} from './async-work.js';
import {ReportPreview} from './report-preview.js';
import {PcOptions} from './pc-options.js';
import {canRegisterEntry} from './execution-presentation.js';

const metadata=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const VERSION=metadata.version,EDITION=resolveEdition(metadata.doctorGleanEdition);
const PROCESS_STARTED_AT=Math.floor(Date.now()-process.uptime()*1000);
app.setName(EDITION.name);
const dataDirectory=join(app.getPath('appData'),EDITION.directory),browserDirectory=join(dataDirectory,'browser');
mkdirSync(browserDirectory,{recursive:true,mode:0o700});
if(app.getPath('userData')!==dataDirectory)app.setPath('userData',dataDirectory);
if(app.getPath('sessionData')!==browserDirectory)app.setPath('sessionData',browserDirectory);
if(process.platform==='win32')app.setAppUserModelId(EDITION.appId);
const dataAccess=new DataAccess(join(dataDirectory,'data-access-v1.json'));
app.commandLine.appendSwitch('disable-background-networking');
const requestSites=new Map(SITES.flatMap(site=>site.hosts.map(host=>[host,site.id])));
requestSites.set('api.keymedi.com','keymedi');
function requestSite(raw){
 try{const url=new URL(raw);if(url.protocol==='https:')return requestSites.get(url.hostname)??(allowedNavigation('doctorville',raw)?'doctorville':undefined);}catch{}
}
const networkSessions=new Set(),registeredSessions=new WeakSet();
function* liveNetworkSessions(){
 for(const ref of networkSessions){const profile=ref.deref();if(profile)yield profile;else networkSessions.delete(ref);}
}
const configureNetwork=(profile,id)=>{
 if(!registeredSessions.has(profile)){registeredSessions.add(profile);networkSessions.add(new WeakRef(profile));}
 guardSession(profile,{
  allowed:request=>{
   if(!dataAccess.allowed())return false;
   if(!siteWait)return true;
   return [id,requestSite(request.url)].every(site=>{
    if(!site||siteWait.allowed(site))return true;
    const hold=siteWait.status(site);
    return hold?.manual===true&&siteWait.clockTrusted(Date.now())&&Date.now()>=hold.until&&[...manualOwners].some(([w,owner])=>owner===site&&!w.isDestroyed()&&w.webContents.id===request.webContentsId);
   });
  },
  response:(details,worker)=>{
   const site=requestSite(details.url)??id;
   if(site&&siteWait&&details.webContentsId>0&&(!worker||site!==id))observeSiteResponse(siteWait,site,details);
  }
 });
 if(!dataAccess.allowed())profile.enableNetworkEmulation({offline:true});
};
app.on('session-created',profile=>configureNetwork(profile));
const controlUrl=new URL('../ui/index.html',import.meta.url).href;
let control,tray,state,catalog,collector,catalogQueue,automation,credentials,registration,developerTools,preload,updater,pcOptions,quitting=false,viewDate=kstDate();
const reportPreview=new ReportPreview();
const loginVisits=new WeakMap();
const manualSurveyKeys=new WeakMap();
const registrationWindows=new Map(),registrationConfirmed=new Map();
const siteWindows=new Map(),remoteWindows=new Set(),configuredSessions=new Set();
const manualOwners=new Map();
const siteSessions=new Map(),navigationVersions=new WeakMap(),loadRequests=new WeakMap(),closingWindows=new WeakSet(),flushingSessions=new Map();
const sessionState=id=>siteSessions.get(id)??{load:'not_opened',login:'not_confirmed',save:'not_requested',route:'other',checkedAt:0,lastError:''};
const runtimeFaults=new RuntimeFaults({onFault:fault=>{
 try{developerTools?.event({area:'process',phase:'fault',site:'',...fault,appVersion:VERSION,sourceCommit:BUILD_INFO.sourceCommit});}catch{}
 // Stop new dispatches before cancelling workers. Never clear attempt records.
 try{state?.setPaused(true);}catch{}
 for(const stop of [()=>catalogQueue?.clear(),()=>collector?.cancel(),()=>automation?.cancel(),()=>credentials?.cancel(),()=>registration?.cancel()])try{stop();}catch{}
 try{if(tray&&!tray.isDestroyed())updateTray();notify();}catch{}
}});
runtimeFaults.install();
const effectiveSession=id=>sessionWithDailyEvidence(id,sessionState(id),catalog?.view(kstDate()).results[id],automation?.store.day().daily);
function sessionChange(id,change){siteSessions.set(id,{...sessionState(id),...change,...(change.login&&change.login!=='authenticated'?{authSource:''}:{})});notify();}
const browserEvents=[];
function browserEvent(site,kind){
  browserEvents.push({site,kind,at:Date.now()});if(browserEvents.length>30)browserEvents.shift();
  developerTools?.event({area:'browser',phase:kind,site});notify();
}
function validQueryDate(date){try{kstInstant(date,'00:00');const today=kstDate();return date>=today&&date<=kstDate(kstInstant(today,'00:00')+7*86_400_000);}catch{return false;}}
function notify(){if(control&&!control.isDestroyed())control.webContents.send('pc:changed');}
const buildState=()=>({
  version:VERSION,processStartedAt:PROCESS_STARTED_AT,appName:EDITION.name,applicationId:EDITION.appId,edition:EDITION.id,date:validQueryDate(viewDate)?viewDate:(viewDate=kstDate()),today:kstDate(),
  maxDate:kstDate(kstInstant(kstDate(),'00:00')+7*86_400_000),paused:state.snapshot().paused,
  sites:SITES.map(({id,name,loginUrl})=>({id,name,serverWait:siteWait?.status(id),open:[...manualOwners.values()].includes(id),loginEntry:!!loginUrl,session:effectiveSession(id),catalog:true,selected:catalog.selected().includes(id)})),
  collection:collector.snapshot(),results:catalog.view(validQueryDate(viewDate)?viewDate:kstDate()).results,
  pendingQueries:catalogQueue?.snapshot()??[],
  siteWaitUntrusted:!!siteWait&&!siteWait.clockTrusted(Date.now()),dataAccess:dataAccess.snapshot(),usage:resourceUse(),options:pcOptions?.snapshot(),credentials:credentials?.snapshot(),update:updater?.snapshot(),
  automationAvailable:true,automation:automation?.snapshot(),registration:registrationState(),dailyTasks:DAILY_TASKS.map(({key,label,site})=>({key,label,site})),
});

function diagnosticSnapshot(){
 const snapshot=state.snapshot();
 return {appName:EDITION.name,applicationId:EDITION.appId,edition:EDITION.id,appVersion:VERSION,build:BUILD_INFO,exportedAt:Date.now(),processStartedAt:PROCESS_STARTED_AT,date:kstDate(),automationPaused:snapshot.paused,
  runtime:{platform:process.platform,arch:process.arch,electron:process.versions.electron,chromium:process.versions.chrome,osRelease:release()},runtimeFaults:runtimeFaults.snapshot(),dataAccess:dataAccess.snapshot(),siteWaitUntrusted:!!siteWait&&!siteWait.clockTrusted(Date.now()),resourceUse:resourceUse(),
  stage:'automation',automationAvailable:true,collection:collector.snapshot(),selectedCatalogSites:catalog.selected(),pendingQueries:catalogQueue?.snapshot()??[],sites:catalog.diagnostics(viewDate),automation:automation?.diagnostics(),
  siteSessions:SITES.map(({id})=>({site:id,open:[...manualOwners.values()].includes(id),...effectiveSession(id)})),credentials:credentials?.snapshot(),registration:registration?.store.snapshot(),browserEvents:[...browserEvents],developerDiagnostics:developerTools?.status(),
  attempts:Object.values(snapshot.jobs).map(({site,kind,date,slot,state,updatedAt})=>({site,kind,date,slot,state,updatedAt}))};
}
function registrationState(){
 if(!registration)return undefined;
 const entries={},lectures={},lectureKeys={};for(const job of automation?.store.entries()??[])entries[job.key]=registration.store.status(job);
 for(const row of Object.values(catalog.view(viewDate).results))for(const event of row.events){lectures[event.id]=registration.store.status(event);if(event.site==='hmp')lectureKeys[event.id]=registrationKey(event);}
 return {active:registration.active?.job.site??'',storageUnavailable:registration.store.failed,entries,lectures,lectureKeys};
}
function registrationFinished(target){
 if(quitting)return;
 automation?.entry.registrationConfirmed(target);
 if(validQueryDate(target.date))catalogQueue?.request(target.date,[target.site]);
 notify();
}
function createRegistrationPage(job,signal,{check}){
 let window=registrationWindows.get(job.key);
 if(window?.isDestroyed()){registrationWindows.delete(job.key);window=null;}
 if([...manualOwners].some(([other,site])=>site===job.site&&other!==window))throw Error('manual_view_open');
 if(!window){
  window=new BrowserWindow({width:1100,height:820,show:false,parent:control,title:siteById(job.site).name,autoHideMenuBar:false,webPreferences:prepareSession(job.site)});
  registrationWindows.set(job.key,window);siteWindows.set(job.site,window);hardenSiteWindow(window,job.site);browserEvent(job.site,'window_opened');
  window.setTitle(siteById(job.site).name+' · 강의 신청 · 완료 후 상단의 신청 마침을 눌러 주세요');
  window.setMenu(Menu.buildFromTemplate([
   {id:'finish-registration',label:'신청 마침 · 상태 확인',click:async()=>{try{const result=await check();if(result.ok&&result.status==='confirmed')await finishSiteLogin(job.site);else if(!window.isDestroyed())await dialog.showMessageBox(window,{type:'info',message:'선택한 강의의 신청 완료 상태를 확인하지 못했어요. 사이트에서 최종 신청을 마친 뒤 다시 확인해 주세요.'});}catch{}}},
   {id:'open-login',label:'로그인 화면',click:()=>{registration?.cancel(job.site);navigateSite(window,job.site,siteById(job.site).loginUrl);}},
  ]));
  const owned=window;
  window.on('closed',()=>{
   if(registrationWindows.get(job.key)!==owned)return;registrationWindows.delete(job.key);registration?.cancel(job.site);
   const confirmed=registrationConfirmed.get(job.key);registrationConfirmed.delete(job.key);
   try{if(confirmed)registrationFinished(confirmed);else if(!quitting&&validQueryDate(job.date))catalogQueue?.request(job.date,[job.site]);}catch(error){operationError(error,'control');}
  });
 }
 const contents=window.webContents,alive=()=>{if(signal.aborted||window.isDestroyed())throw Error('cancelled');};
 const page={
  get url(){return window.isDestroyed()?'':contents.getURL();},get version(){return navigationVersions.get(window)??0;},
  async load(url){alive();if(url!==siteById(job.site).url&&!doctorvilleDetailNavigation(page.url,url))throw Error('policy_rejected');window.show();window.focus();await boundedWork(window.loadURL(url),signal,30000);alive();},
  async ready(){for(let i=0;i<125;i++){alive();if(!contents.isLoadingMainFrame()&&page.url!=='about:blank')return;await waitFor(80,signal);}throw Error('time_limit');},
  async call(target,mode,binding){
   await page.ready();alive();const url=page.url,version=page.version;
   if(['login','provider'].includes(pageRole(url)))return {status:'login',reason:'login_required'};
   if(!allowedNavigation(job.site,url)||mode==='click'&&(!binding||binding.url!==url||binding.version!==version))throw Error('page_changed');
   const code=`(()=>{if(location.href!==${JSON.stringify(url)})return null;return JSON.stringify((${pcEntrySource()})(${JSON.stringify(target)},${JSON.stringify('registration-'+mode)}));})()`;
   let encoded;try{encoded=await boundedWork(contents.executeJavaScriptInIsolatedWorld(1002,[{code}]),signal,10000);}catch(error){if(mode==='click'&&!signal.aborted&&!window.isDestroyed()&&page.version!==version)return {status:'unconfirmed'};throw error;}
   alive();if(mode!=='click'&&(page.version!==version||page.url!==url))throw Error('page_changed');
   if(typeof encoded!=='string'||encoded.length>32000)throw Error('invalid_response');return JSON.parse(encoded);
  },close(){},
 };return page;
}

async function flushProfile(id){
 if(flushingSessions.has(id))return flushingSessions.get(id);
 const work=(async()=>{
  sessionChange(id,{save:'saving'});let timer;
  try{
   const profile=session.fromPartition(remotePreferences(id,EDITION.id).partition);
   await Promise.race([profile.cookies.flushStore().then(()=>profile.flushStorageData()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('flush_timeout')),3000);})]);
   sessionChange(id,{save:'flushed'});browserEvent(id,'session_flushed');return true;
  }catch{sessionChange(id,{save:'failed'});browserEvent(id,'session_flush_failed');return false;}
  finally{clearTimeout(timer);}
 })();
 flushingSessions.set(id,work);try{return await work;}finally{flushingSessions.delete(id);}
}
function armLoginVisit(window,id){
 if(!['doctorville','intermd'].includes(id)||!credentials.vault.enabled(id)||state.snapshot().paused||!catalog.selected().includes(id))return;
 loginVisits.set(window,{selection:catalogSelectionEpoch,day:kstDate(),date:viewDate,account:credentials.vault.epoch(id),epoch:state.snapshot().epoch,expires:Date.now()+150000});
}
async function continueLoginVisit(window,id,url,version){
 const visit=loginVisits.get(window);
 const valid=()=>visit&&Date.now()<visit.expires&&visit.selection===catalogSelectionEpoch&&visit.day===kstDate()&&visit.date===viewDate&&validQueryDate(viewDate)&&state.snapshot().epoch===visit.epoch&&!state.snapshot().paused&&credentials.vault.epoch(id)===visit.account&&credentials.vault.enabled(id)&&dataAccess.allowed()&&siteWait.allowed(id)&&catalog.selected().includes(id)&&!window.isDestroyed()&&loginVisits.get(window)===visit&&window.webContents.getURL()===url&&navigationVersions.get(window)===version&&[...manualOwners].filter(([,owner])=>owner===id).every(([w])=>loginVisits.get(w)===visit);
 if(!valid()||visit.pending||!siteById(id).hosts.includes(new URL(url).hostname)||['login','provider'].includes(pageRole(url)))return;
 visit.pending=true;
 try{
  if(!await flushProfile(id)||!valid())return;
  for(const [w,owner] of manualOwners)if(owner===id&&loginVisits.get(w)===visit){loginVisits.delete(w);closingWindows.add(w);w.destroy();}
  catalogQueue.request(visit.date,[id]);showControl();
 }finally{visit.pending=false;}
}
async function inspectSession(window,id){
 if(window.isDestroyed())return;
 const contents=window.webContents,url=contents.getURL(),version=navigationVersions.get(window);
 if(!allowedNavigation(id,url))return;
 let timer;try{
  const probe='(()=>{const state=('+inspectLoginPage.toString()+')();if('+JSON.stringify(id==='dtalks')+'&&state==="not_confirmed"){const reply=('+credentialPageState.toString()+')('+JSON.stringify({site:id,mode:'verify',expectedUrl:url,validation:false})+');if(reply.status==="authenticated")return "authenticated";}return state;})()';
  const value=await Promise.race([contents.executeJavaScript(probe,false),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('probe_timeout')),3000);})]);
  if(!window.isDestroyed()&&contents.getURL()===url&&navigationVersions.get(window)===version){sessionChange(id,{login:safeLoginState(value),route:pageRole(url),checkedAt:Date.now()});if(value==='authenticated')await continueLoginVisit(window,id,url,version);}
 }catch{}finally{clearTimeout(timer);}
}
function navigateSite(window,id,url,allowLoginFallback=true){
 if(window.isDestroyed())return;
 if(!allowedNavigation(id,url)){sessionChange(id,{lastError:'navigation_blocked'});browserEvent(id,'navigation_blocked');return;}
 const request=(loadRequests.get(window)??0)+1;loadRequests.set(window,request);
 sessionChange(id,{load:'loading',lastError:'',login:'loading'});
 if(window.isMinimized())window.restore();window.show();window.focus();
 window.loadURL(url).catch(error=>{
  if(window.isDestroyed()||loadRequests.get(window)!==request)return;
  const recovery=manualLoadRecovery(id,url,error,allowLoginFallback);if(recovery==='aborted')return;
  if(recovery==='login'){browserEvent(id,'login_fallback');navigateSite(window,id,siteById(id).loginUrl,false);return;}
  const reason=loadFailure(error.errno);sessionChange(id,{load:'failed',lastError:reason,login:'not_confirmed'});
  const page='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{font:18px system-ui;padding:40px;color:#193d35}p{line-height:1.8}</style><h1>사이트를 열지 못했어요</h1><p>이 창 위쪽의 「다시 열기」 또는 「로그인 화면」을 눌러 주세요.</p><p>문제가 계속되면 관리 창에서 오류보고를 저장해 주세요.</p>';
  window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(page)).catch(()=>{});
 });
}
async function finishSiteLogin(id){
 if(!siteById(id))return {ok:false,reason:'invalid_site'};
 const windows=[...manualOwners].filter(([,owner])=>owner===id).map(([window])=>window);
 for(const window of windows)loginVisits.delete(window);
 await Promise.all(windows.map(async window=>{await observeDocple(window,id);await inspectSession(window,id);}));
 // The action acknowledges the user's login step; it is not authentication proof.
 const saved=await flushProfile(id);
 if(!saved)return {ok:false,reason:'session_storage_error'};
 for(const window of windows)if(!window.isDestroyed()){closingWindows.add(window);window.destroy();}
 showControl();
 if(catalog.selected().includes(id)){
  if(!validQueryDate(viewDate))viewDate=kstDate();
  catalogQueue.request(viewDate,[id]);
 }
 automation?.requestDaily({readOnly:true,keys:DAILY_TASKS.filter(task=>task.site===id&&pcOptions.snapshot().dailyKeys.includes(task.key)&&automation.store.day().daily[task.key]?.status==='login').map(task=>task.key)});
 return {ok:true,queryStarted:catalog.selected().includes(id)};
}

function updateTray(){
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:EDITION.name+' 열기',click:showControl},
    {label:state.snapshot().paused?'자동 실행 허용':'자동 실행 중지',click:()=>{try{const paused=!state.snapshot().paused;if(paused){catalogQueue.clear();collector.cancel();automation?.cancel();credentials?.cancel();registration?.cancel();}state.setPaused(paused);automation?.resumed();updateTray();notify();}catch(error){operationError(error,'control');}}},
    {label:'전체 중지',click:()=>{try{catalogQueue.clear();collector.cancel();automation?.cancel();credentials?.cancel();registration?.cancel();state.setPaused(true);updateTray();notify();}catch(error){operationError(error,'control');}}},
    {type:'separator'},
    {label:'프로그램 종료',click:()=>app.quit()},
  ]));
}
function operationError(error,origin='automation'){
  const fault=runtimeFaults.record(origin,error);
  dialog.showMessageBox(faultNotice(fault)).catch(()=>{});
}
function showControl(){
  if(control&&!control.isDestroyed()){control.show();control.focus();return;}
  control=new BrowserWindow({
    width:780,height:760,minWidth:600,minHeight:500,title:EDITION.name,
    autoHideMenuBar:true,backgroundColor:'#f7faf9',
    webPreferences:{preload,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,navigateOnDragDrop:false},
  });
  control.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  control.webContents.on('will-navigate',event=>event.preventDefault());
  control.webContents.on('will-attach-webview',event=>event.preventDefault());
  control.on('close',event=>{if(!quitting){event.preventDefault();control.hide();}});
  const window=control;
  window.loadURL(controlUrl).catch(error=>{if(!quitting&&control===window&&!window.isDestroyed())operationError(error,'control');});
}
let siteWait;
function workerTraffic(id,signal){dataAccess.require();return workerWait(siteWait,id,signal,()=>credentials?.vault.epoch(id)??0);}
const profileEpochs=new Map();
app.on('web-contents-created',(_event,contents)=>trackPage(contents,'all'));
function prepareSession(id){
  dataAccess.require();
  const preferences=remotePreferences(id,EDITION.id);
  const profile=session.fromPartition(preferences.partition);
  if(!configuredSessions.has(id)){
    configureNetwork(profile,id);
    profile.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    profile.setPermissionCheckHandler(()=>false);
    profile.on('will-download',event=>event.preventDefault());
    profile.on('cookie-changed',()=>profileEpochs.set(id,(profileEpochs.get(id)??0)+1));
    profile.cookies.on('changed',()=>profileEpochs.set(id,(profileEpochs.get(id)??0)+1));
    configuredSessions.add(id);
  }
  return preferences;
}
async function observeDocple(window,id){
 const permitted=()=>id==='docple'&&!window.isDestroyed()&&dataAccess.allowed()&&!state.snapshot().paused&&pcOptions.snapshot().dailyKeys.includes('docple:attendance')&&manualOwners.get(window)===id;
 if(!permitted())return;
 const contents=window.webContents,url=contents.getURL(),version=navigationVersions.get(window),date=kstDate(),profile=profileEpochs.get(id),account=credentials.vault.epoch(id),epoch=state.snapshot().epoch,selection=attendanceSelectionEpoch;
 if(!/^https:\/\/docple-plus\.com\/offerwall\/attendance\/?$/.test(url))return;
 try{
  const ok=await boundedWork(contents.executeJavaScriptInIsolatedWorld(1003,[{code:'('+docpleTodayReceipt+')('+JSON.stringify(date)+')'}]),new AbortController().signal,3000);
  if(ok!==true||!permitted()||kstDate()!==date||contents.getURL()!==url||navigationVersions.get(window)!==version||profileEpochs.get(id)!==profile||credentials.vault.epoch(id)!==account||state.snapshot().epoch!==epoch||selection!==attendanceSelectionEpoch)return;
  const old=automation.store.day(date).daily['docple:attendance'];
  if(old?.status!=='complete')automation.store.record(date,'docple:attendance',{status:'complete',reason:'docple_visible_receipt',attempted:old?.attempted===true||state.consumed(dailyTicket({site:id,kind:'attendance'},date,0))});
  notify();
 }catch{}
}
let attendanceSelectionEpoch=0,catalogSelectionEpoch=0;
function hardenSiteWindow(window,id){
  if(remoteWindows.has(window))return;
  remoteWindows.add(window);manualOwners.set(window,id);notify();
  const contents=window.webContents;
  watchManualEntry(window,id,{jobs:()=>automation?.store.entries()??[],surveyAllowed:()=>manualSurveyKeys.has(window),onSurvey:(url,raw)=>automation?.survey.observe(url,raw,manualSurveyKeys.get(window)),onClick:key=>{automation?.entry.cancelJob(key,true);browserEvent(id,'manual_entry_observed');}});
  window.setTitle(siteById(id).name+' · 로그인 후 상단의 「로그인 마침」을 눌러 주세요');
  contents.on('page-title-updated',event=>event.preventDefault());
  window.setAutoHideMenuBar(false);
  window.setMenu(Menu.buildFromTemplate([
    ...(id==='docple'?[{label:'지금 열린 달력에서 오늘 출석 확인',click:()=>observeDocple(window,id)}]:[]),
    {id:'finish-login',label:'로그인 마침 · 선택한 사이트 조회',click:()=>finishSiteLogin(id).then(result=>{if(!result.ok)dialog.showMessageBox(window,{type:'error',message:'사이트의 세션 저장 요청을 마치지 못했어요. 이 창을 유지하고 다시 시도해 주세요.'});}).catch(()=>{})},
    {id:'open-login',label:'로그인 화면',enabled:!!siteById(id).loginUrl,click:()=>{armLoginVisit(window,id);navigateSite(window,id,siteById(id).loginUrl);}},
    {label:'다시 열기',click:()=>navigateSite(window,id,siteById(id).url)},
  ]));
  contents.on('did-start-navigation',(event,_url,inPlace,main)=>{
    if((main??event.isMainFrame)&&!(inPlace??event.isInPlace)&&allowedNavigation(id,typeof _url==='string'?_url:event.url)){navigationVersions.set(window,(navigationVersions.get(window)??0)+1);sessionChange(id,{load:'loading',login:'loading',lastError:''});}
  });
  const navigation=(event,url)=>{
    const target=typeof url==='string'?url:event.url;
    if(!allowedNavigation(id,target)){event.preventDefault();sessionChange(id,{lastError:'navigation_blocked'});browserEvent(id,'navigation_blocked');}
  };
  contents.on('did-navigate-in-page',()=>{if(loginVisits.has(window))void inspectSession(window,id);});
  contents.on('did-finish-load',()=>{
    if(!allowedNavigation(id,contents.getURL()))return;
    sessionChange(id,{load:'ready'});browserEvent(id,'document_ready');void observeDocple(window,id);void inspectSession(window,id);
    const visit=loginVisits.get(window),version=navigationVersions.get(window);
    if(visit)for(const delay of [600,2000])setTimeout(()=>{if(!window.isDestroyed()&&loginVisits.get(window)===visit&&navigationVersions.get(window)===version)void inspectSession(window,id);},delay).unref();
  });
  contents.on('did-fail-load',(_event,code,_description,_url,main)=>{
    if(main!==false&&code!==-3){sessionChange(id,{load:'failed',login:'not_confirmed',lastError:loadFailure(code)});browserEvent(id,'document_load_failed');}
  });
  contents.on('render-process-gone',()=>{sessionChange(id,{load:'failed',login:'not_confirmed',lastError:'renderer_stopped'});browserEvent(id,'document_load_failed');});
  contents.on('will-navigate',navigation);
  contents.on('will-redirect',(event,url,_inPlace,isMainFrame)=>{
    // A redirected embedded video is not a top-level control navigation.
    const main=typeof isMainFrame==='boolean'?isMainFrame:event.isMainFrame;
    if(main!==false)navigation(event,url);
  });
  contents.on('will-attach-webview',event=>event.preventDefault());
  contents.setWindowOpenHandler(({url})=>{
    if(!dataAccess.allowed()||siteWait.status(id)?.until>Date.now()||!allowedPopup(id,url,contents.getURL())||remoteWindows.size>=12){sessionChange(id,{lastError:'popup_blocked'});browserEvent(id,'popup_blocked');return {action:'deny'};}
    return {action:'allow',overrideBrowserWindowOptions:{show:true,width:1100,height:820,autoHideMenuBar:false,webPreferences:prepareSession(id)}};
  });
  contents.on('did-create-window',child=>{if(loginVisits.has(window))loginVisits.set(child,loginVisits.get(window));if(manualSurveyKeys.has(window))manualSurveyKeys.set(child,manualSurveyKeys.get(window));hardenSiteWindow(child,id);child.show();child.focus();});
  window.on('close',event=>{
    if(quitting||closingWindows.has(window))return;
    event.preventDefault();
    observeDocple(window,id).then(()=>inspectSession(window,id)).finally(()=>flushProfile(id)).finally(()=>{if(!window.isDestroyed()){closingWindows.add(window);window.close();}});
  });
  window.on('closed',()=>{
    remoteWindows.delete(window);
    manualOwners.delete(window);notify();
    if(siteWindows.get(id)===window)siteWindows.delete(id);
    if(!quitting&&!manualOwners.size)showControl();
  });
}
function openSite(id,login=false,survey){
  dataAccess.require();if(siteWait.status(id)?.until>Date.now())throw Error('site_wait');
  const site=siteById(id);if(!site)throw Error('invalid_site');
  if(collector.snapshot().running&&collector.snapshot().site===id)collector.cancel();
  automation?.manualOpened(id);
  credentials?.cancel(id);registration?.cancel(id);
  const existing=siteWindows.get(id);
  if(existing&&!existing.isDestroyed()){
    if(existing.isMinimized())existing.restore();existing.show();existing.focus();
    if(survey){manualSurveyKeys.set(existing,survey.key);navigateSite(existing,id,survey.url);}
    else if(login&&site.loginUrl){armLoginVisit(existing,id);navigateSite(existing,id,site.loginUrl);}
    return;
  }
  let window;try{window=new BrowserWindow({width:1100,height:820,show:false,parent:control,title:site.name,autoHideMenuBar:false,webPreferences:prepareSession(id)});}
  catch{sessionChange(id,{load:'failed',login:'not_confirmed',lastError:'window_unavailable'});browserEvent(id,'window_open_failed');throw Error('window_unavailable');}
  siteWindows.set(id,window);hardenSiteWindow(window,id);
  browserEvent(id,'window_opened');
  if(login)armLoginVisit(window,id);
  if(survey)manualSurveyKeys.set(window,survey.key);
  navigateSite(window,id,survey?.url??(login&&site.loginUrl?site.loginUrl:site.url));
}
function registerIPC(channel,handler){
  ipcMain.handle(channel,async(event,...args)=>{
    if(!trustedControl(event,control,controlUrl))throw Error('not_allowed');
    if(remoteChannels.has(channel)&&!dataAccess.allowed())return {ok:false,reason:'data_blocked'};
    if(updater?.guarded&&!['pc:state','pc:quit','pc:update-check','pc:update-install','pc:update-ready'].includes(channel))return {ok:false,reason:'busy'};
    try{return await handler(...args);}
    catch(error){if(pcOptions?.failed){try{state.setPaused(true);automation?.cancel();notify();}catch{}}return {ok:false,reason:['invalid_selection','invalid_date','collection_busy','window_unavailable','data_blocked','site_wait'].includes(error.message)?error.message:'operation_unavailable'};}
  });
}
const remoteChannels=new Set('update-check update-install update-page collect collect-site daily quick-run survey-open credential-save credential-recover entry-preflight entry-preflight-upcoming registration-request open-site open-login finish-login'.split(' ').map(k=>'pc:'+k));
function ipc(){
  registerIPC('pc:data-mode',mode=>{
   const before=dataAccess.allowed();
   try{dataAccess.set(mode);}
   finally{
    if(before&&!dataAccess.allowed()){
     for(const profile of liveNetworkSessions()){profile.enableNetworkEmulation({offline:true});void profile.closeAllConnections().catch(()=>{});}
     catalogQueue.clear();collector.cancel();automation.cancel();credentials.cancel();registration.cancel();
     for(const window of BrowserWindow.getAllWindows())if(window!==control&&!window.isDestroyed())window.destroy();
     // Terminate existing network-service sockets, service workers and downloads.
     if(!dataAccess.failed){app.relaunch();setImmediate(()=>app.quit());}
    }
    if(!before&&dataAccess.allowed()){
     for(const profile of liveNetworkSessions())profile.disableNetworkEmulation();
     automation.rearm();catalogQueue.pump();
    }
    notify();
   }
   return {ok:true};
  });
  registerIPC('pc:update-check',()=>updater.check());
  registerIPC('pc:update-install',()=>updater.install());
  registerIPC('pc:update-ready',()=>{updater.acknowledgeBoot().catch(()=>{});return {ok:true};});
  registerIPC('pc:update-page',async()=>{
   const result=updater.snapshot();if(!['available','full_required'].includes(result.status))return {ok:false};
   const page=result.page;
   if(!/^https:\/\/github\.com\/issackr580\/doctor-glean-pc\/releases\/tag\/(?:pc-v\d+\.\d+\.\d+(?:-preview\.\d+)?|untagged-[a-zA-Z0-9-]{1,80}|pc-developer-v\d+\.\d+\.\d+(?:-preview\.\d+)?)$/.test(page))return {ok:false};
   await shell.openExternal(page);return {ok:true};
  });
  developerTools.register();
  registerIPC('pc:state',()=>buildState());
  registerIPC('pc:set-date',date=>{
    if(!validQueryDate(date))return {ok:false,reason:'invalid_date'};
    catalogSelectionEpoch++;catalogQueue.clear();collector.cancel();viewDate=date;notify();return {ok:true,state:buildState()};
  });
  registerIPC('pc:select-sites',ids=>{
    catalogSelectionEpoch++;catalogQueue.clear();collector.cancel();catalog.select(ids);notify();return {ok:true,state:buildState()};
  });
  registerIPC('pc:collect',()=>{
    if(!validQueryDate(viewDate))return {ok:false,reason:'invalid_date'};
    if(collector.snapshot().running)return {ok:false,reason:'collection_busy'};
    catalogQueue.request(viewDate,catalog.selected());
    return {ok:true};
  });
  registerIPC('pc:usage',action=>({ok:changeUsage(action)}));
  registerIPC('pc:confirm-site-wait',(id,at,revision)=>{const ok=siteWait.acknowledge(id,at,revision);notify();return {ok};});
  registerIPC('pc:collect-site',id=>{
    if(!SITES.some(site=>site.id===id))return {ok:false,reason:'invalid_site'};
    if(!validQueryDate(viewDate))return {ok:false,reason:'invalid_date'};
    catalogQueue.request(viewDate,[id]);return {ok:true};
  });
  registerIPC('pc:cancel-collection',()=>{catalogQueue.clear();collector.cancel();return {ok:true};});
  registerIPC('pc:daily-selection',keys=>{attendanceSelectionEpoch++;catalogQueue.invalidateAutomatic();automation.daily.cancel();pcOptions.selectDaily(keys);notify();return {ok:true};});
  registerIPC('pc:memo',(date,text)=>{if(!validQueryDate(date))return {ok:false};pcOptions.memo(date,text);notify();return {ok:true};});
  registerIPC('pc:entry-hosts',rows=>{if(automation.busy||remoteWindows.size||credentials.busy||collector.snapshot().running)return {ok:false,reason:'busy'};pcOptions.hosts(rows);notify();return {ok:true};});
  registerIPC('pc:survey-skip',(key,value)=>({ok:automation.survey.skip(key,value)}));
  registerIPC('pc:survey-open',key=>{const url=automation.survey.target(key);if(!url)return {ok:false};openSite('doctorville',false,{key,url});return {ok:true};});
  registerIPC('pc:copy-schedule',async()=>{await clipboard.writeText(formatPcSchedule(viewDate,catalog.selected(),catalog.view(viewDate).results)+(pcOptions.snapshot().memos[viewDate]?'\n\n메모: '+pcOptions.snapshot().memos[viewDate]:''));return {ok:true};});
  registerIPC('pc:pause',value=>{
    if(typeof value!=='boolean')return {ok:false,reason:'invalid_setting'};
    if(value){catalogQueue.clear();collector.cancel();automation?.cancel();credentials?.cancel();registration?.cancel();}state.setPaused(value);if(!value)automation?.resumed();updateTray();notify();return {ok:true,state:buildState()};
  });
  registerIPC('pc:set-feature',(key,value)=>{automation.setFeature(key,value);if(!value&&['morning','dailyClaim'].includes(key))catalogQueue.invalidateAutomatic();return {ok:true,state:buildState()};});
  registerIPC('pc:set-entry-sites',ids=>{automation.setEntrySites(ids);return {ok:true,state:buildState()};});
  registerIPC('pc:daily',readOnly=>{if(typeof readOnly!=='boolean')return {ok:false,reason:'invalid_setting'};return automation.requestDaily({readOnly});});
  registerIPC('pc:quick-run',()=>automation.quick());
  const credentialReply=result=>({ok:['saved','authenticated'].includes(result.status),status:safeCredentialStatus(result.status),submitted:result.submitted===true,attempted:result.attempted===true,...(result.detail==='input_format'?{detail:'input_format'}:{}),...(Number.isSafeInteger(result.retryAt)?{retryAt:result.retryAt}:{})});
  const refreshCredentialProfile=async(site,result)=>{
   if(result.status!=='authenticated')return;
   sessionChange(site,{login:'authenticated',authSource:'verified_profile',checkedAt:Date.now(),lastError:''});
   await flushProfile(site);
   if(catalog.selected().includes(site)){if(!validQueryDate(viewDate))viewDate=kstDate();catalogQueue.request(viewDate,[site]);}
   const keys=DAILY_TASKS.filter(task=>task.site===site&&pcOptions.snapshot().dailyKeys.includes(task.key)&&automation.store.day().daily[task.key]?.status==='login').map(task=>task.key);
   if(keys.length)automation.requestDaily({readOnly:true,keys});
  };
  const prepareCredential=id=>{if(!credentialSite(id))throw Error('invalid_site');if(collector.snapshot().running&&collector.snapshot().site===id)collector.cancel();automation.manualOpened(id);registration?.cancel(id);};
  registerIPC('pc:credential-save',async(site,id,password,automatic)=>{
   prepareCredential(site);try{
    const saved=await credentials.save(site,id,password,automatic);id='';password='';if(saved.status!=='saved')return credentialReply(saved);
    let profileStatus='not_checked';
    if(automatic&&!state.snapshot().paused){const recovered=await credentials.recover(site,{automatic:true});profileStatus=recovered.status;await refreshCredentialProfile(site,recovered);}
    return {...credentialReply(saved),profileStatus};
   }finally{id='';password='';}
  });
  registerIPC('pc:credential-recover',async site=>{prepareCredential(site);const result=await credentials.recover(site);await refreshCredentialProfile(site,result);return credentialReply(result);});
  registerIPC('pc:credential-automatic',(site,value)=>{credentials.setAutomatic(site,value);return {ok:true};});
  registerIPC('pc:credential-remove',site=>{credentials.remove(site);return {ok:true};});
  registerIPC('pc:credential-cancel',site=>{if(!credentialSite(site))return {ok:false};credentials.cancel(site);return {ok:true};});
  registerIPC('pc:entry-cancel',key=>({ok:automation.entry.cancelJob(key)}));
  registerIPC('pc:entry-retry',key=>({ok:automation.entry.retryJob(key)}));
  registerIPC('pc:entry-manual',key=>({ok:automation.entry.cancelJob(key,true)}));
  registerIPC('pc:entry-preflight',key=>automation.preflightEntry(key));
  registerIPC('pc:entry-preflight-upcoming',()=>automation.preflightUpcoming());
  registerIPC('pc:registration-request',(source,key)=>registration.request(source,key));
  registerIPC('pc:quit',()=>{setImmediate(()=>app.quit());return {ok:true};});
  registerIPC('pc:open-site',id=>{
    if(!siteById(id))return {ok:false,reason:'invalid_site'};
    openSite(id);return {ok:true};
  });
  registerIPC('pc:open-login',id=>{
    if(!siteById(id)?.loginUrl)return {ok:false,reason:'invalid_site'};
    openSite(id,true);return {ok:true};
  });
  registerIPC('pc:finish-login',id=>finishSiteLogin(id));
  registerIPC('pc:report-preview',()=>reportPreview.freeze(JSON.stringify({...diagnosticSnapshot(),...developerTools?.reportDetails?.()},null,2)+'\n'));
  registerIPC('pc:report-copy',token=>{const text=reportPreview.text(token);if(text===null)return {ok:false};clipboard.writeText(text);return {ok:true};});
  registerIPC('pc:export-report',async token=>{
    const frozen=token===undefined?null:reportPreview.text(token);if(token!==undefined&&frozen===null)return {ok:false};
    const result=await dialog.showSaveDialog(control,{title:'오류보고 저장',defaultPath:`doctor-glean-pc-${kstDate()}.txt`,filters:[{name:'텍스트 파일',extensions:['txt']}]});
    if(result.canceled||!result.filePath)return {ok:true,cancelled:true};
    const report={...diagnosticSnapshot(),...developerTools?.reportDetails?.()};
    await writeFile(result.filePath,frozen??JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
    return {ok:true};
  });
}

if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(state)showControl();});
  app.on('before-quit',()=>{quitting=true;try{flushUsage();developerTools?.event({area:'process',phase:'quit',site:''});registration?.cancel();catalogQueue?.close();automation?.close();credentials?.cancel();collector?.cancel();developerTools?.close();}catch{}});
  app.on('window-all-closed',()=>{});
  app.on('quit',()=>runtimeFaults.close());
  app.whenReady().then(()=>{
    try{
      snapshotIdentityState(join(app.getPath('userData'),'workflows-v1.json'));snapshotIdentityState(join(app.getPath('userData'),'workflows-v1.json'),'before-entry-policy-v156');snapshotIdentityState(join(app.getPath('userData'),'workflows-v1.json'),'before-network-v168');
      configureUsage(join(dataDirectory,'usage-v1.json'));siteWait=new SiteWait(join(dataDirectory,'site-wait-v1.json'));
      state=new LocalState(join(app.getPath('userData'),'state-v1.json'));
      updater=new PcUpdater({context:{appPath:app.getAppPath(),executable:process.execPath,edition:EDITION.id,currentVersion:VERSION,electronVersion:process.versions.electron,platform:process.platform,arch:process.arch,channel:VERSION.includes('-preview.')?'preview':'stable'},
       fetch:(url,options)=>{dataAccess.require();return net.fetch(url,{...options,signal:AbortSignal.any([options.signal,dataAccess.controller.signal])});},publicDownload:(target,progress)=>{dataAccess.require();return electronPatchDownload(target,progress,dataAccess.controller.signal);},privateDownload:(target,progress)=>{dataAccess.require();return downloadPrivateUpdate(target,progress,{parent:control});},
       isBusy:()=>!dataAccess.allowed()||!!automation?.busy||!!credentials?.busy||!!registration?.active||!!collector?.snapshot().running||manualOwners.size>0||remoteWindows.size>0||!state.snapshot().paused&&automation?.store.features().entry&&!!automation?.store.entries().some(job=>job.status==='reserved'&&job.deadline>=Date.now()&&(job.nextAt??job.due)<=Date.now()+120000),
       onChange:()=>{notify();if(!updater?.guarded){catalogQueue?.pump();automation?.tick();}},quit:()=>app.quit()});
      if(updater.waitForHelper){app.quit();return;}
      pcOptions=new PcOptions(join(dataDirectory,'pc-options-v1.json'));
      catalog=new CatalogStore(join(app.getPath('userData'),'catalog-v1.json'));
      developerTools=createDeveloperTools({directory:dataDirectory,register:registerIPC,notify,edition:EDITION,version:VERSION,build:{sourceCommit:BUILD_INFO.sourceCommit,electronVersion:process.versions.electron,chromiumVersion:process.versions.chrome},copy:text=>clipboard.writeText(text),
        policy:{allowedNavigation,remotePreferences},snapshot:diagnosticSnapshot,save:async(defaultPath,content,valid=()=>true)=>{
          const selected=await dialog.showSaveDialog(control,{title:'개발자 진단 저장',defaultPath,filters:[{name:'진단 파일',extensions:[defaultPath.endsWith('.txt')?'txt':'json']}]});
          if(selected.canceled||!selected.filePath)return {ok:true,cancelled:true};
          if(!valid())return {ok:false};
          await writeFile(selected.filePath,typeof content==='string'?content:JSON.stringify(content,null,2)+'\n',{encoding:'utf8',mode:0o600});return {ok:true};
        }});
      if(developerTools.available!==EDITION.developer)throw Error('edition_mismatch');
      developerTools.event({area:'process',phase:'start',site:''});
      preload=fileURLToPath(new URL('./'+developerTools.preloadName,import.meta.url));
      credentials=new CredentialManager({directory:dataDirectory,applicationId:EDITION.appId,developer:EDITION.developer,
       protect:{available:()=>process.platform==='win32'&&safeStorage.isEncryptionAvailable(),encrypt:text=>safeStorage.encryptString(text),decrypt:bytes=>safeStorage.decryptString(bytes)},
       automaticAllowed:id=>dataAccess.allowed()&&(!id||siteWait.allowed(id))&&!state.snapshot().paused&&!updater.guarded,isManualOpen:id=>[...manualOwners.values()].includes(id),
       createPage:async(id,signal,{validation,partition}={})=>{
        dataAccess.require();const prefs=validation?{...remotePreferences(id,EDITION.id),partition}:prepareSession(id);
        if(validation){const profile=session.fromPartition(partition);configureNetwork(profile,id);profile.setPermissionRequestHandler((_c,_p,callback)=>callback(false));profile.setPermissionCheckHandler(()=>false);profile.on('will-download',event=>event.preventDefault());}
        const page=new AutomationPage(id,signal,prefs,{traffic:workerTraffic(id,signal)});
        if(validation){const close=page.close.bind(page),profile=session.fromPartition(partition);let cleaned=false;page.close=()=>{close();if(!cleaned){cleaned=true;profile.clearStorageData().catch(()=>{});profile.clearCache().catch(()=>{});}};}
        return page;
       },onChange:()=>{notify();if(!credentials?.busy)queueMicrotask(()=>{catalogQueue?.pump();automation?.tick();});}});
      const nativeCatalog=new NativeCatalogRead({gate:siteWait,sessionOwner:id=>session.fromPartition(prepareSession(id).partition),accountEpoch:id=>credentials.vault.epoch(id),profileEpoch:id=>profileEpochs.get(id)??0});
      collector=new CatalogRunner({online:()=>net.isOnline(),context:id=>credentials.vault.epoch(id)+':'+(profileEpochs.get(id)??0),gate:siteWait,store:catalog,createPage:(profile,signal)=>electronCatalogPage(profile,signal,prepareSession(profile.id),workerTraffic(profile.id,signal)),
        prepareCollection:async(id,signal)=>{const admission=await credentials.prepareCollection(id,signal);if(id==='ckd')nativeCatalog.admitCkd(admission);},nativeRead:(...args)=>nativeCatalog.read(...args),
        recoverLogin:async(id,signal)=>(await credentials.recover(id,{automatic:true,signal})).status==='authenticated',
        isManualOpen:id=>[...manualOwners.values()].includes(id)||credentials.active?.site===id,onChange:snapshot=>{developerTools.observe(snapshot);notify();if(!snapshot.running)queueMicrotask(()=>catalogQueue?.pump());}});
      catalogQueue=new CatalogQueue({context:id=>credentials.vault.epoch(id)+':'+(profileEpochs.get(id)??0),resultValid:(date,id)=>{const row=catalog.view(date).results[id];return row?.coverage===true&&!row.stale&&row.status==='ok';},start:async(date,ids,morningAt)=>{const run=collector.start(date,ids);if(collector.snapshot().running)automation?.catalogStarted(date,morningAt);await run;automation?.catalogFinished(date,ids,collector.snapshot(),morningAt);},busy:()=>!dataAccess.allowed()||updater.guarded||collector.sleeping||collector.snapshot().running||!!automation?.busy||credentials.busy,validDate:validQueryDate,onChange:notify});
      automation=new AutomationController({file:join(dataDirectory,'workflows-v1.json'),dataEnabledAt:()=>dataAccess.enabledAt??0,options:pcOptions,followupAllowed:()=>net.isOnline()&&siteWait.allowed('intermd')&&!credentials.busy&&![...manualOwners.values()].includes('intermd'),ledger:state,executionAllowed:()=>dataAccess.allowed()&&!updater.guarded,
       entryContextEpoch:site=>credentials.vault.epoch(site),createPage:(site,signal,options)=>credentials.wrapPage(site,new AutomationPage(site,signal,prepareSession(site),{...options,traffic:workerTraffic(site,signal),externalEntryAllowed:(id,url)=>pcOptions.allowsEntry(id,url)}),options),
       createInspectionPage:(site,signal,options)=>new AutomationPage(site,signal,prepareSession(site),{...options,traffic:workerTraffic(site,signal),externalEntryAllowed:(id,url)=>pcOptions.allowsEntry(id,url)}),onEvent:event=>developerTools.event(event),traceEntry:(job,kind)=>developerTools.traceEntry(job,kind),observeEntry:(...args)=>developerTools.observeEntry(...args),
       isManualOpen:id=>[...manualOwners.values()].includes(id)||credentials.active?.site===id,catalog:date=>catalog.view(date).results,catalogBusy:()=>collector.snapshot().running||credentials.busy,
       queueCatalog:(date,morningAt)=>{
        viewDate=date;const ids=catalog.selected(),queued=catalogQueue.request(date,ids,{automatic:true,morningAt});
        const row=automation.store.day(date).morning;
        if(!queued&&morningAt&&row?.catalogRequestedAt===morningAt)automation.store.record(date,'morning',{...row,status:ids.length?'unknown':'none',reason:ids.length?'collection_in_progress_or_cached':'no_target'});
       },
       yieldCatalog:()=>{const current=collector.snapshot();if(current.running){catalogQueue.request(current.date,catalog.selected());collector.cancel('entry_priority');}},
       onChange:()=>{notify();if(!automation?.busy)queueMicrotask(()=>catalogQueue?.pump());},onError:operationError});
      automation.daily.siteWait=siteWait;
      automation.daily.receiptContext=site=>[credentials.vault.epoch(site),profileEpochs.get(site)??0,state.snapshot().epoch,attendanceSelectionEpoch].join('/');
      registration=new RegistrationController({store:new RegistrationStore(join(dataDirectory,'registration-attempts-v1.json')),
       resolve:(source,key)=>{
        if(source==='entry'){const job=automation.store.entries().find(row=>row.key===key);return canRegisterEntry(job)?job:null;}
        const rows=Object.values(catalog.view(viewDate).results).filter(row=>!row.stale&&['ok','review'].includes(row.status)).flatMap(row=>row.events).filter(event=>event.site==='hmp'&&registrationKey(event)===key&&event.registrationStatus==='not_registered');return rows.length===1?rows[0]:null;
       },createPage:createRegistrationPage,
       createInspectionPage:(job,signal)=>{
        const page=new AutomationPage(job.site,signal,prepareSession(job.site),{traffic:workerTraffic(job.site,signal)});return {get url(){return page.url;},get version(){return page.version;},load:url=>page.load(url),ready:()=>page.ready(),call:(target,mode)=>{if(mode!=='inspect')throw Error('policy_rejected');return page.call('pc-registration.js',[target,'inspect']);},close:()=>page.close()};
       },isBusy:()=>automation.busy||credentials.busy||collector.snapshot().running,
       onConfirmed:target=>{const key=registrationKey(target);if([...manualOwners.values()].includes(target.site))registrationConfirmed.set(key,target);else registrationFinished(target);},onChange:notify});
    }
    catch(error){
      const notice=faultNotice(runtimeFaults.record('startup',error),{startup:true});dialog.showErrorBox(notice.title,notice.message);
      app.quit();return;
    }
    ipc();
    bindPowerEvents(powerMonitor,{collector,automation,onSuspend:()=>{developerTools.event({area:'process',phase:'suspend',site:''});registration.cancel();catalogQueue.clear({keepRunning:true});credentials.cancel();},onResume:()=>{catalogQueue.pump();developerTools.event({area:'process',phase:'resume',site:''});}});
    tray=new Tray(nativeImage.createFromPath(fileURLToPath(new URL('../ui/tray.png',import.meta.url))));
    tray.setToolTip(EDITION.name);tray.on('double-click',showControl);updateTray();showControl();
  }).catch(()=>app.quit());
}
