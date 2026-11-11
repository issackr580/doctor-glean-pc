import {ckdCatalog,docplePage,completeDocple} from './catalog-api.js';
import {resourceCount} from './resource-use.js';
import {boundedWork} from './async-work.js';
const CKD='https://www.ckdmediview.com/hcpapp/webinar/',DOC='https://docple-plus.com/api/season2/webinar/list';
const ORIGINAL={ckd:CKD+'webinar.do',docple:'https://docple-plus.com/webinar?category=C01&mode=LIVE&sort=START_ASC'};
export class NativeCatalogRead{
 constructor({sessionOwner,accountEpoch,profileEpoch,fetchImpl=globalThis.fetch,now=Date.now}){Object.assign(this,{sessionOwner,accountEpoch,profileEpoch,fetchImpl,now});this.ckdAdmission=null;}
 admitCkd(admission){if(admission?.authenticated===true)this.ckdAdmission={...admission,profileEpoch:this.profileEpoch('ckd')};}
 async read(profile,date,signal,{remainingMs=8000,current=()=>true}={}){
  const site=profile.id;if(!Object.hasOwn(ORIGINAL,site)||profile.url!==ORIGINAL[site])return null;
  const epoch=this.accountEpoch(site),generation=this.profileEpoch(site),owner=this.sessionOwner(site),admission=this.ckdAdmission;
  const valid=()=>!signal.aborted&&current()&&this.accountEpoch(site)===epoch&&this.profileEpoch(site)===generation&&this.sessionOwner(site)===owner;
  if(!valid()||site==='ckd'&&(!admission||admission.date!==new Date(this.now()+32400000).toISOString().slice(0,10)||admission.accountEpoch!==epoch||admission.profileEpoch!==generation))return null;
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});const budget=Math.min(8000,remainingMs);let bytes=0;
  const request=async(path,method='GET',body,token)=>{
   if(!valid())throw Error('cancelled');resourceCount('apiRequests');
   // Node fetch has no browser/default cookie jar and does not persist
   // Set-Cookie. Only this exact profile's bearer is held for this request.
   const one=new AbortController(),cancel=()=>one.abort();controller.signal.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,Math.min(2000,budget));
   try{
    const response=await boundedWork(this.fetchImpl(path,{method,body,redirect:'manual',credentials:'omit',signal:one.signal,headers:{Accept:'application/json','Accept-Encoding':'identity',...(body?{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}:{}),...(token?{Authorization:'Bearer '+token}:{})}}),one.signal,Math.min(2000,budget));
    if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')||!['','identity'].includes(response.headers.get('content-encoding')||'')||site==='docple'&&response.headers.has('set-cookie')){response.body?.cancel().catch(()=>{});throw Error('invalid_response');}
    const reader=response.body?.getReader();if(!reader)throw Error('invalid_response');const chunks=[];let size=0;
    try{for(;;){const chunk=await boundedWork(reader.read(),one.signal,Math.min(2000,budget));if(chunk.done)break;size+=chunk.value.byteLength;bytes+=chunk.value.byteLength;resourceCount('apiBodyBytes',chunk.value.byteLength);if(size>262144||bytes>1048576)throw Error('response_size');chunks.push(chunk.value);}}catch(error){reader.cancel().catch(()=>{});throw error;}
    if(!valid())throw Error('cancelled');return JSON.parse(Buffer.concat(chunks).toString('utf8'));
   }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);one.abort();}
  };
  try{
   const work=async()=>{
    if(site==='ckd'){
     const month=await request(CKD+'webinarCalAjax.do','POST',new URLSearchParams({r_month:date.slice(0,7)}).toString());
     const day=await request(CKD+'webinarCalDtlAjax.do','POST',new URLSearchParams({r_date:date}).toString());return ckdCatalog(month,day,date);
    }
    const cookies=await owner.cookies.get({url:DOC}),values=[...new Set(cookies.filter(c=>['accessToken','check-accessToken'].includes(c.name)).map(c=>c.value))];
    if(values.length!==1||!/^[A-Za-z0-9._~-]{10,4096}$/.test(values[0])||!valid())throw Error('session_required');
    const pages=[];for(let page=1;page<=20;page++){
     const query=new URLSearchParams({categoryCode:'C01',searchType:'ALL',displayMode:'LIVE',period:'ALL',sort:'DEFAULT',page:String(page),size:'6'});
     const result=docplePage(await request(DOC+'?'+query.toString(),'GET',undefined,values[0]),date,pages[0]);pages.push(result);
     if(page>=Math.max(1,result.totalPages))return completeDocple(pages,date);
    }throw Error('page_limit');
   };
   if(!Number.isFinite(budget)||budget<=0)return null;
   const result=await boundedWork(work(),controller.signal,budget);if(!valid())return {abandoned:true};resourceCount('apiCompleted');return result;
  }catch{if(!valid())return {abandoned:true};resourceCount('apiFallbacks');return null;}
  finally{controller.abort();signal.removeEventListener('abort',abort);}
 }
}
