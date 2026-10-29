import {siteById,allowedNavigation} from './security.js';
import {entrySchedule,safeReason,doctorvilleDetailNavigation} from './automation-policy.js';
import {cleanReceipt,cleanEntryInspection} from './workflow-store.js';
import {kstDate,kstInstant} from './schedule.js';
import {waitFor} from './async-work.js';
import {randomUUID} from 'node:crypto';
import {BUILD_INFO,executionEvent} from './build-info.js';
const navigable=(site,raw)=>{try{const u=new URL(raw);return allowedNavigation(site,raw)&&!/(?:login|logout|regist|apply|enroll|payment|order|cart|token|auth|session|password|email|ticket|delete|withdraw)/i.test(decodeURIComponent(u.pathname+u.search));}catch{return false;}};
export class EntryRunner{
 constructor({ledger,store,createPage,createInspectionPage,isManualOpen=()=>false,onChange=()=>{},onEvent=()=>{},now=Date.now,sleep=waitFor,traceEntry=()=>({}),observeEntry=()=>{}}){Object.assign(this,{ledger,store,createPage,createInspectionPage,isManualOpen,onChange,onEvent,now,sleep,traceEntry,observeEntry});this.active=null;}
 #trace(job,kind){let trace;try{trace=this.traceEntry(job,kind);}catch{}return {event:(...args)=>{try{trace?.event?.(...args);}catch{}},finish:(...args)=>{try{trace?.finish?.(...args);}catch{}}};}
 #observe(job,phase,detail){try{this.observeEntry(job,phase,detail);}catch{}}
 emit(phase,job,detail={}){executionEvent(this.onEvent,{area:'automation',phase,kind:'entry',site:job.site,key:job.key,slot:job.slot,due:job.due,...detail});}
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
    this.emit('scheduled',{key,site,slot,due},{status:'reserved'});
    this.#observe(this.store.entries(date).find(row=>row.key===key),'reservation_observed',{status:'reserved'});
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
 cancelJob(key,manual=false){const job=this.store.entries().find(row=>row.key===key);if(!job)return false;if(this.active?.job.key===key)this.cancel();this.store.updateEntry(key,{status:manual?'manual_clicked':'cancelled',nextAt:0,receipt:cleanReceipt({status:manual?'manual_clicked':'cancelled',reason:manual?'manual_clicked':'cancelled'})});this.#observe(job,'state_observed',{status:manual?'manual_clicked':'cancelled'});this.onChange();return true;}
 retryJob(key){
  const job=this.store.entries().find(row=>row.key===key);if(!job||job.entryAttempted||['clicked','manual_clicked','cancelled','lecture_ended'].includes(job.status)||this.now()>job.deadline)return false;
  this.store.updateEntry(key,{status:'reserved',nextAt:Math.max(job.due,this.now()),retries:0});this.onChange();return true;
 }
 registrationConfirmed(target){
  const job=this.store.entries(target.date).find(row=>row.site===target.site&&row.date===target.date&&row.time===target.time&&row.title.replace(/\s+/g,' ').trim()===target.title.replace(/\s+/g,' ').trim());
  if(!job||job.date!==kstDate(this.now())||!this.store.features().entry||!this.store.entrySites().includes(job.site)||job.status!=='not_registered'||job.entryAttempted||this.now()>job.deadline)return false;
  const input={site:job.site,kind:'entry',date:job.date,target:job.key,slot:job.slot,dueAt:job.due,deadline:job.deadline};if(this.ledger.consumed(input))return false;
  return this.retryJob(job.key);
 }
 #finish(job,raw){
  const current=this.store.entries(job.date).find(row=>row.key===job.key);if(current&&['cancelled','manual_clicked'].includes(current.status))return;
  const now=this.now(),receipt=cleanReceipt({...raw,slot:job.slot,due:job.due},now),attempts=[...(job.attempts??[]),receipt].slice(-5);
  if(job.site==='hmp'&&!['lecture_ended','manual_clicked','cancelled','blocked','login','ambiguous'].includes(receipt.status)){
   let next=job.slot+1;while(next<5&&job.start+next*600000<now)next++;
   if(next<5){const due=job.start+next*600000;this.store.updateEntry(job.key,{status:'reserved',slot:next,due,deadline:due+90000,nextAt:due,attempts,receipt,executionFinishedAt:receipt.checkedAt,retries:0,entryAttempted:false});this.onChange();return;}
  }
  this.store.updateEntry(job.key,{status:receipt.status,receipt,attempts,executionFinishedAt:receipt.checkedAt,nextAt:0,entryAttempted:raw.attempted===true||job.entryAttempted===true});this.onChange();
 }
 #unexecuted(job,receipt){
  const now=this.now();
  if(job.site!=='hmp'&&['not_open','button_missing','target_missing','network','busy'].includes(receipt.status)&&job.retries<4){
   const nextAt=job.site==='doctorville'&&now<job.start-300000?job.start-300000:now+120000;
    if(nextAt<=job.deadline){const checked=cleanReceipt({...receipt,retryCount:job.retries+1},this.now());this.store.updateEntry(job.key,{status:'reserved',nextAt,retries:job.retries+1,receipt:checked,executionFinishedAt:checked.checkedAt,attempts:[...(job.attempts??[]),checked].slice(-5),entryAttempted:false});this.emit('retry',job,checked);this.#observe(job,'retry_scheduled',{status:'reserved',retryCount:job.retries+1});this.onChange();return;}
  }
  this.#finish(job,{...receipt,attempted:false});
 }
 async preflight(key){
  const job=this.store.entries().find(row=>row.key===key);
  if(!job||!this.createInspectionPage||this.active||this.isManualOpen(job.site))return {ok:false,reason:'busy'};
  const controller=new AbortController(),run={job,controller,page:null};this.active=run;
  const began=this.now(),runId=randomUUID().replace(/-/g,'');let receipt={status:'unknown',reason:'provider_result_unconfirmed'},reply={},reads=0,trace;
  this.emit('preflight',job,{runId,status:'running',readOnly:true});this.onChange();
  try{
   if(job.date!==kstDate(this.now()))return {ok:false,reason:'date_mismatch'};
   trace=this.#trace(job,'preflight');run.page=await this.createInspectionPage(job.site,controller.signal,{onDiagnostic:(phase,detail)=>{if(this.active===run&&!controller.signal.aborted)trace.event(phase,detail);}});await run.page.load(siteById(job.site).url);
   if(controller.signal.aborted)throw Error('cancelled');
   const observedAt=this.now();let fingerprint='',stable=0;
   // A loaded document can still be hydrating its catalog or redirecting to
   // login. Re-read only; never turn this observation into credential recovery.
   while(reads<21&&this.now()-observedAt<=8000){
    if(controller.signal.aborted||job.date!==kstDate(this.now()))throw Error('cancelled');
    await run.page.ready?.();
    if(['login','provider'].includes(run.page.route)){reply={status:'login',reason:'login_required'};break;}
    try{reply=await run.page.call('pc-entry.js',[job,'preflight']);reads++;}
    catch(error){if(controller.signal.aborted)throw error;if(!['page_changed','navigation_changed'].includes(error.code??error.message))throw error;reply={status:'not_open',reason:'page_changed'};reads++;}
    const next=JSON.stringify([reply.status,reply.reason,reply.targetMatched,reply.candidateCards,reply.titleMatches,reply.scheduleMatches,reply.entryControls]);
    trace.event('inspect',{...reply,readOnly:true,pageGeneration:run.page.version});
    stable=next===fingerprint?stable+1:1;fingerprint=next;
    if(['login','blocked','not_registered','lecture_ended'].includes(reply.status))break;
    if(stable>=2&&['ready','ambiguous'].includes(reply.status)||stable>=2&&reply.status==='not_open'&&reply.targetMatched===true)break;
    if(reads>=21||this.now()-observedAt>=8000)break;
    await this.sleep(400,controller.signal);
   }
   if(controller.signal.aborted||job.date!==kstDate(this.now()))throw Error('cancelled');
   receipt=cleanReceipt({...reply,status:reply.status==='ready'?'complete':reply.status,attempted:false,reads,elapsedMs:Math.max(0,this.now()-began)},this.now());
   return {ok:true};
  }catch(error){receipt=cleanReceipt({status:controller.signal.aborted?'cancelled':'network',reason:controller.signal.aborted?'cancelled':'network_error',attempted:false},this.now());return {ok:false,reason:receipt.reason};}
  finally{
   trace?.finish({...receipt,readOnly:true});
   try{if(job.date===kstDate(this.now()))this.store.updateEntry(job.key,{preflight:receipt,inspection:cleanEntryInspection({...reply,status:receipt.status==='complete'?'ready':receipt.status,reason:receipt.reason,readOnly:true},this.now())});this.emit('result',job,{...receipt,runId,readOnly:true,dateMatches:reply.dateMatches,timeMatches:reply.timeMatches});}
   finally{run.page?.close();this.active=null;this.onChange();}
  }
 }
 async run(job,{prepare=false}={}){
  if(this.active)return false;
  const controller=new AbortController(),run={job,controller,page:null};this.active=run;const began=this.now(),runId=randomUUID().replace(/-/g,'');let ticket=null,dispatched=false,started=false,receipt={status:'unknown',reason:'unknown_result'},adapter='auto-entry.js',trace;
  const emit=(phase,detail={})=>this.emit(phase,job,{runId,...detail});
  const allowed=()=>!controller.signal.aborted&&!this.ledger.snapshot().paused&&this.store.features().entry&&job.date===kstDate(this.now())&&!this.store.failed;
  const nativeJob=()=>({...job,due:prepare?job.prepAt:job.due,deadline:prepare?job.start-1:job.deadline,...(job.site==='hmp'?{hmpRepeatSchema:1,hmpSlot:job.slot}:{})});
  try{
   if(!allowed())return false;
   started=true;
   trace=this.#trace(job,prepare?'prepare':'entry');
   if(!prepare)this.store.updateEntry(job.key,{lastStartedAt:began,executionVersion:BUILD_INFO.version,...(BUILD_INFO.sourceCommit?{sourceCommit:BUILD_INFO.sourceCommit}:{})});
   emit('start',{startedAt:began,delayMs:Math.max(0,began-job.due),readOnly:prepare});
   if(this.isManualOpen(job.site)){receipt={status:'busy',reason:'manual_view_open'};return false;}
   if(!prepare)this.store.updateEntry(job.key,{status:'running'});
   run.page=await this.createPage(job.site,controller.signal,{onDiagnostic:(phase,detail)=>{if(this.active===run&&!controller.signal.aborted)trace.event(phase,detail);}});const page=run.page;await page.load(siteById(job.site).url);let navigations=0,detailOpened=false,pcDetailRead=false;
   while(allowed()&&this.now()-began<45000&&(prepare?this.now()<job.start:this.now()<=job.deadline)){
    if(['login','provider'].includes(page.route)){receipt={status:'login',reason:'login_required'};break;}
    let reply=await page.call(pcDetailRead?'pc-entry.js':'auto-entry.js',[{...nativeJob(),detailOpened},'inspect']);adapter=pcDetailRead?'pc-entry.js':'auto-entry.js';
    if(!pcDetailRead&&['doctorville','medigate','keymedi','hmp','bluepharm'].includes(job.site)&&['target_missing','button_missing','ambiguous'].includes(reply.status)){
     const supplement=await page.call('pc-entry.js',[nativeJob(),'inspect']);
     emit('inspect',{...cleanReceipt(supplement,this.now()),reader:'pc',dateMatches:supplement.dateMatches,timeMatches:supplement.timeMatches,duplicateEquivalent:supplement.duplicateEquivalent});
     this.store.updateEntry(job.key,{inspection:cleanEntryInspection({...supplement,readOnly:false},this.now())});
     trace.event('inspect',{...supplement,reader:'pc',pageGeneration:page.version});
     if(supplement.status==='ready'){reply=supplement;adapter='pc-entry.js';}
     else if(['target_missing','button_missing'].includes(reply.status)&&supplement.status==='navigate'&&supplement.reason==='read_only'){reply=supplement;adapter='pc-entry.js';}
     else if(['target_missing','button_missing'].includes(reply.status)&&supplement.status==='target_missing'&&supplement.titleMatches>0)reply=supplement;
    }
    receipt={...reply,reason:safeReason(reply.reason)};emit('inspect',{...cleanReceipt(receipt,this.now()),reader:adapter==='pc-entry.js'?'pc':'original'});
    trace.event('inspect',{...reply,reader:adapter==='pc-entry.js'?'pc':'original',pageGeneration:page.version});
    if(prepare)break;
    if(reply.status==='navigate'){
     const detail=job.site==='doctorville';
     if(++navigations>3||!navigable(job.site,reply.url)||detail&&(job.site!=='doctorville'||pcDetailRead||!doctorvilleDetailNavigation(page.url,reply.url))){receipt={status:'blocked',reason:'policy_rejected'};break;}
     if(detail){pcDetailRead=true;detailOpened=true;emit('open_detail',cleanReceipt(receipt,this.now()));}
     trace.event('target_open_requested',{status:'navigate'});await page.load(reply.url);trace.event('target_open_response',{status:'detail_opened'});continue;
    }
    if(reply.status==='open_target'){
     emit('open_detail',cleanReceipt(receipt,this.now()));
     if(detailOpened){receipt={status:'button_missing',reason:'no_target'};break;}
     trace.event('target_open_requested',{status:'open_target'});const opened=await page.call('auto-entry.js',[{...nativeJob(),detailOpened:false},'open_target'],{navigation:true});trace.event('target_open_response',opened);detailOpened=true;if(job.site==='doctorville')pcDetailRead=true;await this.sleep(600,controller.signal);continue;
    }
    if(reply.status==='ready'){
     if(reply.targetMatched!==true){receipt={status:'ambiguous',reason:'no_target'};break;}
     const input={site:job.site,kind:'entry',date:job.date,target:job.key,slot:job.slot,dueAt:job.due,deadline:job.deadline};
     ticket=this.ledger.reserve(input,this.now());if(!ticket||!allowed()||!this.ledger.beginDispatch(ticket,this.now())){receipt={status:'unknown',reason:'duplicate_prevented'};break;}
     this.store.updateEntry(job.key,{status:'attempting',entryAttempted:true});page.allowPopups(true);const before=page.version;dispatched=true;
     emit('dispatch',{attempted:true,targetMatched:true});
     trace.event('click_requested',{attempted:true,targetMatched:true});
     const executed=await page.call(adapter,[nativeJob(),'click'],{navigation:true});
     trace.event('click_response',executed);
     receipt={...reply,status:executed.status==='clicked'?'clicked':'unknown',reason:executed.status==='clicked'?'clicked':'navigation_unconfirmed',attempted:true};
     await this.sleep(800,controller.signal);receipt.navigationObserved=page.version!==before&&allowedNavigation(job.site,page.url);
     trace.event('navigation_observed',{navigationObserved:receipt.navigationObserved,pageGeneration:page.version});
     if(job.site==='hmp'){
      receipt.playback='navigation_unconfirmed';
      if(receipt.navigationObserved){const playback=await page.call('auto-entry.js',[nativeJob(),'playback_start']);receipt.playback=playback.status;await this.sleep(1200,controller.signal);receipt.playback=(await page.call('auto-entry.js',[nativeJob(),'playback_probe'])).status;trace.event('playback_observed',{playback:receipt.playback});}
     }
     break;
    }
    if(['login','blocked','ambiguous','invalid','lecture_ended','not_registered'].includes(reply.status))break;
    if(this.now()-began>=8000)break;await this.sleep(900,controller.signal);
   }
  }catch(error){receipt={status:dispatched?'unknown':controller.signal.aborted?'cancelled':'network',reason:safeReason(controller.signal.aborted?'cancelled':error.code??error.message),attempted:dispatched};}
  finally{
   trace?.finish({...receipt,attempted:dispatched,readOnly:prepare});
   let diagnostics={};try{diagnostics=run.page?.diagnostics?.()??{};}catch{}
   emit('result',{...cleanReceipt({...receipt,attempted:dispatched,elapsedMs:Math.max(0,this.now()-began)},this.now()),readOnly:prepare,navigationBlocked:diagnostics.navigationBlocked,popupDenied:diagnostics.popupDenied,mainFrameFailures:diagnostics.mainFrameFailures});
   try{if(ticket&&dispatched)this.ledger.finish(ticket,'unknown',this.now());
   if(started){if(prepare){this.store.updateEntry(job.key,{prepNextAt:Math.min(job.start,this.now()+60000),receipt:cleanReceipt(receipt)});if(receipt.status==='lecture_ended')this.#finish(job,receipt);}
   else if(dispatched)this.#finish(job,{...receipt,attempted:true,elapsedMs:Math.max(0,this.now()-began)});
   else this.#unexecuted(job,{...receipt,elapsedMs:Math.max(0,this.now()-began)});}}
   finally{run.page?.close();this.active=null;this.onChange();}
  }
  return true;
 }
}
