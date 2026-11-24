import {session} from 'electron';
import {createServer} from 'node:http';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {docpleCard,docpleList} from '../test/fixtures/docple-webinar.js';

const origin='https://docple-plus.com';
const attendance=origin+'/offerwall/attendance', calendar=origin+'/api/season2/mission/attendance/calendar';
const list=origin+'/webinar?category=C01&mode=LIVE&sort=START_ASC', listApi=origin+'/api/season2/webinar/list';
const token='synthetic.docple.token';
const html=body=>'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css">'+body+'<script src="/fixture.js"></script>';
const json=value=>JSON.stringify(value);

export async function compareHttpReads({moduleOf,temp,equal,report}){
 const {AutomationPage}=await moduleOf('automation-page'),{DailyRunner}=await moduleOf('daily-runner');
 const {CatalogRunner}=await moduleOf('catalog-runner'),{CatalogPage}=await moduleOf('catalog-page');
 const {CatalogStore}=await moduleOf('catalog-store'),{WorkflowStore}=await moduleOf('workflow-store');
 const {NativeCatalogRead}=await moduleOf('native-catalog'),{LocalState}=await moduleOf('local-state');
 const {SiteWait}=await moduleOf('site-wait'),{kstDate}=await moduleOf('schedule');
 const {guardSession}=await moduleOf('hidden-resources');
 const {remotePreferences}=await moduleOf('security');
 const date=kstDate(),month=date.slice(0,7).replace('-','');
 const title='합성 강의',time='13:00';
 const item={id:901,title,liveStartAt:date+'T'+time+':00',liveEndAt:date+'T14:00:00',status:'OPEN',registered:true,detailUrl:origin+'/webinar/901'};
 const complete=json({data:{yearMonth:month,attendedDates:[date]}}),pending=json({data:{yearMonth:month,attendedDates:[]}});
 let metrics,scenario,recovered,apiReads;
 const counts=()=>({requests:0,bodyBytes:0,contentPages:0,pages:0,posts:0,recoveries:0,redirects:0,unexpected:0});
 const server=createServer((req,res)=>{
  metrics.requests++;
  const path=new URL(req.url,origin).pathname;
  let body,status=200,type='text/html',headers={};
  if(req.method!=='GET'){metrics.posts++;status=405;body='';}
  else if(path==='/fixture.css'){type='text/css';body='/*'+'.'.repeat(2048)+'*/';}
  else if(path==='/fixture.js'){type='text/javascript';body='/*'+'.'.repeat(4096)+'*/';}
  else if(path==='/offerwall/attendance'){metrics.contentPages++;body=html('<main>출석 달력</main>');}
  else if(path==='/webinar'){
   metrics.contentPages++;
   body=html(recovered?docpleList({cards:docpleCard({id:'901',title,date:date.replaceAll('-','.'),time,url:'/webinar/901'})}).replace('Value">3','Value">1'):'<input type="password"><main>로그인</main>');
  }else if(path===new URL(calendar).pathname||path===new URL(listApi).pathname){
   assert.equal(req.headers.authorization,'Bearer '+token);
   type='application/json';apiReads++;
   if(scenario==='restricted'){status=429;headers={'Retry-After':'600'};body='{}';}
   else if(scenario==='inconclusive'&&apiReads===1)body='{}';
   else if(path===new URL(calendar).pathname)body=scenario==='pending'?pending:complete;
   else body=json({success:true,code:'SUCCESS',message:'',data:{items:[item],totalCount:1,totalPages:1}});
  }else{metrics.unexpected++;status=403;body='';}
  metrics.bodyBytes+=Buffer.byteLength(body);
  if(status>=300&&status<400)metrics.redirects++;
  res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),...headers});
  res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const loopback='http://127.0.0.1:'+server.address().port;
 const toLocal=url=>{const target=new URL(url);assert.equal(target.origin,origin);return loopback+target.pathname+target.search;};
 const routes=new Set([new URL(attendance).pathname,new URL(calendar).pathname,new URL(list).pathname,new URL(listApi).pathname,'/fixture.css','/fixture.js']);
 try{
  for(const name of ['attendanceBrowser','attendanceHttp','pending','inconclusive','restricted','loginBrowser','loginHttp']){
   scenario=name;recovered=false;metrics=counts();apiReads=0;
   const partition='http-fixture-'+name,owner=session.fromPartition(partition);
   guardSession(owner,{allowed:({url})=>new URL(url).origin===origin&&routes.has(new URL(url).pathname)});
   await owner.protocol.handle('https',request=>fetch(toLocal(request.url),{method:request.method,headers:request.headers,redirect:'manual'}));
   const putCookie=()=>owner.cookies.set({url:origin,name:'accessToken',value:token,secure:true});
   const makePage=signal=>{metrics.pages++;return new AutomationPage('docple',signal,{...remotePreferences('docple'),partition});};
   const wait=new SiteWait(join(temp,'http-wait-'+name+'.json'));
   const native=new NativeCatalogRead({gate:wait,sessionOwner:()=>owner,accountEpoch:()=>0,profileEpoch:()=>Number(recovered),
    fetchImpl:(url,options)=>fetch(toLocal(url),options)});
   if(!name.startsWith('login')){
    await putCookie();
    const store=new WorkflowStore(join(temp,'http-work-'+name+'.json'));
    const ledger=new LocalState(join(temp,'http-ledger-'+name+'.json'));ledger.setPaused(false);store.setFeature('dailyClaim',true);
    const runner=new DailyRunner({ledger,store,createPage:async(_site,signal)=>makePage(signal),
     readDocpleAttendance:name==='attendanceBrowser'?undefined:(...args)=>native.readAttendance(...args)});
    runner.siteWait=wait;
    await runner.run(['docple:attendance'],{readOnly:true});
    const row=store.day(date).daily['docple:attendance'];
    equal(row.status,({pending:'pending',restricted:'unknown'})[name]??'complete');
    equal(row.attempted,false);
    if(name==='restricted')equal(new SiteWait(wait.file).allowed('docple'),false);
   }else{
    const store=new CatalogStore(join(temp,'http-list-'+name+'.json'));let reads=0;
    const runner=new CatalogRunner({store,gate:wait,context:()=>Number(recovered),
     nativeRead:(...args)=>++reads===1||name==='loginHttp'?native.read(...args):null,
     recoverLogin:async()=>{metrics.recoveries++;await putCookie();recovered=true;return true;},
     createPage:async(profile,signal)=>{
      const page=makePage(signal);
      return new CatalogPage(profile,{snapshot:()=>({url:page.url,version:page.version,loading:false}),
       load:url=>page.load(url),evaluate:script=>page.current.webContents.executeJavaScript(script),close:()=>page.close()},signal);
     }});
    await runner.start(date,['docple']);
    const row=store.view(date).results.docple;
    equal(row.events.map(({id,date,time})=>[id,date,time]),[['901',date,time]]);
    equal(row.coverage,true);equal(row.events[0].registrationStatus,'registered');equal(metrics.recoveries,1);
   }
   equal(metrics.posts,0);equal(metrics.unexpected,0);equal(metrics.redirects,0);
   report[name]=metrics;
   owner.protocol.unhandle('https');
  }
  equal(report.attendanceBrowser.pages,1);equal(report.attendanceHttp.pages,0);
  equal(report.attendanceBrowser.requests,4);equal(report.attendanceHttp.requests,1);
  equal(report.attendanceHttp.bodyBytes,Buffer.byteLength(complete));
  equal(report.pending.pages,0);equal(report.pending.requests,1);
  equal(report.inconclusive.pages,1);equal(report.inconclusive.requests,5);
  equal(report.restricted.pages,0);equal(report.restricted.requests,1);
  equal(report.loginBrowser.pages,2);equal(report.loginHttp.pages,1);
  equal(report.loginBrowser.requests,6);equal(report.loginHttp.requests,4);
  assert.ok(report.loginHttp.bodyBytes<report.loginBrowser.bodyBytes);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
