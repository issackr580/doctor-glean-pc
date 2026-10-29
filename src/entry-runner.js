import {siteById,allowedNavigation} from './security.js';
import {entrySchedule,safeReason,doctorvilleDetailNavigation} from './automation-policy.js';
import {cleanReceipt,cleanEntryInspection} from './workflow-store.js';
import {kstDate,kstInstant} from './schedule.js';
import {waitFor} from './async-work.js';
import {randomUUID} from 'node:crypto';
import {BUILD_INFO,executionEvent} from './build-info.js';
import {catalogEntryReference} from './entry-reference.js';
import {canPreflightEntry} from './execution-presentation.js';
import {catalogScheduleRevision,confirmedRevisionTiming,detailIdentity} from './entry-revision.js';
const navigable=(site,raw)=>{try{const u=new URL(raw);return allowedNavigation(site,raw)&&!/(?:login|logout|regist|apply|enroll|payment|order|cart|token|auth|session|password|email|ticket|delete|withdraw)/i.test(decodeURIComponent(u.pathname+u.search));}catch{return false;}};
export class EntryRunner{
 constructor({ledger,store,createPage,createInspectionPage,catalog=()=>({}),isManualOpen=()=>false,onChange=()=>{},onEvent=()=>{},now=Date.now,sleep=waitFor,traceEntry=()=>({}),observeEntry=()=>{}}){Object.assign(this,{ledger,store,createPage,createInspectionPage,catalog,isManualOpen,onChange,onEvent,now,sleep,traceEntry,observeEntry});this.active=null;this.revisions=new Map();}
 #trace(job,kind){let trace;try{trace=this.traceEntry(job,kind);}catch{}return {event:(...args)=>{try{trace?.event?.(...args);}catch{}},finish:(...args)=>{try{trace?.finish?.(...args);}catch{}}};}
 #observe(job,phase,detail){try{this.observeEntry(job,phase,detail);}catch{}}
 async #catalogDetail(job,page,trace,signal,reference){
  const ref=reference??catalogEntryReference(job,this.catalog(job.date));
  trace.event('inspect',{targetSource:'catalog',catalogReference:!ref?'missing':ref.status==='navigate'?(ref.scheduleChanged?'schedule_changed':'matched'):ref.status==='ambiguous'?'ambiguous':'unsafe',readOnly:true});
  if(!ref)return {used:false};
  if(ref.status!=='navigate')return {used:false,reply:ref};
  if(!doctorvilleDetailNavigation(page.url,ref.url))return {used:false,reply:{status:'blocked',reason:'policy_rejected'}};
  trace.event('target_open_requested',{status:'navigate',reason:'read_only',readOnly:true,targetSource:'catalog'});
  this.emit('open_detail',job,{reason:'read_only',readOnly:true});
  await page.load(ref.url);
  if(signal.aborted||job.date!==kstDate(this.now()))throw Error('cancelled');
  const exact=page.url===ref.url;
  trace.event('target_open_response',{status:exact?'detail_opened':'target_missing',readOnly:true,targetSource:'catalog'});
  if(!exact&&!['login','provider'].includes(page.route))return {used:true,reply:{status:'blocked',reason:'policy_rejected'}};
  return {used:true};
 }
 emit(phase,job,detail={}){executionEvent(this.onEvent,{area:'automation',phase,kind:'entry',site:job.site,key:job.key,slot:job.slot,due:job.due,...detail});}
 get busy(){return !!this.active;}
 cancel(){this.active?.controller.abort();this.active?.page?.close();}
 manualOpened(site){if(this.active?.job.site===site)this.cancel();}
 #revision(job,results=this.catalog(job?.date)){
  if(!job||!this.store.features().entry||!this.store.entrySites().includes(job.site))return null;
  const input={site:job.site,kind:'entry',date:job.date,target:job.key,slot:job.slot,dueAt:job.due,deadline:job.deadline};
  return this.ledger.consumed(input)?null:catalogScheduleRevision(job,results,this.now());
 }
 #currentRevision(proposal){
  const job=this.store.entries().find(row=>row.key===proposal.key);
  if(!job||JSON.stringify(job)!==proposal.before)return null;
  const current=this.#revision(job);
  return current&&current.catalogAt===proposal.catalogAt&&current.identity===proposal.identity&&current.job.time===proposal.job.time?current:null;
 }
 revisionDue(key){
  if(this.ledger.snapshot().paused||this.store.failed||!this.createInspectionPage)return null;
  const pending=[];
  for(const [id,proposal] of this.revisions){
   const current=this.#currentRevision(proposal);if(!current){this.revisions.delete(id);continue;}
   if((!key||id===key)&&!this.isManualOpen(current.job.site))pending.push(current);
  }
  const now=this.now();pending.sort((a,b)=>{const started=a.job.start<=now,other=b.job.start<=now;return started!==other?(started?-1:1):started?b.job.start-a.job.start:a.job.start-b.job.start;});
  return pending[0]??null;
 }
 async reviseSchedule(key){
  if(this.active)return {ok:false,reason:'busy'};
  const proposal=this.revisionDue(key);if(!proposal)return {ok:false,reason:'scope_changed'};
  this.revisions.delete(key);
  const original=this.store.entries().find(job=>job.key===key),controller=new AbortController(),run={job:original,kind:'schedule',controller,page:null};this.active=run;
  const began=this.now(),trace=this.#trace(original,'prepare');let reply={},reads=0,updated=false,result={status:'unknown',reason:'scope_changed',attempted:false};
  const rejected=reason=>{result={status:reason==='cancelled'?'cancelled':'blocked',reason,attempted:false};return {ok:false,reason};};
  this.emit('preflight',original,{readOnly:true,reason:'scope_changed'});this.onChange();
  try{
   run.page=await this.createInspectionPage(original.site,controller.signal,{onDiagnostic:(phase,detail)=>{if(this.active===run&&!controller.signal.aborted)trace.event(phase,detail);}});
   await run.page.load(siteById(original.site).url);await run.page.ready?.();
   if(controller.signal.aborted)throw Error('cancelled');
   if(['login','provider'].includes(run.page.route)){reply={status:'login',reason:'login_required'};return {ok:false,reason:reply.reason};}
   if(!this.#currentRevision(proposal)||this.ledger.snapshot().paused)return rejected('scope_changed');
   const detail=await this.#catalogDetail(proposal.job,run.page,trace,controller.signal,proposal.reference);
   if(!detail.used||detail.reply){reply=detail.reply??{status:'blocked',reason:'policy_rejected'};return {ok:false,reason:reply.reason};}
   const observedAt=this.now();let fingerprint='',stable=0;
   while(reads<21&&this.now()-observedAt<=8000){
    if(controller.signal.aborted)throw Error('cancelled');
    if(!this.#currentRevision(proposal)||this.ledger.snapshot().paused)return rejected('scope_changed');
    await run.page.ready?.();
    if(run.page.url!==proposal.reference.url||['login','provider'].includes(run.page.route)){reply={status:'blocked',reason:'policy_rejected'};break;}
    const generation=run.page.version;reply=await run.page.call('pc-entry.js',[proposal.job,'schedule-inspect']);reads++;
    if(run.page.version!==generation||run.page.url!==proposal.reference.url||controller.signal.aborted)return rejected(controller.signal.aborted?'cancelled':'scope_changed');
    trace.event('inspect',{...reply,readOnly:true,pageGeneration:run.page.version});
    const next=JSON.stringify([reply.status,reply.reason,reply.targetMatched,reply.dateMatches,reply.observedTime,reply.endsAt,reply.scheduleMatches,reply.matchedTargets,reply.entryControls]);
    stable=next===fingerprint?stable+1:1;fingerprint=next;
    const exact=reply.targetMatched===true&&reply.dateMatches===1&&typeof reply.observedTime==='string'&&reply.scheduleMatches===1&&reply.matchedTargets===1;
    if(exact&&stable>=2&&['ready','not_open'].includes(reply.status)){
     const current=this.#currentRevision(proposal);
     if(!current||controller.signal.aborted||this.ledger.snapshot().paused)return rejected(controller.signal.aborted?'cancelled':'scope_changed');
     const now=this.now(),job=confirmedRevisionTiming(original,reply,now);if(!job)return rejected('scope_changed');
     const changed=!job.unchanged,change={oldTime:original.time,time:job.time,oldStart:original.start,start:job.start,oldDue:original.due,due:job.due,oldDeadline:original.deadline,deadline:job.deadline,checkedAt:now,...(job.recovered?{recovered:true}:{})};
     result={...reply,status:reply.status==='ready'?'complete':reply.status,attempted:false,reads,elapsedMs:Math.max(0,now-began)};
     this.store.updateEntry(key,{status:'reserved',time:job.time,start:job.start,due:job.due,deadline:job.deadline,nextAt:job.nextAt,entryClosesAt:job.entryClosesAt,scheduleIdentity:current.identity,...(changed?{scheduleChanges:[...(original.scheduleChanges??[]),change].slice(-8)}:{}),preflight:cleanReceipt(result,now),inspection:cleanEntryInspection({...reply,timeMatches:1,readOnly:true},now)});
     updated=true;if(changed)trace.event('schedule_updated',{status:'reserved',reason:'scope_changed',readOnly:true,oldTime:original.time,confirmedTime:job.time});return {ok:true,changed};
    }
    if(['login','blocked','ambiguous','not_registered','lecture_ended'].includes(reply.status))break;
    await this.sleep(400,controller.signal);
   }return {ok:false,reason:safeReason(reply.reason)};
  }catch(error){result={status:controller.signal.aborted?'cancelled':this.store.failed?'blocked':'network',reason:controller.signal.aborted?'cancelled':this.store.failed?'storage_error':'network_error',attempted:false};if(this.store.failed)throw error;return {ok:false,reason:result.reason};}
  finally{
   if(!updated&&result.status==='unknown')result={...reply,status:reply.status??'unknown',reason:safeReason(reply.reason??'scope_changed'),attempted:false};
   trace.finish({...result,readOnly:true});
   if(controller.signal.aborted&&!this.revisions.has(key)&&JSON.stringify(this.store.entries().find(job=>job.key===key))===proposal.before)this.revisions.set(key,proposal);
   run.page?.close();this.active=null;this.emit('result',original,{...cleanReceipt(result,this.now()),readOnly:true});this.onChange();
  }
 }
 reserveCatalog(date,results){
  if(!this.store.features().entry||date!==kstDate(this.now()))return;
  const selected=this.store.entrySites(),existing=new Set(this.store.entries(date).map(row=>row.key));
  const hmpGroups=new Map();for(const row of Object.values(results))for(const event of row.events??[])if(event.site==='hmp'&&entrySchedule(event,this.now())){const ids=hmpGroups.get(event.time)??new Set();ids.add(this.store.entryKey(event));hmpGroups.set(event.time,ids);}
  for(const [site,result] of Object.entries(results)){
   if(!selected.includes(site)||result.stale||!['ok','review'].includes(result.status))continue;
   for(const event of result.events){
    const key=this.store.entryKey(event);
    if(existing.has(key)){
     const proposal=this.#revision(this.store.entries(date).find(job=>job.key===key),results);
     if(proposal&&(this.revisions.has(key)||this.revisions.size<40))this.revisions.set(key,proposal);else this.revisions.delete(key);
     continue;
    }
    const timing=entrySchedule(event,this.now());if(!timing||site==='hmp'&&hmpGroups.get(event.time)?.size!==1)continue;
    let slot=0;if(site==='hmp')while(slot<5&&this.now()>timing.start+slot*600000+90000)slot++;
    if(slot===5)continue;
    const due=site==='hmp'?timing.start+slot*600000:Math.max(timing.due,kstInstant(date,'00:00')),deadline=site==='hmp'?due+90000:timing.deadline;
    const reference=catalogEntryReference(event,results);
    this.store.putEntry({key,site,date,time:event.time,title:event.title,start:timing.start,due,deadline,nextAt:due,status:'reserved',slot,retries:0,attempts:[],entryAttempted:false,prepAt:site==='hmp'?timing.start-600000:0,...(reference?.status==='navigate'?{scheduleIdentity:detailIdentity(reference.url)}:{})});existing.add(key);
    this.emit('scheduled',{key,site,slot,due},{status:'reserved'});
    this.#observe(this.store.entries(date).find(row=>row.key===key),'reservation_observed',{status:'reserved'});
    const proposal=this.#revision(this.store.entries(date).find(row=>row.key===key),results);if(proposal&&this.revisions.size<40)this.revisions.set(key,proposal);
   }
  }
  this.onChange();
 }
 recover(){
  for(const job of this.store.entries())if(['attempting','running'].includes(job.status))this.#finish(job,{status:'unknown',reason:'unknown_result',attempted:job.entryAttempted===true});
 }
 due(now=this.now(),excludeKey){
  const jobs=this.store.entries().filter(job=>this.store.entrySites().includes(job.site)&&job.status==='reserved');
  for(const job of jobs)if(now>job.deadline&&!this.revisions.has(job.key)&&!(this.active?.kind==='schedule'&&this.active.job.key===job.key)){this.#finish(job,{status:'expired',reason:'expired',attempted:false});}
  return this.store.entries().filter(job=>job.key!==excludeKey&&this.store.entrySites().includes(job.site)&&job.status==='reserved'&&now>=(job.nextAt??job.due)&&now<=job.deadline).sort((a,b)=>a.deadline-b.deadline)[0]??null;
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
    if(nextAt<=job.deadline){const checked=cleanReceipt({...receipt,retryCount:job.retries+1},this.now());this.store.updateEntry(job.key,{status:'reserved',nextAt,retries:job.retries+1,receipt:checked,executionFinishedAt:checked.checkedAt,attempts:[...(job.attempts??[]),checked].slice(-5),entryAttempted:false});
     const proposal=this.#revision(this.store.entries(job.date).find(row=>row.key===job.key));
     if(proposal&&(this.revisions.has(job.key)||this.revisions.size<40))this.revisions.set(job.key,proposal);
     this.emit('retry',job,checked);this.#observe(job,'retry_scheduled',{status:'reserved',retryCount:job.retries+1});this.onChange();return;}
  }
  this.#finish(job,{...receipt,attempted:false});
 }
 async preflight(key){
  const job=this.store.entries().find(row=>row.key===key);
  if(!job||!this.createInspectionPage||this.active||this.isManualOpen(job.site))return {ok:false,reason:'busy'};
  if(!canPreflightEntry(job))return {ok:false,reason:'duplicate_prevented'};
  const controller=new AbortController(),run={job,controller,page:null};this.active=run;
  const began=this.now(),runId=randomUUID().replace(/-/g,'');let receipt={status:'unknown',reason:'provider_result_unconfirmed'},reply={},reads=0,trace;
  this.emit('preflight',job,{runId,status:'running',readOnly:true});this.onChange();
  try{
   if(job.date!==kstDate(this.now()))return {ok:false,reason:'date_mismatch'};
   trace=this.#trace(job,'preflight');run.page=await this.createInspectionPage(job.site,controller.signal,{onDiagnostic:(phase,detail)=>{if(this.active===run&&!controller.signal.aborted)trace.event(phase,detail);}});await run.page.load(siteById(job.site).url);
   if(controller.signal.aborted)throw Error('cancelled');
   let observedAt=this.now(),fingerprint='',stable=0,detailRead=false;
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
    if(!detailRead&&stable>=2&&job.site==='doctorville'&&reply.status==='target_missing'&&reply.titleMatches>0&&reply.dateMissingCards===reply.titleMatches){
     detailRead=true;const detail=await this.#catalogDetail(job,run.page,trace,controller.signal);
     if(detail.reply){reply=detail.reply;break;}
     if(detail.used){observedAt=this.now();fingerprint='';stable=0;continue;}
    }
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
   // Keep the verified detail authoritative when the list still has an old
   // clock or omits the end time needed by a live recovery.
   if(job.site==='doctorville'&&!prepare&&job.scheduleIdentity){
    const reference=catalogEntryReference(job,this.catalog(job.date));
    if(reference?.status==='navigate'&&detailIdentity(reference.url)===job.scheduleIdentity){
     const detail=await this.#catalogDetail(job,page,trace,controller.signal,reference);
     if(detail.reply){receipt=detail.reply;return false;}
     if(detail.used){pcDetailRead=true;detailOpened=true;navigations++;}
    }
   }
   while(allowed()&&this.now()-began<45000&&(prepare?this.now()<job.start:this.now()<=job.deadline)){
    if(['login','provider'].includes(page.route)){receipt={status:'login',reason:'login_required'};break;}
    let reply=await page.call(pcDetailRead?'pc-entry.js':'auto-entry.js',[{...nativeJob(),detailOpened},'inspect']);adapter=pcDetailRead?'pc-entry.js':'auto-entry.js';
    // Doctorville's original reader can find an old clock in a title or end
    // time. Every result, including ready, must cross the strict PC reader.
    if(!pcDetailRead&&(job.site==='doctorville'||['medigate','keymedi','hmp','bluepharm'].includes(job.site)&&['target_missing','button_missing','ambiguous'].includes(reply.status))){
     const supplement=await page.call('pc-entry.js',[nativeJob(),'inspect']);
     emit('inspect',{...cleanReceipt(supplement,this.now()),reader:'pc',dateMatches:supplement.dateMatches,timeMatches:supplement.timeMatches,duplicateEquivalent:supplement.duplicateEquivalent});
     this.store.updateEntry(job.key,{inspection:cleanEntryInspection({...supplement,readOnly:false},this.now())});
     trace.event('inspect',{...supplement,reader:'pc',pageGeneration:page.version});
     if(job.site==='doctorville'&&!prepare&&supplement.titleMatches>0&&supplement.dateMissingCards===supplement.titleMatches&&['target_missing','navigate'].includes(supplement.status)){
      const detail=await this.#catalogDetail(job,page,trace,controller.signal);
      if(detail.reply){receipt=detail.reply;break;}
      if(detail.used){pcDetailRead=true;detailOpened=true;navigations++;continue;}
     }
     if(job.site==='doctorville'||supplement.status==='ready'){reply=supplement;adapter='pc-entry.js';}
     else if(['target_missing','button_missing'].includes(reply.status)&&supplement.status==='navigate'&&supplement.reason==='read_only'){reply=supplement;adapter='pc-entry.js';}
     else if(['target_missing','button_missing'].includes(reply.status)&&supplement.status==='target_missing'&&supplement.titleMatches>0){reply=supplement;adapter='pc-entry.js';}
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
     if(job.entryClosesAt&&(!Number.isSafeInteger(reply.endsAt)||reply.endsAt<=this.now())){receipt={status:'lecture_ended',reason:'lecture_ended'};break;}
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
