import {siteById,allowedNavigation} from './security.js';
import {entrySchedule,safeReason} from './automation-policy.js';
import {cleanReceipt} from './workflow-store.js';
import {kstDate,kstInstant} from './schedule.js';
import {waitFor} from './async-work.js';
const navigable=(site,raw)=>{try{const u=new URL(raw);return allowedNavigation(site,raw)&&!/(?:login|logout|regist|apply|enroll|payment|order|cart|token|auth|session|password|email|ticket|delete|withdraw)/i.test(decodeURIComponent(u.pathname+u.search));}catch{return false;}};
export class EntryRunner{
 constructor({ledger,store,createPage,isManualOpen=()=>false,onChange=()=>{},now=Date.now,sleep=waitFor}){Object.assign(this,{ledger,store,createPage,isManualOpen,onChange,now,sleep});this.active=null;}
 get busy(){return !!this.active;}
 cancel(){this.active?.controller.abort();this.active?.page?.close();}
 manualOpened(site){if(this.active?.job.site===site)this.cancel();}
 reserveCatalog(date,results){
  if(!this.store.features().entry||date!==kstDate(this.now()))return;
  const selected=this.store.entrySites(),existing=new Set(this.store.entries(date).map(row=>row.key));
  const hmpGroups=new Map();for(const row of Object.values(results))for(const event of row.events??[])if(event.site==='hmp'&&entrySchedule(event,this.now())){const ids=hmpGroups.get(event.time)??new Set();ids.add(this.store.entryKey(event));hmpGroups.set(event.time,ids);}
  for(const [site,result] of Object.entries(results)){
   if(!selected.includes(site)||result.stale||!['ok','review'].includes(result.status))continue;
   for(const event of result.events){
    const timing=entrySchedule(event,this.now()),key=this.store.entryKey(event);if(!timing||existing.has(key)||site==='hmp'&&hmpGroups.get(event.time)?.size!==1)continue;
    let slot=0;if(site==='hmp')while(slot<5&&this.now()>timing.start+slot*600000+90000)slot++;
    if(slot===5)continue;
    const due=site==='hmp'?timing.start+slot*600000:Math.max(timing.due,kstInstant(date,'00:00')),deadline=site==='hmp'?due+90000:timing.deadline;
    this.store.putEntry({key,site,date,time:event.time,title:event.title,start:timing.start,due,deadline,nextAt:due,status:'reserved',slot,retries:0,attempts:[],entryAttempted:false,prepAt:site==='hmp'?timing.start-600000:0});existing.add(key);
   }
  }
  this.onChange();
 }
 recover(){
  for(const job of this.store.entries())if(['attempting','running'].includes(job.status))this.#finish(job,{status:'unknown',reason:'unknown_result',attempted:job.entryAttempted===true});
 }
 due(now=this.now()){
  const jobs=this.store.entries().filter(job=>this.store.entrySites().includes(job.site)&&job.status==='reserved');
  for(const job of jobs)if(now>job.deadline){this.#finish(job,{status:'expired',reason:'expired',attempted:false});}
  return this.store.entries().filter(job=>this.store.entrySites().includes(job.site)&&job.status==='reserved'&&now>=(job.nextAt??job.due)&&now<=job.deadline).sort((a,b)=>a.deadline-b.deadline)[0]??null;
 }
 prepareDue(now=this.now()){
  return this.store.entries().find(job=>job.site==='hmp'&&job.status==='reserved'&&job.slot===0&&now>=job.prepAt&&now<job.start&&(job.prepNextAt??0)<=now)??null;
 }
 cancelJob(key,manual=false){const job=this.store.entries().find(row=>row.key===key);if(!job)return false;if(this.active?.job.key===key)this.cancel();this.store.updateEntry(key,{status:manual?'manual_clicked':'cancelled',nextAt:0,receipt:cleanReceipt({status:manual?'manual_clicked':'cancelled',reason:manual?'manual_clicked':'cancelled'})});this.onChange();return true;}
 retryJob(key){
  const job=this.store.entries().find(row=>row.key===key);if(!job||job.entryAttempted||['clicked','manual_clicked','cancelled','lecture_ended'].includes(job.status)||this.now()>job.deadline)return false;
  this.store.updateEntry(key,{status:'reserved',nextAt:Math.max(job.due,this.now()),retries:0});this.onChange();return true;
 }
 #finish(job,raw){
  const current=this.store.entries(job.date).find(row=>row.key===job.key);if(current&&['cancelled','manual_clicked'].includes(current.status))return;
  const now=this.now(),receipt=cleanReceipt({...raw,slot:job.slot,due:job.due},now),attempts=[...(job.attempts??[]),receipt].slice(-5);
  if(job.site==='hmp'&&!['lecture_ended','manual_clicked','cancelled','blocked','login','ambiguous'].includes(receipt.status)){
   let next=job.slot+1;while(next<5&&job.start+next*600000<now)next++;
   if(next<5){const due=job.start+next*600000;this.store.updateEntry(job.key,{status:'reserved',slot:next,due,deadline:due+90000,nextAt:due,attempts,receipt,retries:0,entryAttempted:false});this.onChange();return;}
  }
  this.store.updateEntry(job.key,{status:receipt.status,receipt,attempts,nextAt:0,entryAttempted:raw.attempted===true||job.entryAttempted===true});this.onChange();
 }
 #unexecuted(job,receipt){
  const now=this.now();
  if(job.site!=='hmp'&&['not_open','button_missing','target_missing','network','busy'].includes(receipt.status)&&job.retries<4){
   const nextAt=job.site==='doctorville'&&now<job.start-300000?job.start-300000:now+120000;
   if(nextAt<=job.deadline){this.store.updateEntry(job.key,{status:'reserved',nextAt,retries:job.retries+1,receipt:cleanReceipt({...receipt,retryCount:job.retries+1}),entryAttempted:false});this.onChange();return;}
  }
  this.#finish(job,{...receipt,attempted:false});
 }
 async run(job,{prepare=false}={}){
  if(this.active)return false;
  const controller=new AbortController(),run={job,controller,page:null};this.active=run;const began=this.now();let ticket=null,dispatched=false,started=false,receipt={status:'unknown',reason:'unknown_result'};
  const allowed=()=>!controller.signal.aborted&&!this.ledger.snapshot().paused&&this.store.features().entry&&job.date===kstDate(this.now())&&!this.store.failed;
  const nativeJob=()=>({...job,due:prepare?job.prepAt:job.due,deadline:prepare?job.start-1:job.deadline,...(job.site==='hmp'?{hmpRepeatSchema:1,hmpSlot:job.slot}:{})});
  try{
   if(!allowed())return false;
   started=true;
   if(this.isManualOpen(job.site)){receipt={status:'busy',reason:'manual_view_open'};return false;}
   if(!prepare)this.store.updateEntry(job.key,{status:'running'});
   run.page=await this.createPage(job.site,controller.signal);const page=run.page;await page.load(siteById(job.site).url);let navigations=0,detailOpened=false;
   while(allowed()&&this.now()-began<45000&&(prepare?this.now()<job.start:this.now()<=job.deadline)){
    if(['login','provider'].includes(page.route)){receipt={status:'login',reason:'login_required'};break;}
    const reply=await page.call('auto-entry.js',[{...nativeJob(),detailOpened},'inspect']);receipt={...reply,reason:safeReason(reply.reason)};
    if(prepare)break;
    if(reply.status==='navigate'){
     if(++navigations>3||!navigable(job.site,reply.url)){receipt={status:'blocked',reason:'policy_rejected'};break;}await page.load(reply.url);continue;
    }
    if(reply.status==='open_target'){
     if(detailOpened){receipt={status:'button_missing',reason:'no_target'};break;}
     await page.call('auto-entry.js',[{...nativeJob(),detailOpened:false},'open_target'],{navigation:true});detailOpened=true;await this.sleep(600,controller.signal);continue;
    }
    if(reply.status==='ready'){
     if(reply.targetMatched!==true){receipt={status:'ambiguous',reason:'no_target'};break;}
     const input={site:job.site,kind:'entry',date:job.date,target:job.key,slot:job.slot,dueAt:job.due,deadline:job.deadline};
     ticket=this.ledger.reserve(input,this.now());if(!ticket||!allowed()||!this.ledger.beginDispatch(ticket,this.now())){receipt={status:'unknown',reason:'duplicate_prevented'};break;}
     this.store.updateEntry(job.key,{status:'attempting',entryAttempted:true});page.allowPopups(true);const before=page.version;dispatched=true;
     const executed=await page.call('auto-entry.js',[nativeJob(),'click'],{navigation:true});
     receipt={...reply,status:executed.status==='clicked'?'clicked':'unknown',reason:executed.status==='clicked'?'clicked':'navigation_unconfirmed',attempted:true};
     await this.sleep(800,controller.signal);receipt.navigationObserved=page.version!==before&&allowedNavigation(job.site,page.url);
     if(job.site==='hmp'){
      receipt.playback='navigation_unconfirmed';
      if(receipt.navigationObserved){const playback=await page.call('auto-entry.js',[nativeJob(),'playback_start']);receipt.playback=playback.status;await this.sleep(1200,controller.signal);receipt.playback=(await page.call('auto-entry.js',[nativeJob(),'playback_probe'])).status;}
     }
     break;
    }
    if(['login','blocked','ambiguous','invalid','lecture_ended','not_registered'].includes(reply.status))break;
    if(this.now()-began>=8000)break;await this.sleep(900,controller.signal);
   }
  }catch(error){receipt={status:dispatched?'unknown':controller.signal.aborted?'cancelled':'network',reason:safeReason(controller.signal.aborted?'cancelled':error.code??error.message),attempted:dispatched};}
  finally{
   try{if(ticket&&dispatched)this.ledger.finish(ticket,'unknown',this.now());
   if(started){if(prepare){this.store.updateEntry(job.key,{prepNextAt:Math.min(job.start,this.now()+60000),receipt:cleanReceipt(receipt)});if(receipt.status==='lecture_ended')this.#finish(job,receipt);}
   else if(dispatched)this.#finish(job,{...receipt,attempted:true,elapsedMs:Math.max(0,this.now()-began)});
   else this.#unexecuted(job,{...receipt,elapsedMs:Math.max(0,this.now()-began)});}}
   finally{run.page?.close();this.active=null;this.onChange();}
  }
  return true;
 }
}
