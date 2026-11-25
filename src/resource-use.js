// These counters have different boundaries. Native body bytes and browser
// encoded bytes are reported separately and are never added to estimate OS use.
import {readJson,atomicJson} from './atomic-json.js';
const KEYS=['apiRequests','apiBodyBytes','apiCompleted','apiFallbacks','pagesCreated','hiddenPagesCreated','mainFrameLoads','mediaGetBlocked','browserRequests','browserEncodedBytes','entryDispatches','entryWindowLifetimeMs','domReads','catalogResults','catalogComplete'];
const SURVEY_PHASES=['survey','survey_reminder'];
const SURVEY_KEYS=['attempts','mainFrameLoads','redirects','domReads','browserRequests','browserEncodedBytes','byteSamples','notifications','open','complete','closed','unknown'];
const WEEK=7*86400000;
const zero=keys=>Object.fromEntries(keys.map(key=>[key,0]));
const empty=()=>({start:0,until:0,enabled:false,counts:Object.fromEntries(KEYS.map(k=>[k,0]))});
const countsValid=(counts,keys)=>counts&&keys.every(key=>Number.isSafeInteger(counts[key])&&counts[key]>=0);
const versionValid=value=>/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value);
const valid=s=>s&&typeof s.enabled==='boolean'&&Number.isSafeInteger(s.start)&&s.start>=0&&Number.isSafeInteger(s.until)&&s.until>=s.start&&s.until-s.start<=WEEK&&countsValid(s.counts,KEYS)&&
 (s.surveys===undefined||s.surveys&&typeof s.surveys==='object'&&!Array.isArray(s.surveys)&&Object.entries(s.surveys).every(([version,phases])=>versionValid(version)&&phases&&SURVEY_PHASES.every(phase=>countsValid(phases[phase],SURVEY_KEYS))));
export class UsageMeter {
 constructor(file,now=Date.now,version='0.0.0'){
  this.file=file;this.now=now;this.version=version;this.state=empty();this.saved=0;
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
 count(key,n,phase){
  if(!this.active()||!Number.isSafeInteger(n)||n<0)return;
  const general=KEYS.includes(key),survey=SURVEY_PHASES.includes(phase)&&SURVEY_KEYS.includes(key);
  if(general&&!(survey&&key==='domReads'))this.state.counts[key]=Math.min(Number.MAX_SAFE_INTEGER,this.state.counts[key]+n);
  if(survey){
   this.state.surveys??={};
   this.state.surveys[this.version]??=Object.fromEntries(SURVEY_PHASES.map(name=>[name,zero(SURVEY_KEYS)]));
   const counters=this.state.surveys[this.version][phase];counters[key]=Math.min(Number.MAX_SAFE_INTEGER,counters[key]+n);
  }
  if((general||survey)&&this.now()-this.saved>=5000)this.save();
 }
 view(){
  const enabled=this.active(),surveys=[];
  for(const [appVersion,phases] of Object.entries(this.state.surveys??{}))for(const phase of SURVEY_PHASES){
   const {browserEncodedBytes,byteSamples,...counts}=phases[phase];
   surveys.push({site:'doctorville',phase,appVersion,...counts,browserEncodedBytes:byteSamples?browserEncodedBytes:null,byteSamples,apiBodyBytes:null,processEstimatedBytes:null});
  }
  return {enabled,start:this.state.start,until:this.state.until,scope:'native_api_and_observed_owned_chromium_pages',...Object.fromEntries(KEYS.map(k=>[k,this.state.counts[k]])),surveys,osNetworkBytes:null,fullNetworkMeasured:false,playbackDurationMs:null,playbackDurationMeasured:false,encodedBytesIncludeCacheAndCrossOriginLimits:true};
 }
}
let meter=new UsageMeter();
export function configureUsage(file,version){meter=new UsageMeter(file,Date.now,version);return meter;}
const subscribers=new Set();
function publishUsage(){const enabled=meter.active();for(const notify of subscribers)notify(enabled);}
export function onUsageChange(notify){subscribers.add(notify);notify(meter.active());return ()=>subscribers.delete(notify);}
export function changeUsage(action){const changed=meter.change(action);if(changed)publishUsage();return changed;}
export function flushUsage(){if(meter.active())meter.save();}
export function resourceCount(key,value=1,phase){const enabled=meter.state.enabled;meter.count(key,value,phase);if(enabled&&!meter.state.enabled)publishUsage();}
export function resourceUse(){const enabled=meter.state.enabled,view=meter.view();if(enabled&&!view.enabled)publishUsage();return view;}
const pages=new WeakSet(),hidden=new WeakSet(),surveyRoles=new WeakMap();
export function trackPage(contents,role,phase){
 if(phase)surveyRoles.set(contents,phase);
 if(!pages.has(contents)){pages.add(contents);resourceCount('pagesCreated');contents.on('did-start-navigation',(event,_url,inPlace,main)=>{if((main??event.isMainFrame)&&!(inPlace??event.isInPlace))resourceCount('mainFrameLoads',1,surveyRoles.get(contents));});}
 if(role==='hidden'&&!hidden.has(contents)){hidden.add(contents);resourceCount('hiddenPagesCreated');}
}
