// Real Chromium, synthetic HTTPS, no real enrollment or account data.
import {app,BrowserWindow,session} from 'electron';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {pcEntryPage} from '../src/entry-page.js';
import {RegistrationController,RegistrationStore} from '../src/registration.js';
import {AutomationPage} from '../src/automation-page.js';
import {remotePreferences} from '../src/security.js';
import {kstDate} from '../src/schedule.js';
const root=mkdtempSync(join(tmpdir(),'pc-registration-native-'));app.setPath('userData',root);app.on('window-all-closed',()=>{});
const checks=[],check=(label,value)=>{assert.ok(value,label);checks.push(label);},date=kstDate(),title='Synthetic registration target',clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(Date.now());
const urls={doctorville:'https://www.doctorville.co.kr/seminar/main',medigate:'https://new.medigate.net/symposium',keymedi:'https://www.keymedi.com/meditv/live',hmp:'https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm',intermd:'https://www.intermd.co.kr/webinar/list.do',bluepharm:'https://bluepharmkorea.co.kr/'};
const card=(site,control,when=date,heading=title)=>site==='doctorville'?`<a class="list_detail" href="/seminar/seminarDetail?seminarId=17"><strong class="tit">${heading}</strong><span>${when}</span><div class="time"><span class="start">${clock}</span> ~ 23:59</div>${control}</a>`:site==='hmp'?`<div class="area"><div class="top"><span class="date">${when}</span><span class="time">${clock}</span></div><div class="subject"><strong>${heading}</strong></div>${control}</div>`:site==='keymedi'?`<div data-gtm-event-name="content_click" data-gtm-content-category="메디 TV_메디TV Live" data-gtm-content-title="${heading}"><p>${when} ${clock} ~ 23:59</p>${control}</div>`:site==='bluepharm'?`<div class="sem_info"><h3 class="sem_tit">${heading}</h3><ul class="sem_detail"><li>일시: ${when} ${clock} ~ 23:59</li></ul>${control}</div>`:site==='intermd'?`<div class="webinarItem--live"><h3>${heading}</h3><p class="webinarItem__date">${when} ${clock} ~ 23:59</p>${control}</div>`:`<article><h3>${heading}</h3><p class="date">${when} ${clock} ~ 23:59</p>${control}</article>`;
const apply='<button onclick="event.preventDefault();event.stopPropagation();window.syntheticClicks=(window.syntheticClicks||0)+1">신청하기</button>';
async function run(){let window;try{
 await app.whenReady();
 const cases=[...Object.keys(urls).map(site=>({id:site,site,body:card(site,apply),status:'registration_ready'})),
  {id:'duplicate',body:card('medigate',apply)+card('medigate',apply),status:'ambiguous'},
  {id:'two_buttons',body:card('medigate',apply+apply),status:'ambiguous'},
  {id:'hidden_copy',body:card('medigate',apply)+'<div hidden>'+card('medigate',apply)+'</div>',status:'registration_ready'},
  {id:'wrong_title',body:card('medigate',apply,date,'Other synthetic target'),status:'target_missing'},
  {id:'wrong_date',body:card('medigate',apply,'2025-01-01'),status:'target_missing'},
  {id:'closed',body:card('medigate','<span>신청마감</span>'),status:'lecture_ended'},
  {id:'disabled',body:card('medigate','<button disabled>신청하기</button>'),status:'not_open'},
  {id:'login',body:'<input type="password">'+card('medigate',apply),status:'login'},
  {id:'registered',body:card('medigate','<span>신청완료</span>'),status:'registered'},
  {id:'conflict',body:card('medigate','<span>신청완료</span>'+apply),status:'ambiguous'},
  {id:'foreign_link',body:card('medigate','<a href="https://foreign.invalid/apply">신청하기</a>'),status:'blocked'},
  {id:'payment',body:card('medigate','<a href="/payment/order">신청하기</a>'),status:'blocked'},
  {id:'fee',body:card('medigate','<p>수강료 10,000원</p>'+apply),status:'blocked'},
  {id:'personal_form',body:card('medigate','<form><input name="name"><button>신청하기</button></form>'),status:'blocked'},
  {id:'consent',body:card('medigate','<input type="checkbox" required>'+apply),status:'blocked'},
  {id:'two_actions',body:card('medigate',apply+'<button>입장하기</button>'),status:'blocked'},
 ];
 for(const width of [360,1240])for(const c of cases){
  const site=c.site??'medigate',profile=session.fromPartition('registration-'+randomUUID());profile.protocol.handle('https',()=>new Response('<!doctype html><meta charset="utf-8">'+c.body,{headers:{'content-type':'text/html; charset=utf-8'}}));
  window=new BrowserWindow({show:false,width,height:1000,webPreferences:{...remotePreferences(site),session:profile}});await window.loadURL(urls[site]);
  const job={site,key:'a'.repeat(64),date,time:clock,title,due:Date.now()-1000,deadline:Date.now()+60000,slot:0},call=mode=>window.webContents.executeJavaScriptInIsolatedWorld(1002,[{code:`(${pcEntryPage.toString()})(${JSON.stringify(job)},${JSON.stringify('registration-'+mode)})`}]);
  const inspected=await call('inspect');check(width+' '+c.id+' inspect '+JSON.stringify(inspected),inspected.status===c.status);
  check(width+' '+c.id+' inspect has no action',await window.webContents.executeJavaScript('(window.syntheticClicks||0)===0'));
  const result=await call('click');check(width+' '+c.id+' original action is gated',c.status==='registration_ready'?result.status==='registration_clicked'&&await window.webContents.executeJavaScript('window.syntheticClicks===1'):result.status!=='registration_clicked'&&await window.webContents.executeJavaScript('(window.syntheticClicks||0)===0'));
  if(c.status==='registration_ready')check(width+' '+c.id+' repeated app request is one-shot',(await call('click')).status==='already_attempted'&&await window.webContents.executeJavaScript('window.syntheticClicks===1'));
  check(width+' '+c.id+' remote has no bridge',await window.webContents.executeJavaScript('typeof require==="undefined"&&typeof doctorGlean==="undefined"'));window.destroy();window=null;
 }
 // Execute the real controller and provider POST with durable state checked
 // inside the synthetic server; a second request uses a read-only page.
 const site='medigate',profile=session.fromPartition('registration-controller-'+randomUUID()),store=new RegistrationStore(join(root,'attempts.json'));let posts=0,durable=false,registered=false;
 const target={site,date,time:clock,title,key:'b'.repeat(64)};
 profile.protocol.handle('https',request=>{if(request.method==='POST'){posts++;durable=store.status(target)?.attempted===true;registered=true;return new Response('{}');}return new Response('<!doctype html><meta charset="utf-8">'+card(site,registered?'<span>신청완료</span>':`<button onclick="fetch('/synthetic-registration',{method:'POST'}).then(()=>this.outerHTML='<span>신청완료</span>')">신청하기</button>`),{headers:{'content-type':'text/html; charset=utf-8'}});});
 const controller=new RegistrationController({store,resolve:()=>target,createPage:async(job,signal)=>{
  window=new BrowserWindow({show:false,webPreferences:{...remotePreferences(site),session:profile}});let version=0;window.webContents.on('did-start-navigation',()=>version++);const w=window;
  return {get url(){return w.webContents.getURL();},get version(){return version;},load:url=>w.loadURL(url),call:async(j,mode,binding)=>{if(mode==='click')assert.equal(binding.version,version);return w.webContents.executeJavaScriptInIsolatedWorld(1002,[{code:`(${pcEntryPage.toString()})(${JSON.stringify(j)},${JSON.stringify('registration-'+mode)})`}]);},close(){w.destroy();}};
 },createInspectionPage:async(job,signal)=>{
  const page=new AutomationPage(site,signal,{...remotePreferences(site),session:profile});return {get url(){return page.url;},get version(){return page.version;},load:url=>page.load(url),ready:()=>page.ready(),call:(j,mode)=>page.call('pc-registration.js',[j,mode]),close:()=>page.close()};
 }});
 const first=await controller.request('entry',target.key);check('native controller calls one original POST after durable reserve',first.ok&&posts===1&&durable);
 const second=await controller.request('catalog',target.key);check('native confirmed recheck has zero repeated POSTs',second.status==='confirmed'&&posts===1&&store.status(target).state==='confirmed');
 window.destroy();window=null;
 const deniedPage=new AutomationPage(site,new AbortController().signal,{...remotePreferences(site),session:profile});await deniedPage.load(urls[site]);
 await assert.rejects(deniedPage.call('pc-registration.js',[registrationTargetForTest(target),'click'],{navigation:true}));check('automatic page registration helper is inspect-only',posts===1);deniedPage.close();
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});writeFileSync(new URL('../verification/electron-registration.json',import.meta.url),JSON.stringify({runtime:{platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome},environment:'synthetic HTTPS registration',checks:checks.length,scenarios:cases.length*2+2,passed:checks,windowsVerified:false,actualProviderVerified:false},null,2)+'\n');console.log('ELECTRON_REGISTRATION_PASS:'+checks.length);app.quit();
 }catch(error){console.error(error);window?.destroy();app.exit(1);}finally{rmSync(root,{recursive:true,force:true});}}
const registrationTargetForTest=target=>({...target,due:Date.now()-1000,deadline:Date.now()+60000,slot:0});
run().catch(error=>{console.error(error);app.exit(1);});
