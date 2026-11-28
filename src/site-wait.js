import {MEDIGATE_COUNTER_ORIGIN,MEDIGATE_COUNTER_PATH} from './medigate-counter.js';
// Only the single-instance Electron main process owns this store. Workers
// observe responses here synchronously before another request is admitted.
import {existsSync,unlinkSync} from 'node:fs';
import {atomicJson,readJson} from './atomic-json.js';
import {siteById,allowedNavigation} from './security.js';
import {doctorvilleSurveyId} from './survey-policy.js';

const integer=n=>Number.isSafeInteger(n)&&n>=0;
const max=Number.MAX_SAFE_INTEGER;
const docpleApiSources=new Map([
 ['/api/season2/webinar/list','catalog_api'],
 ['/api/season2/mission/attendance/calendar','attendance_api']
]);
const responseSources=new Set(['login_document','document','frame','catalog_api','attendance_api','site_api']);
const responseContexts=new Set(['manual_browser','background_browser','native_read']);
const requestMethods=new Set(['GET','POST','HEAD']);
function valid(data){
 return data?.version===1&&integer(data.observedAt)&&data.sites&&typeof data.sites==='object'&&!Array.isArray(data.sites)&&Object.entries(data.sites).every(([id,row])=>
  siteById(id)&&row&&integer(row.at)&&integer(row.until)&&integer(row.revision)&&typeof row.manual==='boolean'&&row.at<=data.observedAt&&
  (row.source===undefined||responseSources.has(row.source))&&(row.context===undefined||responseContexts.has(row.context))&&(row.method===undefined||requestMethods.has(row.method)));
}
export function waitUntil(value,now,fallback){
 const header=typeof value==='string'?value.trim():'';
 if(/^\d+$/.test(header))return Math.min(max,now+Number(header)*1000);
 if(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{2} [A-Z][a-z]{2} \d{4} \d\d:\d\d:\d\d GMT$/.test(header)){
  const at=Date.parse(header);
  if(Number.isFinite(at)&&new Date(at).toUTCString()===header)return Math.max(now,at);
 }
 return now+fallback;
}
export class SiteWait{
 constructor(file,{now=Date.now,write=atomicJson}={}){
  Object.assign(this,{file,now,write});this.marker=file+'.pending';this.failed=existsSync(this.marker);
  try{this.data=readJson(file,{version:1,observedAt:0,sites:{}},valid);}catch{this.failed=true;}
  this.high=this.data?.observedAt??0;
 }
 status(site){return this.data&&Object.hasOwn(this.data.sites,site)?{...this.data.sites[site]}:null;}
 clockTrusted(at){
  if(this.failed||!integer(at))return false;
  if(at>=this.high)return true;
  if(this.high>this.data.observedAt)this.persist({...this.data,observedAt:this.high});
  return false;
 }
 allowed(site){
  const at=this.now();if(!this.clockTrusted(at))return false;
  this.high=at;const row=this.status(site);return !row||(!row.manual&&at>=row.until);
 }
 save(site,row){
  return this.persist({version:1,observedAt:row.at,sites:{...this.data.sites,[site]:row}});
 }
 persist(next){
  try{atomicJson(this.marker,{pending:true});this.write(this.file,next);unlinkSync(this.marker);this.data=next;this.high=next.observedAt;}
  catch{this.failed=true;return false;}return true;
 }
 observe(site,{url,status,retryAfter,resourceType,document=false,api=false,context,method}){
  const provider=siteById(site);let address;try{address=new URL(url);}catch{return false;}
  if(!provider||address.protocol!=='https:'||address.port||address.username||address.password||!(allowedNavigation(site,url)||site==='doctorville'&&doctorvilleSurveyId(url)||site==='keymedi'&&address.hostname==='api.keymedi.com'||site==='medigate'&&address.origin===MEDIGATE_COUNTER_ORIGIN&&address.pathname===MEDIGATE_COUNTER_PATH))return false;
  if(!(document||api||['mainFrame','subFrame'].includes(resourceType))||![403,429,503].includes(status))return false;
  const login=provider.loginUrl&&new URL(provider.loginUrl);
  const source=resourceType==='subFrame'?'frame':document||resourceType==='mainFrame'?
   (login&&address.origin===login.origin&&address.pathname===login.pathname&&(!login.search||address.search===login.search)?'login_document':'document'):
   (site==='docple'&&docpleApiSources.get(address.pathname)||'site_api');
  const observation={source,context:responseContexts.has(context)?context:undefined,method:requestMethods.has(method)?method:undefined};
  const at=this.now();if(!this.clockTrusted(at)){
   // A restriction received during rollback is timed from the last trusted instant.
   if(!this.failed&&integer(this.high))return this.observeAt(site,status,retryAfter,this.high,observation);
   return true;
  }
  return this.observeAt(site,status,retryAfter,at,observation);
 }
 observeAt(site,status,retryAfter,at,observation){
  const old=this.status(site);
  this.save(site,{at,revision:(old?.revision??0)+1,status,...observation,manual:status===403||old?.manual===true,
   until:Math.max(old?.until??0,status===403?0:waitUntil(retryAfter,at,status===429?300000:60000))});return true;
 }
 acknowledge(site,at,revision){
  const old=this.status(site),now=this.now();
  if(!this.clockTrusted(now)||!old?.manual||old.at!==at||old.revision!==revision)return false;
  return this.save(site,{...old,at:now,revision:revision+1,manual:false});
 }
}

// Capture the account and the operation at creation. Requests from a previous
// worker may finish, but cannot change the restriction of its successor.
export function workerWait(gate,site,signal,epoch){
 const initial=epoch(),revision=gate.status(site)?.revision??0;let stopped=false;
 const current=()=>!signal.aborted&&epoch()===initial;
 if(!current()||!gate.allowed(site))throw Error('site_wait');
 return {
  allowed:()=>!stopped&&current()&&(gate.status(site)?.revision??0)===revision&&gate.allowed(site),
  response(details){
   if(!current()||details.fromCache)return;
   if(observeSiteResponse(gate,site,details,'background_browser'))stopped=true;
  }
 };
}

export function observeSiteResponse(gate,site,details,context){
 if(details.fromCache)return false;
 const retry=Object.entries(details.responseHeaders??{}).find(([name])=>name.toLowerCase()==='retry-after')?.[1];
 const pathname=new URL(details.url).pathname;
 // A first-party data read may also carry an explicit Retry-After outside
 // the native API allowlist. This grants no permission to call that route.
 const directedRead=['xhr','fetch'].includes(details.resourceType)&&[429,503].includes(details.statusCode)&&!!retry&&!/\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|woff2?|mp[34])$|\/(?:ad[s]?|advertising|analytics|static|assets)\//i.test(pathname);
 const api=directedRead||site==='medigate'&&details.url.split('?')[0]===MEDIGATE_COUNTER_ORIGIN+MEDIGATE_COUNTER_PATH||site==='keymedi'&&details.url==='https://api.keymedi.com/api/drlounge/getMainInfo'||site==='docple'&&docpleApiSources.has(pathname)||site==='ckd'&&['/hcpapp/webinar/webinarCalAjax.do','/hcpapp/webinar/webinarCalDtlAjax.do'].includes(pathname);
 return gate.observe(site,{url:details.url,status:details.statusCode,retryAfter:Array.isArray(retry)?retry[0]:retry,resourceType:details.resourceType,api,context,method:details.method});
}
