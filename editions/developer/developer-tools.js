import {join} from 'node:path';
import {DeveloperJournal} from './developer-journal.js';
import {focusReport,entryEvidence} from './entry-report.js';
import {randomUUID} from 'node:crypto';

export function createDeveloperTools({directory,register,save,copy,notify,policy,edition,version,snapshot,build={}}){
 const journal=new DeveloperJournal(join(directory,'developer-diagnostics-v1.json'));let previous='',epoch=0,frozen;
 const revoke=()=>{epoch++;frozen=undefined;};
 const valid=token=>typeof token==='string'&&!!frozen&&journal.status().enabled&&frozen.token===token&&frozen.epoch===epoch&&Date.now()<frozen.until;
 const entryEvent=(job,kind,phase,detail)=>{try{journal.entry(job,kind,phase,detail);}catch{}};
 const event=input=>{
  try{
   if(!journal.status().enabled)return;
   const memory=process.memoryUsage();journal.event({...input,heapUsedKb:Math.round(memory.heapUsed/1024),rssKb:Math.round(memory.rss/1024)});
  }catch{}
 };
 return Object.freeze({
  available:true,preloadName:'preload-developer.cjs',
  event,
  observeEntry(job,phase,detail={}){entryEvent(job,'entry',phase,detail);},
  traceEntry(job,kind){
   const active=journal.status().enabled,lease=epoch,owner=randomUUID().replaceAll('-',''),began=performance.now();let finished=false;
   const emit=(phase,detail={})=>{if(!active||finished||lease!==epoch||!journal.status().enabled)return;entryEvent(job,kind,phase,{...detail,owner,elapsedMs:Math.min(190000,Math.max(0,Math.floor(performance.now()-began)))});};
   emit('work_started',{status:'running',appVersion:version,...build});
   return {event:emit,finish(detail){emit('work_finished',detail);finished=true;}};
  },
  observe(state){
   const signature=JSON.stringify([state.running,state.site,state.completed,state.reason]);if(signature===previous)return;previous=signature;
   event({area:'collection',phase:state.running?'phase':'finish',site:state.site??'',completed:state.completed??0,total:state.total??0,reason:state.reason});
  },
  status:()=>journal.status(),
  reportDetails(){try{return journal.status().enabled?{entryJournal:journal.export().entryJournal}:{};}catch{return {}; }},
  register(){
   register('pc-dev:status',()=>journal.status());
   register('pc-dev:enabled',value=>{if(typeof value!=='boolean')return {ok:false};revoke();const ok=journal.setEnabled(value);if(ok)event({area:'control',phase:value?'enable':'disable',site:''});notify();return {ok};});
   register('pc-dev:clear',()=>{revoke();const ok=journal.clear();notify();return {ok};});
   register('pc-dev:export',()=>save('doctor-glean-pc-developer-diagnostics.json',{appVersion:version,applicationId:edition.appId,edition:edition.id,...journal.export(),currentState:snapshot()}));
   register('pc-dev:entry-list',()=>({ok:true,enabled:journal.status().enabled,records:journal.export().entryJournal.records.map(row=>({executionId:row.executionId,site:row.site,date:row.date,time:row.time,slot:row.slot,kind:row.kind,updatedAt:row.updatedAt,...entryEvidence(row)}))}));
   register('pc-dev:entry-preview',executionId=>{
    frozen=undefined;if(typeof executionId!=='string'||!journal.status().enabled)return {ok:false};
    const text=focusReport(journal.export().entryJournal,executionId);if(!text)return {ok:false};
    frozen={token:randomUUID(),text,epoch,until:Date.now()+300000};return {ok:true,token:frozen.token,text,summary:JSON.parse(text).summary};
   });
   register('pc-dev:entry-save',token=>{if(!valid(token))return {ok:false};const text=frozen.text;return save('doctor-glean-pc-entry-report.txt',text,()=>valid(token));});
   register('pc-dev:entry-copy',async token=>{if(!valid(token))return {ok:false};await copy(frozen.text);return {ok:true};});
   register('pc-dev:policy-check',()=>{
    const rules=[
     ['https_site',policy.allowedNavigation('keymedi','https://www.keymedi.com/meditv/live')],
     ['http_rejected',!policy.allowedNavigation('keymedi','http://www.keymedi.com/')],
     ['foreign_host_rejected',!policy.allowedNavigation('keymedi','https://www.keymedi.com.evil.invalid/')],
     ['file_rejected',!policy.allowedNavigation('keymedi','file:///C:/Windows/win.ini')],
    ];
    const p=policy.remotePreferences('keymedi',edition.id);
    rules.push(['sandbox_configured',p.sandbox===true],['node_disabled',p.nodeIntegration===false],['context_isolated',p.contextIsolation===true]);
    return {scope:'offline_policy',checks:rules.map(([id,passed])=>({id,passed}))};
   });
  },
  close(){revoke();},
 });
}
