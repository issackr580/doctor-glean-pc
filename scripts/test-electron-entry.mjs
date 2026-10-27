// Real Chromium DOM and the PC host boundary; synthetic providers only.
import {app,session,BrowserWindow} from 'electron';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {AutomationPage} from '../src/automation-page.js';
import {EntryRunner} from '../src/entry-runner.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {remotePreferences} from '../src/security.js';
import {kstDate} from '../src/schedule.js';
app.on('window-all-closed',()=>{});
const root=mkdtempSync(join(tmpdir(),'pc-entry-electron-'));app.setPath('userData',root);app.setPath('sessionData',join(root,'browser'));
const date=kstDate(),checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);},shell=body=>'<!doctype html><html><meta charset="utf-8"><body>'+body+'</body></html>';
const title='합성 입장 검증',key='a'.repeat(64),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(Date.now());
const job=site=>({key,site,date,time:clock,title,due:Date.now()-1000,deadline:Date.now()+600000,slot:0,hmpRepeatSchema:1,hmpSlot:0});
async function inspect(site,body,options={}){
 const partition='pc-entry-'+randomUUID(),prefs={...remotePreferences(site),partition};let posts=0;
 await session.fromPartition(partition).protocol.handle('https',request=>{
  if(request.method!=='GET'){posts++;return new Response('{}',{headers:{'content-type':'application/json'}});}
  return new Response(shell(body),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const controller=new AbortController(),page=new AutomationPage(site,controller.signal,prefs),urls={doctorville:'https://www.doctorville.co.kr/seminar/main',medigate:'https://new.medigate.net/symposium',keymedi:'https://www.keymedi.com/meditv/live',hmp:'https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm',intermd:'https://www.intermd.co.kr/webinar/list.do',bluepharm:'https://bluepharmkorea.co.kr/'};
 await page.load(urls[site]);
 try{if(options.work)return await options.work(page,()=>posts);return await page.call('pc-entry.js',[{...job(site),...options.job},options.mode??'preflight']);}
 finally{page.close();}
}
const doctor=(extra='',when=date,at=clock)=>`<a class="list_detail" href="/seminar/seminarDetail?seminarId=11"><strong class="tit">${title}</strong>${extra}<span>${when}</span><div class="time"><span class="start">${at}</span> ~ 23:59</div><button onclick="window.syntheticClicks=(window.syntheticClicks||0)+1">입장하기</button></a>`;
const medi=(id=11,extra='')=>`<article><h3>${title}</h3><p class="date">${date} ${clock} ~ 23:59</p><a href="/symposium/${id}${extra}">상세보기</a><button onclick="window.syntheticClicks=(window.syntheticClicks||0)+1">입장하기</button></article>`;
async function run(){
 await app.whenReady();
 const corrected=doctor('<span class="detail_date" hidden>2020-01-01</span>');
 await inspect('doctorville',corrected,{work:async page=>{
  const original=await page.call('auto-entry.js',[job('doctorville'),'inspect']);check('original Doctorville reader reproduces a title match with rejected hidden old date',original.titleMatches>0&&original.scheduleMatches===0);
  const result=await page.call('pc-entry.js',[job('doctorville'),'inspect']);check('PC Doctorville reader binds the rendered date and start time in the same card',result.status==='ready'&&result.targetMatched&&result.dateMatches===1);
  const before=await page.current.webContents.executeJavaScript('window.syntheticClicks||0');check('inspection never executes the provider button',before===0);
 }});
 for(const [name,body] of [['different date',doctor('', '2020-01-01')],['end time only',doctor('',date,'00:00')],['duplicate cards',doctor()+doctor()],['login form',doctor()+'<input type="password">']]){
  const result=await inspect('doctorville',body);check('Doctorville rejects '+name,result.status!=='ready');
 }
 const live=await inspect('medigate',medi(11)+medi(11,'?utm_source=hero#top'));
 check('Medigate equivalent visible cards merge only by one observed lecture identity',live.status==='ready'&&live.duplicateEquivalent&&live.matchedTargets===1);
 for(const [name,body] of [['different lecture IDs',medi(11)+medi(12)],['unknown query difference',medi(11,'?sessionType=a')+medi(11,'?sessionType=b')],['registration disagreement',medi(11)+medi(11).replace('입장하기','신청하기')]]){
  const result=await inspect('medigate',body);check('Medigate preserves ambiguity for '+name,result.status!=='ready');
 }
 const keyCard=`<div data-gtm-event-name="content_click" data-gtm-content-category="메디 TV_메디TV Live" data-gtm-content-title="${title}"><h3>${title}</h3><p class="date">${date} ${clock} ~ 23:59</p><button>신청하기</button></div>`;
 check('Keymedi unregistered card remains unsubmitted',(await inspect('keymedi',keyCard)).status==='not_registered');
 check('Keymedi matched detail without an entry control stays unconfirmed',(await inspect('keymedi',`<section><h2>${title}</h2><p class="date">${date} ${clock}</p><span>신청완료</span></section>`)).status==='button_missing');
 for(const [site,body] of [
  ['hmp',`<div class="area"><div class="subject">${title}</div><div class="date">${date}</div><div class="time">${clock} ~ 23:59</div><button onclick="fetch('/synthetic-entry',{method:'POST'})">강의시청</button></div>`],
  ['intermd',`<section class="webinarItem--live"><h3>${title}</h3><p class="webinarItem__date">${date} ${clock} ~ 23:59</p><button onclick="fetch('/synthetic-entry',{method:'POST'})">입장하기</button></section>`],
  ['bluepharm',`<article><div class="sem_info"><h3>${title}</h3><p class="date">${date} ${clock} ~ 23:59</p><span class="W_status ongoing">강의중</span></div><div class="sem_action"><button onclick="fetch('/synthetic-entry',{method:'POST'})">참여하기</button></div></article>`],
 ])await inspect(site,body,{work:async(page,posts)=>{const result=await page.call('pc-entry.js',[job(site),'preflight']);check(site+' preflight finds its own exact target with zero provider submissions',result.status==='ready'&&posts()===0);}});
 check('Bluepharm participation needs its explicit ongoing status',(await inspect('bluepharm',`<div class="sem_info"><h3>${title}</h3><p class="date">${date} ${clock}</p><button>참여하기</button></div>`)).status!=='ready');
 await inspect('doctorville',doctor(),{work:async page=>{
  const future={...job('doctorville'),due:Date.now()+300000,deadline:Date.now()+900000};
  const read=await page.call('pc-entry.js',[future,'preflight']);const blocked=await page.call('pc-entry.js',[future,'click'],{navigation:true});
  check('future preflight can read eligibility while actual clicking remains outside its window',read.status==='ready'&&blocked.status==='not_open'&&(await page.current.webContents.executeJavaScript('window.syntheticClicks||0'))===0);
  await assert.rejects(page.call('pc-entry.js',[job('medigate'),'click'],{navigation:true}));check('PC entry alias refuses a cross-site job',true);
  const power=await page.current.webContents.executeJavaScript('({node:typeof require,bridge:typeof doctorGlean})');check('entry inspection retains the no-Node and no-control-bridge boundary',power.node==='undefined'&&power.bridge==='undefined');
 }});
 // Full host fallback: the original reader fails, the PC supplement finds one
 // exact target, and the original provider handler runs after durable dispatch.
 const directory=join(root,'host'),partition='entry-host-'+randomUUID(),prefs={...remotePreferences('doctorville'),partition};let posts=0,reservedBeforePost=false;
 const ledger=new LocalState(join(directory,'state.json'));ledger.setPaused(false);const store=new WorkflowStore(join(directory,'workflows.json'));store.setFeature('entry',true);
 await session.fromPartition(partition).protocol.handle('https',request=>{
  if(request.method==='POST'){
   posts++;reservedBeforePost=Object.values(JSON.parse(readFileSync(join(directory,'state.json'))).jobs).some(row=>row.state==='attempting');return new Response('{}',{headers:{'content-type':'application/json'}});
  }
  return new Response(shell(corrected.replace('window.syntheticClicks=(window.syntheticClicks||0)+1',"fetch('/synthetic-entry',{method:'POST'})")),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const runner=new EntryRunner({ledger,store,createPage:async(_site,signal)=>new AutomationPage('doctorville',signal,prefs)});
 const entry={...job('doctorville'),start:Date.now(),status:'reserved',nextAt:Date.now()-1,retries:0,attempts:[],entryAttempted:false};store.putEntry(entry);
 await runner.run(entry);const receipt=store.entries()[0];check('real PC fallback calls the provider once after durable dispatch',posts===1&&reservedBeforePost&&receipt.status==='clicked');
 check('a clicked PC fallback cannot be automatically re-reserved',runner.retryJob(key)===false&&posts===1);
 check('entry report does not turn navigation alone into confirmed playback or site credit',receipt.receipt.playback!=='playing_observed'&&!Object.values(ledger.snapshot().jobs).some(row=>row.state==='confirmed'));
 check('all inspection and entry windows are released',BrowserWindow.getAllWindows().length===0);
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});writeFileSync(new URL('../verification/electron-entry.json',import.meta.url),JSON.stringify({environment:'Linux Electron45; synthetic HTTPS; PC exact entry and read-only preflight',checks:checks.length,passed:checks,actualProviderVerified:false,windowsVerified:false},null,2)+'\n');
 console.log('ELECTRON_ENTRY_PASS:'+checks.length);app.quit();
}
run().catch(error=>{console.error('ELECTRON_ENTRY_FAIL:'+error.stack);for(const window of BrowserWindow.getAllWindows())window.destroy();app.exit(1);});
app.on('quit',()=>{try{rmSync(root,{recursive:true,force:true});}catch{}});
