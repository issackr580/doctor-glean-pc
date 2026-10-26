import {join} from 'node:path';
import {DeveloperJournal} from './developer-journal.js';

export function createDeveloperTools({directory,register,save,notify,policy,edition,version,snapshot}){
 const journal=new DeveloperJournal(join(directory,'developer-diagnostics-v1.json'));let previous='';
 const event=input=>{
  try{
   if(!journal.status().enabled)return;
   const memory=process.memoryUsage();journal.event({...input,heapUsedKb:Math.round(memory.heapUsed/1024),rssKb:Math.round(memory.rss/1024)});
  }catch{}
 };
 return Object.freeze({
  available:true,preloadName:'preload-developer.cjs',
  event,
  observe(state){
   const signature=JSON.stringify([state.running,state.site,state.completed,state.reason]);if(signature===previous)return;previous=signature;
   event({area:'collection',phase:state.running?'phase':'finish',site:state.site??'',completed:state.completed??0,total:state.total??0,reason:state.reason});
  },
  status:()=>journal.status(),
  register(){
   register('pc-dev:status',()=>journal.status());
   register('pc-dev:enabled',value=>{const ok=journal.setEnabled(value);if(ok)event({area:'control',phase:value?'enable':'disable',site:''});notify();return {ok};});
   register('pc-dev:clear',()=>{const ok=journal.clear();notify();return {ok};});
   register('pc-dev:export',()=>save('doctor-glean-pc-developer-diagnostics.json',{appVersion:version,applicationId:edition.appId,edition:edition.id,...journal.export(),currentState:snapshot()}));
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
  close(){},
 });
}
