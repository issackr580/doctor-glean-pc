// Real Electron workers and immutable Android scripts; synthetic HTTPS only.
import {app,BrowserWindow,session} from 'electron';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {AutomationPage} from '../src/automation-page.js';
import {DailyRunner} from '../src/daily-runner.js';
import {DoctorvilleQuizRunner} from '../src/doctorville-quiz-runner.js';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {remotePreferences} from '../src/security.js';
import {kstDate} from '../src/schedule.js';
import {watchManualEntry} from '../src/manual-entry-watch.js';
app.on('window-all-closed',()=>{});
const root=mkdtempSync(join(tmpdir(),'pc-native-automation-'));
app.setPath('userData',root);app.setPath('sessionData',join(root,'browser'));
const checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const date=kstDate(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let attendance=0,quiz=0,quizReads=0,mode='normal',sentAfterReservation=false;
const ledger=new LocalState(join(root,'state.json')),store=new WorkflowStore(join(root,'workflows.json'));
const fixture=body=>'<!doctype html><html><head><meta charset="utf-8"></head><body>'+body+'</body></html>';
const quizBody='<input id="quizId" type="hidden" value="3644"><div id="quizLayerPop">'+Array.from({length:3},(_,q)=>'<p>합성 문항 '+(q+1)+'</p>'+Array.from({length:3},(_,o)=>`<input type="radio" name="answer${q+1}" id="answer${q+1}-${o+1}" value="${o+1}"><label for="answer${q+1}-${o+1}">보기 ${o+1}</label>`).join('')).join('')+'<button class="btn_answer">정답 도전</button></div><div id="modalType2" hidden></div><script>document.querySelector(".btn_answer").onclick=async()=>{await fetch("/synthetic-quiz-submit",{method:"POST"});setTimeout(()=>{let m=document.querySelector("#modalType2");m.hidden=false;m.textContent="정답입니다. 500 포인트 적립";},700);};</script>';
const names=['개원·경영','마케팅','세무·법무','의료기기','금융','어벤져스 Pack','브랜드 스테이션'];
async function run(){
 await app.whenReady();
 for(const site of ['doctorville','keymedi']){
  await session.fromPartition(remotePreferences(site).partition).protocol.handle('https',async request=>{
   const url=new URL(request.url),headers={'content-type':'text/html; charset=utf-8'};
   if(url.hostname==='api.doctorville.co.kr'){
    quizReads++;return new Response(JSON.stringify({quizNm:'합성',point:500,applyCnt:0,attemptCount:0,questionList:[{answerNum:1},{answerNum:2},{answerNum:3}]}),{headers:{'content-type':'application/json','access-control-allow-origin':'https://www.doctorville.co.kr','access-control-allow-credentials':'true'}});
   }
   if(request.method==='POST'){
    const rows=Object.values(JSON.parse(readFileSync(join(root,'state.json'),'utf8')).jobs);
    if(url.pathname==='/synthetic-attendance-submit'){attendance++;sentAfterReservation=rows.some(r=>r.kind==='attendance'&&r.state==='attempting');}
    if(url.pathname==='/synthetic-quiz-submit'){quiz++;check('quiz dispatch is already durable in the native ledger',rows.some(r=>r.kind==='quiz'&&r.state==='attempting'));}
    return new Response('{}',{headers:{'content-type':'application/json'}});
   }
   let body='';
   if(url.pathname==='/event/attend')body='<main><h2>오늘 출석체크</h2><button class="btn point_down">오늘 출석하기</button></main><script>document.querySelector("button").onclick=async()=>{if(!confirm('+JSON.stringify(mode==='unknown-confirm'?'계정을 탈퇴하시겠습니까?':'출석하시겠습니까?')+'))return;await fetch("/synthetic-attendance-submit",{method:"POST"});document.querySelector("button").textContent="오늘 출석체크 완료";};</script>';
   if(url.pathname==='/product/main')body=`<main><div class="today_quiz"><span class="date">${date}</span><span class="name">합성 제품</span><a href="/product/productView?pId=123">퀴즈 풀기</a><a href="/product/productView?utm_source=desktop&amp;pId=123#quiz">제품 자세히</a>${mode==='quiz-complete'?'<strong class="quiz_complete">참여 완료</strong>':''}</div></main>`;
   if(url.pathname==='/product/productView')body=quizBody;
   if(url.pathname==='/seminar/synthetic')body=`<main><article><h2>합성 입장 강의</h2><p class="date">${date} 13:00</p><button>입장하기</button></article></main>`;
   if(url.pathname==='/brandhall')body='<main><h1>브랜드관</h1><p>브랜드 콘텐츠 목록</p></main>';
   if(url.pathname==='/drlounge')body='<main><a>미션 보기</a><section><h3>미션 보기</h3><div id="progress">0 / 7</div>'+names.map(name=>`<dl><dt>${name} 체험하기</dt><dd><button>포인트 받기</button></dd></dl>`).join('')+'</section></main><script>let n=0;for(const b of document.querySelectorAll("button"))b.onclick=()=>{b.disabled=true;b.textContent="성공";document.querySelector("#progress").textContent=++n+" / 7";};</script>';
   return new Response(fixture(body+'<a href="/logout">로그아웃</a>'),{headers});
  });
 }
 const pages=[],createPage=async(site,signal,options)=>{const p=new AutomationPage(site,signal,remotePreferences(site),options);pages.push(p);return p;};
 const quizRunner=new DoctorvilleQuizRunner({ledger,store});
 const daily=new DailyRunner({ledger,store,createPage,quiz:quizRunner});
 check('all submission features and overall execution start disabled',Object.values(store.features()).every(v=>!v)&&ledger.snapshot().paused);
 store.setFeature('dailyClaim',true);
 await daily.run(['doctorville:attendance'],{readOnly:true});
 check('original attendance engine finds an available claim without clicking in read-only mode',attendance===0&&Object.keys(ledger.snapshot().jobs).length===0&&store.day().daily['doctorville:attendance'].status==='pending');
 ledger.setPaused(false);await daily.run(['doctorville:attendance']);
 check('native worker handles only the scoped original confirmation and dispatches once',attendance===1&&sentAfterReservation);
 check('attendance completion requires the original visible provider receipt',store.day().daily['doctorville:attendance'].status==='complete');
 await daily.run(['doctorville:attendance']);check('completed attendance is not resubmitted',attendance===1);
 check('workers retain sandbox, isolation and no privileged website bridge',pages.every(p=>p.root.isDestroyed()));
 store.setFeature('quizAuto',true);await daily.run(['doctorville:quiz']);
 check('real quiz journey uses the observed product link and original read-only API',quizReads===2);
 check('quiz waits for the delayed provider success receipt',quiz===1&&store.day().quizAuto.status==='complete'&&store.day().quizAuto.reason==='success_receipt');
 await daily.run(['doctorville:quiz']);check('quiz never submits twice on repeated daily checks',quiz===1);
 mode='quiz-complete';const completedPage=await createPage('doctorville',new AbortController().signal);await completedPage.load('https://www.doctorville.co.kr/product/main');
 const [quizYear,quizMonth,quizDay]=date.split('-').map(Number);
 await completedPage.current.webContents.executeJavaScript('document.querySelector(".today_quiz").innerHTML=' + JSON.stringify('<span class="date">'+date+'</span><span class="name">합성 제품</span><table><caption>'+quizYear+'년 '+quizMonth+'월</caption><tbody><tr><td class="today pass"><span class="num">'+quizDay+'</span><i class="ico_comm3 ico_clear" style="display:inline-block;width:10px;height:10px"></i></td></tr></tbody></table>'));
 const already=await quizRunner.run(completedPage,date,{signal:completedPage.signal,allowed:()=>true});
 check('provider completion from another device skips product discovery and submission',already.status==='complete'&&already.reason==='already_participated'&&quiz===1);completedPage.close();mode='normal';
 const duplicatePage=await createPage('doctorville',new AbortController().signal);await duplicatePage.load('https://www.doctorville.co.kr/product/main');
 const request={phase:'today',date,expectedUrl:duplicatePage.url};
 check('original desktop reader reproduces the duplicate-link ambiguity',(await duplicatePage.call('doctorville-quiz-journey.js',[request])).reason==='product_link_ambiguous');
 const selected=await duplicatePage.call('doctorville-quiz-page.js',[request]);
 check('PC fallback collapses only equivalent observed product links',selected.status==='navigate'&&selected.url==='https://www.doctorville.co.kr/product/productView?pId=123');
 await duplicatePage.current.webContents.executeJavaScript('document.querySelectorAll(".today_quiz a")[1].href="/product/productView?pId=456"');
 check('distinct products remain ambiguous without a submit',(await duplicatePage.call('doctorville-quiz-page.js',[request])).status==='stopped'&&quiz===1);
 await duplicatePage.current.webContents.executeJavaScript('document.querySelector(".today_quiz .date").textContent="2000-01-01"');
 check('an old calendar cannot supply a fallback quiz target',(await duplicatePage.call('doctorville-quiz-page.js',[request])).status==='stopped');duplicatePage.close();
 const cardPage=await createPage('doctorville',new AbortController().signal);await cardPage.load('https://www.doctorville.co.kr/product/main');
 await cardPage.current.webContents.executeJavaScript('document.body.innerHTML='+JSON.stringify('<main><div class="today_quiz"><span class="date">'+date+'</span><span class="name">합성 제품</span></div><article><a href="/product/productView?pId=123"><span class="name">합성 제품</span></a><a href="/product/productView?pId=123#quiz"><span class="name">합성 제품</span></a></article></main>'));
 const cardRequest={phase:'today',date,expectedUrl:cardPage.url};
 check('original desktop lookup reproduces equivalent card-link ambiguity',(await cardPage.call('doctorville-quiz-journey.js',[cardRequest])).reason==='product_link_ambiguous');
 check('dated quiz name resolves equivalent desktop cards without inventing a URL',(await cardPage.call('doctorville-quiz-page.js',[cardRequest])).url==='https://www.doctorville.co.kr/product/productView?pId=123');
 await cardPage.current.webContents.executeJavaScript('document.querySelector("article").insertAdjacentHTML("afterend",'+JSON.stringify('<article><a href="/product/productView?pId=456"><h3 class="name">합성 제품</h3></a></article>')+')');
 check('two distinct products with the same name remain unsubmitted',(await cardPage.call('doctorville-quiz-page.js',[cardRequest])).status==='stopped');cardPage.close();
 check('diagnostics never contain fixture product, account, answers or raw URLs',!/https:|합성|questionList|answerNum|quizId/.test(JSON.stringify(store.diagnostics())));
 // Test the immutable lounge helper in a real document. The scheduler's durable
 // batch/clock boundaries are tested independently by automation.test.js.
 const signal=new AbortController(),lounge=await createPage('keymedi',signal.signal);await lounge.load('https://www.keymedi.com/drlounge');
 const outside=await lounge.root.webContents.executeJavaScript('({require:typeof require,bridge:typeof doctorGlean,process:typeof process,visibility:document.visibilityState})');
 check('hidden worker is script-visible while Node and control bridge remain absent',outside.require==='undefined'&&outside.bridge==='undefined'&&outside.process==='undefined'&&outside.visibility==='visible');
 const before=await lounge.call('keymedi-lounge.js',[{mode:'inspect'}]);check('immutable lounge identifies exactly seven eligible categories',before.status==='ready'&&before.eligibleMask===127);
 const dispatch=await lounge.call('keymedi-lounge.js',[{mode:'claim',mask:127,lease:'synthetic-native-run',opensAt:Date.now()-1000,closesAt:Date.now()+10000}]);
 check('seven original reward handlers run in one document',dispatch.sentMask===127&&(await lounge.call('keymedi-lounge.js',[{mode:'inspect'}])).current===7);
 check('same lounge document cannot submit those categories again',(await lounge.call('keymedi-lounge.js',[{mode:'claim',mask:127,lease:'synthetic-native-run',opensAt:Date.now()-1000,closesAt:Date.now()+10000}])).sentMask===0);
 await assert.rejects(lounge.load('https://outside.example.invalid/'));check('automation worker rejects an unrelated origin',true);lounge.close();
 const manual=new BrowserWindow({show:true,webPreferences:remotePreferences('doctorville')});await manual.loadURL('https://www.doctorville.co.kr/seminar/synthetic');
 const observed=[],job={key:'a'.repeat(64),site:'doctorville',date,time:'13:00',title:'합성 입장 강의',status:'reserved',due:1,deadline:8e15};
 const stop=watchManualEntry(manual,'doctorville',{jobs:()=>[job],onClick:key=>observed.push(key),interval:50});await sleep(150);
 await manual.webContents.executeJavaScript('document.querySelector("button").click();window.__doctorGleanManualObserver={clicks:["'+job.key+'"]};');await sleep(150);
 check('website script cannot forge a manual entry observation',observed.length===0);
 const rect=await manual.webContents.executeJavaScript('(()=>{const r=document.querySelector("button").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
 manual.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...rect});manual.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...rect});await sleep(200);
 check('trusted manual entry input is matched to the exact reserved lecture',observed.length===1&&observed[0]===job.key);stop();manual.destroy();
 // Unknown native confirmation is dismissed without a POST.
 mode='unknown-confirm';const otherLedger=new LocalState(join(root,'other-state.json'));otherLedger.setPaused(false);const otherStore=new WorkflowStore(join(root,'other-workflows.json'));otherStore.setFeature('dailyClaim',true);
 await new DailyRunner({ledger:otherLedger,store:otherStore,createPage}).run(['doctorville:attendance']);check('unrelated account confirmation is dismissed without submitting',attendance===1&&otherStore.day().daily['doctorville:attendance'].status==='unknown');
 check('all worker windows are released after tasks',BrowserWindow.getAllWindows().length===0);
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});writeFileSync(new URL('../verification/electron-automation.json',import.meta.url),JSON.stringify({environment:'Linux Electron 45 and synthetic HTTPS',windowsVerified:false,authenticatedProviderVerified:false,checks:checks.length,passed:checks},null,2)+'\n');
 console.log('ELECTRON_AUTOMATION_PASS:'+checks.length);app.quit();
}
run().catch(error=>{console.error('ELECTRON_AUTOMATION_FAIL:'+error.stack);for(const w of BrowserWindow.getAllWindows())w.destroy();app.exit(1);});
app.on('quit',()=>{try{rmSync(root,{recursive:true,force:true});}catch{}});
