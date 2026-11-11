import {readFileSync} from 'node:fs';
import {allowedNavigation} from './security.js';
import {pcEntrySource} from './entry-page.js';
import {officialIdentity} from './entry-identity.js';
import {randomUUID} from 'node:crypto';
const survey=readFileSync(new URL('../vendor/automation/doctorville-survey.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('../vendor/automation/auto-entry.js',import.meta.url),'utf8');
const identityEngine=readFileSync(new URL('../vendor/identity/auto-entry.js',import.meta.url),'utf8');
// This isolated world has no preload, IPC or Node. The website cannot write its
// click queue. Only trusted user input is inspected, using the original engine.
const WORLD=1001;
export function watchManualEntry(window,site,{jobs,onClick,onSurvey=()=>{},surveyAllowed=()=>false,interval=700}){
 let running=false,closed=false,generation=0,lastSurvey=0;
 const contents=window.webContents,debuggerWire=contents.debugger,token=randomUUID().replaceAll('-',''),binding='__doctorGleanManualNotify',contexts=new Set(),candidates=new Set(),seen=new Set();let ownDebugger=false,mainFrame='';
 const report=(item,tag)=>{
  if(closed||window.isDestroyed()||!item||!Number.isSafeInteger(item.sequence)||item.sequence<1||item.sequence>1000000||typeof tag!=='string'||!/^[a-f0-9]{32}$/.test(tag)||typeof item.key!=='string'||!/^[a-f0-9]{64}$/.test(item.key))return;
  const id=tag+':'+item.sequence;if(seen.has(id)||!jobs().some(job=>job.site===site&&job.key===item.key&&!['manual_clicked','cancelled','lecture_ended','expired'].includes(job.status)))return;
  seen.add(id);if(seen.size>128)seen.delete(seen.values().next().value);onClick(item.key);
 };
 const messages=(_event,method,params)=>{
  if(closed)return;
  if(method==='Runtime.executionContextCreated'){const c=params.context;if(c?.auxData?.isDefault===false&&c.auxData.frameId===mainFrame&&candidates.size<16)candidates.add(c.id);}
  else if(method==='Runtime.executionContextDestroyed'){contexts.delete(params.executionContextId);candidates.delete(params.executionContextId);}
  else if(method==='Runtime.executionContextsCleared'){contexts.clear();candidates.clear();}
  else if(method==='Runtime.bindingCalled'&&params.name===binding&&contexts.has(params.executionContextId)&&typeof params.payload==='string'&&params.payload.length<=300){
   try{const value=JSON.parse(params.payload);if(value.token===token)report(value,value.tag);}catch{}
  }
 };
 // A notification in this isolated main-frame world survives immediate
 // navigation. It conveys a trusted-click observation only: no URL, command,
 // credential, submission, or remote Node/IPC API is exposed. Polling remains
 // a fallback when a debugger is unavailable.
 const wire=(async()=>{try{
  if(!debuggerWire.isAttached()){debuggerWire.attach('1.3');ownDebugger=true;}
  debuggerWire.on('message',messages);
  mainFrame=(await debuggerWire.sendCommand('Page.getFrameTree')).frameTree.frame.id;
  await debuggerWire.sendCommand('Runtime.enable');
 }catch{}})();
 const bind=async()=>{for(const id of candidates)if(!contexts.has(id)&&!closed)try{
  const value=await debuggerWire.sendCommand('Runtime.evaluate',{expression:'globalThis.__doctorGleanManualObserver?.token',contextId:id,returnByValue:true});
  if(value.result?.value!==token)continue;
  await debuggerWire.sendCommand('Runtime.addBinding',{name:binding,executionContextId:id});if(!closed)contexts.add(id);
 }catch{}};
 const navigated=()=>{generation++;};contents.on('did-start-navigation',navigated);
 const tick=async()=>{
  if(closed||running||window.isDestroyed())return;const contents=window.webContents,url=contents.getURL();
  if(contents.isLoadingMainFrame()||!allowedNavigation(site,url))return;
  running=true;const boundGeneration=generation;
  try{
   await wire;if(closed||window.isDestroyed())return;
   const eligible=jobs().filter(job=>job.site===site&&!['manual_clicked','cancelled','lecture_ended','expired'].includes(job.status)).map(job=>({...job,...(officialIdentity(job)?{lectureIdentity:officialIdentity(job)}:{}),...(site==='hmp'?{hmpRepeatSchema:1,hmpSlot:job.slot}:job.repeatSchema===1?{repeatSlot:job.slot}:{})}));
   const install=`(()=>{
    const name='__doctorGleanManualObserver';let state=window[name];
    if(!state){state={jobs:${JSON.stringify(eligible)},clicks:[],sequence:0,tag:${JSON.stringify(randomUUID().replaceAll('-',''))},token:${JSON.stringify(token)}};window[name]=state;const legacy=${engine},official=${identityEngine},pc=${pcEntrySource()};const inspect=(job,mode,target)=>job.lectureIdentity?(mode==='manual_click'&&['doctorville','keymedi','medigate','hmp'].includes(job.site)?pc(job,mode,target):official(job,mode,target)):legacy(job,mode,target);
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
      for(const job of state.jobs)try{if(manual(job,event.target)&&state.clicks.length<20){const click={key:job.key,sequence:++state.sequence};state.clicks.push(click);try{globalThis.${binding}(JSON.stringify({...click,tag:state.tag,token:state.token}));}catch{}}}catch{}
     },true);
    }
    return [];
   })()`;
   const code=`(()=>{const state=window.__doctorGleanManualObserver;if(!state)return null;const result={clicks:state.clicks.splice(0),tag:state.tag};state.jobs=${JSON.stringify(eligible)};state.token=${JSON.stringify(token)};return result;})()`;
   const result=await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code}]);
   if(result===null){await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:install}]);await bind();return;}
   await bind();
   if(closed||window.isDestroyed()||contents.getURL()!==url||boundGeneration!==generation||!Array.isArray(result?.clicks))return;
   if(site==='doctorville'&&surveyAllowed()&&Date.now()-lastSurvey>=15000){lastSurvey=Date.now();const raw=await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:`(${survey})('')`}]);if(!closed&&!window.isDestroyed()&&contents.getURL()===url&&boundGeneration===generation)onSurvey(url,raw);}
   for(const item of result.clicks)report(item,result.tag);
  }catch{}finally{running=false;if(!closed&&boundGeneration!==generation)queueMicrotask(()=>tick());}
 };
 const loaded=()=>tick();contents.on('did-finish-load',loaded);
 const timer=setInterval(tick,interval);timer.unref();const close=()=>{closed=true;clearInterval(timer);contents.removeListener('did-start-navigation',navigated);contents.removeListener('did-finish-load',loaded);debuggerWire.removeListener('message',messages);contexts.clear();candidates.clear();if(ownDebugger&&!contents.isDestroyed()&&debuggerWire.isAttached())try{debuggerWire.detach();}catch{}};window.once('closed',close);tick();return close;
}
