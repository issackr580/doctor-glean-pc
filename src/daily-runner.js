import {DAILY_TASKS,taskByKey,actionAllowed,dailyDialog,safeReason} from './automation-policy.js';
import {dailyTicket} from './task-ticket.js';
import {kstDate} from './schedule.js';
import {waitFor} from './async-work.js';
export class DailyRunner{
 constructor({ledger,store,createPage,isManualOpen=()=>false,quiz,onChange=()=>{},shouldYield=()=>false,now=Date.now,sleep=waitFor}){Object.assign(this,{ledger,store,createPage,isManualOpen,quiz,onChange,shouldYield,now,sleep});this.active=null;this.last={running:false,reason:'idle',key:'',progress:''};}
 snapshot(){return {...this.last};}
 get busy(){return !!this.active;}
 get claimPending(){return !!this.active?.claimSent;}
 cancel(reason='cancelled'){const run=this.active;if(!run)return;run.reason=reason;run.controller.abort();run.page?.close();}
 manualOpened(site){if(this.active?.site===site)this.cancel('manual_view_open');}
 async run(keys=DAILY_TASKS.map(task=>task.key),{readOnly=false}={}){
  if(this.active)throw Error('operation_unavailable');
  const date=kstDate(this.now()),controller=new AbortController(),run={date,controller,page:null,site:'',key:'',claimSent:false,remaining:[...new Set(keys)].filter(key=>taskByKey(key)),reason:'finished'};
  this.active=run;const began=this.now();let completed=0;
  const allowed=()=>this.active===run&&!controller.signal.aborted&&date===kstDate(this.now())&&!this.store.failed;
  const publish=progress=>{this.last={running:true,date,key:run.key,site:run.site,completed,total:keys.length,reason:'running',progress};this.onChange(this.snapshot());};
  try{
   while(run.remaining.length&&allowed()){
    if(this.now()-began>540000)throw Error('time_limit');
    if(this.shouldYield()){run.reason='entry_priority';break;}
    const key=run.remaining.shift(),task=taskByKey(key);run.key=key;run.site=task.site;run.claimSent=false;
    const features=this.store.features();
    if(task.kind.startsWith('brand')&&!features.brand)continue;
    if(this.isManualOpen(task.site)){this.store.record(date,key,{status:'busy',reason:'manual_view_open'});completed++;continue;}
    const old=this.store.day(date).daily[key];
    if((old?.status==='complete'||task.kind.startsWith('brand')&&['ended','none'].includes(old?.status))&&task.kind!=='quiz'){completed++;continue;}
    if(key==='keymedi:brand2'){
     const first=this.store.day(date).daily['keymedi:brand1'];
     if(first?.status!=='complete'||first.reason!=='brand_reward_success'){
      const ended=first?.status==='ended',limit=first?.status==='none'||first?.reason==='brand_reward_final';
      this.store.record(date,key,{status:ended?'ended':limit?'none':'unknown',reason:ended?'brand_previous_no_banner':limit?'brand_daily_limit':'brand_previous_unconfirmed',attempted:false});completed++;continue;
     }
    }
    let receipt={status:'unknown',reason:'unknown_result'},taskBegan=this.now(),reads=0,navigations=0,tickets=[],claimAt=0;
    const mayAct=()=>!readOnly&&!this.ledger.snapshot().paused&&(task.kind.startsWith('brand')?this.store.features().brand:this.store.features().dailyClaim)&&allowed();
    publish(task.label+' 확인 중');
    try{
     run.page=await this.createPage(task.site,controller.signal,{onDialog:message=>dailyDialog(task,message,run.claimSent)});
     const page=run.page;
     const quizAllowed=()=>!readOnly&&!this.ledger.snapshot().paused&&this.store.features().quizAuto&&allowed();
     if(task.key==='doctorville:quiz'&&quizAllowed()){
      receipt=await this.quiz.run(page,date,{signal:controller.signal,allowed:quizAllowed,onProgress:publish,onSubmit:()=>{run.claimSent=true;}});
     }else{
      await page.load(task.url);const menuMarkers=new Set();
      while(allowed()&&this.now()-taskBegan<150000){
       if(page.dialogResult){receipt=page.dialogResult;break;}
       if(['login','provider'].includes(page.route)){receipt={status:'login',reason:'login_required'};break;}
       const brandSlot=task.kind==='brand2'?1:0,primary=dailyTicket(task,date,brandSlot,this.now()),confirmation=dailyTicket(task,date,1,this.now());
       const request={site:task.site,kind:task.kind,date,autoClaim:mayAct(),attempted:this.ledger.consumed(primary),confirmationAttempted:task.key==='keymedi:attendance'&&this.ledger.consumed(confirmation),checkId:date+':'+taskBegan};
       reads++;const reply=await page.call('daily.js',[request]);receipt={...reply,reason:safeReason(reply.reason)};
       if(reply.status==='action'){
        if(!actionAllowed(task,page.url,reply.action)){receipt={status:'unknown',reason:'policy_rejected'};break;}
        const claim=reply.action.type!=='navigate';let ticket=null;
        if(claim){
         if(!mayAct()){receipt={status:'pending',reason:'read_only'};break;}
         const input=reply.action.type==='claim_confirm'?confirmation:primary;
         ticket=this.ledger.reserve(input,this.now());if(!ticket||!this.ledger.beginDispatch(ticket,this.now())){receipt={status:'unknown',reason:'duplicate_prevented'};break;}
         tickets.push(ticket);run.claimSent=true;claimAt=this.now();
         this.store.record(date,key,{status:'unknown',reason:'claim_started',attempted:true,confirmationAttempted:reply.action.type==='claim_confirm'});
         if(reply.action.type==='claim_confirm')page.allowPopups(false);
        }else{
         const marker=JSON.stringify([page.url,reply.action.selector,reply.action.label]);if(menuMarkers.has(marker)||++navigations>3){receipt={status:'unknown',reason:'task_limit'};break;}menuMarkers.add(marker);
        }
        if(!allowed()||claim&&!mayAct())throw Error('scope_changed');
        const execution=await page.call('daily.js',[{...request,phase:'execute',action:reply.action,allowClaim:claim,...(claim?reply.action.type==='claim_confirm'?{confirmationAttempted:false}:{attempted:false}:{})}],{navigation:true});
        if(claim&&execution.executed===false){this.ledger.releaseUnexecuted(ticket,false);tickets=tickets.filter(t=>t!==ticket);run.claimSent=tickets.length>0;receipt={status:'unknown',reason:execution.reason};break;}
        await this.sleep(600,controller.signal);continue;
       }
       if(['complete','none','offday','scheduled','login','failed'].includes(reply.status)){break;}
       if(reply.status==='pending'&&!run.claimSent){if(request.attempted||request.confirmationAttempted)receipt={status:'unknown',reason:'duplicate_prevented'};break;}
       if(task.kind.startsWith('brand')&&!run.claimSent&&reply.reason==='brand_recommendation_unavailable'&&this.now()-taskBegan>=30000){receipt={status:'ended',reason:reply.reason,attempted:false};break;}
       if(claimAt&&this.now()-claimAt>=45000||!claimAt&&this.now()-taskBegan>=45000)break;
       await this.sleep(900,controller.signal);
      }
     }
    }catch(error){receipt={status:'unknown',reason:safeReason(controller.signal.aborted?run.reason==='finished'?'cancelled':run.reason:error.code??error.message)};}
    finally{
     for(const ticket of tickets)this.ledger.finish(ticket,receipt.status==='complete'?'confirmed':'unknown',this.now());
     receipt={...receipt,attempted:receipt.submitted===true||tickets.length>0||old?.attempted===true,reads,navigations,elapsedMs:Math.max(0,this.now()-taskBegan)};
     this.store.record(date,key,receipt);run.claimSent=false;run.page?.close();run.page=null;completed++;publish(task.label+' 확인 종료');
    }
   }
  }finally{
   run.page?.close();if(this.active===run)this.active=null;
   this.last={running:false,date,key:run.key,site:run.site,completed,total:keys.length,reason:controller.signal.aborted?run.reason==='finished'?'cancelled':run.reason:run.reason,progress:'오늘 출석·퀴즈 확인 종료',remaining:[...run.remaining]};this.onChange(this.snapshot());
  }
  return this.snapshot();
 }
}
