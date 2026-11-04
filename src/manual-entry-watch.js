import {readFileSync} from 'node:fs';
import {allowedNavigation} from './security.js';
const survey=readFileSync(new URL('../vendor/automation/doctorville-survey.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('../vendor/automation/auto-entry.js',import.meta.url),'utf8');
// This isolated world has no preload, IPC or Node. The website cannot write its
// click queue. Only trusted user input is inspected, using the original engine.
const WORLD=1001;
export function watchManualEntry(window,site,{jobs,onClick,onSurvey=()=>{},surveyAllowed=()=>false,interval=700}){
 let running=false,closed=false,generation=0,lastSurvey=0;
 window.webContents.on('did-start-navigation',()=>{generation++;});
 const tick=async()=>{
  if(closed||running||window.isDestroyed())return;const contents=window.webContents,url=contents.getURL();
  if(contents.isLoadingMainFrame()||!allowedNavigation(site,url))return;
  running=true;const boundGeneration=generation;
  try{
   const eligible=jobs().filter(job=>job.site===site&&!['manual_clicked','cancelled','lecture_ended','expired'].includes(job.status)).map(job=>({...job,...(site==='hmp'?{hmpRepeatSchema:1,hmpSlot:job.slot}:job.repeatSchema===1?{repeatSlot:job.slot}:{})}));
   const install=`(()=>{
    const name='__doctorGleanManualObserver';let state=window[name];
    if(!state){state={jobs:${JSON.stringify(eligible)},clicks:[]};window[name]=state;const inspect=${engine};
     const manual=(job,target)=>{
      if(inspect(job,'manual_click',target).status==='manual_clicked')return true;
      if(job.repeatSchema!==1||!['whodadoc','dtalks'].includes(job.site))return false;
      const reading=inspect({...job,due:Date.now()-1,deadline:Date.now()+10000},'inspect');
      if(reading.status!=='ready'||reading.targetMatched!==true||reading.entryControls!==1)return false;
      const nodes=[...document.querySelectorAll('a,button,[role="button"],input[type="button"],input[type="submit"]')].filter(e=>e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]')&&/^(?:(?:강의|실시간|라이브)?(?:입장|시청)(?:하기|하러가기)?|강의보기|라이브보기)$/.test(String(e.getAttribute('aria-label')||e.getAttribute('title')||e.value||e.innerText||e.textContent||'').replace(/\\s+/g,'')));
      const node=target?.nodeType===1?target:target?.parentElement;
      return nodes.length===1&&!!node&&(node===nodes[0]||nodes[0].contains(node)&&node.closest('a,button,[role="button"],input')===nodes[0]);
     };
     document.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      for(const job of state.jobs)try{if(manual(job,event.target)&&state.clicks.length<20)state.clicks.push(job.key);}catch{}
     },true);
    }
    return [];
   })()`;
   const code=`(()=>{const state=window.__doctorGleanManualObserver;if(!state)return null;const result=state.clicks.splice(0);state.jobs=${JSON.stringify(eligible)};return result;})()`;
   const keys=await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code}]);
   if(keys===null){await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:install}]);return;}
   if(closed||window.isDestroyed()||contents.getURL()!==url||boundGeneration!==generation||!Array.isArray(keys))return;
   if(site==='doctorville'&&surveyAllowed()&&Date.now()-lastSurvey>=15000){lastSurvey=Date.now();const raw=await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:`(${survey})('')`}]);if(!closed&&!window.isDestroyed()&&contents.getURL()===url&&boundGeneration===generation)onSurvey(url,raw);}
   for(const key of new Set(keys))if(typeof key==='string'&&eligible.some(job=>job.key===key))onClick(key);
  }catch{}finally{running=false;}
 };
 const timer=setInterval(tick,interval);timer.unref();const close=()=>{closed=true;clearInterval(timer);};window.once('closed',close);tick();return close;
}
