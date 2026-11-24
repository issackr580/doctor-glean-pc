import {ckdCatalog,docplePage,completeDocple,docpleAttendedToday} from './catalog-api.js';
import {resourceCount} from './resource-use.js';
import {boundedWork} from './async-work.js';
const CKD='https://www.ckdmediview.com/hcpapp/webinar/',DOC='https://docple-plus.com/api/season2/webinar/list';
const ATTENDANCE='https://docple-plus.com/api/season2/mission/attendance/calendar';
const ORIGINAL={ckd:CKD+'webinar.do',docple:'https://docple-plus.com/webinar?category=C01&mode=LIVE&sort=START_ASC'};
export class NativeCatalogRead{
 constructor({gate,sessionOwner,accountEpoch,profileEpoch,fetchImpl=globalThis.fetch,now=Date.now}){Object.assign(this,{gate,sessionOwner,accountEpoch,profileEpoch,fetchImpl,now});this.ckdAdmission=null;}
 admitCkd(admission){if(admission?.authenticated===true)this.ckdAdmission={...admission,profileEpoch:this.profileEpoch('ckd')};}
 async read(profile,date,signal,options){
  const site=profile.id;if(!Object.hasOwn(ORIGINAL,site)||profile.url!==ORIGINAL[site])return null;
  if(site==='ckd'){
   const admission=this.ckdAdmission;
   if(!admission||admission.date!==new Date(this.now()+32400000).toISOString().slice(0,10)||
      admission.accountEpoch!==this.accountEpoch(site)||admission.profileEpoch!==this.profileEpoch(site))return null;
  }
  return this.#read(site,signal,options,async(request,owner,valid)=>{
   if(site==='ckd'){
    const month=await request(CKD+'webinarCalAjax.do','POST',new URLSearchParams({r_month:date.slice(0,7)}).toString());
    const day=await request(CKD+'webinarCalDtlAjax.do','POST',new URLSearchParams({r_date:date}).toString());
    return ckdCatalog(month,day,date);
   }
   const token=await this.#docpleToken(owner,DOC,valid);
   const pages=[];
   for(let page=1;page<=20;page++){
    const query=new URLSearchParams({categoryCode:'C01',searchType:'ALL',displayMode:'LIVE',period:'ALL',sort:'DEFAULT',page:String(page),size:'6'});
    const result=docplePage(await request(DOC+'?'+query.toString(),'GET',undefined,token),date,pages[0]);pages.push(result);
    if(page>=Math.max(1,result.totalPages))return completeDocple(pages,date);
   }
   throw Error('page_limit');
  });
 }
 async readAttendance(date,signal,options){
  return this.#read('docple',signal,options,async(request,owner,valid)=>{
   const token=await this.#docpleToken(owner,ATTENDANCE,valid);
   const response=await request(ATTENDANCE,'GET',undefined,token);
   return {status:docpleAttendedToday(response,date)?'complete':'pending',reason:'docple_current_month_calendar'};
  });
 }
 async #docpleToken(owner,url,valid){
  const cookies=await owner.cookies.get({url});
  const values=[...new Set(cookies.filter(c=>['accessToken','check-accessToken'].includes(c.name)).map(c=>c.value))];
  if(values.length!==1||!/^[A-Za-z0-9._~-]{10,4096}$/.test(values[0])||!valid())throw Error('session_required');
  return values[0];
 }
 async #read(site,signal,{remainingMs=8000,current=()=>true}={},work){
  if(signal.aborted||!current())return {abandoned:true};
  if(this.gate&&!this.gate.allowed(site))return {restricted:true};
  const owner=this.sessionOwner(site),epoch=this.accountEpoch(site),generation=this.profileEpoch(site);
  const valid=()=>!signal.aborted&&current()&&this.accountEpoch(site)===epoch&&this.profileEpoch(site)===generation&&this.sessionOwner(site)===owner;
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});const budget=Math.min(8000,remainingMs);let bytes=0;
  const request=async(path,method='GET',body,token)=>{
   if(!valid()||this.gate&&!this.gate.allowed(site))throw Error('cancelled');resourceCount('apiRequests');
   // Node fetch has no browser/default cookie jar and does not persist
   // Set-Cookie. Only this exact profile's bearer is held for this request.
   const one=new AbortController(),cancel=()=>one.abort();controller.signal.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,Math.min(2000,budget));
   try{
    const response=await boundedWork(this.fetchImpl(path,{method,body,redirect:'manual',credentials:'omit',cache:'no-store',signal:one.signal,headers:{Accept:'application/json','Accept-Encoding':'identity',...(body?{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}:{}),...(token?{Authorization:'Bearer '+token}:{})}}),one.signal,Math.min(2000,budget));
    if(!valid()||controller.signal.aborted){response.body?.cancel().catch(()=>{});throw Error('cancelled');}
    if(this.gate?.observe(site,{url:path,status:response.status,retryAfter:response.headers.get('retry-after'),api:true})){
     response.body?.cancel().catch(()=>{});throw Error('site_wait');
    }
    if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')||!['','identity'].includes(response.headers.get('content-encoding')||'')||site==='docple'&&response.headers.has('set-cookie')){response.body?.cancel().catch(()=>{});throw Error('invalid_response');}
    const reader=response.body?.getReader();if(!reader)throw Error('invalid_response');const chunks=[];let size=0;
    try{for(;;){const chunk=await boundedWork(reader.read(),one.signal,Math.min(2000,budget));if(chunk.done)break;size+=chunk.value.byteLength;bytes+=chunk.value.byteLength;resourceCount('apiBodyBytes',chunk.value.byteLength);if(size>262144||bytes>1048576)throw Error('response_size');chunks.push(chunk.value);}}catch(error){reader.cancel().catch(()=>{});throw error;}
    if(this.gate&&!this.gate.allowed(site))throw Error('site_wait');if(!valid())throw Error('cancelled');return JSON.parse(Buffer.concat(chunks).toString('utf8'));
   }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);one.abort();}
  };
  try{
   if(!Number.isFinite(budget)||budget<=0)return null;
   const result=await boundedWork(work(request,owner,valid),controller.signal,budget);if(!valid())return {abandoned:true};
   if(this.gate&&!this.gate.allowed(site))return {restricted:true};
   resourceCount(result?'apiCompleted':'apiFallbacks');return result;
  }catch(error){if(error.message==='site_wait'||this.gate&&!this.gate.allowed(site))return {restricted:true};if(!valid())return {abandoned:true};resourceCount('apiFallbacks');return null;}
  finally{controller.abort();signal.removeEventListener('abort',abort);}
 }
}
