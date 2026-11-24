import {session} from 'electron';
import {syntheticEntryClock} from './electron-entry-clock.mjs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AutomationPage} from '../src/automation-page.js';
import {EntryRunner} from '../src/entry-runner.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {discoverMedigatePage,MedigateCountPages,readMedigateCounter} from '../src/medigate-counter.js';
import {remotePreferences} from '../src/security.js';
import {kstInstant} from '../src/schedule.js';
import {SiteWait,workerWait} from '../src/site-wait.js';

const list='https://new.medigate.net/symposium';
const november='https://www.medigate.net/event/20261103092020307';
const december='https://www.medigate.net/event/20261205092020307';
const outside='https://lecture.example.invalid/watch';
const endpoint='https://apis.medigate.net/w/event/webinar-start-count';
const syntheticDay='2026-12-08';
const document=body=>'<html><meta charset="utf-8">'+body+'</html>';
const dbHeader={'Content-Type':'application/json','Access-Control-Allow-Origin':'https://www.medigate.net'};

export async function medigateCountCases({root,check}){
 const file=join(root,'counter-links.json'),options=new MedigateCountPages(file);
 assert.throws(()=>options.set('2026-12',december+'?unapproved=1'));
 options.set('2026-12',december);
 check('month-specific official setting survives restart and is not used for January',new MedigateCountPages(file).get('2026-12')===december&&!options.get('2027-01'));
 for(const scenario of ['increases','unchanged','mismatch','account-change','cancelled','next-month','redirect','wrong-period','server-wait']){
  const partition='entry-aggregate-'+randomUUID(),profile=session.fromPartition(partition);
  let countReads=0,docs=0,posts=0,outsideRequests=0,clicks=0,closed=0,status,epoch=0,watch;
  await profile.protocol.handle('https',({url,method})=>{
   if(url===outside){outsideRequests++;return new Response('',{status:403});}
   if(method!=='GET'){posts++;return new Response('',{status:403});}
   if(url===endpoint){
    const count=countReads++>0&&scenario!=='unchanged'?4:3;
    if(scenario==='server-wait')return new Response('{}',{status:429,headers:{...dbHeader,'Retry-After':'600'}});
    if(scenario==='redirect')return new Response('',{status:302,headers:{Location:endpoint+'?second=yes'}});
    return new Response(JSON.stringify({data:{count}}),{headers:dbHeader});
   }
   let body='';
   if(url===list)body=`<article><h3>합성 강의</h3><p class="date">${syntheticDay} 13:00 ~ 14:00</p><a href="/symposium/123">상세보기</a><button id="entry">입장하기</button></article>
    <a href="${december}">2026년 12월 웨비나 월간 참여 현황</a><a href="${november}">2026년 11월 웨비나 월간 참여 현황</a>
    <script>document.getElementById('entry').onclick=()=>{
     window.syntheticClicks=(window.syntheticClicks||0)+1;
     window.open(${JSON.stringify(outside)});
     document.body.append(Object.assign(document.createElement('iframe'),{src:${JSON.stringify(outside)}}));
    };</script>`;
   if(url===december){
    docs++;
    const month=scenario==='wrong-period'?11:12;
    body='<section><h2>나의 웨비나 참여 현황</h2><p>2026년 '+month+'월 (월간 집계)</p><strong>0회</strong></section>'+
      '<script>fetch('+JSON.stringify(endpoint)+').then(r=>r.json()).then(j=>document.querySelector("strong").textContent=('+
      (scenario==='mismatch'?'j.data.count+5':'j.data.count')+')+"회")</script>';
   }
   return new Response(document(body),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  });
  const gate=new SiteWait(join(root,'medigate-wait-'+scenario+'.json'));
  const create=signal=>new AutomationPage('medigate',signal,{...remotePreferences('medigate'),partition},{traffic:workerWait(gate,'medigate',signal,()=>epoch),externalEntryAllowed:(_site,url)=>url===outside});
  const controller=new AbortController();
  try{
   if(['next-month','redirect','wrong-period'].includes(scenario)){
    const page=create(controller.signal);
    await page.load(list);check('only the matching observed next-month link '+scenario,await discoverMedigatePage(page,'2026-12',controller.signal)===december);
    page.close();
    const statusPage=create(controller.signal);
    try{
     const count=await readMedigateCounter(statusPage,december,'2026-12',controller.signal,()=>true,1500).catch(()=>null);
     check('verified current month and fresh original count response '+scenario,count===(scenario==='next-month'?3:null));
    }finally{statusPage.close();}
    continue;
   }
   const stores=join(root,scenario),file=join(stores,'workflow.json');
   const ledger=new LocalState(join(stores,'ledger.json'));ledger.setPaused(false);
   let now=kstInstant(syntheticDay,'13:00:30');
   const store=new WorkflowStore(file,{now:()=>now});store.setFeature('entry',true);store.setEntrySites(['medigate']);
   const event={site:'medigate',title:'합성 강의',date:syntheticDay,time:'13:00',url:'https://new.medigate.net/symposium/123'};
   const rows={medigate:{status:'ok',stale:false,events:[event]}};
   const finished=new Promise(resolve=>{watch=resolve;});
   const runner=new EntryRunner({ledger,store,now:()=>now,
    sleep:async(ms)=>{now+=ms;if(scenario==='account-change')epoch++;if(scenario==='cancelled')runner.manualOpened('medigate');},
    catalog:()=>rows,createInspectionPage:async(_site,signal)=>create(signal),
    createPage:async(_site,signal)=>{
     const page=syntheticEntryClock(create(signal),()=>now),close=page.close.bind(page),call=page.call.bind(page);
     page.close=()=>{if(!page.closed)closed++;close();};
     page.call=async(name,args,options)=>{
      if(args[1]!=='click')return call(name,args,options);
      status=Object.values(ledger.snapshot().jobs)[0]?.state;
      const result=await call(name,args,options);
      clicks=await page.current.webContents.executeJavaScript('window.syntheticClicks??0');
      return result;
     };
     return page;
    },
    medigateCounter:{allowed:()=>gate.allowed('medigate'),epoch:()=>epoch,page:month=>options.get(month)},
    onChange:()=>{if(store.entries(syntheticDay)[0]?.receipt)watch();}});
   runner.reserveCatalog(syntheticDay,rows);const [job]=store.entries(syntheticDay);
   await runner.run(job);
   const timer=setTimeout(watch,14000);
   try{await finished;}finally{clearTimeout(timer);}
   const result=new WorkflowStore(file,{now:()=>now}).entries(syntheticDay)[0];
   if(scenario==='server-wait'){
    check('Medigate count 429 prevents dispatch and persists the site hold',
     clicks===0&&result.status==='blocked'&&posts===0&&countReads===1&&Object.keys(ledger.snapshot().jobs).length===0&&!new SiteWait(gate.file).allowed('medigate'));
    continue;
   }
   check('original Medigate click only once after durable record '+scenario,clicks===1&&status==='attempting'&&result.entryAttempted&&posts===0);
   check('only a genuine monthly increase confirms Medigate '+scenario,result.status===(scenario==='increases'?'complete':'unknown')&&closed===1);
   check('Medigate watcher releases scheduler and repeat after result '+scenario,!runner.active&&!runner.medigateWatch&&runner.due()===null);
   if(scenario==='increases'){
    check('first increase closes without extra status loads',countReads===2&&docs===2);
    check('saved external host cannot authorize an automatic popup or frame',outsideRequests===0);
   }
   if(scenario==='account-change'||scenario==='cancelled')check('scope loss causes zero follow-up reads '+scenario,countReads===1);
  }finally{controller.abort();profile.protocol.unhandle('https');}
 }
}
