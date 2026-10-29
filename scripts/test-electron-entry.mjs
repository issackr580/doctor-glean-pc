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
import {CatalogPage} from '../src/catalog-page.js';
import {initialSettings} from '../vendor/engine/core.js';
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
 await page.load(options.url??urls[site]);
 try{if(options.work)return await options.work(page,()=>posts);return await page.call('pc-entry.js',[{...job(site),...options.job},options.mode??'preflight']);}
 finally{page.close();}
}
const doctor=(extra='',when=date,at=clock)=>`<a class="list_detail" href="/seminar/seminarDetail?seminarId=11"><strong class="tit">${title}</strong>${extra}<span>${when}</span><div class="time"><span class="start">${at}</span> ~ 23:59</div><button onclick="window.syntheticClicks=(window.syntheticClicks||0)+1">입장하기</button></a>`;
const medi=(id=11,extra='')=>`<article><h3>${title}</h3><p class="date">${date} ${clock} ~ 23:59</p><a href="/symposium/${id}${extra}">상세보기</a><button onclick="window.syntheticClicks=(window.syntheticClicks||0)+1">입장하기</button></article>`;
async function catalog(page,site){
 const reader=new CatalogPage(initialSettings().profiles[site],{snapshot:()=>({url:page.url,version:page.version,loading:false}),load:url=>page.load(url),evaluate:script=>page.current.webContents.executeJavaScript(script,false),close(){}},page.signal);
 let previous,result;
 for(let i=0;i<18;i++){
  result=await reader.read(date,previous);previous=result.state;
  if(result.done)return result;
  if(result.action)await reader.act(result.action,previous);
  await new Promise(resolve=>setTimeout(resolve,600));
 }return result;
}
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
 const bareDoctor=`<a class="list_detail" href="/seminar/seminarDetail?seminarId=11"><strong class="tit">${title}</strong>${date.replaceAll('-','.')}<div class="time"><span class="start">${clock}</span> ~ 23:59</div><button>입장하기</button></a>`;
 await inspect('doctorville',bareDoctor,{work:async(page,posts)=>{
  const c=await catalog(page,'doctorville'),r=await page.call('pc-entry.js',[job('doctorville'),'preflight']);
  check('Doctorville collector and entry reader both bind bare date text beside inline elements',c.events.some(e=>e.title===title&&e.time===clock)&&r.status==='ready'&&posts()===0);
 }});
 const datedTitle=title+' '+date,headingOnly=bareDoctor.replace(`<strong class="tit">${title}</strong>${date.replaceAll('-','.')}`,`<h3>${datedTitle}</h3>`);
 check('Doctorville never borrows its date from an alternate title heading',(await inspect('doctorville',headingOnly,{job:{title:datedTitle}})).status!=='ready');
 check('Doctorville dedicated start also accepts a hyphenated month/day',(await inspect('doctorville',bareDoctor.replace(date.replaceAll('-','.'),date.slice(5)))).status==='ready');
 for(const [name,body] of [
  ['conflicting visible dates',bareDoctor.replace('<div class="time">','<span>2020-01-01</span><div class="time">')],
  ['missing start',bareDoctor.replace(clock,'00:00')],
  ['duplicate starts',bareDoctor.replace('</div><button>',`<span class="start">${clock}</span></div><button>`)],
 ])check('Doctorville dedicated schedule rejects '+name,(await inspect('doctorville',body)).status!=='ready');
 // Only the content relationship comes from a reported PC list layout.
 // These synthetic classes/handlers are not a copy of authenticated HTML.
 const listWeekday='일월화수목금토'[new Date(date+'T00:00:00Z').getUTCDay()];
 const listDate=`${date.slice(5).replace('-','/')} ${listWeekday}요일`;
 const listCard=(heading=title,id=31)=>`<a class="list_detail" href="/seminar/seminarDetail?seminarId=${id}"><div class="time"><span class="start">${clock}</span><span>~23:59</span></div><div><strong class="tit">${heading}</strong><span>신청완료</span><button onclick="fetch('/synthetic-entry',{method:'POST'})">입장하기</button></div></a>`;
 const dayGroup=(label=listDate,content=listCard())=>`<section><div>${label}</div><div>${content}</div></section>`;
 const sharedList=dayGroup(undefined,listCard('다른 합성 강의',30)+listCard()+listCard('별도 합성 강의',32));
 await inspect('doctorville',sharedList,{work:async(page,posts)=>{
  const c=await catalog(page,'doctorville'),r=await page.call('pc-entry.js',[job('doctorville'),'preflight']);
  check('Doctorville collector recognizes the synthetic shared-date list before entry inspection',c.events.some(e=>e.title===title&&e.time===clock));
  check('Doctorville shared list date binds the same lecture in preflight without submitting',r.status==='ready'&&r.sharedDateCards===1&&posts()===0);
  check('Doctorville shared-date registration inspection remains read-only',(await page.call('pc-registration.js',[job('doctorville'),'inspect'])).status==='registered'&&posts()===0);
  await page.current.webContents.executeJavaScript("document.querySelector('section>div').textContent='2020-01-01'");
  check('Doctorville rechecks a changed group date immediately before its original entry handler',(await page.call('pc-entry.js',[job('doctorville'),'click'],{navigation:true})).status!=='clicked'&&posts()===0);
 }});
 const listRows=(first=listDate,gap='')=>`<ul><li><div>${first}</div><div>${listCard('다른 합성 강의',30)}</div></li>${gap}<li><div style="min-height:1px"></div><div>${listCard()}</div></li></ul>`;
 check('Doctorville contiguous two-column rows can share their visible date',(await inspect('doctorville',listRows())).status==='ready');
 for(const [name,body] of [
  ['wrong group date',dayGroup('2020-01-01')],
  ['wrong group weekday',dayGroup(date+'('+('일월화수목금토일'[new Date(date+'T00:00:00Z').getUTCDay()+1])+')')],
  ['hidden group date',dayGroup(`<span hidden>${listDate}</span>`)],
  ['unrelated global heading',`<h2>${listDate}</h2><main>${listCard()}</main>`],
  ['separate section date',dayGroup(undefined,listCard('다른 합성 강의',30))+`<section>${listCard()}</section>`],
  ['hidden intervening row',listRows(undefined,'<li hidden>다른 날짜 영역</li>')],
  ['unrelated intervening row',listRows(undefined,'<li>다른 목록 영역</li>')],
  ['conflicting own date',dayGroup(undefined,listCard().replace('<div class="time">','<span>2020-01-01</span><div class="time">'))],
  ['duplicate matching cards',dayGroup(undefined,listCard()+listCard())],
 ])await inspect('doctorville',body,{work:async(page,posts)=>{
  const r=await page.call('pc-entry.js',[job('doctorville'),'preflight']);
  check('Doctorville shared list date rejects '+name,r.status!=='ready'&&posts()===0);
 }});
 const anotherDate=dayGroup('2020-01-01',listCard(title,29));
 check('Doctorville same-title lectures on different days resolve only inside the matching date group',(await inspect('doctorville',anotherDate+sharedList)).status==='ready');
 for(const [name,body,field] of [
  ['missing date',listCard(),'dateMissingCards'],
  ['different date',dayGroup('2020-01-01'),'dateMismatchCards'],
  ['conflicting dates',dayGroup(undefined,listCard().replace('<div class="time">','<span>2020-01-01</span><div class="time">')),'dateConflictCards'],
  ['invalid date',dayGroup('2020-02-30'),'dateInvalidCards'],
  ['missing start',dayGroup(undefined,listCard().replace('class="start"','class="other"')),'startInvalidCards'],
  ['different start',dayGroup(undefined,listCard().replace(`<span class="start">${clock}</span>`,`<span class="start">${clock==='00:00'?'00:01':'00:00'}</span>`)),'startMismatchCards'],
 ])check('Doctorville diagnostics distinguish '+name+' without retaining raw text',(await inspect('doctorville',body))[field]===1);
 // Screenshot-observed content relationships, with synthetic titles and no
 // claim about the authenticated site's CSS classes or private handlers.
 const detailUrl='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=17',detailWeekday='일월화수목금토'[new Date(date+'T00:00:00Z').getUTCDay()];
 const detailHeader=(action='<button>입장하기</button>',schedule=date+'('+detailWeekday+') '+clock+' ~ 23:59',heading=title,extra='')=>`<main><section><figure>합성 이미지</figure><div><strong>${heading}</strong><div>${schedule}</div><p>합성 강연자</p><span>100 / 200명</span>${extra}${action}</div></section><section><h3>세미나 소개</h3><p>자료 안내 2020-01-01</p></section></main>`;
 await inspect('doctorville',detailHeader(),{url:detailUrl,work:async(page,posts)=>{
  const r=await page.call('pc-entry.js',[job('doctorville'),'preflight']);check('Doctorville detail binds a plain strong title and one complete header schedule without CSS guesses',r.status==='ready'&&r.targetMatched&&r.dateMatches===1&&r.timeMatches===1&&posts()===0);
 }});
 await inspect('doctorville',detailHeader('<span>종료된 세미나입니다.</span>'),{url:detailUrl,work:async(page,posts)=>{check('Doctorville exact ended-seminar notice stops entry with no provider action',(await page.call('pc-entry.js',[job('doctorville'),'inspect'])).status==='lecture_ended'&&posts()===0);}});
 await inspect('doctorville',detailHeader('<button>신청취소</button>'),{url:detailUrl,work:async(page,posts)=>{
  check('Doctorville cancellation action proves an existing application without invoking it',(await page.call('pc-registration.js',[job('doctorville'),'inspect'])).status==='registered'&&posts()===0);
  check('Doctorville existing application without an entry button remains waiting',(await page.call('pc-entry.js',[{...job('doctorville'),due:Date.now()+60000},'preflight'])).status==='not_open'&&posts()===0);
 }});
 await inspect('doctorville',detailHeader('<span>미리보기 VOD</span><button>신청취소</button>'),{url:detailUrl,work:async(page,posts)=>{check('Doctorville preview VOD badge does not turn an existing application into an ended lecture',(await page.call('pc-registration.js',[job('doctorville'),'inspect'])).status==='registered'&&posts()===0);}});
 check('Doctorville date and start in a later description cannot repair a header with no schedule',(await inspect('doctorville',detailHeader(undefined,'').replace('<p>자료 안내 2020-01-01</p>',`<p>${date}(${detailWeekday}) ${clock} ~ 23:59</p>`),{url:detailUrl})).status!=='ready');
 check('Doctorville header schedule can be a direct text run between title and action',(await inspect('doctorville',detailHeader().replace(`<div>${date}(${detailWeekday}) ${clock} ~ 23:59</div>`,`${date}(${detailWeekday}) ${clock} ~ 23:59`),{url:detailUrl})).status==='ready');
 check('Doctorville complete range owns nested start and end spans',(await inspect('doctorville',detailHeader(undefined,`<span>${date}(${detailWeekday})</span> <span>${clock}</span> ~ <span>23:59</span>`),{url:detailUrl})).status==='ready');
 check('Doctorville header semantics do not depend on a presentation class',(await inspect('doctorville',detailHeader().replace('<section>','<header>').replace('</section>','</header>'),{url:detailUrl})).status==='ready');
 check('Doctorville detail accepts its already allowed canonical host alias',(await inspect('doctorville',detailHeader(),{url:detailUrl.replace('www.doctorville','doctorville')})).status==='ready');
 for(const [name,body,input] of [
  ['wrong date',detailHeader(undefined,'2020-01-01 '+clock+' ~ 23:59'),{}],
  ['end clock instead of start',detailHeader(undefined,date+'('+detailWeekday+') 00:00 ~ '+clock),{}],
  ['title-only date',detailHeader(undefined,clock+' ~ 23:59',title+' '+date),{title:title+' '+date}],
  ['conflicting visible header date',detailHeader(undefined,undefined,undefined,'<span>2020-01-01</span>'),{}],
  ['duplicate detail headers',detailHeader()+detailHeader(),{}],
  ['unreviewed detail query',detailHeader(),{}],
 ])check('Doctorville detail rejects '+name,(await inspect('doctorville',body,{url:detailUrl+(name==='unreviewed detail query'?'&token=SYNTHETIC':''),job:input})).status!=='ready');
 const live=await inspect('medigate',medi(11)+medi(11,'?utm_source=hero#top'));
 check('Medigate equivalent visible cards merge only by one observed lecture identity',live.status==='ready'&&live.duplicateEquivalent&&live.matchedTargets===1);
 const registered=medi().replace('</h3>','</h3><span>신청완료</span>'),hero=registered.replace(/<button[\s\S]*?<\/button>/,'');
 check('Medigate same registered hero without an action defers to the single actionable card',(await inspect('medigate',hero+registered)).status==='ready');
 const unknown=(await inspect('medigate',hero.replace('/symposium/11','/symposium/12')+registered));
 check('Medigate different identities remain ambiguous with safe diagnostic counts',unknown.status==='ambiguous'&&unknown.identifiedTargets===2&&unknown.distinctIdentities===2&&unknown.entryControls===1);
 check('Medigate ended hero cannot supply eligibility to a live card',(await inspect('medigate',hero.replace('신청완료','강의종료')+registered)).status==='ambiguous');
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
 const weekday='일월화수목금토'[new Date(date+'T00:00:00Z').getUTCDay()],wrongWeekday='일월화수목금토'[new Date(date+'T00:00:00Z').getUTCDay()===0?1:0];
 const grouped=(label=date+'('+weekday+')',gap='',extra='')=>`<main><div class="rows"><div class="area"><div>${label}</div><div><div class="subject">다른 합성 강의</div><div class="top"><span class="time">${clock} ~ 23:59</span></div></div></div>${gap}<div class="area"><div><div class="subject">${title}</div><div class="top"><span class="time">${clock} ~ 23:59</span></div>${extra}<button onclick="fetch('/synthetic-entry',{method:'POST'})">강의시청</button></div></div></div></main>`;
 await inspect('hmp',grouped(),{work:async(page,posts)=>{const r=await page.call('pc-entry.js',[job('hmp'),'preflight']);check('Hanmi preflight binds the collector-style adjacent date group with no submit',r.status==='ready'&&r.targetMatched&&posts()===0);}});
 await inspect('hmp',grouped(),{work:async(page,posts)=>{const r=await page.call('pc-entry.js',[{...job('hmp'),hmpSlot:5},'click'],{navigation:true});check('Hanmi supplemental click refuses an invalid repetition slot',r.status==='blocked'&&posts()===0);}});
 for(const [name,body] of [['wrong weekday',grouped(date+'('+wrongWeekday+')')],['hidden gap',grouped(undefined,'<div hidden>다른 날짜 영역</div>')],['conflicting row date',grouped(undefined,'','<span class="date">2020-01-01</span>')]])check('Hanmi date group rejects '+name,(await inspect('hmp',body)).status!=='ready');
 const plainGrouped=grouped().replaceAll(`<div class="top"><span class="time">${clock} ~ 23:59</span></div>`,'').replaceAll('<div class="subject">',`<span>${clock} ~ 23:59</span><div class="subject">`),parity={};
 await inspect('hmp',plainGrouped,{work:async(page,posts)=>{
  const c=await catalog(page,'hmp'),r=await page.call('pc-entry.js',[job('hmp'),'preflight']);parity.hmpCatalog=c.events.some(e=>e.title===title&&e.time===clock);parity.hmpEntry=r.status==='ready'&&posts()===0;
 }});
 const mixedBlue=`<article><h3 class="sem_tit">${title}</h3><div class="sem_detail"><p>일시 <span>${date} ${clock} ~ 23:59</span></p><p>연자 합성 강연자</p><p>포인트 제공</p></div><span class="W_status ongoing">진행 중</span><button>참여하기</button></article>`;
 await inspect('bluepharm',mixedBlue,{work:async(page,posts)=>{
  const read=readFileSync(new URL('../vendor/engine/collect-additional.js',import.meta.url),'utf8'),profile={...initialSettings().profiles.bluepharm,rowSelector:'article',titleSelector:'.sem_tit',validated:true,allowNoPagination:true};
  const c=await page.current.webContents.executeJavaScript(`(${read})(${JSON.stringify(profile)},${JSON.stringify(date)})`),r=await page.call('pc-entry.js',[job('bluepharm'),'preflight']);parity.blueCatalog=c.events.some(e=>e.title===title&&e.time===clock);parity.blueEntry=r.status==='ready'&&posts()===0;
 }});
 console.log('COLLECTOR_ENTRY_PARITY:'+JSON.stringify(parity));
 check('Hanmi classless clocks are accepted by both the original collector and PC entry reader',parity.hmpCatalog&&parity.hmpEntry);
 check('Bluepharm labelled schedule stays separate from speaker metadata in both readers',parity.blueCatalog&&parity.blueEntry);
 for(const [name,body] of [
  ['two preceding clocks',plainGrouped.replace(`<span>${clock} ~ 23:59</span><div class="subject">${title}`,`<span>${clock} ~ 23:59</span><span>00:00</span><div class="subject">${title}`)],
  ['clock after the title',plainGrouped.replace(`<span>${clock} ~ 23:59</span><div class="subject">${title}</div>`,`<div class="subject">${title}</div><span>${clock} ~ 23:59</span>`)],
  ['wrong weekday',plainGrouped.replace(date+'('+weekday+')',date+'('+wrongWeekday+')')],
  ['classless conflicting date',plainGrouped.replace(`<div class="subject">${title}`,`<span>2020-01-01</span><div class="subject">${title}`)],
  ['replay region',`<section class="replay"><h2>VOD</h2>${plainGrouped}</section>`],
 ])check('Hanmi classless group rejects '+name,(await inspect('hmp',body)).status!=='ready');
 check('two labelled Bluepharm schedules do not merge merely because their starts agree',(await inspect('bluepharm',mixedBlue.replace('<p>연자 합성 강연자</p>',`<p>일시 ${date} ${clock} ~ ${date} ${clock}</p>`))).status!=='ready');
 const tomorrow=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10),blue=value=>`<article><h3>${title}</h3><div class="sem_detail">일시 <span>${value}</span></div><span class="W_status ongoing">강의중</span><button onclick="fetch('/synthetic-entry',{method:'POST'})">참여하기</button></article>`;
 await inspect('bluepharm',blue(`${date} ${clock} ~ ${tomorrow} 23:59`),{work:async(page,posts)=>{const r=await page.call('pc-entry.js',[job('bluepharm'),'preflight']);check('Bluepharm continuous range uses its exact start date and time without submitting',r.status==='ready'&&r.targetMatched&&posts()===0);}});
 for(const [name,value] of [['backwards end',`${date} ${clock} ~ 2020-01-01 23:59`],['separate schedules',`${date} ${clock} / ${tomorrow} 23:59`],['missing start time',`${date} ~ ${tomorrow} ${clock}`]])check('Bluepharm range rejects '+name,(await inspect('bluepharm',blue(value))).status!=='ready');
 await inspect('doctorville',`<main id="lazy-catalog"></main><script>setTimeout(()=>document.getElementById('lazy-catalog').innerHTML=${JSON.stringify(doctor())},900)</script>`,{work:async(page,posts)=>{
  const directory=join(root,'lazy-preflight'),ledger=new LocalState(join(directory,'state.json')),store=new WorkflowStore(join(directory,'workflows.json'));
  const entry={...job('doctorville'),start:Date.now(),status:'reserved',nextAt:Date.now()-1,retries:0,attempts:[],entryAttempted:false};store.putEntry(entry);let normal=0;
  const runner=new EntryRunner({ledger,store,createPage:async()=>{normal++;throw Error('credential recovery forbidden');},createInspectionPage:async()=>page});
  await runner.preflight(key);const saved=store.entries()[0];check('native preflight waits for delayed real DOM and stable eligibility with zero submits',saved.preflight.status==='complete'&&saved.preflight.reads>=4&&saved.status==='reserved'&&normal===0&&posts()===0&&Object.keys(ledger.snapshot().jobs).length===0);
 }});
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
 await inspect('doctorville',sharedList,{work:async(page,submissions)=>{
  const folder=join(root,'shared-list-host'),ledger=new LocalState(join(folder,'state.json')),store=new WorkflowStore(join(folder,'workflows.json'));ledger.setPaused(false);store.setFeature('entry',true);
  const entry={...job('doctorville'),start:Date.now(),status:'reserved',nextAt:Date.now()-1,retries:0,attempts:[],entryAttempted:false};store.putEntry(entry);let durable=false;
  const call=page.call.bind(page);page.call=async(name,args,options)=>{if(args[1]==='click')durable=Object.values(JSON.parse(readFileSync(join(folder,'state.json'))).jobs).some(row=>row.state==='attempting');return call(name,args,options);};
  const runner=new EntryRunner({ledger,store,createPage:async()=>page});await runner.run(entry);
  check('Doctorville shared list fallback dispatches its original provider handler only after durable recording',submissions()===1&&durable&&store.entries()[0].status==='clicked');
  check('Doctorville shared list fallback preserves consumption and refuses another automatic attempt',runner.retryJob(key)===false&&submissions()===1);
 }});
 const hmpDirectory=join(root,'hmp-host'),hmpPartition='entry-hmp-host-'+randomUUID(),hmpPrefs={...remotePreferences('hmp'),partition:hmpPartition};let hmpPosts=0,hmpReserved=false;
 const hmpLedger=new LocalState(join(hmpDirectory,'state.json'));hmpLedger.setPaused(false);const hmpStore=new WorkflowStore(join(hmpDirectory,'workflows.json'));hmpStore.setFeature('entry',true);
 await session.fromPartition(hmpPartition).protocol.handle('https',request=>{
  if(request.method==='POST'){hmpPosts++;hmpReserved=Object.values(JSON.parse(readFileSync(join(hmpDirectory,'state.json'))).jobs).some(row=>row.state==='attempting'&&row.slot===0);return new Response('{}',{headers:{'content-type':'application/json'}});}
  return new Response(shell(plainGrouped),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const hmpRunner=new EntryRunner({ledger:hmpLedger,store:hmpStore,createPage:async(_site,signal)=>new AutomationPage('hmp',signal,hmpPrefs)}),hmpEntry={...entry,...job('hmp')};hmpStore.putEntry(hmpEntry);
 await hmpRunner.run(hmpEntry);const hmpResult=hmpStore.entries()[0];
 check('native Hanmi supplemental click preserves its slot lease and five-slot schedule',hmpPosts===1&&hmpReserved&&hmpResult.receipt.status==='clicked'&&hmpResult.slot===1&&hmpResult.status==='reserved');
 const blueDir=join(root,'blue-host'),bluePartition='entry-blue-'+randomUUID(),blueLedger=new LocalState(join(blueDir,'state.json')),blueStore=new WorkflowStore(join(blueDir,'workflows.json'));let bluePosts=0,blueLease=false;
 blueLedger.setPaused(false);blueStore.setFeature('entry',true);
 const blueBody=blue(`${date} ${clock} ~ ${tomorrow} 23:59`).replace('<h3>','<span class="date">신청기간 2020-01-01</span><h3>');
 await session.fromPartition(bluePartition).protocol.handle('https',request=>{
  if(request.method==='POST'){bluePosts++;blueLease=Object.values(JSON.parse(readFileSync(join(blueDir,'state.json'))).jobs).some(row=>row.state==='attempting');return new Response('{}');}
  return new Response(shell(blueBody),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const blueRunner=new EntryRunner({ledger:blueLedger,store:blueStore,createPage:async(_site,signal)=>new AutomationPage('bluepharm',signal,{...remotePreferences('bluepharm'),partition:bluePartition})}),blueEntry={...entry,...job('bluepharm')};blueStore.putEntry(blueEntry);
 await blueRunner.run(blueEntry);
 check('native Bluepharm timed supplement calls its original ongoing button once after the durable lease',bluePosts===1&&blueLease&&blueStore.entries()[0].status==='clicked');
 check('Bluepharm inspected schedule survives restart without exposing raw links',new WorkflowStore(join(blueDir,'workflows.json')).diagnostics().entries[0].inspection.timeMatches===1&&!JSON.stringify(blueStore.diagnostics()).includes('https:'));
 for(const scenario of ['exact','plain_detail','ended_detail','wrong_date','end_time','title_date_only','duplicate','unsafe_link']){
  const dir=join(root,'doctor-detail-'+scenario),partition='doctor-detail-'+randomUUID(),ledger=new LocalState(join(dir,'state.json')),store=new WorkflowStore(join(dir,'workflows.json'));ledger.setPaused(false);store.setFeature('entry',true);let posts=0,details=0,durable=false,now=Date.now();
  const shownTitle=scenario==='title_date_only'?title+' '+date:title;
  const card=`<a class="list_detail" href="/seminar/seminarDetail?seminarId=17${scenario==='unsafe_link'?'&token=PRIVATE':''}"><strong class="tit">${shownTitle}</strong><div class="time"><span class="start">${clock}</span></div></a>`;
  const detail=['plain_detail','ended_detail'].includes(scenario)?detailHeader(scenario==='ended_detail'?'<span>종료된 세미나입니다.</span>':`<button onclick="fetch('/synthetic-entry',{method:'POST'})">입장하기</button>`):`<section><h2>${shownTitle}</h2>${scenario==='title_date_only'?'':`<p class="detail_date">${scenario==='wrong_date'?'2020-01-01':date}</p>`}<p class="time">${scenario==='end_time'?'00:00 ~ '+clock:clock+' ~ 23:59'}</p><button onclick="fetch('/synthetic-entry',{method:'POST'})">입장하기</button></section>`;
  await session.fromPartition(partition).protocol.handle('https',request=>{
   if(request.method==='POST'){posts++;durable=Object.values(JSON.parse(readFileSync(join(dir,'state.json'))).jobs).some(row=>row.state==='attempting');return new Response('{}');}
   const isDetail=new URL(request.url).pathname==='/seminar/seminarDetail';if(isDetail)details++;
   return new Response(shell(isDetail?detail:card+(scenario==='duplicate'?card:'')),{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  const entry={...job('doctorville'),title:shownTitle,start:now,status:'reserved',nextAt:now-1,retries:0,attempts:[],entryAttempted:false};store.putEntry(entry);
  const runner=new EntryRunner({ledger,store,now:()=>now,sleep:async ms=>{now+=ms;await new Promise(resolve=>setTimeout(resolve,0));},createPage:async(_site,signal)=>new AutomationPage('doctorville',signal,{...remotePreferences('doctorville'),partition})});
  await runner.run(entry);await new Promise(resolve=>setTimeout(resolve,100));
  check('Doctorville '+scenario+' reads a single observed detail only when the list title and link are unique',details===(['duplicate','unsafe_link'].includes(scenario)?0:1));
  check('Doctorville '+scenario+' requires fresh detail date/start/title before durable entry dispatch',['exact','plain_detail'].includes(scenario)?posts===1&&durable&&store.entries()[0].status==='clicked':posts===0&&Object.keys(ledger.snapshot().jobs).length===0);
  if(scenario==='ended_detail')check('Doctorville closed detail is recorded as ended without consuming an entry lease',store.entries()[0].status==='lecture_ended'&&posts===0&&Object.keys(ledger.snapshot().jobs).length===0);
 }
 check('all inspection and entry windows are released',BrowserWindow.getAllWindows().length===0);
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});writeFileSync(new URL('../verification/electron-entry.json',import.meta.url),JSON.stringify({runtime:{platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome},environment:'Linux Electron45; synthetic HTTPS; PC exact entry and read-only preflight',checks:checks.length,passed:checks,actualProviderVerified:false,windowsVerified:false},null,2)+'\n');
 console.log('ELECTRON_ENTRY_PASS:'+checks.length);app.quit();
}
run().catch(error=>{console.error('ELECTRON_ENTRY_FAIL:'+error.stack);for(const window of BrowserWindow.getAllWindows())window.destroy();app.exit(1);});
app.on('quit',()=>{try{rmSync(root,{recursive:true,force:true});}catch{}});
