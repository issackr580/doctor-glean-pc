import {app,session} from 'electron';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AutomationPage} from '../src/automation-page.js';
import {CatalogPage} from '../src/catalog-page.js';
import {CatalogStore} from '../src/catalog-store.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {EntryRunner} from '../src/entry-runner.js';
import {LocalState} from '../src/local-state.js';
import {atomicJson} from '../src/atomic-json.js';
import {kstDate} from '../src/schedule.js';
import {siteById,remotePreferences} from '../src/security.js';

app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND');
app.on('window-all-closed',()=>{});
const root=mkdtempSync(join(tmpdir(),'pc-v169-'));
app.setPath('userData',root);
const fixture=name=>readFileSync(new URL('../test/fixtures/v169/'+name+'.html',import.meta.url),'utf8');
const calendar='https://www.dtalks.kr/websim/vodList.do',detail='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=901',popup=detail.replace('seminarDetail','broadcastSeminarPopup');
let unexpected=0,checks=0;
const baseline=process.argv.includes('--baseline');
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
let serial=0;
async function replay(site,routes,work){
 const partition='v169-'+(++serial),profile=session.fromPartition(partition);
 profile.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(request,done)=>{
  const allowed=Object.hasOwn(routes,request.url)&&request.method==='GET';
  if(!allowed)unexpected++;
  done({cancel:!allowed});
 });
 await profile.protocol.handle('https',req=>{
  const body=routes[req.url];if(!body||req.method!=='GET'){unexpected++;return new Response('',{status:403});}
  return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 });
 const controller=new AbortController(),page=new AutomationPage(site,controller.signal,{...remotePreferences(site),partition});
 try{await work(page,controller);}finally{controller.abort();profile.protocol.unhandle('https');}
}
async function calendarCase(name,width,date,expected,html=fixture(name),checked=true){
 return replay('dtalks',{[calendar]:html},async(page,controller)=>{
  page.root.setContentSize(width,1200);await page.load(calendar);
  const transport={snapshot:()=>({url:page.url,version:page.version}),evaluate:source=>page.current.webContents.executeJavaScript(source)};
  const reader=new CatalogPage({id:'dtalks',url:calendar,crawler:'additional-catalog-v1',filter:'all'},transport,controller.signal);
  let result;
  for(let tick=0;tick<38;tick++){
   await transport.evaluate('Date.now=()=>'+(1000+tick*1200)+';void 0');
   result=await reader.read(date,result?.state);if(result.done||result.action)break;
  }
  const times=result.events.map(e=>e.time).sort();
  console.log(name,width,date,times.join(','),result.diagnostics.calendarChecked);
  equal(await transport.evaluate('fixtureActions.buttonClicks'),0);
  if(baseline)return;
  equal(times,expected);equal(result.diagnostics.calendarChecked,checked);
  const path=join(root,'catalog-'+serial+'.json'),store=new CatalogStore(path);
  const row=(day,time)=>({site:'dtalks',date:day,time,title:'과거 강의'});
  store.record('dtalks',date,{status:'review',events:[row(date,'18:00')]});
  store.record('dtalks','2026-11-27',{status:'review',events:[row('2026-11-27','18:00')]});
  store.record('dtalks',date,result);
  const restored=new CatalogStore(path);
  equal(restored.view(date).results.dtalks.events.map(e=>e.time).sort(),checked?expected:[...expected,'18:00'].sort());
  equal(restored.view('2026-11-27').results.dtalks.events.length,1);
 });
}
async function channelCase(kind='selected'){
 const other=kind==='other';
 return replay('doctorville',{[detail]:fixture('doctorville-entry'),[popup]:fixture(other?'doctorville-other-dialog':'doctorville-popup')},async page=>{
  await page.load(detail);
  const job={key:'a'.repeat(64),site:'doctorville',url:detail,date:'2026-11-23',time:'18:30',title:'예제 강의',due:Date.now()-1000,deadline:Date.now()+60000};
  const ready=await page.call('pc-entry.js',[job,'inspect']);equal(ready.status,'ready');
  page.armEntryDispatch();page.allowPopups(true);
  await page.call('pc-entry.js',[job,'click'],{expectedDocument:page.entryBinding(),navigation:true});
  for(let i=0;i<60&&page.url!==popup;i++)await new Promise(done=>setTimeout(done,50));
  await page.ready();
  let marks=0;
  const active=()=>kind!=='cancelled'&&(kind!=='revoked'||marks===0);
  const target=kind==='wrong-id'?{...job,url:detail.replace('901','902')}:job;
  const arrival=await page.doctorvilleArrival?.(target,active,()=>{marks++;return true;});

  const counts=await page.current.webContents.executeJavaScript('fixtureActions');
  console.log('channel',arrival,counts);
  equal(await page.root.webContents.executeJavaScript('fixtureActions.entryClicks'),1);
  if(!baseline){equal(counts.confirmClicks,kind==='selected'?1:0);equal(marks,['selected','revoked'].includes(kind)?1:0);if(!other)equal(counts.radioClicks,0);if(kind==='selected'){equal(counts.selectedChannel,'2');equal(counts.radioClicks,0);equal(arrival,'waiting_room');}}
 });
}
async function reservationCase(failSave=false){
 const now=Date.now(),date=kstDate(now),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(now);
 const site='doctorville',event={site,date,time,url:detail,title:'예제 강의'};
 const base=siteById(site).url,rows={doctorville:{site,date,status:'ok',checkedAt:now,events:[event]}};
 const files={[base]:'<html>라이브세미나</html>',[detail]:fixture('doctorville-entry').replace('2026.11.23 18:30',date+' '+time),[popup]:fixture('doctorville-popup')};
 await replay(site,files,async page=>{
  const dir=join(root,'run-'+serial),file=join(dir,'workflows.json'),ledgerFile=join(dir,'ledger.json');
  const store=new WorkflowStore(file,{commit:(p,data)=>{
   if(failSave&&Object.values(data.entries).some(e=>e.doctorvilleChannelConsumed))throw Error('save failed');
   atomicJson(p,data);
  }});
  const ledger=new LocalState(ledgerFile);ledger.setPaused(false);store.setFeature('entry',true);store.setEntrySites([site]);
  // Retain the synthetic windows only until their DOM counters are read.
  const close=page.close.bind(page);page.close=()=>{};
  const runner=new EntryRunner({store,ledger,createPage:async()=>page,catalog:()=>rows});
  try{
   runner.reserveCatalog(date,rows);const [job]=store.entries(date);
   await runner.run(job);
   const counts=await page.current.webContents.executeJavaScript('fixtureActions');
   equal(await page.root.webContents.executeJavaScript('fixtureActions.entryClicks'),1);
   equal(counts.confirmClicks,failSave?0:1);equal(counts.radioClicks,0);
   const restored=new WorkflowStore(file),persisted=restored.entries(date)[0];
   equal(persisted.entryAttempted,true);
   if(!failSave){equal(persisted.doctorvilleArrival,'waiting_room');equal(persisted.doctorvilleChannelConsumed,true);}
   const resumed=new EntryRunner({store:restored,ledger:new LocalState(ledgerFile),createPage:async()=>assert.fail('duplicate entry')});
   resumed.recover();equal(resumed.due(),null);equal(restored.consumeDoctorvilleChannel(job),false);
  }finally{close();}
 });
}

async function main(){try{
 await app.whenReady();
 for(const name of ['dtalks-aligned','dtalks-displaced'])for(const width of [411,1240])for(const day of ['23','26'])await calendarCase(name,width,'2026-11-'+day,day==='23'?['13:00']:['13:00','18:00']);
 await channelCase();await channelCase('other');
 if(!baseline){
  for(const kind of ['wrong-id','revoked','cancelled'])await channelCase(kind);
  const mon='2026-11-23',moved=fixture('dtalks-displaced');
  await calendarCase('boundary',1240,mon,['13:00'],moved.replace('translateX(360px)','translateX(310px)'),false);
  await calendarCase('boundary-thursday',411,'2026-11-26',['13:00'],moved.replace('translateX(360px)','translateX(310px)'),false);
  await calendarCase('real-monday-evening',411,mon,['13:00','18:00'],moved.replace('translateX(360px)','translateX(0px)'));
  await calendarCase('same-time-different-title',1240,mon,['13:00','13:00'],moved.replace('translateX(360px)','translateX(0px)').replace('18:00','13:00'));
  await reservationCase();await reservationCase(true);}
 equal(unexpected,0);
 mkdirSync('verification',{recursive:true});writeFileSync('verification/electron-v169.json',JSON.stringify({runtime:{platform:process.platform,electron:process.versions.electron},checks,unexpectedRequests:unexpected}));

 console.log('ELECTRON_V169_PASS:'+checks);
} catch(e){console.error(e);process.exitCode=1;}finally{rmSync(root,{recursive:true,force:true});app.quit();}
}
main();
