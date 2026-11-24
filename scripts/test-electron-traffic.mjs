import {compareHttpReads} from './electron-http-reads.mjs';
import {app,BrowserWindow,ipcMain} from 'electron';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

const root=resolve(process.env.DOCTOR_GLEAN_PC_TEST_ROOT??fileURLToPath(new URL('..',import.meta.url)));
const moduleOf=name=>import(pathToFileURL(join(root,'src',name+'.js')).href);
const legacy=process.env.DOCTOR_GLEAN_TRAFFIC_BASELINE==='1';
const {hiddenResources}=await moduleOf('hidden-resources');
const {CatalogRedirects}=legacy?{}:await moduleOf('catalog-redirects');
const temp=mkdtempSync(join(tmpdir(),'pc-traffic-'));
app.setPath('userData',temp);
const report={platform:process.platform,electron:process.versions.electron,legacy,network:{},windowsPowerHardware:false};
let checks=0;
function equal(actual,wanted){assert.deepEqual(actual,wanted);checks++;}
async function compareBrowser(){
 let metrics,pattern;
 const server=createServer((req,res)=>{
  if(!req.url.startsWith('/catalog')){res.writeHead(204);res.end();return;}
  const socket=res.socket,base=socket.bytesWritten;
  metrics.requests++;const i=metrics.requests;
  const target=pattern[i-1],body=target?'moved':'<html>fixture</html>';
  res.writeHead(target?302:200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),...(target?{Location:'/catalog'+target}:{})});
  res.end(body,()=>{metrics.responseBytes+=socket.bytesWritten-base;metrics.bodyBytes+=Buffer.byteLength(body);});
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const alternating=Array.from({length:12},(_,i)=>i%2?'/b':'/a');
  for(const [name,targets,allowed,manual] of [
   ['alternating',alternating,4,false],['fragments',['/a#x','/a#y','/a#z'],2,false],
   ['distinctQuery',Array.from({length:9},(_,i)=>'?p='+i),8,false],
   ['ordinary',['/a','/b','/c'],3,false],['manual',alternating,12,true]]){
   metrics={pageOpens:1,requests:0,responseBytes:0,bodyBytes:0};pattern=targets;
   const window=new BrowserWindow({show:false,webPreferences:{partition:'traffic-'+name,sandbox:true}});
   const counter=legacy||manual?null:new CatalogRedirects(url=>new URL(url).origin===origin);
   if(!manual)hiddenResources(window.webContents,null,counter);
   try{await window.loadURL(origin+'/catalog/start');}catch(error){if(!counter?.stopped)throw error;}
   await new Promise(ok=>setImmediate(ok));
   report.network[name]={...metrics,allowedRedirects:metrics.requests-1,cancelled:!!counter?.stopped};
   equal(metrics.requests-1,legacy?targets.length:allowed);equal(!!counter?.stopped,!legacy&&allowed<targets.length);
   window.destroy();
  }
 }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
}

async function duplicateWindows(){
 const {AutomationController}=await moduleOf('automation-controller'),{LocalState}=await moduleOf('local-state'),{kstInstant}=await moduleOf('schedule');
 const date='2026-11-20',pre=kstInstant(date,'08:00')-1;let now=pre,starts=0,blocked=true;
 const make=()=>{
  const ledger=new LocalState(join(temp,'ledger.json'));
  const scheduler=new AutomationController({file:join(temp,'workflows.json'),ledger,now:()=>now,catalog:()=>({}),catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){},followupAllowed:()=>!blocked,onError:e=>{throw e;}});
  clearInterval(scheduler.timer);ledger.setPaused(false);scheduler.store.setFeature('dailyClaim',true);
  scheduler.daily.run=async()=>{starts++;return {reason:'finished'};};return scheduler;
 };
 let scheduler=make();scheduler.store.record(date,'intermd:quiz',{status:'scheduled',reason:'intermd_quiz_before_open'},pre);
 const due=legacy?kstInstant(date,'08:01'):scheduler.morning.quizDue(date);now=due;
 const preload=join(temp,'test-preload.cjs');
 writeFileSync(preload,"const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('wake',()=>ipcRenderer.invoke('fixture:wake'));");
 const windows=[0,1].map(()=>new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:true,sandbox:true}}));
 try{
  ipcMain.handle('fixture:wake',e=>{if(!windows.some(w=>w.webContents===e.sender))throw Error('unexpected sender');scheduler.resumed();});
  await Promise.all(windows.map(w=>w.loadURL('data:text/html,fixture')));
  const fire=()=>Promise.all(windows.map(w=>w.webContents.executeJavaScript('window.wake()')));
  scheduler.suspended();await fire();const offline=starts;
  blocked=false;await fire();await fire();const beforeRestart=starts;
  scheduler.close();scheduler=make();await fire();
  report.twoWindows={offline,beforeRestart,afterRestart:starts};
  equal(offline,legacy?1:0);equal(beforeRestart,1);equal(starts,legacy?2:1);
  if(!legacy)equal(scheduler.morning.quizDue(date),due);
 }finally{ipcMain.removeHandler('fixture:wake');windows.forEach(w=>w.destroy());scheduler.close();}
}

async function resumeCatalog(){
 const {CatalogRunner}=await moduleOf('catalog-runner'),{CatalogPage}=await moduleOf('catalog-page');
 const {EventEmitter}=await import('node:events'),{kstInstant}=await moduleOf('schedule');
 for(const scenario of ['stable','replaced','login','crash','late','loading','cancelled']){
  const date='2026-11-20',clock=kstInstant(date,'13:00'),monitor=new EventEmitter();
  let now=clock,opens=0,reads=0,clicks=0,continued=0,version=1,sleepCount=0,closed=false,loading=false,last;
  const window=new BrowserWindow({show:false,webPreferences:{partition:'list-'+scenario,sandbox:true}});
  const url='https://www.doctorville.co.kr/seminar/main';
  await window.webContents.session.protocol.handle('https',()=>new Response('<main id="page">1</main>',{headers:{'Content-Type':'text/html'}}));
  const evaluate=code=>window.webContents.executeJavaScript(code);
  const runner=new CatalogRunner({now:()=>now,elapsed:()=>now-clock,store:{record:(_id,_day,r)=>{last=r;}},
   createPage:async(profile,signal)=>{
    const page=new CatalogPage(profile,{
     snapshot:()=>({url,version,crashed:window.isDestroyed(),loading}),
     load:async()=>{opens++;await window.loadURL(url);},evaluate,close:()=>{closed=true;}
    },signal);
    page.read=async(_date,previous)=>{
     reads++;const current=await evaluate("document.querySelector('main').textContent");
     if(reads===1)return {events:[],state:{page:1},action:{kind:'click'},done:false};
     if(reads===2)return {events:[],state:{page:2},done:false};
     if(previous?.page===2&&current==='2')continued++;
     return {events:[],status:'ok',coverage:true,done:true};
    };
    page.act=async()=>{clicks++;await evaluate("document.querySelector('main').textContent='2'");return true;};
    return page;
   },
   sleep:async()=>{
    if(++sleepCount!==2)return;
    monitor.emit('suspend');
    if(scenario==='replaced')version++;
    if(scenario==='login')await evaluate("document.body.append(Object.assign(document.createElement('input'),{type:'password'}))");
    if(scenario==='crash')window.destroy();
    if(scenario==='late')now+=200000;
    if(scenario==='loading')loading=true;
    if(scenario==='cancelled')runner.cancel();
    monitor.emit('resume');
   }
  });
  if(legacy)monitor.on('suspend',()=>runner.cancel('suspended'));
  else{
   const {bindPowerEvents}=await moduleOf('power-events');
   bindPowerEvents(monitor,{collector:runner,automation:{suspended(){},resumed(){}},onSuspend(){},onResume(){}});
  }
  await runner.start(date,['doctorville']);
  report.resume??={};report.resume[scenario]={opens,reads,clicks,continued,status:last.status,reason:last.reason??'',closed};
  equal(opens,1);equal(clicks,1);equal(continued,!legacy&&scenario==='stable'?1:0);
  if(!legacy)equal(last.reason??last.status,({stable:'ok',late:'time_limit',cancelled:'cancelled'})[scenario]??'connection_context_changed');
  if(!window.isDestroyed())window.destroy();
 }
}

async function comparePolicies(){
 const {DailyRunner}=await moduleOf('daily-runner'),{WorkflowStore}=await moduleOf('workflow-store'),{LocalState}=await moduleOf('local-state');
 const {SurveyRunner}=await moduleOf('survey-runner'),{PcOptions}=await moduleOf('pc-options'),{kstInstant}=await moduleOf('schedule');
 const {SiteWait}=await moduleOf('site-wait'),{CatalogRunner}=await moduleOf('catalog-runner');
 const date='2026-11-20';let now=kstInstant(date,'08:00')-1,opens=0,alerts=0;
 const page={async load(){opens++;},async call(name){return name==='doctorville-survey.js'?{site:'doctorville',seminarId:'17',status:'open',buttonCount:1,disabled:false,minutesLeft:5}:{status:'scheduled',reason:'intermd_quiz_before_open'};},close(){}};
 const runner=new DailyRunner({store:new WorkflowStore(join(temp,'tasks.json'),{now:()=>now}),ledger:new LocalState(join(temp,'task-ledger.json')),now:()=>now,createPage:async()=>page});
 await runner.run(['intermd:quiz']);report.preOpen=opens;equal(opens,legacy?1:0);
 now++;opens=0;await runner.run(['intermd:quiz']);report.publishedQuiz=opens;equal(opens,1);
 now=kstInstant(date,'12:50');opens=0;
 const surveys=new SurveyRunner({file:join(temp,'surveys.json'),options:new PcOptions(join(temp,'options.json')),createPage:async()=>page,allowed:()=>true,notify:()=>alerts++,now:()=>now});
 surveys.seed(date,{status:'ok',stale:false,events:[{site:'doctorville',date,time:'13:00',url:'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=17'}]});
 now=kstInstant(date,'13:21');if(surveys.due?.())await surveys.run(surveys.due());
 report.survey={automaticPageOpens:opens,alerts};equal(opens,legacy?1:0);equal(alerts,legacy?1:0);
 const file=join(temp,'wait.json'),url='https://docple-plus.com/api/season2/webinar/list';
 new SiteWait(file,{now:()=>now}).observe('docple',{url,status:429,retryAfter:'120',api:true});
 const gate=new SiteWait(file,{now:()=>now});now+=119999;
 let same=0,other=0,fallback=0;
 const refreshed=new CatalogRunner({gate,now:()=>now,store:{record(){}},nativeRead:async p=>{if(p.id==='docple')same++;else other++;return {done:true,events:[]};},createPage:()=>{fallback++;throw Error('unexpected page');}});
 await refreshed.start(date,['docple','doctorville']);equal(same,0);equal(other,1);equal(fallback,0);
 now++;equal(gate.allowed('docple'),true);
 const image=gate.observe('docple',{url,status:403});equal(image,false);equal(gate.allowed('docple'),true);
 gate.observe('docple',{url,status:403,document:true});equal(gate.allowed('docple'),false);
 report.serverWait={same,other,fallback,waitMs:120000,image403Allowed:true,document403Blocked:true};
}

app.on('window-all-closed',()=>{});
async function run(){
try{
 await app.whenReady();await compareBrowser();await duplicateWindows();await resumeCatalog();await comparePolicies();
 if(!legacy)await compareHttpReads({moduleOf,temp,equal,report:report.httpReads={}});
 const dir=fileURLToPath(new URL('../verification/',import.meta.url));mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'traffic-'+(legacy?'baseline':'candidate')+'.json'),JSON.stringify(report,null,2)+'\n');
 if(!legacy)writeFileSync(join(dir,'electron-traffic.json'),JSON.stringify({runtime:{platform:process.platform,electron:process.versions.electron},checks,report},null,2)+'\n');
 console.log('ELECTRON_TRAFFIC_PASS:'+checks);app.exit(0);
}catch(error){console.error(error);app.exit(1);}
}
void run();
