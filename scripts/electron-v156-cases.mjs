import {app,BrowserWindow,session} from 'electron';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {AutomationPage} from '../src/automation-page.js';
import {CredentialManager} from '../src/credential-manager.js';
import {EntryRunner} from '../src/entry-runner.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {CatalogRunner} from '../src/catalog-runner.js';
import {CatalogStore} from '../src/catalog-store.js';
import {NativeCatalogRead} from '../src/native-catalog.js';
import {resourceUse,trackPage} from '../src/resource-use.js';
import {remotePreferences} from '../src/security.js';
import {initialSettings} from '../vendor/engine/core.js';
import {syntheticEntryClock} from './electron-entry-clock.mjs';
import {kstInstant} from '../src/schedule.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const html=body=>'<!doctype html><meta charset="utf-8"><body>'+body+'</body>';
export async function v156Cases({root,date,check}){
 const windows=[],controllers=[],track=(_e,c)=>trackPage(c,'all');app.on('web-contents-created',track);
 let server;
 try{
  // R01/R09: even a caller retaining an old job cannot enter or recover login.
  const partition='v156-dtalks-'+randomUUID(),prefs={...remotePreferences('dtalks'),partition};let gets=0,recoveries=0,posts=0;
  await session.fromPartition(partition).protocol.handle('https',request=>{if(request.method==='GET')gets++;else posts++;return new Response(html('<input type="password">'),{headers:{'content-type':'text/html'}});});
  const signal=new AbortController();controllers.push(signal);const page=new AutomationPage('dtalks',signal.signal,prefs);windows.push(page);
  CredentialManager.prototype.wrapPage.call({automaticAllowed:()=>true,vault:{enabled:()=>true},verifyPage:async()=>{recoveries++;return 'login_required';},recover:async()=>{recoveries++;return {status:'authenticated'};}},'dtalks',page,{purpose:'entry'});
  let rejected=false;try{await page.load('https://www.dtalks.kr/websim/vodList.do');}catch(e){rejected=e.message==='disabled';}
  check('v156 old Dtalks entry purpose performs zero GET, login verification, recovery and POST',rejected&&gets===0&&recoveries===0&&posts===0);page.close();
  const direct=new AutomationPage('dtalks',signal.signal,prefs);windows.push(direct);await direct.load('https://www.dtalks.kr/websim/vodList.do');
  for(const mode of ['inspect','open_target','click','entry_probe','playback_start','playback_probe']){
   let blocked=false;try{await direct.call('auto-entry.js',[{site:'dtalks',repeatSchema:1,key:'a'.repeat(64)},mode]);}catch(e){blocked=e.code==='disabled';}check('v156 renderer rejects Dtalks '+mode,blocked&&posts===0);
  }direct.close();

  // R03: the real renderer accepts only the new checkpoint schema.
  const hmpPartition='v156-hmp-'+randomUUID(),hmpPrefs={...remotePreferences('hmp'),partition:hmpPartition},start=kstInstant(date,'13:10');let now=start+25*60000,hmpPosts=0;
  await session.fromPartition(hmpPartition).protocol.handle('https',request=>{if(request.method==='POST'){hmpPosts++;return new Response('{}');}return new Response(html('<div class="area"><div class="top"><span class="date">'+date+'</span><span class="time">13:10 ~ 14:30</span></div><div class="subject">SYNTHETIC HMP</div><div class="state"><span>신청완료</span><button onclick="fetch(\'/synthetic-entry\',{method:\'POST\'})">강의시청하기</button></div></div>'),{headers:{'content-type':'text/html'}});});
  const nativeJob={site:'hmp',key:'b'.repeat(64),date,time:'13:10',title:'SYNTHETIC HMP',slot:1,hmpSlot:1,start,due:now,deadline:now+90000,hmpRepeatSchema:2,hmpTiming:'start_0_25_35',hmpAttempts:[]};
  const hp=syntheticEntryClock(new AutomationPage('hmp',signal.signal,hmpPrefs),()=>now);windows.push(hp);await hp.load('https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm');
  check('v156 actual injected HMP reader recognizes schema2 +25 before any click',(await hp.call('auto-entry.js',[nativeJob,'inspect'])).status==='ready'&&hmpPosts===0);
  check('v156 an old schema1 callback cannot consume the new same-number slot',(await hp.call('auto-entry.js',[{...nativeJob,hmpRepeatSchema:1},'click'])).status==='blocked'&&hmpPosts===0);
  check('v156 string schema cannot be a renderer permission',(await hp.call('auto-entry.js',[{...nativeJob,hmpRepeatSchema:'2'},'click'])).status==='blocked'&&hmpPosts===0);hp.close();
  const directory=join(root,'v156-hmp-host'),ledger=new LocalState(join(directory,'state-v1.json')),store=new WorkflowStore(join(directory,'workflows-v1.json'),{now:()=>now});ledger.setPaused(false);store.setFeature('entry',true);
  const entry={...nativeJob,status:'reserved',nextAt:now,retries:0,attempts:[],entryAttempted:false};store.putEntry(entry);let granted=false,created=0;
  const runner=new EntryRunner({ledger,store,now:()=>now,sleep:async ms=>{now+=ms;await wait(0);},createPage:async(_site,abort)=>{
   created++;const p=syntheticEntryClock(new AutomationPage('hmp',abort,hmpPrefs),()=>now);windows.push(p);const call=p.call.bind(p);p.call=async(name,args,options)=>{
    if(args[1]==='click')granted=store.entries(date)[0].entryAttempted===true&&Object.values(ledger.snapshot().jobs).some(r=>r.slot===33&&r.state==='attempting');return call(name,args,options);
   };return p;
  }});
  await runner.run(entry);for(let i=0;i<40&&!hmpPosts;i++)await wait(10);
  check('v156 actual HMP IPC dispatch follows both durable records and a schema2 lease',granted&&hmpPosts===1&&store.entries(date)[0].receipt.attempted===true);
  check('v156 inaccessible HMP playback does not create conditional +35',store.entries(date)[0].status!=='reserved'&&store.entries(date)[0].hmpAttempts[0].hmpRepeatSchema===2);
  await runner.run(store.entries(date)[0]);check('v156 repeated HMP host callback creates no second page or POST',created===1&&hmpPosts===1);

  // R08: only clear incidental media GET in a hidden worker is cancelled.
  const mediaPartition='v156-media-'+randomUUID(),mediaPrefs={...remotePreferences('doctorville'),partition:mediaPartition},seen=new Map();
  const body='<img id="badge" src="/badge.png"><img src="/captcha.png"><link rel="stylesheet" href="/style.css"><script src="/script.js"></script><video preload="auto" src="/incidental.mp4"></video><script>fetch("/api/list");fetch("/original.mp4",{method:"POST"})</script>';
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
  await session.fromPartition(mediaPartition).protocol.handle('https',request=>{
   const path=new URL(request.url).pathname,k=request.method+' '+path;seen.set(k,(seen.get(k)??0)+1);
   if(path.endsWith('.png'))return new Response(png,{headers:{'content-type':'image/png'}});
   if(path.endsWith('.css'))return new Response('body {color:rgb(1,2,3)}',{headers:{'content-type':'text/css'}});
   if(path.endsWith('.js'))return new Response('window.syntheticScript=true',{headers:{'content-type':'text/javascript'}});
   if(path.endsWith('.mp4'))return new Response('synthetic-media',{headers:{'content-type':'video/mp4'}});
   if(path.startsWith('/api'))return new Response('{}',{headers:{'content-type':'application/json'}});
   return new Response(html(body),{headers:{'content-type':'text/html'}});
  });
  const media=new AutomationPage('doctorville',signal.signal,mediaPrefs);windows.push(media);await media.load('https://www.doctorville.co.kr/seminar/main');await wait(250);
  check('v156 hidden media GET is blocked in actual Electron webRequest',(seen.get('GET /incidental.mp4')??0)===0);
  check('v156 images, CAPTCHA, CSS, script, API and original POST survive hidden restriction',['GET /badge.png','GET /captcha.png','GET /style.css','GET /script.js','GET /api/list','POST /original.mp4'].every(k=>(seen.get(k)??0)>0));
  const pagesBefore=resourceUse().pagesCreated;media.armEntryDispatch();await media.current.webContents.executeJavaScript('fetch("/entry.mp4").then(r=>r.text())');
  check('v156 actual entry role permits media and does not create an extra page',(seen.get('GET /entry.mp4')??0)===1&&resourceUse().pagesCreated===pagesBefore);
  const manual=new BrowserWindow({show:false,webPreferences:mediaPrefs});windows.push({close:()=>{if(!manual.isDestroyed())manual.destroy();}});await manual.loadURL('https://www.doctorville.co.kr/seminar/main');await wait(150);
  check('v156 same-profile manual lecture screen retains its media GET',(seen.get('GET /incidental.mp4')??0)>0);
  check('v156 remote resource policy keeps sandbox, context isolation and no Node',manual.webContents.getLastWebPreferences().sandbox===true&&manual.webContents.getLastWebPreferences().contextIsolation===true&&manual.webContents.getLastWebPreferences().nodeIntegration===false);
  media.close();manual.destroy();

  // R05/R06/R10: actual Node HTTP transport plus exact Electron cookie owner.
  const normal=session.fromPartition('v156-normal-'+randomUUID()),other=session.fromPartition('v156-other-'+randomUUID());let generation=0,mode='success',httpCount=0,rawBytes=0,authCorrect=true;
  await normal.cookies.set({url:'https://docple-plus.com',name:'accessToken',value:'SYNTHETIC_NORMAL_BEARER',secure:true});await other.cookies.set({url:'https://docple-plus.com',name:'accessToken',value:'SYNTHETIC_OTHER_BEARER',secure:true});
  normal.cookies.on('changed',()=>generation++);
  server=createServer(async(request,response)=>{
   httpCount++;authCorrect&&=request.headers.authorization==='Bearer SYNTHETIC_NORMAL_BEARER'&&!request.headers.cookie;
   if(mode==='401'){response.writeHead(401,{'content-type':'application/json'});response.end('{}');return;}
   if(mode==='rotate'){await normal.cookies.set({url:'https://docple-plus.com',name:'accessToken',value:'SYNTHETIC_ROTATED_BEARER',secure:true});await wait(30);}
   const page=Number(new URL(request.url,'http://localhost').searchParams.get('page')),all=Array.from({length:7},(_,i)=>({id:910+i,title:'SYNTHETIC DOC '+i,liveStartAt:date+'T13:00:00',liveEndAt:date+'T14:00:00',status:'OPEN',registered:true,detailUrl:'https://docple-plus.com/webinar/'+(910+i)}));
   const text=JSON.stringify({success:true,code:'SUCCESS',message:'ok',data:{items:page===1?all.slice(0,6):all.slice(6),totalCount:7,totalPages:2}});rawBytes+=Buffer.byteLength(text);response.writeHead(200,{'content-type':'application/json'});response.end(text);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const reader=new NativeCatalogRead({sessionOwner:()=>normal,accountEpoch:()=>0,profileEpoch:()=>generation,fetchImpl:(url,options)=>globalThis.fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname+new URL(url).search,options)});
  const profile=initialSettings().profiles.docple,cache=new CatalogStore(join(root,'v156-native-catalog.json'));let uiPages=0;
  const before=resourceUse(),listRunner=new CatalogRunner({store:cache,nativeRead:(...a)=>reader.read(...a),createPage:async()=>{uiPages++;throw Error('successful API cannot render');}});
  await listRunner.start(date,['docple']);
  check('v156 real HTTP full LIVE read advances catalog without a browser page',cache.view(date).results.docple.coverage===true&&cache.view(date).results.docple.events.length===7&&uiPages===0&&httpCount===2);
  check('v156 native bearer comes only from the exact selected normal Electron profile',authCorrect);
  check('v156 native body bytes are measured separately from total network',resourceUse().apiBodyBytes-before.apiBodyBytes===rawBytes&&resourceUse().fullNetworkMeasured===false&&resourceUse().osNetworkBytes===null);
  mode='401';const fallbackPartition='v156-fallback-'+randomUUID(),fallbackPrefs={...remotePreferences('docple'),partition:fallbackPartition};let fallbackReads=0;
  await session.fromPartition(fallbackPartition).protocol.handle('https',()=>{fallbackReads++;return new Response(html('<h1>SYNTHETIC ORIGINAL LIST</h1>'),{headers:{'content-type':'text/html'}});});
  const fallback=new CatalogRunner({store:new CatalogStore(join(root,'v156-native-fallback.json')),nativeRead:(...a)=>reader.read(...a),createPage:async(_p,abort)=>{
   uiPages++;const p=new AutomationPage('docple',abort,fallbackPrefs);windows.push(p);return {open:()=>p.load('https://docple-plus.com/webinar?category=C01&mode=LIVE&sort=START_ASC'),read:async()=>({done:true,status:'review',coverage:false,events:[],reason:'list_unverified'}),close:()=>p.close()};
  }});const requestsBefore=httpCount;await fallback.start(date,['docple']);
  check('v156 actual HTTP401 falls back once to the original browser list',uiPages===1&&fallbackReads===1&&httpCount===requestsBefore+1);
  mode='rotate';const stale=await reader.read(profile,date,signal.signal);check('v156 a real cookie change discards an in-flight native result',stale?.abandoned===true);
  const metrics=resourceUse();check('v156 metrics export contains no cookie, token, request or response text',!JSON.stringify(metrics).includes('SYNTHETIC')&&metrics.playbackDurationMs===null);
 }finally{for(const c of controllers)c.abort();for(const w of windows)try{w.close();}catch{}if(server)await new Promise(resolve=>server.close(resolve));app.removeListener('web-contents-created',track);}
}
