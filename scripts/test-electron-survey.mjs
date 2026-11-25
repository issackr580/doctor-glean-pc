import {app,BrowserWindow,session} from 'electron';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(process.env.DOCTOR_GLEAN_PC_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url)));
const moduleOf=name=>import(pathToFileURL(join(root,'src',name+'.js')).href);
const baseline=process.env.DOCTOR_GLEAN_SURVEY_BASELINE==='1';
const fixture=JSON.parse(readFileSync(new URL('../test/fixtures/doctorville-survey-v176.json',import.meta.url)));
const temp=mkdtempSync(join(tmpdir(),'pc-electron-survey-'));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND');
app.setPath('userData',temp);
app.on('window-all-closed',()=>{});
const {AutomationController}=await moduleOf('automation-controller');
const {LocalState}=await moduleOf('local-state');
const {AutomationPage}=await moduleOf('automation-page');
const {SiteWait,workerWait}=await moduleOf('site-wait');
const {configureUsage,changeUsage,resourceUse}=await moduleOf('resource-use');
const {watchManualEntry}=await moduleOf('manual-entry-watch');
const domSource=baseline?readFileSync(join(root,'vendor/automation/doctorville-survey.js'),'utf8'):(await moduleOf('doctorville-survey-page')).doctorvilleSurveySource;

const testDate=fixture.opening.fiveLectureReplay.jobs[0].date;
const id='99000001',target='https://www.doctorville.co.kr/seminar/broadcastSeminarPopup?viewType=2&seminarId='+id;
const mobile='https://m.doctorville.co.kr/cme/vod/'+id;
const other='https://example.invalid/seminar/broadcastSeminarPopup?viewType=2&seminarId='+id;
const login='https://www.doctorville.co.kr/login/loginView';
const detail='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId='+id;
const start=Date.parse(fixture.opening.fiveLectureReplay.jobs[0].startAt);
const observationAt=Date.parse(fixture.reminder.cases[0].observedAt);
const reminderAt=Date.parse(fixture.reminder.baseExpectedScheduleAt);
const observed={site:'doctorville',seminarId:id,status:'open',minutesLeft:30,buttonCount:1,disabled:false};
let checks=0,serial=0,unexpected=0;
const result={baseline,dom:{},network:{},liveRequests:0,osTransmittedBytes:null,platform:process.platform,electron:process.versions.electron,runtime:{platform:process.platform,electron:process.versions.electron}};
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(predicate){
 for(let i=0;i<150;i++){if(await predicate())return;await pause(20);}
 throw Error('fixture_wait_timeout');
}
const html=body=>new Response('<!doctype html><meta charset="utf-8">'+body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
const open=left=>`<button onclick="fetch('/synthetic-submit',{method:'POST'})">설문 참여</button><p>설문 마감 ${left}분 전</p><img src="/synthetic-image.png" alt="">`;
async function profileWith(handler,work){
 const partition='v176-survey-'+(++serial),profile=session.fromPartition(partition);
 const request=async req=>handler(req);
 profile.protocol.handle('https',request);
 try{await work(partition);}
 finally{profile.protocol.unhandle('https');await profile.closeAllConnections();}
}
async function domCases(){
 const cases=baseline?fixture.domCases:[...fixture.domCases,
  {case:'explicit_close',document:target,expectedSeminarId:id,html:'<p>설문이 마감되었습니다.</p>',expect:{status:'closed'}},
  {case:'duplicate_id',document:target+'&seminarId='+id,expectedSeminarId:id,html:open(9),expect:{status:null}},
  {case:'private_query',document:target+'&token=SYNTHETIC_TEST',expectedSeminarId:id,html:open(9),expect:{status:null}},
 ];
 for(const item of cases){
  await profileWith(req=>req.url===item.document?html(item.html):new Response(null,{status:204}),async partition=>{
   const box=new BrowserWindow({show:false,webPreferences:{partition,sandbox:true}});
   try{
    await box.loadURL(item.document);
    const raw=await box.webContents.executeJavaScriptInIsolatedWorld(1003,[{code:'('+domSource+')('+JSON.stringify(item.expectedSeminarId)+','+JSON.stringify(item.document)+')'}]);
    result.dom[item.case]=raw?.status??null;
    for(const [key,value] of Object.entries(item.expect))eq(key==='status'?raw?.status??null:raw?.[key],value,item.case);
   }finally{box.destroy();}
  });
 }
}
async function schedulerScenario(name,{phase='survey_reminder',response='open',http=0,redirect,late=false,diagnostics=true}={}){
 let now=phase==='survey'?start-1:observationAt-1,pages=0,manualReads=0,bytes=0,headerObservation;
 const root=join(temp,name),requests=[],alerts=[];
 mkdirSync(root);
 await profileWith(req=>{
  if(req.method!=='GET'){unexpected++;return new Response(null,{status:405});}
  requests.push(req.url);
  if(req.url===target&&redirect)return new Response('',{status:302,headers:{location:redirect}});
  if(req.url===target||req.url===mobile){
   if(http){
    // Intercepted protocol responses do not produce webRequest headers.
    // Feed the synthetic headers to the same worker callback as production.
    headerObservation({url:req.url,statusCode:http,responseHeaders:{'Retry-After':['120']},resourceType:'mainFrame'});
    return new Response('fixture hold',{status:http,headers:{'Retry-After':'120'}});
   }
   const body=response==='login'?'<input type="password" value="SYNTHETIC_PASSWORD">'+open(9):response==='complete'?'<a>설문 참여 완료</a>':response==='closed'?'<p>설문 참여가 종료되었습니다.</p>':response==='unknown'?'<main>설문 준비 중</main>':open(phase==='survey'||name==='manual'&&now===observationAt?30:9);
   bytes+=Buffer.byteLength('<!doctype html><meta charset="utf-8">'+body);
   return html(body);
  }
  if(req.url===detail)return html('<button onclick="location.href='+JSON.stringify(target).replaceAll('"','&quot;')+'">열린 설문 보기</button>');
  if(req.url.endsWith('/synthetic-image.png'))return new Response('synthetic image',{headers:{'content-type':'image/png'}});
  if(req.url===other||req.url===login)unexpected++;
  return new Response(null,{status:204});
 },async partition=>{
  const gateFile=join(root,'wait.json'),gate=new SiteWait(gateFile,{now:()=>now});
  const ledger=new LocalState(join(root,'state.json'));ledger.setPaused(false);
  const event={site:'doctorville',date:testDate,time:'15:00',url:detail,title:'합성 닥터빌 강의'};
  const catalog=()=>({doctorville:{status:'ok',stale:false,events:[event]}});
  configureUsage(join(root,'usage.json'),'0.1.0-preview.40');
  if(diagnostics)changeUsage('start');
  const controller=new AutomationController({
   file:join(root,'workflows.json'),ledger,now:()=>now,catalog,catalogBusy:()=>false,isManualOpen:()=>false,queueCatalog(){},yieldCatalog(){},
   surveyAllowed:()=>gate.allowed('doctorville'),notifySurvey:value=>{alerts.push(value);return true;},
   createInspectionPage:(site,signal,options)=>{
    pages++;
    const traffic=workerWait(gate,site,signal,()=>0);headerObservation=traffic.response;
    return new AutomationPage(site,signal,{partition,sandbox:true,contextIsolation:true,webSecurity:true},{...options,traffic});
   },
   createPage:()=>{throw Error('unexpected_login_or_submit');},onError:error=>{throw error;},
  });
  clearInterval(controller.timer);
  const key=controller.store.entryKey(event);
  controller.store.putEntry({...event,key,status:'clicked',entryAttempted:true,doctorvilleArrival:'waiting_room',start,due:start,deadline:start+600_000,nextAt:0,retries:0,slot:0,attempts:[]});
  try{
   if(baseline)controller.store.setFeature('survey',true);
   else controller.setSurveySettings({mode:phase==='survey'?'economy':'off',delay:60,reminder:phase==='survey_reminder'});
   controller.catalogFinished(testDate,['doctorville'],{reason:'finished'});
   const [row]=controller.survey.snapshot();
   if(phase==='survey_reminder'){
    now=observationAt;
    if(name==='manual'){
     const win=new BrowserWindow({show:false,webPreferences:{partition,sandbox:true}});
     try{
      watchManualEntry(win,'doctorville',{jobs:()=>[],onClick:()=>{throw Error('test_unexpected_entry');},surveyScope:url=>controller.survey.wantsObservation(url,row.key)?'session-a':null,
       onSurvey:(url,raw)=>{manualReads++;controller.survey.observe(url,raw,row.key);},interval:40});
      await win.loadURL(target);
      await until(()=>controller.survey.snapshot()[0].reminderAt===reminderAt);
      eq(manualReads,1);
     }finally{win.destroy();}
     requests.length=0;bytes=0;
    }else controller.survey.observe(target,observed,row.key);
   }
   now=phase==='survey'?start+60*60_000:reminderAt+(late?2*60_000:0);
   const triggers=[controller.tick(),controller.tick()];
   await Promise.all(triggers);
   await until(()=>!controller.active);
   if(!baseline&&!late&&['open','complete','closed','unknown','login'].includes(response)&&!http&&(!redirect||redirect===mobile))await pause(30);
   const measured=resourceUse().surveys??[];
   const stats=measured.find(item=>item.phase===phase),rowAfter=controller.survey.snapshot()[0];
   const requestsMain=requests.filter(url=>[target,mobile].includes(url)).length;
   const successfulProof=!baseline&&!late&&!http&&response==='open'&&(!redirect||redirect===mobile);
   result.network[name]={phase,checksSent:pages,topLevelRequests:requestsMain,subresourceRequests:requests.length-requestsMain,redirectsObserved:stats?.redirects??null,
    documentNavigations:stats?.mainFrameLoads??null,domReads:stats?.domReads??null,alerts:alerts.length,syntheticDocumentBodyBytes:bytes,observedBrowserBytes:stats?.browserEncodedBytes??null};
   if(baseline){eq(pages,0);eq(alerts.length,0);return;}
   eq(pages,late?0:1,name);
   eq(alerts.length,successfulProof?1:0,name);
   eq(BrowserWindow.getAllWindows().length,0,name);
   if(!late&&!http&&(!redirect||redirect===mobile))eq(stats?.domReads??null,diagnostics?1:null,name);
   if(!late)eq(requestsMain,redirect===mobile?2:1,name);
   if(redirect)eq(stats?.redirects,1,name);
   if(http){
    eq(gate.status('doctorville')?.status,http,name);
    const after=new SiteWait(gateFile,{now:()=>now});
    eq(after.allowed('doctorville'),false,name);
    if(http!==403){eq(after.status('doctorville').until,now+120_000,name);now+=120_001;eq(after.allowed('doctorville'),true,name);}
    controller.tick();await until(()=>!controller.active);eq(pages,1,name);
   }
   if(phase==='survey_reminder'){eq(rowAfter.reads,0);eq(rowAfter.reminderReads,late?0:1);}
   else {eq(rowAfter.reads,1);eq(rowAfter.reminderReads,0);}
   if(alerts.length)eq(controller.survey.target(alerts[0].key),detail,name);
   if(!diagnostics)eq(measured,[],name);
   if(!late&&!http&&!redirect&&response==='open')eq(requests.filter(url=>url.endsWith('/synthetic-image.png')).length,1,name);
   eq(JSON.stringify({measured,details:controller.survey.snapshot({diagnostics:true})}).includes('SYNTHETIC_PASSWORD'),false);
  }finally{controller.close();}
 });
}

async function run(){try{
 await app.whenReady();
 await domCases();
 await schedulerScenario('opening',{phase:'survey'});
 await schedulerScenario('reminder');
 if(!baseline){
  for(const response of ['complete','closed','unknown','login'])await schedulerScenario(response,{response});
  for(const http of [403,429,503])await schedulerScenario('http_'+http,{http});
  await schedulerScenario('mobile_once',{redirect:mobile});
  await schedulerScenario('mobile_wait',{redirect:mobile,http:429});
  await schedulerScenario('other_origin',{redirect:other});
  await schedulerScenario('login_transition',{redirect:login});
  await schedulerScenario('overdue',{late:true});
  await schedulerScenario('without_diagnostics',{diagnostics:false});
  await schedulerScenario('manual');
 }
 eq(unexpected,0);
 result.checks=checks;
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});
 const filename=baseline?'electron-survey-baseline.json':'electron-survey.json';
 writeFileSync(new URL('../verification/'+filename,import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log('ELECTRON_SURVEY_PASS:'+checks);
 app.exit(0);
}catch(error){console.error(error.stack);app.exit(1);}
finally{rmSync(temp,{recursive:true,force:true});}
}
void run();
