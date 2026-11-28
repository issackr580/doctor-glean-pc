import {app,BrowserWindow,session,shell} from 'electron';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const here=fileURLToPath(new URL('../',import.meta.url));
const root=resolve(process.env.DOCTOR_GLEAN_PC_TEST_ROOT??here);
const load=name=>import(pathToFileURL(join(root,'src',name+'.js')));
const metadata=JSON.parse(readFileSync(join(root,'package.json')));
const baseline=metadata.version==='0.1.0-preview.35';
const temp=mkdtempSync(join(tmpdir(),'pc-access-'));
const {directory}= (await load('edition')).resolveEdition(metadata.doctorGleanEdition);
const data=join(temp,directory);
mkdirSync(join(data,'browser'),{recursive:true});
app.setPath('appData',temp);app.setPath('userData',data);app.setPath('sessionData',join(data,'browser'));
app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
const fixture=name=>readFileSync(join(here,'test/fixtures/v168',name),'utf8');
const cases=JSON.parse(fixture('04_ACCEPTANCE.json'));
const date=cases.fixtureDefaults.date;
const report={version:metadata.version,network:{},runtime:{platform:process.platform,electron:process.versions.electron}};
let checks=0;
function equal(value,expected,label){assert.deepEqual(value,expected,label);checks++;}
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn){for(let i=0;i<100;i++){const value=await fn();if(value)return value;await sleep(50);}throw Error('fixture timeout');}
const html=body=>new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8'}});
async function attendance(){
 const {AutomationPage}=await load('automation-page'),{DailyRunner}=await load('daily-runner'),{WorkflowStore}=await load('workflow-store'),{LocalState}=await load('local-state'),{kstInstant}=await load('schedule');
 let elapsed=0;const now=()=>kstInstant(date,'10:00')+elapsed;
 for(const site of ['docple','hmp']){
  const partition='fixture-'+site,profile=session.fromPartition(partition),requests=[];
  await profile.protocol.handle('https',request=>{
   requests.push(request.method);
   if(site==='hmp')return html(fixture('hmp-login.html'));
   if(request.url.endsWith('/calendar'))return Response.json({data:{yearMonth:'202611',attendedDates:[date]}});
   return html(fixture('docple-november.html'));
  });
  if(site==='docple')await profile.cookies.set({url:'https://docple-plus.com',name:'accessToken',value:'synthetic'});
  const store=new WorkflowStore(join(temp,site+'-daily'),{now}),key=site==='docple'?'docple:attendance':'hmp:capsule';
  let firstLoad,redirects=0;
  const ledger=new LocalState(join(temp,site+'-ledger'));ledger.setPaused(false);
  const daily=new DailyRunner({store,now,sleep:async()=>{elapsed+=10000;await sleep(100);},ledger,createPage:async(id,signal)=>{
   const page=new AutomationPage(id,signal,{partition,sandbox:true});
   page.current.webContents.on('did-redirect-navigation',()=>redirects++);
   // Pin the renderer clock as well as the host clock for replay on future dates.
   await page.current.loadURL('about:blank');
   await page.current.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:"const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:["+now()+"]));}static now(){return "+now()+";}};"});
   const open=page.load.bind(page);
   page.load=async url=>{await open(site==='hmp'?'https://www.hmp.co.kr/login/loginForm.hm':url);firstLoad=requests.length;};
   return page;
  }});
  await daily.run([key],{readOnly:true});
  const row=store.day(date).daily[key];
  report.network[site]={initialReads:firstLoad,additionalReads:requests.filter(r=>r==='GET').length-firstLoad,writes:requests.filter(r=>r!=='GET').length,redirects,status:row.status,reason:row.reason};
  equal(row.status,site==='hmp'?'login':'complete',site+' '+row.reason);equal(report.network[site].writes,0);equal(redirects,0);
  equal(report.network[site].additionalReads,site==='docple'&&baseline?1:0);
  if(!baseline)equal(row.reason,site==='hmp'?'hmp_login_before_claim':'docple_visible_receipt');
  if(site==='docple'&&!baseline){
   const page=new AutomationPage(site,new AbortController().signal,{partition,sandbox:true});
   await page.load('https://docple-plus.com/offerwall/attendance');
   const body=await page.current.webContents.executeJavaScript('document.body.innerHTML');
   const count=requests.length;equal(await page.hasDocpleReceipt(date),true);
   await page.current.webContents.executeJavaScript("document.querySelectorAll('section div div')[22].textContent='23 출석'");
   equal(await page.hasDocpleReceipt(date),true);
   for(const edit of ["document.querySelector('button').remove()","document.querySelector('button').disabled=false","document.querySelector('h2').innerText='2025년 11월 출석 달력'","document.querySelector('h2').innerText='12월 출석 달력'","document.querySelector('section').remove()","document.querySelectorAll('section div div')[22].innerText='23'","document.body.append('보안 확인')","document.querySelector('button').after(document.querySelector('button').cloneNode(true))","document.querySelectorAll('section div div')[23].innerText='출석'","document.querySelector('button').insertAdjacentHTML('beforebegin','<button>로그인</button>')"]){
    await page.current.webContents.executeJavaScript('document.body.innerHTML='+JSON.stringify(body)+';'+edit);
    equal(await page.hasDocpleReceipt(date),false,edit);
   }
   equal(requests.length,count);page.close();
  }
 }
}
async function popup(){
 const {electronCatalogPage}=await load('electron-catalog-page'),{siteById}=await load('security');
 const {initialSettings}=await import(pathToFileURL(join(root,'vendor/engine/core.js')));
 for(const site of ['doctorville','intermd']){
  const partition='popup-'+site,profile=session.fromPartition(partition);let reads=0;
  const target=siteById(site).loginUrl;
  await profile.protocol.handle('https',()=>{reads++;return html('<main>강의 목록</main><script>window.open('+JSON.stringify(target)+')</script>');});
  const page=electronCatalogPage(initialSettings().profiles[site],new AbortController().signal,{partition,sandbox:true});
  await page.open();let reply;
  for(let i=0;i<6;i++){await sleep(75);reply=await page.read(date,reply?.state);if(reply.done)break;}
  page.close();
  report.network[site]={reads,redirects:0,popupRecoverySignal:reply.status==='login',status:reply.status??'unconfirmed'};
  equal(reads,1);if(!baseline)equal(reply.status,'login',site);
  if(!baseline){
   const {CatalogRunner}=await load('catalog-runner'),{kstInstant}=await load('schedule');
   const callsBefore=reads;let recoveries=0,last;
   const runner=new CatalogRunner({now:()=>kstInstant(date,'09:00'),sleep:()=>sleep(75),
    store:{record:(_site,_date,row)=>{last=row;}},
    createPage:async(p,signal)=>electronCatalogPage(p,signal,{partition,sandbox:true}),
    recoverLogin:async()=>{recoveries++;return true;}});
   await runner.start(date,[site]);
   equal(recoveries,1);equal(reads-callsBefore,2);equal(last.status,'login');
   report.network[site].afterSyntheticRecovery={recoveries,listReads:reads-callsBefore,status:last.status};
  }
 }
}
async function expiredSessionDialogs(){
 const {electronCatalogPage}=await load('electron-catalog-page'),{CatalogRunner}=await load('catalog-runner'),{kstInstant}=await load('schedule');
 const {initialSettings}=await import(pathToFileURL(join(root,'vendor/engine/core.js')));
 const stale='장시간 이용하지 않아 로그인 세션이 만료되었습니다. 다시 로그인해 주세요.';
 const fixtures=[
  ['doctorville','alert','<script>alert('+JSON.stringify(stale)+')</script>'],
  ['intermd','confirm','<script>if(confirm('+JSON.stringify(stale)+'))fetch("/unexpected",{method:"POST"})</script>'],
  ['intermd','modal','<dialog open>로그인이 되어 있지 않습니다.</dialog>'],
 ];
 for(const [site,kind,notice] of fixtures){
  const partition='expired-'+kind,profile=session.fromPartition(partition);let gets=0,posts=0,recovered=0,last;
  const cards=site==='intermd'?'<div class="webinarItem--live"><h3 class="webinarItem__topic">합성 강의</h3><p class="webinarItem__date">'+date+' 13:00 ~ 15:00</p></div>':'<main><h1>라이브세미나</h1><a class="list_detail" href="/seminar/seminarDetail?seminarId=17"><strong class="tit">합성 강의</strong><span>'+date+'</span><div class="time"><span class="start">13:00</span> ~ 15:00</div></a></main>';
  await profile.protocol.handle('https',req=>{if(req.method==='GET')gets++;else posts++;return html('<meta charset="utf-8">'+cards+(recovered?'':notice));});
  const runner=new CatalogRunner({now:()=>kstInstant(date,'09:00'),sleep:()=>sleep(75),
   store:{record:(_id,_day,row)=>{last=row;}},
   createPage:async(p,signal)=>electronCatalogPage(p,signal,{partition,sandbox:true}),
   recoverLogin:async()=>{recovered++;return true;}});
  await runner.start(date,[site]);equal(recovered,1,kind);equal(gets,2,kind);equal(posts,0,kind);equal(last.events.length,1,kind);
  report.network[site][kind]={recovered,listReads:gets,posts,events:last.events.length};
 }
 const site='doctorville',partition='expired-barrier',profile=session.fromPartition(partition);
 await profile.protocol.handle('https',()=>html('<script>alert("추가 인증이 필요합니다. 다시 로그인하세요.")</script><div role="dialog">로그인이 필요합니다.</div>'));
 const page=electronCatalogPage(initialSettings().profiles[site],new AbortController().signal,{partition,sandbox:true});
 try{await page.open();const reply=await until(async()=>{const row=await page.read(date,null);return row.done&&row;});equal(reply.status,'blocked');}finally{page.close();}
}

async function sharedWait(){
 const {SiteWait,workerWait}=await load('site-wait'),resources=await load('hidden-resources');
 const file=join(temp,'wait');let now=Date.now(),gate=new SiteWait(file,{now:()=>now});
 let status=429,count=0;
 const server=createServer((req,res)=>{
  if(req.url==='/limit'){res.writeHead(status,{'Retry-After':'120'});res.end('wait');return;}
  if(req.url.startsWith('/list'))count++;
  res.end('fixture');
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/list';
 const wins=[1,2].map(i=>new BrowserWindow({show:false,webPreferences:{partition:'wait-window-'+i,sandbox:true}}));
 try{
  if(!baseline)for(const w of wins)resources.guardSession(w.webContents.session,{allowed:()=>gate.allowed('docple')});
  for(status of [429,503]){
   const trigger=new BrowserWindow({show:false,webPreferences:{partition:'trigger-'+status,sandbox:true}});
   const worker=workerWait(gate,'docple',new AbortController().signal,()=>0);
   resources.hiddenResources(trigger.webContents,{allowed:worker.allowed,response:details=>{
    // Only loopback is reachable. Translate the fixture origin at the provider boundary.
    if(details.url.endsWith('/limit'))worker.response({...details,url:'https://docple-plus.com/offerwall/attendance'});
   }});
   await trigger.loadURL(new URL('/limit',url).href).catch(()=>{});trigger.destroy();
   equal(gate.status('docple')?.until,now+120000);
   now+=20000;gate=new SiteWait(file,{now:()=>now});
   const before=count;await Promise.all(wins.map(w=>w.loadURL(url).catch(()=>{})));
   equal(count-before,baseline?2:0);
   now+=100000;const atExpiry=count;
   await wins[0].loadURL(url+'?new');
   report.network['wait'+status]={otherWindowReads:atExpiry-before,afterNewRequest:count-atExpiry,redirects:0};
   equal(count-atExpiry,1);
  }
 }finally{wins.forEach(w=>w.destroy());server.closeAllConnections();await new Promise(ok=>server.close(ok));}
}
async function mainIpc(){
 writeFileSync(join(data,'data-access-v1.json'),JSON.stringify({mode:'off'}));
 const {remotePreferences}=await load('security'),pref=remotePreferences('doctorville',metadata.doctorGleanEdition);
 let requests=0,external=0;
 const profile=session.fromPartition(pref.partition);
 await profile.protocol.handle('https',()=>{requests++;return html('<main>합성 목록</main>');});
 const docpleRequests=[];
 const docpleProfile=session.fromPartition(remotePreferences('docple',metadata.doctorGleanEdition).partition);
 await docpleProfile.protocol.handle('https',request=>{
  if(new URL(request.url).pathname==='/auth/login')docpleRequests.push(request.method);
  return html('<form><input type="password"></form>');
 });
 shell.openExternal=async()=>{external++;};
 const {SiteWait}=await load('site-wait');
 const gate=new SiteWait(join(data,'site-wait-v1.json'));
 gate.observe('doctorville',{url:'https://www.doctorville.co.kr/seminar/main',status:429,document:true,retryAfter:'120'});
 gate.observe('docple',{url:'https://docple-plus.com/auth/login',status:429,document:true,retryAfter:'4'});
 await load('main');
 const control=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/ui/index.html')));
 const call=expr=>control.webContents.executeJavaScript('window.doctorGlean.'+expr);
 await until(()=>control.webContents.executeJavaScript('!!window.doctorGlean?.state'));
 const start=await call('state()');equal(start.paused,true);
 const open=await call("openSite('doctorville')");
 if(baseline)await until(()=>requests>0);
 report.network.offAtStartup={siteReads:requests,redirects:0,open:open.ok};
 equal(requests,baseline?1:0);
 if(!baseline){
  for(const mode of ['off','wifi']){
   if(mode==='wifi')await call("setDataMode('wifi')");
   for(const action of ["openLogin('doctorville')","collectSite('doctorville')","recoverCredential('intermd')","checkDaily(true)","quickRun()","preflightUpcoming()","checkUpdate()","installUpdate()","openUpdatePage()"])equal((await call(action)).reason,'data_blocked',action);
   equal((await call('state()')).dataAccess.mode,mode);
   equal(external,0);equal(requests,0);
  }
  equal((await call("setDataMode('always')")).ok,true);equal((await call('state()')).paused,true);
  equal((await call('state()')).sites.find(s=>s.id==='doctorville').serverWait?.status,429);
  const after429=requests;
  equal((await call("openLogin('doctorville')")).reason,'site_wait');
  await call("collectSite('doctorville')");await sleep(300);
  equal(requests,after429);report.network.persisted429={additionalReads:requests-after429,status:429};
  const evaluate=code=>control.webContents.executeJavaScript(code);
  await until(()=>evaluate('document.querySelectorAll("#sites .site-name").length===10'));
  await evaluate(`document.getElementById('tab-sites').click();
   const row=[...document.querySelectorAll('#sites .site')].find(el=>el.querySelector('.site-name').textContent.includes('닥플 플러스'));
   [...row.querySelectorAll('button')].find(button=>button.textContent==='계정 저장·복구').click();`);
  equal(await evaluate(`(()=>{const button=document.getElementById('credential-manual-login');button.click();return [button.hidden,button.disabled];})()`),[false,true]);
  equal(docpleRequests.length,0);
  await until(()=>evaluate(`!document.getElementById('credential-manual-login').disabled`));
  equal(docpleRequests.length,0);
  await evaluate("document.getElementById('credential-manual-login').click()");
  await until(()=>docpleRequests.length>0);
  const manual=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='https://docple-plus.com/auth/login'));
  try{
   await until(()=>evaluate("!document.getElementById('credential-dialog').open"));
   equal(docpleRequests,['GET']);
   equal((await call('checkUpdate()')).status,'unsupported');
   const savedReport=JSON.parse((await call('previewReport()')).text);
   equal(savedReport.update,{status:'unsupported'});
   equal(savedReport.serverWait.find(row=>row.site==='docple').active,false);
   equal(savedReport.serverWait.find(row=>row.site==='docple').source,'login_document');
  }finally{manual.destroy();}
 }
}
app.on('window-all-closed',()=>{});
async function run(){
 try{
  await app.whenReady();
  await attendance();await popup();if(!baseline&&metadata.version!=='0.1.0-preview.36')await expiredSessionDialogs();await sharedWait();await mainIpc();
  report.checks=checks;
  const dir=join(here,'verification');mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,baseline?'access-baseline.json':'electron-access.json'),JSON.stringify(report,null,2)+'\n');
  console.log('ELECTRON_ACCESS_PASS:'+checks);app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
}
void run();
