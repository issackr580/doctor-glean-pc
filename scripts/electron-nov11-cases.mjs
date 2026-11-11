// Synthetic counterexamples for the November 11 Windows report. No user DOM,
// lecture identifiers, titles, accounts, or private report contents are copied.
import {parseOfficialIdentity} from '../src/entry-identity.js';
import {session} from 'electron';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {AutomationPage} from '../src/automation-page.js';
import {EntryRunner} from '../src/entry-runner.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {remotePreferences} from '../src/security.js';
export async function nov11Cases({root,date,title,clock,check,inspect,job,detailHeader}){
 const url='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=921';
 const known={...job('doctorville'),url,lectureIdentity:parseOfficialIdentity('doctorville',url)};
 const decorated=detailHeader('<button onclick="window.syntheticClicks=(window.syntheticClicks||0)+1">입장하기</button>',date+' '+clock+' ~ 23:59',title)
  .replace('<strong>','<b>심혈관질환</b><strong>').replace(/<p>합성\s*강연자<\/p>/,'<p><b>합성강연자</b> <em>교수</em></p><strong>100/200명</strong>');
 await inspect('doctorville',decorated,{url,work:async page=>{
  const r=await page.call('pc-entry.js',[known,'inspect']);
  check('Nov11 official Doctorville detail separates lecture title from bold category, presenter and count',r.status==='ready'&&r.dateMatches===1&&r.timeMatches===1);
  check('Nov11 decorated detail inspection has no click',await page.current.webContents.executeJavaScript('(window.syntheticClicks||0)===0'));
  const result=await page.call('pc-entry.js',[known,'click']);
  check('Nov11 same inspected original control clicks once',result.status==='clicked'&&await page.current.webContents.executeJavaScript('window.syntheticClicks===1'));
  check('Nov11 same control never clicks twice',(await page.call('pc-entry.js',[known,'click'])).status==='already_attempted');
 }});
 const renamed=decorated.replace('<strong>'+title+'</strong>','<strong>합성 변경된 공식 강의 제목</strong>');
 check('Nov11 same official ID permits a renamed decorated detail title',(await inspect('doctorville',renamed,{url,job:known,mode:'inspect'})).status==='ready');
 for(const [name,body,at] of [
  ['wrong date',decorated.replace(date+' '+clock,'2020-01-01 '+clock),url],
  ['wrong start',decorated.replace(date+' '+clock,date+' '+(clock==='00:00'?'01:00':'00:00')),url],
  ['different official ID',decorated,url.replace('921','922')],
  ['missing schedule',decorated.replace(date+' '+clock+' ~ 23:59','일정 미정'),url],
  ['login',decorated+'<input type="password">',url],
  ['conflicting schedule',decorated.replace('<p><b>',`<p>${date} 00:01 ~ 23:59</p><p><b>`),url],
  ['two lecture headers',decorated+decorated,url],
  ['two renamed lecture headers',renamed+renamed.replace('합성 변경된 공식 강의 제목','합성 두 번째 강의 제목'),url],
 ])check('Nov11 decorated detail rejects '+name,(await inspect('doctorville',body,{url:at,job:known,mode:'inspect'})).status!=='ready');
 const schedule=await inspect('doctorville',renamed,{url,job:known,mode:'schedule-inspect'});
 check('Nov11 decorated renamed schedule remains an independent read-only date/start observation',schedule.observedTime===clock&&schedule.dateMatches===1&&schedule.targetMatched===true);
 const mediUrl='https://new.medigate.net/symposium/931';
 const mediJob={...job('medigate'),url:mediUrl,lectureIdentity:parseOfficialIdentity('medigate',mediUrl)};
 const card=`<article><h3>${title}</h3><p class="date">${date} ${clock} ~ 23:59</p><span>신청완료</span><a href="/symposium/931">상세보기</a><a href="/bookmarks">관심강의</a></article>`;
 await inspect('medigate',card,{work:async(page,posts)=>{
  const native=await page.call('auto-entry.js',[mediJob,'inspect']);
  check('Nov11 Medigate reproduces registered list with unrelated utility link and missing native button',native.status==='button_missing');
  const read=await page.call('pc-entry.js',[mediJob,'inspect']);
  check('Nov11 Medigate reads the one observed official detail among utility links',read.status==='navigate'&&read.url===mediUrl&&read.reason==='read_only'&&posts()===0);
 }});
 for(const [name,body] of [
  ['two IDs',card.replace('</article>','<a href="/symposium/932">다른 강의</a></article>')],
  ['missing original link',card.replace('<a href="/symposium/931">상세보기</a>','')],
  ['unregistered',card.replace('신청완료','신청하기')],
  ['wrong date',card.replace(date,'2020-01-01')],
  ['unsafe query',card.replace('/symposium/931','/symposium/931?token=synthetic')],
 ])check('Nov11 Medigate detail opening rejects '+name,(await inspect('medigate',body,{job:mediJob,mode:'inspect'})).status!=='navigate');
 for(const validDate of [true,false]){
  const partition='nov11-'+randomUUID(),directory=join(root,partition),ledger=new LocalState(join(directory,'state.json')),store=new WorkflowStore(join(directory,'workflows.json'));let posts=0,details=0,durable=true;
  ledger.setPaused(false);store.setFeature('entry',true);
  await session.fromPartition(partition).protocol.handle('https',request=>{
   if(request.method!=='GET'){posts++;durable&&=store.entries()[0]?.entryAttempted===true&&Object.keys(ledger.snapshot().jobs).length===1;return new Response('{}');}
   const detail=new URL(request.url).pathname==='/symposium/931';if(detail)details++;
   const body=detail?`<section><h1>${title}</h1><p class="date">${validDate?date:'2020-01-01'} ${clock} ~ 23:59</p><span>신청완료</span><button onclick="fetch('/synthetic-entry',{method:'POST'})">입장하기</button></section>`:card;
   return new Response('<!doctype html><meta charset="utf-8"><body>'+body+'</body>',{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  const entry={...mediJob,start:Date.now(),status:'reserved',nextAt:Date.now()-1,retries:0,attempts:[],entryAttempted:false};store.putEntry(entry);
  const runner=new EntryRunner({ledger,store,createPage:async(_site,signal)=>new AutomationPage('medigate',signal,{...remotePreferences('medigate'),partition})});
  await runner.run(entry);
  check('Nov11 actual PC host follows observed Medigate detail and '+(validDate?'dispatches after durable records':'rejects changed detail date'),details===1&&posts===(validDate?1:0)&&durable&&store.entries()[0].entryAttempted===validDate);
  if(validDate){await runner.run(store.entries()[0]);check('Nov11 completed Medigate host never resends on repeated invocation',posts===1&&Object.keys(ledger.snapshot().jobs).length===1);}
 }
 for(const [message,status] of [['로그인이 필요합니다.','login'],['수강 신청 후 입장해주세요.','not_registered']]){
  await inspect('whodadoc','<main><h1>합성 안내</h1></main>',{url:'https://hcp.whodadoc.com/hcp/main',work:async page=>{
   await page.current.webContents.executeJavaScript(`setTimeout(()=>alert(${JSON.stringify(message)}),0);void 0`);
   for(let i=0;i<30&&!page.entryObstacle();i++)await new Promise(resolve=>setTimeout(resolve,20));
   check('Nov11 site alert classifies '+status+' without accepting a confirmation',page.entryObstacle()?.status===status);
   const result=await page.call('auto-entry.js',[{...job('whodadoc'),repeatSchema:1,repeatSlot:0},'inspect']);
   check('Nov11 '+status+' obstacle crosses the existing recovery wrapper boundary',result.status===status);
   check('Nov11 stored alert observation excludes raw text',!JSON.stringify(page.lastEntryDialog).includes(message));
   await page.load('https://hcp.whodadoc.com/hcp/main');
   check('Nov11 old '+status+' alert cannot affect a replacement document',page.entryObstacle()===null);
  }});
 }
 await inspect('whodadoc',`<iframe srcdoc="<script>setTimeout(()=>alert('로그인이 필요합니다.'),10)</script>"></iframe>`,{url:'https://hcp.whodadoc.com/hcp/main',work:async page=>{
  for(let i=0;i<30&&!page.lastEntryDialog;i++)await new Promise(resolve=>setTimeout(resolve,20));
  check('Nov11 an embedded document alert cannot request site account recovery',page.lastEntryDialog?.reason==='manual_confirmation'&&page.entryObstacle()===null);
 }});
}
