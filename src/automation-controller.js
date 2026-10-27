import {WorkflowStore} from './workflow-store.js';
import {DailyRunner} from './daily-runner.js';
import {DoctorvilleQuizRunner} from './doctorville-quiz-runner.js';
import {EntryRunner} from './entry-runner.js';
import {LoungeRunner} from './lounge-runner.js';
import {DAILY_TASKS} from './automation-policy.js';
import {kstDate,kstInstant,nextLoungePreparation} from './schedule.js';
function nextMorning(now){const today=kstDate(now),at=kstInstant(today,'08:10');return at>now?at:kstInstant(kstDate(now+86400000),'08:10');}
export class AutomationController{
 constructor({file,ledger,createPage,createInspectionPage,isManualOpen,catalog,catalogBusy,queueCatalog,yieldCatalog,onChange=()=>{},onEvent=()=>{},onError=()=>{},now=Date.now}){
  Object.assign(this,{ledger,createPage,isManualOpen,catalog,catalogBusy,queueCatalog,yieldCatalog,onChange,onError,now});this.store=new WorkflowStore(file);this.active=null;this.pendingDaily=[];this.pendingReadOnly=true;this.closed=false;
  this.store.recover();
  const common={ledger,store:this.store,createPage,createInspectionPage,isManualOpen,onChange:()=>{onChange();},onEvent,now};
  this.quiz=new DoctorvilleQuizRunner(common);
  this.daily=new DailyRunner({...common,quiz:this.quiz,shouldYield:()=>this.allowed()&&!!this.entry.due(this.now())});
  this.entry=new EntryRunner(common);this.entry.recover();this.lounge=new LoungeRunner(common);
  this.rearm();this.timer=setInterval(()=>this.tick(),250);this.timer.unref();
 }
 allowed(){return !this.closed&&!this.ledger.snapshot().paused&&!this.store.failed;}
 get busy(){return !!this.active||this.daily.busy||this.entry.busy||this.lounge.busy;}
 rearm(){this.boundary=this.now();this.morningAt=nextMorning(this.now());this.loungeAt=nextLoungePreparation(this.now());}
 snapshot(){return {features:this.store.features(),entrySites:this.store.entrySites(),today:this.store.day(),entries:this.store.entries(),daily:this.daily.snapshot(),preflight:this.preflightProgress,active:this.active??'',queuedDaily:[...this.pendingDaily],nextMorning:this.store.features().morning?this.morningAt:0,nextLounge:this.store.features().lounge?this.loungeAt:0,storageUnavailable:this.store.failed};}
 diagnostics(){return {...this.store.diagnostics(),daily:this.daily.snapshot(),preflight:this.preflightProgress,active:this.active??'',queuedDaily:[...this.pendingDaily],nextMorning:this.morningAt,nextLounge:this.loungeAt};}
 setFeature(key,value){this.store.setFeature(key,value);if(!value){if(key==='entry')this.entry.cancel();if(key==='lounge')this.lounge.cancel();if(['dailyClaim','quizAuto','brand'].includes(key))this.daily.cancel();}this.rearm();if(key==='entry'&&value)this.entry.reserveCatalog(kstDate(this.now()),this.catalog(kstDate(this.now())));this.onChange();this.tick();}
 setEntrySites(ids){this.store.setEntrySites(ids);this.onChange();this.tick();}
 async preflightEntry(key){
  if(this.closed||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||this.busy||this.catalogBusy())return {ok:false,reason:'busy'};
  this.active='preflight';this.onChange();
  try{return await this.entry.preflight(key);}
  finally{this.active=null;this.onChange();this.tick();}
 }
 async preflightUpcoming(){
  if(this.closed||this.busy||this.catalogBusy())return {ok:false,reason:'busy'};
  const now=this.now(),date=kstDate(now),keys=this.store.entries(date).filter(job=>job.status==='reserved'&&job.start>now&&this.store.entrySites().includes(job.site)).sort((a,b)=>a.start-b.start).slice(0,40).map(job=>job.key);
  const controller=new AbortController();this.preflightBatch=controller;this.active='preflight';
  const timer=setTimeout(()=>{controller.abort();this.entry.cancel();},120000);timer.unref?.();
  const progress={running:true,total:keys.length,completed:0,skipped:0,ready:0,waiting:0,login:0,unresolved:0,reason:'running'};this.preflightProgress=progress;this.onChange();
  try{
   for(const key of keys){
    if(this.closed||controller.signal.aborted||kstDate(this.now())!==date||this.now()-now>=120000){progress.reason='cancelled';break;}
    // The normal scheduler cancels an active read. Also yield between pages,
    // before it can schedule another read ahead of an already due entry.
    if(this.allowed()&&this.store.features().entry&&this.entry.due(this.now())){progress.reason='entry_priority';break;}
    const result=await this.entry.preflight(key);
    if(controller.signal.aborted){progress.reason='cancelled';break;}
    if(result.ok){
     progress.completed++;const receipt=this.store.entries(date).find(job=>job.key===key)?.preflight;
     if(receipt?.status==='complete')progress.ready++;
     else if(receipt?.status==='not_open'&&receipt.targetMatched===true)progress.waiting++;
     else if(receipt?.status==='login')progress.login++;
     else progress.unresolved++;
    }else progress.skipped++;
    this.onChange();
   }
   if(progress.reason==='running')progress.reason='finished';
   return {ok:true};
  }finally{clearTimeout(timer);progress.running=false;this.preflightBatch=null;this.active=null;this.onChange();this.tick();}
 }
 requestDaily({readOnly=false,keys=DAILY_TASKS.map(task=>task.key)}={}){
  if(!readOnly&&!this.allowed())return {ok:false,reason:'paused'};
  this.pendingDaily=[...new Set([...this.pendingDaily,...keys])];this.pendingReadOnly=this.pendingReadOnly&&readOnly;this.onChange();this.tick();return {ok:true};
 }
 quick(){if(!this.allowed())return {ok:false,reason:'paused'};this.requestDaily();this.queueCatalog(kstDate(this.now()));return {ok:true};}
 catalogFinished(date,ids,state){
  if(this.closed||date!==kstDate(this.now())||state.reason!=='finished')return;
  this.entry.reserveCatalog(date,this.catalog(date));
  const morning=this.store.day(date).morning;
  if(morning?.status==='running')this.store.record(date,'morning',{...morning,catalogChecked:true,status:morning.dailyChecked?'complete':'running',reason:'finished'});
  if(ids.includes('doctorville')&&this.allowed()&&this.store.features().quizAuto&&!this.store.day(date).quizAuto&&!this.pendingDaily.includes('doctorville:quiz'))this.requestDaily({keys:['doctorville:quiz']});
  this.onChange();this.tick();
 }
 manualOpened(site){this.daily.manualOpened(site);this.entry.manualOpened(site);this.lounge.manualOpened(site);}
 cancel(reason='cancelled'){this.preflightBatch?.abort();this.pendingDaily=[];this.pendingReadOnly=true;this.daily.cancel(reason);this.entry.cancel();this.lounge.cancel();this.onChange();}
 suspended(){this.cancel('suspended');this.rearm();}
 resumed(){this.rearm();this.tick();}
 async #work(kind,work,{priority=false}={}){
  if(this.active)return;this.active=kind;this.onChange();
  try{if(priority)this.yieldCatalog();await work();}
  catch{try{this.ledger.setPaused(true);}catch{}this.onError();}
  finally{this.active=null;this.onChange();if(!this.closed){queueMicrotask(()=>this.tick());}}
 }
 tick(){
  if(this.closed)return;
  try{
   const now=this.now(),features=this.store.features(),entry=this.allowed()&&features.entry?this.entry.due(now):null;
   const loungeDue=this.allowed()&&features.lounge&&now>=this.loungeAt&&now<this.loungeAt+60000+20000&&!this.store.day(kstDate(now)).lounge;
   if(this.active){
    if((entry||loungeDue)&&this.active==='daily'&&!this.daily.claimPending)this.daily.cancel('entry_priority');
    if(entry&&this.active==='lounge')this.lounge.cancel();
    if(entry&&this.active==='prepare'||(entry||loungeDue)&&this.active==='preflight'){this.preflightBatch?.abort();this.entry.cancel();}return;
   }
   if(entry){this.#work('entry',()=>this.entry.run(entry),{priority:true});return;}
   if(loungeDue){const at=this.loungeAt;this.loungeAt=nextLoungePreparation(now+1000);this.#work('lounge',()=>this.lounge.run(kstDate(at),at),{priority:true});return;}
   if(features.lounge&&now>this.loungeAt+80000)this.loungeAt=nextLoungePreparation(now);
   if(this.allowed()&&features.morning&&now>=this.morningAt){
    const date=kstDate(this.morningAt),missed=now>this.morningAt+600000;this.morningAt=nextMorning(now);
    if(!this.store.day(date).morning){this.store.record(date,'morning',{status:missed?'missed':'running',reason:missed?'missed':'scheduled'});if(!missed)this.quick();}
   }
   if(this.catalogBusy())return;
   const prep=this.allowed()&&features.entry?this.entry.prepareDue(now):null;
   if(prep){this.#work('prepare',()=>this.entry.run(prep,{prepare:true}));return;}
   if(this.pendingDaily.length){
    const keys=this.pendingDaily;this.pendingDaily=[];const readOnly=this.pendingReadOnly;this.pendingReadOnly=true;
    if(!readOnly&&!this.allowed())return;
    this.#work('daily',async()=>{
     const result=await this.daily.run(keys,{readOnly});
     if(result.reason==='entry_priority'){this.pendingDaily=[...new Set([result.key,...result.remaining,...this.pendingDaily])];this.pendingReadOnly=readOnly;}
     const morning=this.store.day().morning;
     if(morning?.status==='running'&&result.reason!=='entry_priority')this.store.record(kstDate(this.now()),'morning',{...morning,dailyChecked:result.reason==='finished',status:result.reason==='finished'?morning.catalogChecked?'complete':'running':'unknown',reason:result.reason});
    });
   }
  }catch{try{this.ledger.setPaused(true);}catch{}this.onError();}
 }
 close(){this.closed=true;clearInterval(this.timer);this.cancel();}
}
