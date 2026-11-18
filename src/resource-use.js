// These counters have different boundaries. Native body bytes and browser
// encoded bytes are reported separately and are never added to estimate OS use.
import {readJson,atomicJson} from './atomic-json.js';
const KEYS=['apiRequests','apiBodyBytes','apiCompleted','apiFallbacks','pagesCreated','hiddenPagesCreated','mainFrameLoads','mediaGetBlocked','browserRequests','browserEncodedBytes','entryDispatches','entryWindowLifetimeMs','domReads','catalogResults','catalogComplete'];
const WEEK=7*86400000;
const empty=()=>({start:0,until:0,enabled:false,counts:Object.fromEntries(KEYS.map(k=>[k,0]))});
const valid=s=>s&&typeof s.enabled==='boolean'&&Number.isSafeInteger(s.start)&&s.start>=0&&Number.isSafeInteger(s.until)&&s.until>=s.start&&s.until-s.start<=WEEK&&s.counts&&KEYS.every(k=>Number.isSafeInteger(s.counts[k])&&s.counts[k]>=0);
export class UsageMeter {
 constructor(file,now=Date.now){
  this.file=file;this.now=now;this.state=empty();this.saved=0;
  try{if(file)this.state=readJson(file,this.state,valid);}catch{this.failed=true;}
 }
 save(){try{if(this.file)atomicJson(this.file,this.state);this.saved=this.now();return true;}catch{this.failed=true;this.state.enabled=false;return false;}}
 active(){
  if(!this.state.enabled||this.failed)return false;
  if(this.now()<this.state.start||this.now()>=this.state.until){this.state.enabled=false;this.save();return false;}
  return true;
 }
 change(action){
  if(action==='delete'){this.state=empty();this.failed=false;}
  else if(action==='start'&&!this.failed&&!this.active()){this.state={...empty(),enabled:true,start:this.now(),until:this.now()+WEEK};}
  else if(action==='stop')this.state.enabled=false;
  else return false;
  return this.save();
 }
 count(key,n){if(!this.active()||!KEYS.includes(key)||!Number.isSafeInteger(n)||n<0)return;this.state.counts[key]=Math.min(Number.MAX_SAFE_INTEGER,this.state.counts[key]+n);if(this.now()-this.saved>=5000)this.save();}
 view(){const enabled=this.active();return {enabled,start:this.state.start,until:this.state.until,scope:'native_api_and_observed_owned_chromium_pages',...Object.fromEntries(KEYS.map(k=>[k,this.state.counts[k]])),osNetworkBytes:null,fullNetworkMeasured:false,playbackDurationMs:null,playbackDurationMeasured:false,encodedBytesIncludeCacheAndCrossOriginLimits:true};}
}
let meter=new UsageMeter();
export function configureUsage(file){meter=new UsageMeter(file);return meter;}
const subscribers=new Set();
function publishUsage(){const enabled=meter.active();for(const notify of subscribers)notify(enabled);}
export function onUsageChange(notify){subscribers.add(notify);notify(meter.active());return ()=>subscribers.delete(notify);}
export function changeUsage(action){const changed=meter.change(action);if(changed)publishUsage();return changed;}
export function flushUsage(){if(meter.active())meter.save();}
export function resourceCount(key,value=1){const enabled=meter.state.enabled;meter.count(key,value);if(enabled&&!meter.state.enabled)publishUsage();}
export function resourceUse(){const enabled=meter.state.enabled,view=meter.view();if(enabled&&!view.enabled)publishUsage();return view;}
const pages=new WeakSet(),hidden=new WeakSet();
export function trackPage(contents,role){
 if(!pages.has(contents)){pages.add(contents);resourceCount('pagesCreated');contents.on('did-start-navigation',(event,_url,inPlace,main)=>{if((main??event.isMainFrame)&&!(inPlace??event.isInPlace))resourceCount('mainFrameLoads');});}
 if(role==='hidden'&&!hidden.has(contents)){hidden.add(contents);resourceCount('hiddenPagesCreated');}
}
