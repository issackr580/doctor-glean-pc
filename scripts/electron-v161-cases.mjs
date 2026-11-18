import {BrowserWindow,session} from 'electron';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {hiddenResources} from '../src/hidden-resources.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SiteWait,workerWait} from '../src/site-wait.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {initialSettings} from '../vendor/engine/core.js';
import {CatalogPage} from '../src/catalog-page.js';
import {remotePreferences} from '../src/security.js';
import {AutomationPage} from '../src/automation-page.js';
import {sanitiseResult} from '../src/catalog-store.js';
const fixtures=JSON.parse(readFileSync(new URL('../test/fixtures/bluepharm-collection-v1.json',import.meta.url)));
function blueFixture(id,date){
 const times=['2026-11-08 ~ 2026-11-10',date+' ~ 2026-11-10',date+' 13:00 / 2026-11-10 15:00',date+' 13:00 ~ 14:00'];
 const card=(title,time,status,offline=false)=>'<article><div class="sem_info"><h3 class="sem_tit">'+title+'</h3><div class="sem_detail"><p>일시 <span>'+time+'</span></p></div><span class="W_status">'+status+'</span><span class="W_badge_type '+(offline?'offline':'online')+'">'+(offline?'오프라인':'온라인')+'</span></div></article>';
 const empty='<p>세미나가 없습니다</p>';
 const index=fixtures.cases.findIndex(c=>c.id===id);
 const lists=[empty,index===3?empty:card('SYNTHETIC_ONGOING',times[index===4?3:index],'진행중',index===4),index===3?empty:card(index===4?'SYNTHETIC_ONLINE':'SYNTHETIC_RECRUITING',times[3],'모집중')];
 return '<meta charset="utf-8"><main><h2>세미나 전체 목록</h2><div id="filters"><button class="on">전체</button><button>진행중</button><button>모집중</button></div><section id="rows">'+empty+'</section><h2>진행중인 세미나</h2></main><script>window.filtersUsed=0;window.clock='+Date.parse(fixtures.context.clockUtc)+';Date.now=()=>window.clock;const lists='+JSON.stringify(lists)+';[...filters.children].forEach((b,i)=>b.onclick=()=>{window.filtersUsed++;for(const c of filters.children)c.className="";b.className="on";rows.innerHTML=lists[i];});</script>';
}
export async function v161Cases(check){
 const date=fixtures.context.targetDate,profile=initialSettings().profiles.bluepharm;
 for(const c of fixtures.cases){
  const partition='v161-'+randomUUID(),ses=session.fromPartition(partition);
  await ses.protocol.handle('https',req=>new Response(new URL(req.url).search?blueFixture(c.id,date):'<meta charset=utf-8><main><a href="/?pn=webcast.main">웹심포지움</a></main>',{headers:{'content-type':'text/html;charset=utf-8'}}));
  const win=new BrowserWindow({show:false,webPreferences:{...remotePreferences('bluepharm'),partition}});
  try{
   const wc=win.webContents,page=new CatalogPage(profile,{load:u=>win.loadURL(u),evaluate:s=>wc.executeJavaScript(s),snapshot:()=>({url:wc.getURL(),version:1,loading:false}),close(){}},new AbortController().signal);
   await page.open();let previous,r;for(let n=0;n<30;n++){
    await wc.executeJavaScript('window.clock+=2500');r=await page.read(date,previous);previous=r.state;
    if(r.done)break;if(r.action)assert.equal(await page.act(r.action,previous),true,c.id+' filter');
   }
   const diag=r.diagnostics,scopes=diag.listDetails?.scopes??[],clean=sanitiseResult('bluepharm',date,r);
   assert.deepEqual(r.events.map(({title,time,date})=>({date,time,title})),c.expected.events,c.id+' '+JSON.stringify(diag));
   assert.equal(r.done,true,c.id);assert.equal(clean.scope==='ongoing_recruiting',c.expected.terminal==='scoped_complete',c.id+' '+JSON.stringify(diag.listDetails));
   assert.equal(clean.coverage,false);assert.deepEqual(scopes.map(s=>s.scope),c.expected.completedScopes);
   assert.equal(await wc.executeJavaScript('window.filtersUsed'),c.expected.filters);if(c.expected.reason)assert.equal(diag.listDetails.reason,c.expected.reason);
   check('v161 Bluepharm '+c.id,true);
  }finally{win.destroy();}
 }
 const root=mkdtempSync(join(tmpdir(),'pc-rate-limit-')),ratePartition='rate161-'+randomUUID(),rateSession=session.fromPartition(ratePartition);
 const gate=new SiteWait(join(root,'state')),controller=new AbortController(),traffic=workerWait(gate,'keymedi',controller.signal,()=>1);
 let prompts=0,extra=0;
 await rateSession.protocol.handle('https',req=>{
  const path=new URL(req.url).pathname;
  if(path==='/after')extra++;
  return new Response('<body>synthetic</body>',{headers:{'content-type':'text/html'}});
 });
 // Electron protocol.handle bypasses Chromium's network-service response hooks.
 // Exercise those hooks over loopback and translate only this fixture origin.
 const server=createServer((req,res)=>{if(req.url==='/after')extra++;if(req.url==='/rate-limit')res.writeHead(429,{'Retry-After':'600'});else res.writeHead(200,{'content-type':'text/html'});res.end('synthetic');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const network=new BrowserWindow({show:false,webPreferences:{...remotePreferences('keymedi'),partition:ratePartition}});
 hiddenResources(network.webContents,{allowed:traffic.allowed,response:d=>{if(new URL(d.url).origin===origin)traffic.response({...d,url:'https://www.keymedi.com'+new URL(d.url).pathname});}});
 const guarded=new AutomationPage('keymedi',controller.signal,{...remotePreferences('keymedi'),partition:ratePartition},{traffic,onDialog:()=>{prompts++;return {accept:true};}});
 try{
  await guarded.load('https://www.keymedi.com/drlounge');guarded.allowPopups();const wc=guarded.root.webContents;
  await network.loadURL(origin);await network.webContents.executeJavaScript("fetch('/rate-limit').then(r=>r.status,()=>0)");
  assert.ok(gate.status('keymedi')?.until>Date.now(),'Chromium headers reached main gate');
  await wc.executeJavaScript("window.open('/after');confirm('synthetic');true");
  await network.webContents.executeJavaScript("fetch('/after').then(()=>0,()=>0)");
  await assert.rejects(guarded.call('keymedi-lounge.js',[{mode:'claim'}]));
  check('v161 Chromium 429 blocks open-window popup, confirm and outgoing fetch',prompts===0&&extra===0&&guarded.windows.length===1);
 }finally{guarded.close();network.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true});}
 const partition='lounge161-'+randomUUID(),ses=session.fromPartition(partition);let apiCalls=0;
 await ses.protocol.handle('https',req=>{
  if(new URL(req.url).hostname==='api.keymedi.com'){apiCalls++;return new Response(JSON.stringify({code:0,data:{mission:{updated_at:apiCalls===1?'2026-11-08 23:59:59':'2026-11-09 00:01:05',period_at:'2026-11-09 00:01:04'}}}),{headers:{'access-control-allow-origin':'*','content-type':'application/json'}});}
  return new Response('<meta charset="utf-8"><a href="#" onclick="window.opens++;return false">미션 보기</a><script>window.opens=0;window.clock=Date.now();Date.now=()=>window.clock</script>',{headers:{'content-type':'text/html;charset=utf-8'}});
 });
 const p=new AutomationPage('keymedi',new AbortController().signal,{...remotePreferences('keymedi'),partition});
 try{
  await p.load('https://www.keymedi.com/drlounge');const wc=p.root.webContents;
  for(let i=0;i<20;i++){await p.call('keymedi-lounge.js',[{mode:'open'}]);await wc.executeJavaScript('window.clock+=100');}
  check('v161 first 2s of panel polls open once',await wc.executeJavaScript('window.opens')===1);
  await wc.executeJavaScript('window.clock+=1001');for(let i=0;i<2;i++)await p.call('keymedi-lounge.js',[{mode:'open'}]);
  check('v161 panel retries once after 3s without diagnostic HTTP',await wc.executeJavaScript('window.opens')===2&&apiCalls===0);
  const names=['개원·경영','마케팅','세무·법무','의료기기','금융','어벤져스 Pack','브랜드 스테이션'];
  await wc.executeJavaScript('document.body.insertAdjacentHTML("beforeend",'+JSON.stringify('<section><h3>미션 보기</h3><div><span>0 / 7</span></div>'+names.map(n=>'<dl><dt>'+n+' 체험하기</dt><dd><button>포인트 받기</button></dd></dl>').join('')+'</section>')+')');
  await p.call('keymedi-lounge.js',[{mode:'open'}]);check('v161 visible panel has zero new open calls',await wc.executeJavaScript('window.opens')===2);
  for(const expected of ['2026-11-08 23:59:59','2026-11-09 00:01:05']){
   await wc.executeJavaScript("fetch('https://api.keymedi.com/api/drlounge/getMainInfo',{method:'POST'}).then(r=>r.text()).then(()=>true)");
   let observed;
   for(let i=0;i<20;i++){observed=(await p.call('keymedi-lounge.js',[{mode:'inspect'}])).providerObservation;if(observed?.providerUpdatedAt===expected)break;await new Promise(resolve=>setTimeout(resolve,20));}
   assert.equal(observed?.providerUpdatedAt,expected,JSON.stringify(observed));assert.equal(observed.providerPeriodAt,'2026-11-09 00:01:04');assert.ok(observed.responseAt>=observed.requestAt);
  }
  check('v161 original responses observed without another API request',apiCalls===2);
 }finally{p.close();}
}
