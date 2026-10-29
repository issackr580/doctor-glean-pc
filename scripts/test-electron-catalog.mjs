// Executed by Electron with synthetic HTTPS handlers. Never uses real accounts.
import {app,BrowserWindow,session,dialog,clipboard,shell as desktopShell} from 'electron';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {kstDate,kstInstant} from '../src/schedule.js';
import {resolveEdition} from '../src/edition.js';
import {WorkflowStore,cleanReceipt} from '../src/workflow-store.js';

const application=resolve(process.env.DOCTOR_GLEAN_PC_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url)));
const appMetadata=JSON.parse(readFileSync(join(application,'package.json'),'utf8')),edition=resolveEdition(appMetadata.doctorGleanEdition);
const temporary=process.env.DOCTOR_GLEAN_PC_TEST_APP_DATA??mkdtempSync(join(tmpdir(),'doctor-glean-electron-catalog-'));
const dataDirectory=join(temporary,edition.directory),browserDirectory=join(dataDirectory,'browser');
mkdirSync(browserDirectory,{recursive:true});app.setPath('appData',temporary);app.setPath('userData',dataDirectory);app.setPath('sessionData',browserDirectory);
const resultFile=new URL('../verification/electron-edition-'+edition.id+'.json',import.meta.url);
const modes={doctorville:'normal',keymedi:'normal',whodadoc:'normal',dtalks:'entry-error'},requests=[],checks=[];
let registrationPosted=false,registrationDurable=false,registrationPostCount=0,hmpRegistered=false,hmpRegistrationPosts=0,hmpRegistrationDurable=false;
const windowMenus=new WeakMap(),setMenu=BrowserWindow.prototype.setMenu;
BrowserWindow.prototype.setMenu=function(menu){windowMenus.set(this,menu);return setMenu.call(this,menu);};
const today=kstDate(),tomorrow=kstDate(Date.parse(today+'T12:00:00+09:00')+86_400_000);
// Keep synthetic enrollment open regardless of the developer's daytime clock.
const syntheticClock='23:50';
const seededStore=new WorkflowStore(join(dataDirectory,'workflows-v1.json')),seededEvent={site:'doctorville',date:today,time:syntheticClock,title:'합성 닥터빌 강의 1'},seededKey=seededStore.entryKey(seededEvent),seededStart=kstInstant(today,syntheticClock);
seededStore.putEntry({key:seededKey,...seededEvent,start:seededStart,due:seededStart-3000000,deadline:seededStart+600000,nextAt:seededStart-3000000,status:'reserved',slot:0,retries:0,attempts:[],entryAttempted:false});
const historicalEvent={site:'hmp',date:today,time:'00:00',title:'합성 이전 실행 강의'},historicalAt=Date.now()-120000;
seededStore.putEntry({key:seededStore.entryKey(historicalEvent),...historicalEvent,start:kstInstant(today,'00:00'),due:kstInstant(today,'00:00'),deadline:kstInstant(today,'00:00')+90000,nextAt:0,status:'clicked',slot:4,retries:0,entryAttempted:true,attempts:Array.from({length:5},(_,slot)=>cleanReceipt({status:'clicked',attempted:true,slot,playback:'inaccessible'},historicalAt+slot))});
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=25_000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await pause(80);}throw Error('wait_timeout');}
const doctorCards=`<main><h1>라이브세미나</h1><ul>${[today,tomorrow].map((date,i)=>`<li><a class="list_detail" href="/seminar/seminarDetail?seminarId=${i+1}"><strong class="tit">합성 닥터빌 강의 ${i+1}</strong><span>${date}</span><div class="time"><span class="start">${syntheticClock}</span> ~ 23:59</div></a></li>`).join('')}</ul></main>`;
function keyCard(id,date,reward=true){return `<div data-gtm-event-name="content_click" data-gtm-content-category="메디 TV_메디TV Live" data-gtm-content-title="합성 키메디 강의 ${id}"><p>${date}(월) ${syntheticClock} ~ ${date}(월) 23:59</p><p>합성 강연자</p><div class="_3daYPVTCXASH39HyfXlu1A==">${reward?'<svg width="20" height="20"></svg>':''}</div></div>`;}
const keyCards='<main>'+keyCard(1,today)+keyCard(2,tomorrow)+keyCard(3,today,false)+'</main>';
const shell=body=>'<!doctype html><html><head><meta charset="utf-8"></head><body>'+body+'</body></html>';
const login='<form><label>합성 로그인 <input type="password"></label><button type="button" id="synthetic-login">로그인</button></form>';

async function run(){
await app.whenReady();
for(const id of ['doctorville','keymedi','whodadoc','dtalks','hmp']){
 const profile=session.fromPartition(`persist:doctor-glean-pc-${edition.id}-v1-${id}`);
 await profile.protocol.handle('https',request=>{
  requests.push({site:id,method:request.method});
  if(id==='doctorville'&&request.method==='POST'&&new URL(request.url).pathname==='/synthetic-registration'){
   registrationPostCount++;registrationDurable=Object.values(JSON.parse(readFileSync(join(dataDirectory,'registration-attempts-v1.json'),'utf8')).rows).some(row=>row.site==='doctorville'&&row.date===today&&row.time===syntheticClock&&row.attempted===true);registrationPosted=true;return new Response('{}',{headers:{'content-type':'application/json'}});
  }
  if(id==='hmp'&&request.method==='POST'&&new URL(request.url).pathname==='/synthetic-hmp-registration'){
   hmpRegistrationPosts++;hmpRegistrationDurable=Object.values(JSON.parse(readFileSync(join(dataDirectory,'registration-attempts-v1.json'),'utf8')).rows).some(row=>row.site==='hmp'&&row.time==='23:59'&&row.attempted);hmpRegistered=true;return new Response('{}');
  }
  if(request.method!=='GET')return new Response('not allowed',{status:405});
  if(id==='hmp'&&modes.hmp==='registration')return new Response(shell(`<div class="area"><div class="top"><span class="date">${today}</span><span class="time">23:59 ~ 23:59</span></div><div class="subject"><strong>합성 한미 신청 강의</strong></div>${hmpRegistered?'<span>신청완료</span>':`<button onclick="event.preventDefault();event.stopPropagation();fetch('/synthetic-hmp-registration',{method:'POST'}).then(()=>this.outerHTML='<span>신청완료</span>')">신청하기</button>`}</div><a href="/logout">로그아웃</a>`),{headers:{'content-type':'text/html; charset=utf-8'}});
  if(id==='dtalks'&&(modes.dtalks==='all-error'||modes.dtalks==='entry-error'&&new URL(request.url).pathname!=='/login.do'))return Response.error();
  if(id==='dtalks'&&modes.dtalks==='calendar')return new Response(shell(`<div class="calendar_wrap"><div class="btn_month_wrap active"><span class="date_txt">${today.slice(0,7).replace('-','.')}</span></div><div class="calendar_box active"><div class="calendar_grid"><div class="day" data-date="${today}"><div class="day_txt">${Number(today.slice(8))}</div><div class="day_box"><div class="time">13:00</div><div class="memo">합성 디톡스 강의</div></div></div></div></div></div>`),{headers:{'content-type':'text/html; charset=utf-8'}});
  const doctorReady=modes.doctorville==='registration'?doctorCards.replaceAll('</a>',registrationPosted?'<span>신청완료</span></a>':`<button onclick="event.preventDefault();event.stopPropagation();fetch('/synthetic-registration',{method:'POST'}).then(()=>this.outerHTML='<span>신청완료</span>')">신청하기</button></a>`):modes.doctorville==='entry-ready'?doctorCards.replaceAll('</a>','<button onclick="fetch(\'/synthetic-entry\',{method:\'POST\'})">입장하기</button></a>'):doctorCards;
  const ready=(id==='doctorville'?doctorReady:id==='keymedi'?keyCards:'<main>웨비나</main>')+'<a href="/logout">로그아웃</a>';
  const body=modes[id]==='login'?login:`<script>document.write(localStorage.getItem('synthetic-login')==='ready'?${JSON.stringify(ready)}:${JSON.stringify(login)});const b=document.getElementById('synthetic-login');if(b)b.onclick=()=>{localStorage.setItem('synthetic-login','ready');location.reload();};</script>`;
  return new Response(shell(body),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
}
const report=join(temporary,'report-'+edition.id+'.txt'),developerReport=join(temporary,'developer-report.json'),entryReport=join(temporary,'entry-report.txt'),openedPages=[];
dialog.showSaveDialog=async(_window,options)=>({canceled:false,filePath:options?.defaultPath?.includes('entry-report')?entryReport:options?.defaultPath?.includes('developer-diagnostics')?developerReport:report});
desktopShell.openExternal=async url=>{openedPages.push(url);};
const exitTimer=setTimeout(()=>{console.error('ELECTRON_CATALOG_TIMEOUT');app.exit(2);},100_000);
try{
 await import(pathToFileURL(join(application,'src/main.js')));
 const control=await until(()=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('/ui/index.html')));
 await until(()=>control.webContents.executeJavaScript('typeof window.doctorGlean?.state==="function"'));
 const evaluate=script=>control.webContents.executeJavaScript(script);
 const state=()=>evaluate('window.doctorGlean.state()');
 const initial=await state();
 check('control preload and real IPC ready',initial.sites.length===10);
 check('application version comes from its package',initial.version===appMetadata.version);
 check('automatic features are available but initially disabled',initial.automationAvailable&&initial.paused&&Object.values(initial.automation.features).every(value=>!value));
 await until(()=>evaluate('document.querySelectorAll("#features input").length===6'));
 check('control offers feature settings and a visible full quit button',await evaluate('!!document.querySelector("#quit")&&document.querySelectorAll("#entry-sites input").length===6'));
 check('edition metadata and application ID match',initial.edition===edition.id&&initial.applicationId===edition.appId&&initial.appName===edition.name);
 check('manual login retry gap matches the built edition while automatic and daily caps remain',initial.credentials.attempts.policy.manualGapMs===(edition.developer?3000:10000)&&initial.credentials.attempts.policy.automaticWindowLimit===3&&initial.credentials.attempts.policy.dailyLimit===10);
 check('another edition did not supply cached results',Object.keys(initial.results).length===0);
 const hasDeveloper=await evaluate('typeof window.doctorGleanDeveloper!=="undefined"');
 check('developer bridge matches the built edition',hasDeveloper===edition.developer);
 check('update page cannot be opened before an explicit check',!(await evaluate('window.doctorGlean.openUpdatePage()')).ok&&openedPages.length===0);
 const update=await evaluate('window.doctorGlean.checkUpdate()');
 check('PC update distinguishes collaborator delivery from unsupported synthetic Linux',update.status===(edition.developer?'private_delivery':'unknown'));
 if(edition.developer){await evaluate('window.doctorGlean.openUpdatePage("https://foreign.invalid/")');check('developer update opens only the fixed PC release list',openedPages.length===1&&openedPages[0]==='https://github.com/issackr580/doctor-glean-pc/releases');}
 await evaluate('[...document.querySelectorAll("#sites button")].find(b=>b.textContent==="계정 저장·복구").click()');
 check('account settings open in the local control dialog',await evaluate('document.querySelector("#credential-dialog").open'));
 writeFileSync(new URL('../verification/account-settings-'+edition.id+'.png',import.meta.url),(await control.webContents.capturePage()).toPNG());
 check('Linux cannot fall back to plaintext account storage',!initial.credentials.vault.available&&initial.credentials.vault.backend==='unavailable'&&await evaluate('document.querySelector("#credential-save").disabled'));
 await evaluate('document.querySelector("#credential-id").value="SYNTHETIC_ACCOUNT";document.querySelector("#credential-password").value="SYNTHETIC_PASSWORD";document.querySelector("#credential-close").click()');
 check('closing account settings clears both fields',await evaluate('document.querySelector("#credential-id").value===""&&document.querySelector("#credential-password").value===""'));
 const protectedSave=await evaluate('window.doctorGlean.saveCredential("hmp","SYNTHETIC_ACCOUNT","SYNTHETIC_PASSWORD",true)');
 check('credential IPC refuses save when Windows protection is unavailable',!protectedSave.ok&&protectedSave.status==='storage_unavailable'&&!existsSync(join(dataDirectory,'credentials-v1.json')));
 check('untrusted credential site names are rejected',(await evaluate('window.doctorGlean.recoverCredential("__proto__")')).ok===false);
 for(const id of ['whodadoc','dtalks','hmp']){
  const prior=new Set(BrowserWindow.getAllWindows());
  check(id+' open action acknowledged',(await evaluate(`window.doctorGlean.openSite(${JSON.stringify(id)})`)).ok);
  const window=await until(()=>BrowserWindow.getAllWindows().find(w=>!prior.has(w)));
  check(id+' manual window is visible before login',window.isVisible());
  if(id==='dtalks'){
   await until(()=>window.webContents.executeJavaScript('!!document.querySelector("input[type=password]")'));
   check('a failed Dtalks catalog automatically opens only its fixed login screen',window.webContents.getURL()==='https://www.dtalks.kr/login.do');
   modes.dtalks='all-error';await evaluate('window.doctorGlean.openLogin("dtalks")');
   await until(()=>window.webContents.executeJavaScript('document.body?.innerText.includes("사이트를 열지 못했어요")'));
   check('failed catalog and login keep a visible retry window',window.isVisible());
   modes.dtalks='entry-error';await evaluate('window.doctorGlean.openLogin("dtalks")');
   await until(()=>window.webContents.executeJavaScript('!!document.querySelector("input[type=password]")'));
   check('fixed Dtalks login entry still recovers after both targets failed',window.webContents.getURL()==='https://www.dtalks.kr/login.do');
  }else if(id==='whodadoc'){
   await until(()=>window.webContents.executeJavaScript('!!document.querySelector("input[type=password]")'));
   window.minimize();await evaluate('window.doctorGlean.openSite("whodadoc")');
   check('reopening a minimized Whodadoc window restores it',!window.isMinimized()&&window.isVisible());
  }else{
   await until(()=>window.webContents.executeJavaScript('!!document.querySelector("input[type=password]")'));
   const item=windowMenus.get(window).getMenuItemById('open-login');
   check('HMP manual login menu has a real fixed credential entry',item.enabled===true);
   item.click();await until(()=>window.webContents.getURL()==='https://www.hmp.co.kr/login/loginForm.hm');
   check('HMP native login menu navigates without a global runtime fault',window.isVisible());
  }
  check(id+' window offers visible login actions',window.isMenuBarVisible());
  window.close();await until(async()=>!(await state()).sites.find(s=>s.id===id).open);
  if(id==='hmp'){assert.doesNotThrow(()=>windowMenus.get(window).getMenuItemById('open-login').click());check('late native menu callbacks do nothing after their window closes',window.isDestroyed());}
 }
 if(edition.developer){
  check('developer recorder starts disabled',!(await evaluate('window.doctorGleanDeveloper.status()')).enabled);
  await evaluate('window.doctorGleanDeveloper.export()');
  const disabled=JSON.parse(readFileSync(developerReport,'utf8'));
  check('disabled recorder export still includes current site and browser diagnostics',disabled.events.length===0&&disabled.currentState.siteSessions.length===10&&disabled.currentState.browserEvents.some(e=>e.site==='dtalks'&&e.kind==='document_load_failed'));
  check('disabled export does not contain session values or URLs',!/https:|synthetic-login|outside.example/.test(JSON.stringify(disabled)));
  check('developer opt-in succeeds',(await evaluate('window.doctorGleanDeveloper.setEnabled(true)')).ok);
 }else check('distribution creates no developer diagnostic journal',!existsSync(join(dataDirectory,'developer-diagnostics-v1.json')));
 for(const id of ['doctorville','keymedi']){
  await evaluate(`window.doctorGlean.openSite(${JSON.stringify(id)})`);
  const window=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==control&&w.webContents.getURL().includes(id==='doctorville'?'doctorville.co.kr':'keymedi.com')));
  await until(()=>window.webContents.executeJavaScript('!!document.getElementById("synthetic-login")'));
  const powers=await window.webContents.executeJavaScript('({node:typeof require,bridge:typeof doctorGlean,process:typeof process})');
  check(id+' website has no Node or app bridge',powers.node==='undefined'&&powers.bridge==='undefined'&&powers.process==='undefined');
  if(id==='doctorville'){
   await window.webContents.executeJavaScript('location.href="https://outside.example.invalid/"');await pause(100);
   check('manual site cannot navigate to an unrelated origin',window.webContents.getURL().includes('doctorville.co.kr'));
   await window.webContents.executeJavaScript('window.open("about:blank","synthetic-login-popup");void 0');
   const popup=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==window&&w!==control));
   check('blank named login popup is shown',popup.isVisible()&&popup.webContents.getURL()==='about:blank');
   const boundary=await popup.webContents.executeJavaScript('({node:typeof require,bridge:typeof doctorGlean})');
   check('blank login popup has no privileged bridge',boundary.node==='undefined'&&boundary.bridge==='undefined');
   await popup.webContents.executeJavaScript('location.href="https://outside.example.invalid/"');await pause(150);
   check('blank popup cannot escape to an unrelated origin',popup.webContents.getURL()==='about:blank');
   popup.close();await until(()=>popup.isDestroyed());
  }
  await window.webContents.executeJavaScript('document.getElementById("synthetic-login").click()');
  await until(()=>window.webContents.executeJavaScript('!document.querySelector("input[type=password]")'));
  await until(async()=>(await state()).sites.find(site=>site.id===id).session.login==='authenticated');
  check(id+' visible logout confirms login without reading a password',(await state()).sites.find(site=>site.id===id).session.login==='authenticated');
  if(id==='doctorville'){
   await evaluate('window.doctorGlean.openSite("keymedi")');
   check('finish login flushes the session and starts one-site query',(await evaluate('window.doctorGlean.finishLogin("doctorville")')).ok);
   await until(async()=>{const s=await state();return !s.collection.running&&s.results.doctorville?.events.length===1;});
   const finished=await state();
   check('finishing Doctorville leaves another manual login window open',finished.sites.find(s=>s.id==='keymedi').open&&!finished.sites.find(s=>s.id==='doctorville').open);
   check('session storage acknowledgement is visible',finished.sites.find(s=>s.id==='doctorville').session.save==='flushed');
  }else{window.close();await until(async()=>!(await state()).sites.find(site=>site.id===id).open);}
 }
 await evaluate('window.doctorGlean.collect()');
 const done=await until(async()=>{const s=await state();return !s.collection.running&&s.collection.reason==='finished'?s:null;},40_000);
 for(const id of ['doctorville','keymedi']){
  check(id+' login session shared with hidden reader',done.results[id].events.length===1);
  check(id+' only selected day collected',done.results[id].events.every(row=>row.date===today));
 }
 check('Keymedi requires P/M reward',done.results.keymedi.events[0].title==='합성 키메디 강의 1');
 await evaluate('window.doctorGlean.collect()');
 await until(async()=>{const s=await state();return s.collection.running&&s.collection.site==='doctorville';});
 await evaluate('window.doctorGlean.openSite("keymedi")');
 check('opening another login window does not cancel an ongoing site query',(await state()).collection.running&&(await state()).collection.site==='doctorville');
 await evaluate('window.doctorGlean.finishLogin("keymedi")');
 check('finishing another login queues its query instead of cancelling the owner',(await state()).pendingQueries.some(row=>row.site==='keymedi'));
 await until(async()=>{const s=await state();return !s.collection.running&&!s.pendingQueries.length&&s.results.keymedi?.events.length===1;},40000);
 check('queued login query completes after the original query',(await state()).collection.reason==='finished');
 await pause(250);
 control.setSize(800,1320);await pause(250);
 await control.webContents.executeJavaScript('window.scrollTo(0,0)');
 writeFileSync(new URL('../verification/catalog-preview-'+edition.id+'.png',import.meta.url),(await control.webContents.capturePage()).toPNG());
 await evaluate('window.doctorGlean.copySchedule()');
 check('real clipboard receives compact schedule',(await clipboard.readText()).includes(syntheticClock.replace(':','')+' 닥빌 키메'));
 check('copy omits deselected sites',!(await clipboard.readText()).includes('미확인: 한미'));
 modes.doctorville='entry-ready';
 const entryBefore=(await state()).automation.entries.find(row=>row.key===seededKey);
 const preflight=await evaluate('window.doctorGlean.preflightEntry('+JSON.stringify(seededKey)+')');
 const checked=(await state()).automation.entries.find(row=>row.key===seededKey);
 check('real control IPC provides a read-only entry preflight',preflight.ok&&checked.preflight?.status==='complete'&&!checked.preflight.attempted);
 check('preflight preserves the reservation and never dispatches its provider button',checked.status===entryBefore.status&&checked.attempts.length===0&&requests.every(request=>request.method==='GET'));
 check('control shows entry evidence and the read-only inspection result',await evaluate('document.getElementById("entry-results").textContent.includes("실제 클릭 없음")'));
 modes.doctorville='login';await evaluate('window.doctorGlean.preflightEntry('+JSON.stringify(seededKey)+')');
 check('preflight reports login need without credential submission',(await state()).automation.entries.find(row=>row.key===seededKey).preflight.status==='login'&&requests.every(request=>request.method==='GET'));
 modes.doctorville='normal';
 check('control separates retained clicks from this app session',await evaluate('document.getElementById("entry-results").textContent.includes("이번 프로그램 실행 후 PC 클릭 0회 · 시작 전 기록 5회")'));
 const batchResult=await evaluate('window.doctorGlean.preflightUpcoming()');
 check('batch inspection IPC and visible action remain read-only',batchResult.ok&&(await state()).automation.preflight.running===false&&requests.every(r=>r.method==='GET')&&await evaluate('document.getElementById("entry-results").textContent.includes("예정 예약 일괄 사전 검사")'));
 check('batch UI distinguishes processed counts from eligibility outcomes',await evaluate('document.getElementById("entry-results").textContent.includes("버튼 확인")&&document.getElementById("entry-results").textContent.includes("로그인 필요")'));
 await evaluate('window.doctorGlean.exportReport()');
 const diagnostic=readFileSync(report,'utf8');
 check('report omits raw session, URLs and lecture titles',!/synthetic-login|https:|합성 .*강의/.test(diagnostic));
 check('report includes bounded collection counts',JSON.parse(diagnostic).sites.length===2);
 check('blocked navigation is diagnosable without its URL',JSON.parse(diagnostic).browserEvents.some(row=>row.kind==='navigation_blocked')&&!diagnostic.includes('outside.example.invalid'));
 if(edition.developer){
  const policies=await evaluate('window.doctorGleanDeveloper.policyCheck()');
  check('developer policy probe remains an offline check',policies.scope==='offline_policy'&&policies.checks.every(row=>row.passed));
  await evaluate('window.doctorGleanDeveloper.export()');
  const exported=JSON.parse(readFileSync(developerReport,'utf8'));
  check('developer opt-in records collection milestones',exported.events.some(row=>row.area==='collection'));
  check('developer opt-in also records the entry preflight timeline',exported.events.some(row=>row.area==='automation'&&row.phase==='preflight'&&row.readOnly===true));
  check('developer journal excludes URLs and lecture titles',!/https:|합성 .*강의|outside.example.invalid|synthetic-login/.test(JSON.stringify(exported)));
  const records=await evaluate('window.doctorGleanDeveloper.entryList()');
  check('real preflight callbacks produce bounded PC-owned entry records',records.records.length>0&&exported.entryJournal.records.some(r=>r.kind==='preflight'&&r.events.some(e=>e.stage==='page_finished')&&r.events.some(e=>e.stage==='work_finished')));
  const selected=records.records[0].executionId;
  const preview=await evaluate('window.doctorGleanDeveloper.entryPreview('+JSON.stringify(selected)+')');
  const saved=await evaluate('window.doctorGleanDeveloper.entrySave('+JSON.stringify(preview.token)+')'),copied=await evaluate('window.doctorGleanDeveloper.entryCopy('+JSON.stringify(preview.token)+')');
  check('native focus save and copy acknowledge their frozen token',saved.ok&&copied.ok);
  check('native file matches the frozen selected preview bytes',readFileSync(entryReport,'utf8')===preview.text);
  check('native clipboard matches the frozen selected preview bytes',await clipboard.readText()===preview.text);
  check('selected preview contains exactly the chosen execution',JSON.parse(preview.text).recordCount===1&&JSON.parse(preview.text).records[0].executionId===selected);
  check('focus report exports no internal key or unselected activity',!preview.text.includes(seededKey)&&!preview.text.includes('currentState')&&!preview.text.includes('https:'));
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="회차 목록 새로고침").click()');await until(()=>evaluate('document.querySelector("#entry-report-select").options.length>0'));
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="선택 회차 미리보기").click()');await until(()=>evaluate('document.querySelector("#entry-report-preview").value.length>0'));
  check('developer UI presents sanitized text before enabling focus export',await evaluate('document.querySelector("#entry-report-preview").readOnly&&[...document.querySelectorAll("button")].find(b=>b.textContent==="미리본 보고서 저장").disabled===false'));
 }else check('distribution report has no developer recorder state',!Object.hasOwn(JSON.parse(diagnostic),'developerDiagnostics'));
 check('single-site catalog action rejects non-catalog or arbitrary destinations',!(await evaluate('window.doctorGlean.collectSite("docple")')).ok&&!(await evaluate('window.doctorGlean.collectSite("https://outside.example.invalid")')).ok);
 const beforeDtalks=await state();modes.dtalks='calendar';
 await evaluate('window.doctorGlean.collectSite("dtalks")');
 const dtalksDone=await until(async()=>{const s=await state();return !s.collection.running&&s.results.dtalks?.checkedAt?s:null;});
 check('real Dtalks calendar reader retains checked date evidence through storage and IPC',dtalksDone.results.dtalks.scope==='calendar_checked'&&dtalksDone.results.dtalks.inspection.calendarDate===today&&dtalksDone.results.dtalks.events.length===1);
 check('retrying one site does not change selection or rerun previously checked sites',JSON.stringify(dtalksDone.sites.filter(s=>s.selected).map(s=>s.id))===JSON.stringify(beforeDtalks.sites.filter(s=>s.selected).map(s=>s.id))&&dtalksDone.results.doctorville.checkedAt===beforeDtalks.results.doctorville.checkedAt&&dtalksDone.results.keymedi.checkedAt===beforeDtalks.results.keymedi.checkedAt);
 modes.doctorville='login';modes.keymedi='login';
 await evaluate('window.doctorGlean.collect()');
 const failed=await until(async()=>{const s=await state();return !s.collection.running&&s.results.keymedi.status==='login'?s:null;});
 check('failed refresh keeps same-day cached rows',failed.results.doctorville.stale&&failed.results.keymedi.stale);
 check('failed login not rewritten as success',failed.results.keymedi.status==='login');
 await evaluate(`window.doctorGlean.setDate(${JSON.stringify(tomorrow)})`);
 check('date switch never shows another day cache',Object.keys((await state()).results).length===0);
 modes.doctorville='normal';modes.keymedi='normal';
 await evaluate('window.doctorGlean.collect()');
 await until(async()=>{const s=await state();return s.collection.running;});
 await evaluate('window.doctorGlean.cancelCollection()');
 await pause(1200);
 check('cancelled collection cannot become finished later',(await state()).collection.reason==='cancelled');
 check('hidden worker windows released',BrowserWindow.getAllWindows().length===1);
 control.close();check('closing control retains resident app',!control.isDestroyed());
 check('synthetic protocol only made catalog GET requests',requests.every(request=>request.method==='GET'));
 control.show();modes.doctorville='registration';await evaluate('window.doctorGlean.preflightEntry('+JSON.stringify(seededKey)+')');
 await until(()=>evaluate('[...document.querySelectorAll("#entry-results button")].some(b=>b.textContent==="신청하기")'));
 check('missing registration exposes a real control action',(await state()).automation.entries.find(r=>r.key===seededKey).preflight.status==='not_registered');
 check('registration IPC rejects arbitrary targets before opening a provider',!(await evaluate('window.doctorGlean.requestRegistration("url","https://foreign.invalid/")')).ok&&registrationPostCount===0);
 const entryLedger=()=>existsSync(join(dataDirectory,'state-v1.json'))?readFileSync(join(dataDirectory,'state-v1.json'),'utf8'):null;
 const ledgerBeforeRegistration=entryLedger();
 await evaluate('[...document.querySelectorAll("#entry-results button")].find(b=>b.textContent==="신청하기").click()');
 await until(async()=>{const s=await state();return !s.registration.active&&s.registration.entries[seededKey]?.state==='confirmed';});
 const applicationWindow=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==control));
 check('explicit application is durable before exactly one native provider POST',registrationPostCount===1&&registrationDurable);
 check('application uses a visible isolated site window',applicationWindow.isVisible()&&await applicationWindow.webContents.executeJavaScript('typeof require==="undefined"&&typeof doctorGlean==="undefined"'));
 check('registration confirmation is not an entry click or a cleared attempt ledger',entryLedger()===ledgerBeforeRegistration&&!(await state()).automation.entries.find(r=>r.key===seededKey).entryAttempted);
 const checkedRegistration=await evaluate('window.doctorGlean.requestRegistration("entry",'+JSON.stringify(seededKey)+')');
 check('the same application action becomes a read-only status check',checkedRegistration.status==='confirmed'&&registrationPostCount===1);
 const finishRegistration=windowMenus.get(applicationWindow).getMenuItemById('finish-registration');finishRegistration.click();
 await until(async()=>{const s=await state();return BrowserWindow.getAllWindows().length===1&&!s.collection.running&&!s.pendingQueries.length;});
 check('finishing a confirmed application preserves its reservation',registrationPostCount===1&&(await state()).automation.entries.find(r=>r.key===seededKey).status===entryBefore.status);
 check('registration state is scoped to this edition',existsSync(join(dataDirectory,'registration-attempts-v1.json')));
 modes.hmp='registration';await evaluate('window.doctorGlean.setDate('+JSON.stringify(today)+')');await evaluate('window.doctorGlean.selectSites(["doctorville","keymedi","hmp"])');await evaluate('window.doctorGlean.collectSite("hmp")');
 const hmpCatalog=await until(async()=>{const s=await state();return !s.collection.running&&s.results.hmp?.events.some(e=>e.registrationStatus==='not_registered')?s:null;},40000);
 check('unregistered HMP catalog offers application before creating an entry reservation',!hmpCatalog.automation.entries.some(e=>e.site==='hmp'&&e.time==='23:59')&&await evaluate('[...document.querySelectorAll("#lectures article")].some(row=>row.textContent.includes("합성 한미 신청 강의")&&[...row.querySelectorAll("button")].some(b=>b.textContent==="신청하기"))'));
 await evaluate('window.doctorGlean.setFeature("entry",true)');
 await evaluate('[...document.querySelectorAll("#lectures article")].find(row=>row.textContent.includes("합성 한미 신청 강의")).querySelector("button").click()');
 await until(async()=>{const s=await state();return !s.registration.active&&Object.values(s.registration.lectures).some(r=>r?.site==='hmp'&&r.state==='confirmed');});
 check('HMP catalog uses its fixed lecture identity and one durable original POST',hmpRegistrationPosts===1&&hmpRegistrationDurable);
 const hmpApplication=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==control));windowMenus.get(hmpApplication).getMenuItemById('finish-registration').click();
 await until(async()=>{const s=await state();return BrowserWindow.getAllWindows().length===1&&!s.collection.running&&!s.pendingQueries.length&&s.automation.entries.some(e=>e.site==='hmp'&&e.time==='23:59');},40000);
 check('fresh HMP enrollment creates a normal unattempted reservation without entering the lecture',(await state()).automation.entries.some(e=>e.site==='hmp'&&e.time==='23:59'&&e.status==='reserved'&&!e.entryAttempted)&&hmpRegistrationPosts===1);
 await evaluate('window.doctorGlean.setFeature("entry",false)');
 // Emit only the monitor event: the real fatal/default behavior is covered in
 // a separate Node subprocess, so the synthetic suite never hides a popup.
 const exceptionHandlers=process.listenerCount('uncaughtException'),rejectionHandlers=process.listenerCount('unhandledRejection');
 await evaluate('window.doctorGlean.openSite("doctorville")');
 const retainedManual=await until(()=>BrowserWindow.getAllWindows().find(window=>window!==control));
 await evaluate('window.doctorGlean.setPaused(false)');
 const beforeFault=JSON.parse(readFileSync(join(dataDirectory,'state-v1.json'),'utf8'));
 const fault=TypeError('SYNTHETIC_PRIVATE_ACCOUNT https://private.invalid/?token=SECRET');
 fault.stack='TypeError: private\n    at synthetic ('+pathToFileURL(join(application,'src/main.js')).href+':90:7)';
 process.emit('uncaughtExceptionMonitor',fault,'unhandledRejection');
 const afterFault=await state(),savedFault=JSON.parse(readFileSync(join(dataDirectory,'state-v1.json'),'utf8'));
 check('runtime monitoring pauses automatic dispatch durably and retains the manual window',afterFault.paused&&savedFault.paused&&!retainedManual.isDestroyed()&&retainedManual.isVisible());
 check('runtime fault handling preserves all external attempt records',JSON.stringify(beforeFault.jobs)===JSON.stringify(savedFault.jobs));
 check('runtime monitoring leaves default exception and rejection handlers intact',process.listenerCount('uncaughtException')===exceptionHandlers&&process.listenerCount('unhandledRejection')===rejectionHandlers);
 await evaluate('window.doctorGlean.exportReport()');
 const faultReport=JSON.parse(readFileSync(report,'utf8')),faultRows=faultReport.runtimeFaults.events;
 check('ordinary reports identify the safe fault kind and app source position',faultRows.length===1&&faultRows[0].origin==='unhandled_rejection'&&faultRows[0].code==='type_error'&&faultRows[0].source==='src/main.js'&&faultRows[0].line===90);
 check('fault reports omit private error text, absolute paths and URLs',!/SYNTHETIC_PRIVATE|private\.invalid|SECRET|file:|workspace|Users/.test(JSON.stringify(faultReport)));
 if(edition.developer){
  await evaluate('window.doctorGleanDeveloper.export()');
  const persistedFault=JSON.parse(readFileSync(developerReport,'utf8')).events.find(row=>row.phase==='fault');
  check('opt-in developer journal persists safe fault rows with execution version',persistedFault?.code==='type_error'&&persistedFault.appVersion===appMetadata.version&&persistedFault.source==='src/main.js');
 }else check('ordinary fault reporting creates no distribution developer journal',!existsSync(join(dataDirectory,'developer-diagnostics-v1.json')));
 await evaluate('window.doctorGlean.finishLogin("doctorville")');
 await evaluate('window.doctorGlean.cancelCollection()');
 await until(()=>BrowserWindow.getAllWindows().length===1);
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});
 writeFileSync(resultFile,JSON.stringify({schemaVersion:1,edition:edition.id,version:appMetadata.version,runtime:{platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome},environment:'Linux Electron 45 with virtual X display and synthetic HTTPS',osSandboxVerified:false,windowsVerified:false,authenticatedProviderVerified:false,checks:checks.length,passed:checks,requests:requests.length},null,2)+'\n');
 console.log('ELECTRON_CATALOG_PASS:'+checks.length);
 clearTimeout(exitTimer);app.quit();
}catch(error){console.error('ELECTRON_CATALOG_FAIL:'+error.stack);clearTimeout(exitTimer);for(const window of BrowserWindow.getAllWindows())window.destroy();app.exit(1);}
app.on('quit',()=>{if(!process.env.DOCTOR_GLEAN_PC_TEST_APP_DATA)try{rmSync(temporary,{recursive:true,force:true});}catch{}});
}
run().catch(error=>{console.error('ELECTRON_CATALOG_FAIL:'+error.stack);app.exit(1);});
