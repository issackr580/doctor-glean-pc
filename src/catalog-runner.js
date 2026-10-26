import {initialSettings} from '../vendor/engine/core.js';
import {kstDate,kstInstant} from './schedule.js';

const PROFILES=initialSettings().profiles;
const REASONS=new Set(['network_error','time_limit','cancelled','invalid_response','date_mismatch','navigation_changed','action_rejected','storage_error','suspended','entry_priority']);
function wait(ms,signal){return new Promise(resolve=>{
 if(signal.aborted){resolve();return;}
 const abort=()=>{clearTimeout(timer);resolve();};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
 signal.addEventListener('abort',abort,{once:true});
});}

/** Host-owned bounded collection. No page result may schedule a submit task. */
export class CatalogRunner{
 constructor({store,createPage,isManualOpen=()=>false,recoverLogin=async()=>false,onChange=()=>{},now=Date.now,sleep=wait,elapsed=()=>performance.now()}){
  Object.assign(this,{store,createPage,isManualOpen,recoverLogin,onChange,now,sleep,elapsed});this.active=null;this.last={running:false,date:kstDate(now()),site:'',reason:'idle'};
 }
 snapshot(){return structuredClone(this.last);}
 #publish(run,extra={}){
  if(this.active!==run)return;
  this.last={running:true,date:run.date,site:run.site,completed:run.completed,total:run.ids.length,reason:'reading',...extra};
  this.onChange(this.snapshot());
 }
 #owns(run){return this.active===run&&!run.controller.signal.aborted;}
 cancel(reason='cancelled'){
  const run=this.active;if(!run)return;
  if(!REASONS.has(reason))reason='cancelled';
  this.active=null;run.controller.abort();try{run.page?.close();}catch{}
  try{
   const partial=run.lastRead?.events?.length?run.lastRead:run.partialRead;
   for(const id of run.ids.slice(run.completed))this.store.record(id,run.date,{...(id===run.site?partial:null),status:'cancelled',coverage:false,events:id===run.site?partial?.events??[]:[],reason},this.now());
  }finally{
   this.last={running:false,date:run.date,site:run.site,reason,completed:run.completed,total:run.ids.length};this.onChange(this.snapshot());
  }
 }
 async start(date,ids){
  const today=kstDate(this.now()),max=kstDate(kstInstant(today,'00:00')+7*86_400_000);
  kstInstant(date,'00:00');
  if(date<today||date>max||!Array.isArray(ids)||!ids.length||ids.length>9||ids.some(id=>!Object.hasOwn(PROFILES,id))||new Set(ids).size!==ids.length)throw Error('invalid_catalog_request');
  if(this.active)throw Error('collection_busy');
  const run={date,ids:[...ids],controller:new AbortController(),site:'',completed:0,page:null,lastRead:null,began:this.elapsed()};
  this.active=run;this.#publish(run);
  try{
   for(const id of run.ids){
    if(!this.#owns(run))return;
    if(kstDate(this.now())!==today){this.cancel('date_mismatch');return;}
    if(this.elapsed()-run.began>720_000){this.cancel('time_limit');return;}
    run.site=id;run.lastRead=null;run.partialRead=null;this.#publish(run);
    if(this.isManualOpen(id)){this.store.record(id,date,{status:'busy',reason:'manual_view_open',events:[]},this.now());run.completed++;continue;}
    const profile={...PROFILES[id],networkPatienceMs:45000},began=this.elapsed();let previous=null,recoveryAttempted=false;
    try{
     run.page=await this.createPage(profile,run.controller.signal);
     if(!this.#owns(run)){run.page?.close();return;}
     await run.page.open();
     for(let step=0;step<240&&this.#owns(run);step++){
      if(kstDate(this.now())!==today)throw Object.assign(Error(),{code:'date_mismatch'});
      if(this.elapsed()-run.began>720_000||this.elapsed()-began>({keymedi:240_000,hmp:180_000}[id]??150_000))throw Object.assign(Error(),{code:'time_limit'});
      if(this.isManualOpen(id))throw Object.assign(Error(),{code:'cancelled'});
      const reply=await run.page.read(date,previous);
      if(!this.#owns(run))return;
      if(kstDate(this.now())!==today){this.cancel('date_mismatch');return;}
      if(this.elapsed()-run.began>720_000||this.elapsed()-began>({keymedi:240_000,hmp:180_000}[id]??150_000))throw Object.assign(Error(),{code:'time_limit'});
      if(!reply||typeof reply!=='object'||!Array.isArray(reply.events))throw Object.assign(Error(),{code:'invalid_response'});
      if(reply.status==='login'&&!recoveryAttempted){
       recoveryAttempted=true;run.page.close();run.page=null;
       const recovered=await this.recoverLogin(id,run.controller.signal);
       if(!this.#owns(run))return;
       if(recovered){run.page=await this.createPage(profile,run.controller.signal);await run.page.open();previous=null;continue;}
       this.store.record(id,date,reply,this.now());break;
      }
      previous=reply.state??previous;run.lastRead=reply;if(reply.events.length)run.partialRead=reply;
      this.#publish(run,{observed:Math.min(reply.events.length,400)});
      if(reply.done===true){this.store.record(id,date,reply,this.now());break;}
      if(reply.action&&!await run.page.act(reply.action,previous))throw Object.assign(Error(),{code:'action_rejected'});
      if(!this.#owns(run))return;
      if(step===239)throw Object.assign(Error(),{code:'time_limit'});
      await this.sleep(reply.action?700:1000,run.controller.signal);
     }
    }catch(error){
     if(!this.#owns(run))return;
     const reason=REASONS.has(error.code)?error.code:'network_error';
     const partial=run.lastRead?.events?.length?run.lastRead:run.partialRead;
     this.store.record(id,date,{...partial,status:'review',coverage:false,reason,events:partial?.events??[],diagnostics:{...(partial?.diagnostics??{}),failure:error.failure}},this.now());
    }finally{try{run.page?.close();}catch{}run.page=null;}
    if(!this.#owns(run))return;
    run.completed++;this.#publish(run);
   }
  }catch{
   if(this.#owns(run))this.last={running:false,date,site:run.site,reason:'storage_error',completed:run.completed,total:ids.length};
  }finally{
   if(this.active===run){
    this.active=null;try{run.page?.close();}catch{}
    if(this.last.running)this.last={running:false,date,site:'',reason:'finished',completed:run.completed,total:ids.length};
    this.onChange(this.snapshot());
   }
  }
 }
}
