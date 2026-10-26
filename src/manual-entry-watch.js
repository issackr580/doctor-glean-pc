import {readFileSync} from 'node:fs';
import {allowedNavigation} from './security.js';
const engine=readFileSync(new URL('../vendor/automation/auto-entry.js',import.meta.url),'utf8');
// This isolated world has no preload, IPC or Node. The website cannot write its
// click queue. Only trusted user input is inspected, using the original engine.
const WORLD=1001;
export function watchManualEntry(window,site,{jobs,onClick,interval=700}){
 let running=false,closed=false;
 const tick=async()=>{
  if(closed||running||window.isDestroyed())return;const contents=window.webContents,url=contents.getURL();
  if(contents.isLoadingMainFrame()||!allowedNavigation(site,url))return;
  running=true;
  try{
   const eligible=jobs().filter(job=>job.site===site&&!['manual_clicked','cancelled','lecture_ended','expired'].includes(job.status)).map(job=>({...job,...(site==='hmp'?{hmpRepeatSchema:1,hmpSlot:job.slot}:{})}));
   const install=`(()=>{
    const name='__doctorGleanManualObserver';let state=window[name];
    if(!state){state={jobs:${JSON.stringify(eligible)},clicks:[]};window[name]=state;const inspect=${engine};
     document.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      for(const job of state.jobs)try{if(inspect(job,'manual_click',event.target).status==='manual_clicked'&&state.clicks.length<20)state.clicks.push(job.key);}catch{}
     },true);
    }
    return [];
   })()`;
   const code=`(()=>{const state=window.__doctorGleanManualObserver;if(!state)return null;const result=state.clicks.splice(0);state.jobs=${JSON.stringify(eligible)};return result;})()`;
   const keys=await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code}]);
   if(keys===null){await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:install}]);return;}
   if(closed||window.isDestroyed()||contents.getURL()!==url||!Array.isArray(keys))return;
   for(const key of new Set(keys))if(typeof key==='string'&&eligible.some(job=>job.key===key))onClick(key);
  }catch{}finally{running=false;}
 };
 const timer=setInterval(tick,interval);timer.unref();const close=()=>{closed=true;clearInterval(timer);};window.once('closed',close);tick();return close;
}
