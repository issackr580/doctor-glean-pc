import {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,session,dialog,clipboard,powerMonitor,safeStorage} from 'electron';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {readFileSync,mkdirSync} from 'node:fs';
import {release} from 'node:os';
import {LocalState} from './local-state.js';
import {SITES} from './sites.js';
import {siteById,allowedNavigation,allowedPopup,remotePreferences,trustedControl} from './security.js';
import {kstDate} from './schedule.js';
import {kstInstant} from './schedule.js';
import {CatalogStore} from './catalog-store.js';
import {CatalogRunner} from './catalog-runner.js';
import {electronCatalogPage} from './electron-catalog-page.js';
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

const metadata=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const VERSION=metadata.version,EDITION=resolveEdition(metadata.doctorGleanEdition);
app.setName(EDITION.name);
const dataDirectory=join(app.getPath('appData'),EDITION.directory),browserDirectory=join(dataDirectory,'browser');
mkdirSync(browserDirectory,{recursive:true,mode:0o700});
if(app.getPath('userData')!==dataDirectory)app.setPath('userData',dataDirectory);
if(app.getPath('sessionData')!==browserDirectory)app.setPath('sessionData',browserDirectory);
if(process.platform==='win32')app.setAppUserModelId(EDITION.appId);
const controlUrl=new URL('../ui/index.html',import.meta.url).href;
let control,tray,state,catalog,collector,catalogQueue,automation,credentials,developerTools,preload,quitting=false,viewDate=kstDate();
const siteWindows=new Map(),remoteWindows=new Set(),configuredSessions=new Set();
const manualOwners=new Map();
const siteSessions=new Map(),navigationVersions=new WeakMap(),loadRequests=new WeakMap(),closingWindows=new WeakSet(),flushingSessions=new Map();
const sessionState=id=>siteSessions.get(id)??{load:'not_opened',login:'not_confirmed',save:'not_requested',route:'other',checkedAt:0,lastError:''};
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
  version:VERSION,appName:EDITION.name,applicationId:EDITION.appId,edition:EDITION.id,date:validQueryDate(viewDate)?viewDate:(viewDate=kstDate()),today:kstDate(),
  maxDate:kstDate(kstInstant(kstDate(),'00:00')+7*86_400_000),paused:state.snapshot().paused,
  sites:SITES.map(({id,name,loginUrl})=>({id,name,open:[...manualOwners.values()].includes(id),loginEntry:!!loginUrl,session:effectiveSession(id),catalog:id!=='docple',selected:catalog.selected().includes(id)})),
  collection:collector.snapshot(),results:catalog.view(validQueryDate(viewDate)?viewDate:kstDate()).results,
  pendingQueries:catalogQueue?.snapshot()??[],
  credentials:credentials?.snapshot(),
  automationAvailable:true,automation:automation?.snapshot(),dailyTasks:DAILY_TASKS.map(({key,label,site})=>({key,label,site})),
});

function diagnosticSnapshot(){
 const snapshot=state.snapshot();
 return {appName:EDITION.name,applicationId:EDITION.appId,edition:EDITION.id,appVersion:VERSION,date:kstDate(),automationPaused:snapshot.paused,
  runtime:{platform:process.platform,arch:process.arch,electron:process.versions.electron,chromium:process.versions.chrome,osRelease:release()},
  stage:'automation',automationAvailable:true,collection:collector.snapshot(),pendingQueries:catalogQueue?.snapshot()??[],sites:catalog.diagnostics(viewDate),automation:automation?.diagnostics(),
  siteSessions:SITES.map(({id})=>({site:id,open:[...manualOwners.values()].includes(id),...effectiveSession(id)})),credentials:credentials?.snapshot(),browserEvents:[...browserEvents],developerDiagnostics:developerTools?.status(),
  attempts:Object.values(snapshot.jobs).map(({site,kind,date,slot,state,updatedAt})=>({site,kind,date,slot,state,updatedAt}))};
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
async function inspectSession(window,id){
 if(window.isDestroyed())return;
 const contents=window.webContents,url=contents.getURL(),version=navigationVersions.get(window);
 if(!allowedNavigation(id,url))return;
 let timer;try{
  const probe='(()=>{const state=('+inspectLoginPage.toString()+')();if('+JSON.stringify(id==='dtalks')+'&&state==="not_confirmed"){const reply=('+credentialPageState.toString()+')('+JSON.stringify({site:id,mode:'verify',expectedUrl:url,validation:false})+');if(reply.status==="authenticated")return "authenticated";}return state;})()';
  const value=await Promise.race([contents.executeJavaScript(probe,false),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('probe_timeout')),3000);})]);
  if(!window.isDestroyed()&&contents.getURL()===url&&navigationVersions.get(window)===version){sessionChange(id,{login:safeLoginState(value),route:pageRole(url),checkedAt:Date.now()});}
 }catch{}finally{clearTimeout(timer);}
}
function navigateSite(window,id,url,allowLoginFallback=true){
 if(!allowedNavigation(id,url))throw Error('invalid_site');
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
 await Promise.all(windows.map(window=>inspectSession(window,id)));
 // The action acknowledges the user's login step; it is not authentication proof.
 const saved=await flushProfile(id);
 if(!saved)return {ok:false,reason:'session_storage_error'};
 for(const window of windows)if(!window.isDestroyed()){closingWindows.add(window);window.destroy();}
 showControl();
 if(id!=='docple'){
  if(!validQueryDate(viewDate))viewDate=kstDate();
  catalogQueue.request(viewDate,[id]);
 }
 return {ok:true,queryStarted:id!=='docple'};
}

function updateTray(){
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:EDITION.name+' 열기',click:showControl},
    {label:state.snapshot().paused?'자동 실행 허용':'자동 실행 중지',click:()=>{try{const paused=!state.snapshot().paused;if(paused){catalogQueue.clear();collector.cancel();automation?.cancel();credentials?.cancel();}state.setPaused(paused);automation?.resumed();updateTray();notify();}catch{storageError();}}},
    {label:'전체 중지',click:()=>{try{catalogQueue.clear();collector.cancel();automation?.cancel();credentials?.cancel();state.setPaused(true);updateTray();notify();}catch{storageError();}}},
    {type:'separator'},
    {label:'프로그램 종료',click:()=>app.quit()},
  ]));
}
function storageError(){
  dialog.showMessageBox({type:'error',title:'저장 확인 필요',message:'설정이나 실행 기록을 저장하지 못해 자동 실행을 중지했어요. 저장 공간과 파일 접근 권한을 확인해 주세요.'});
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
  control.loadURL(controlUrl);
}
function prepareSession(id){
  const preferences=remotePreferences(id,EDITION.id);
  const profile=session.fromPartition(preferences.partition);
  if(!configuredSessions.has(id)){
    profile.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    profile.setPermissionCheckHandler(()=>false);
    profile.on('will-download',event=>event.preventDefault());
    configuredSessions.add(id);
  }
  return preferences;
}
function hardenSiteWindow(window,id){
  if(remoteWindows.has(window))return;
  remoteWindows.add(window);manualOwners.set(window,id);notify();
  const contents=window.webContents;
  watchManualEntry(window,id,{jobs:()=>automation?.store.entries()??[],onClick:key=>{automation?.entry.cancelJob(key,true);browserEvent(id,'manual_entry_observed');}});
  window.setTitle(siteById(id).name+' · 로그인 후 상단의 「로그인 마침」을 눌러 주세요');
  contents.on('page-title-updated',event=>event.preventDefault());
  window.setAutoHideMenuBar(false);
  window.setMenu(Menu.buildFromTemplate([
    {id:'finish-login',label:id==='docple'?'로그인 마침 · 창 닫기':'로그인 마침 · 이 사이트 조회',click:()=>finishSiteLogin(id).then(result=>{if(!result.ok)dialog.showMessageBox(window,{type:'error',message:'사이트의 세션 저장 요청을 마치지 못했어요. 이 창을 유지하고 다시 시도해 주세요.'});}).catch(()=>{})},
    {id:'open-login',label:'로그인 화면',enabled:!!siteById(id).loginUrl,click:()=>navigateSite(window,id,siteById(id).loginUrl)},
    {label:'다시 열기',click:()=>navigateSite(window,id,siteById(id).url)},
  ]));
  contents.on('did-start-navigation',(event,_url,inPlace,main)=>{
    if((main??event.isMainFrame)&&!(inPlace??event.isInPlace)&&allowedNavigation(id,typeof _url==='string'?_url:event.url)){navigationVersions.set(window,(navigationVersions.get(window)??0)+1);sessionChange(id,{load:'loading',login:'loading',lastError:''});}
  });
  const navigation=(event,url)=>{
    const target=typeof url==='string'?url:event.url;
    if(!allowedNavigation(id,target)){event.preventDefault();sessionChange(id,{lastError:'navigation_blocked'});browserEvent(id,'navigation_blocked');}
  };
  contents.on('did-finish-load',()=>{
    if(!allowedNavigation(id,contents.getURL()))return;
    sessionChange(id,{load:'ready'});browserEvent(id,'document_ready');inspectSession(window,id);
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
    if(!allowedPopup(id,url,contents.getURL())||remoteWindows.size>=12){sessionChange(id,{lastError:'popup_blocked'});browserEvent(id,'popup_blocked');return {action:'deny'};}
    return {action:'allow',overrideBrowserWindowOptions:{show:true,width:1100,height:820,autoHideMenuBar:false,webPreferences:prepareSession(id)}};
  });
  contents.on('did-create-window',child=>{hardenSiteWindow(child,id);child.show();child.focus();});
  window.on('close',event=>{
    if(quitting||closingWindows.has(window))return;
    event.preventDefault();
    inspectSession(window,id).finally(()=>flushProfile(id)).finally(()=>{if(!window.isDestroyed()){closingWindows.add(window);window.close();}});
  });
  window.on('closed',()=>{
    remoteWindows.delete(window);
    manualOwners.delete(window);notify();
    if(siteWindows.get(id)===window)siteWindows.delete(id);
    if(!quitting&&!manualOwners.size)showControl();
  });
}
function openSite(id,login=false){
  const site=siteById(id);if(!site)throw Error('invalid_site');
  if(collector.snapshot().running&&collector.snapshot().site===id)collector.cancel();
  automation?.manualOpened(id);
  credentials?.cancel(id);
  const existing=siteWindows.get(id);
  if(existing&&!existing.isDestroyed()){
    if(existing.isMinimized())existing.restore();existing.show();existing.focus();
    if(login&&site.loginUrl)navigateSite(existing,id,site.loginUrl);
    return;
  }
  let window;try{window=new BrowserWindow({width:1100,height:820,show:false,parent:control,title:site.name,autoHideMenuBar:false,webPreferences:prepareSession(id)});}
  catch{sessionChange(id,{load:'failed',login:'not_confirmed',lastError:'window_unavailable'});browserEvent(id,'window_open_failed');throw Error('window_unavailable');}
  siteWindows.set(id,window);hardenSiteWindow(window,id);
  browserEvent(id,'window_opened');
  navigateSite(window,id,login&&site.loginUrl?site.loginUrl:site.url);
}
function registerIPC(channel,handler){
  ipcMain.handle(channel,async(event,...args)=>{
    if(!trustedControl(event,control,controlUrl))throw Error('not_allowed');
    try{return await handler(...args);}
    catch(error){return {ok:false,reason:['invalid_selection','invalid_date','collection_busy','window_unavailable'].includes(error.message)?error.message:'operation_unavailable'};}
  });
}
function ipc(){
  developerTools.register();
  registerIPC('pc:state',()=>buildState());
  registerIPC('pc:set-date',date=>{
    if(!validQueryDate(date))return {ok:false,reason:'invalid_date'};
    catalogQueue.clear();collector.cancel();viewDate=date;notify();return {ok:true,state:buildState()};
  });
  registerIPC('pc:select-sites',ids=>{
    catalogQueue.clear();collector.cancel();catalog.select(ids);notify();return {ok:true,state:buildState()};
  });
  registerIPC('pc:collect',()=>{
    if(!validQueryDate(viewDate))return {ok:false,reason:'invalid_date'};
    if(collector.snapshot().running)return {ok:false,reason:'collection_busy'};
    catalogQueue.request(viewDate,catalog.selected());
    return {ok:true};
  });
  registerIPC('pc:cancel-collection',()=>{catalogQueue.clear();collector.cancel();return {ok:true};});
  registerIPC('pc:copy-schedule',async()=>{await clipboard.writeText(formatPcSchedule(viewDate,catalog.selected(),catalog.view(viewDate).results));return {ok:true};});
  registerIPC('pc:pause',value=>{
    if(typeof value!=='boolean')return {ok:false,reason:'invalid_setting'};
    if(value){catalogQueue.clear();collector.cancel();automation?.cancel();credentials?.cancel();}state.setPaused(value);if(!value)automation?.resumed();updateTray();notify();return {ok:true,state:buildState()};
  });
  registerIPC('pc:set-feature',(key,value)=>{automation.setFeature(key,value);return {ok:true,state:buildState()};});
  registerIPC('pc:set-entry-sites',ids=>{automation.setEntrySites(ids);return {ok:true,state:buildState()};});
  registerIPC('pc:daily',readOnly=>{if(typeof readOnly!=='boolean')return {ok:false,reason:'invalid_setting'};return automation.requestDaily({readOnly});});
  registerIPC('pc:quick-run',()=>automation.quick());
  const credentialReply=result=>({ok:['saved','authenticated'].includes(result.status),status:safeCredentialStatus(result.status),submitted:result.submitted===true,attempted:result.attempted===true,...(result.detail==='input_format'?{detail:'input_format'}:{}),...(Number.isSafeInteger(result.retryAt)?{retryAt:result.retryAt}:{})});
  const refreshCredentialProfile=async(site,result)=>{
   if(result.status!=='authenticated')return;
   sessionChange(site,{login:'authenticated',authSource:'verified_profile',checkedAt:Date.now(),lastError:''});
   await flushProfile(site);
   if(site!=='docple'){if(!validQueryDate(viewDate))viewDate=kstDate();catalogQueue.request(viewDate,[site]);}
  };
  const prepareCredential=id=>{if(!credentialSite(id))throw Error('invalid_site');if(collector.snapshot().running&&collector.snapshot().site===id)collector.cancel();automation.manualOpened(id);};
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
  registerIPC('pc:export-report',async()=>{
    const result=await dialog.showSaveDialog(control,{title:'오류보고 저장',defaultPath:`doctor-glean-pc-${kstDate()}.txt`,filters:[{name:'텍스트 파일',extensions:['txt']}]});
    if(result.canceled||!result.filePath)return {ok:true,cancelled:true};
    const report=diagnosticSnapshot();
    await writeFile(result.filePath,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
    return {ok:true};
  });
}

if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(state)showControl();});
  app.on('before-quit',()=>{quitting=true;try{catalogQueue?.close();automation?.close();credentials?.cancel();collector?.cancel();developerTools?.close();}catch{}});
  app.on('window-all-closed',()=>{});
  app.whenReady().then(()=>{
    try{
      state=new LocalState(join(app.getPath('userData'),'state-v1.json'));
      catalog=new CatalogStore(join(app.getPath('userData'),'catalog-v1.json'));
      developerTools=createDeveloperTools({directory:dataDirectory,register:registerIPC,notify,edition:EDITION,version:VERSION,
        policy:{allowedNavigation,remotePreferences},snapshot:diagnosticSnapshot,save:async(defaultPath,content)=>{
          const selected=await dialog.showSaveDialog(control,{title:'개발자 진단 저장',defaultPath,filters:[{name:'JSON',extensions:['json']}]});
          if(selected.canceled||!selected.filePath)return {ok:true,cancelled:true};
          await writeFile(selected.filePath,JSON.stringify(content,null,2)+'\n',{encoding:'utf8',mode:0o600});return {ok:true};
        }});
      if(developerTools.available!==EDITION.developer)throw Error('edition_mismatch');
      preload=fileURLToPath(new URL('./'+developerTools.preloadName,import.meta.url));
      credentials=new CredentialManager({directory:dataDirectory,applicationId:EDITION.appId,
       protect:{available:()=>process.platform==='win32'&&safeStorage.isEncryptionAvailable(),encrypt:text=>safeStorage.encryptString(text),decrypt:bytes=>safeStorage.decryptString(bytes)},
       automaticAllowed:()=>!state.snapshot().paused,isManualOpen:id=>[...manualOwners.values()].includes(id),
       createPage:async(id,signal,{validation,partition}={})=>{
        const prefs=validation?{...remotePreferences(id,EDITION.id),partition}:prepareSession(id);
        if(validation){const profile=session.fromPartition(partition);profile.setPermissionRequestHandler((_c,_p,callback)=>callback(false));profile.setPermissionCheckHandler(()=>false);profile.on('will-download',event=>event.preventDefault());}
        const page=new AutomationPage(id,signal,prefs);
        if(validation){const close=page.close.bind(page),profile=session.fromPartition(partition);let cleaned=false;page.close=()=>{close();if(!cleaned){cleaned=true;profile.clearStorageData().catch(()=>{});profile.clearCache().catch(()=>{});}};}
        return page;
       },onChange:()=>{notify();if(!credentials?.busy)queueMicrotask(()=>{catalogQueue?.pump();automation?.tick();});}});
      collector=new CatalogRunner({store:catalog,createPage:(profile,signal)=>electronCatalogPage(profile,signal,prepareSession(profile.id)),
        recoverLogin:async(id,signal)=>(await credentials.recover(id,{automatic:true,signal})).status==='authenticated',
        isManualOpen:id=>[...manualOwners.values()].includes(id)||credentials.active?.site===id,onChange:snapshot=>{developerTools.observe(snapshot);notify();if(!snapshot.running)queueMicrotask(()=>catalogQueue?.pump());}});
      catalogQueue=new CatalogQueue({start:async(date,ids)=>{await collector.start(date,ids);automation?.catalogFinished(date,ids,collector.snapshot());},busy:()=>collector.snapshot().running||!!automation?.busy||credentials.busy,validDate:validQueryDate,onChange:notify});
      automation=new AutomationController({file:join(dataDirectory,'workflows-v1.json'),ledger:state,
       createPage:(site,signal,options)=>credentials.wrapPage(site,new AutomationPage(site,signal,prepareSession(site),options)),
       isManualOpen:id=>[...manualOwners.values()].includes(id)||credentials.active?.site===id,catalog:date=>catalog.view(date).results,catalogBusy:()=>collector.snapshot().running||credentials.busy,
       queueCatalog:date=>{viewDate=date;catalogQueue.request(date,catalog.selected());},
       yieldCatalog:()=>{const current=collector.snapshot();if(current.running){catalogQueue.request(current.date,catalog.selected());collector.cancel('entry_priority');}},
       onChange:()=>{notify();if(!automation?.busy)queueMicrotask(()=>catalogQueue?.pump());},onError:storageError});
    }
    catch{
      dialog.showErrorBox('실행 기록 확인 필요','저장된 실행 기록을 읽지 못했어요. 중복 실행을 막기 위해 시작하지 않았어요. 기존 파일을 지우지 말고 오류를 알려 주세요.');
      app.quit();return;
    }
    ipc();
    powerMonitor.on('suspend',()=>{try{catalogQueue.clear();collector.cancel('suspended');automation.suspended();credentials.cancel();}catch{}});
    powerMonitor.on('resume',()=>automation.resumed());
    tray=new Tray(nativeImage.createFromPath(fileURLToPath(new URL('../ui/tray.png',import.meta.url))));
    tray.setToolTip(EDITION.name);tray.on('double-click',showControl);updateTray();showControl();
  }).catch(()=>app.quit());
}
