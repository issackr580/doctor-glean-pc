import {randomUUID} from 'node:crypto';
import {kstDate,kstInstant} from './schedule.js';
import {taskHash} from './task-ticket.js';
import {safeReason} from './automation-policy.js';
import {waitFor} from './async-work.js';
export class LoungeRunner{
 constructor({ledger,store,createPage,isManualOpen=()=>false,onChange=()=>{},now=Date.now,sleep=waitFor}){Object.assign(this,{ledger,store,createPage,isManualOpen,onChange,now,sleep});this.active=null;}
 get busy(){return !!this.active;}
 cancel(){this.active?.controller.abort();this.active?.page?.close();}
 manualOpened(site){if(site==='keymedi')this.cancel();}
 async run(date,scheduledAt){
  if(this.active||this.store.day(date).lounge)return false;
  const opensAt=kstInstant(date,'00:01:02'),closesAt=opensAt+20000,verifyAt=closesAt+12000,controller=new AbortController();
  const run={controller,page:null},lease=date+':'+randomUUID();this.active=run;
  let row={status:'running',reason:'running',startedAt:this.now(),opensAt,alarmDelayMs:Math.max(0,this.now()-scheduledAt),attemptMask:0,sentMask:0,successMask:0},fresh=false,refreshes=0,lastRefresh=0,lastSent=0;
  const valid=()=>!controller.signal.aborted&&!this.ledger.snapshot().paused&&this.store.features().lounge&&kstDate(this.now())===date&&this.now()<verifyAt&&!this.store.failed;
  let saved='';const save=()=>{const signature=JSON.stringify(row);if(signature===saved)return;this.store.record(date,'lounge',row,this.now());saved=signature;this.onChange();};
  try{
   if(!valid())return false;
   save();
   if(this.isManualOpen('keymedi')){row.status='busy';row.reason='manual_view_open';return false;}
   run.page=await this.createPage('keymedi',controller.signal);const page=run.page;
   const reload=async()=>{await page.load('https://www.keymedi.com/drlounge');lastRefresh=this.now();if(lastRefresh>=opensAt){fresh=true;refreshes++;}row.firstPageReadyAt??=this.now();};
   await reload();let openedVersion=-1;
   while(valid()){
    const now=this.now();
    if(['login','provider'].includes(page.route)){row.status='login';row.reason='login_required';break;}
    if(now>=opensAt&&!fresh){await reload();openedVersion=-1;continue;}
    let result=await page.call('keymedi-lounge.js',[{mode:'inspect'}]);
    if(result.status==='waiting'&&openedVersion!==page.version){openedVersion=page.version;await page.call('keymedi-lounge.js',[{mode:'open'}]);await this.sleep(150,controller.signal);continue;}
    if(result.status==='login'){row.status='login';row.reason='login_required';break;}
    if(result.status==='ready'){
     if(result.total!==7||!Number.isInteger(result.current)||result.current<0||result.current>7||!Number.isInteger(result.eligibleMask)||result.eligibleMask<0||result.eligibleMask>127||!Number.isInteger(result.successMask)||result.successMask<0||result.successMask>127)throw Error('invalid_response');
     row.firstMissionReadAt??=this.now();
     if(Number.isInteger(result.current)&&result.current>=0&&result.current<=7){row.providerComplete=result.current;row.successMask=result.current===7?127:(result.successMask??0)&127;}
     if(row.providerComplete===7){row.status='complete';row.reason=row.sentMask?'confirmed':'already_complete';save();break;}
     const mask=(result.eligibleMask??0)&127&~row.attemptMask;
     if(fresh&&mask&&now>=opensAt&&now<closesAt){
      const inputs=[];let safeMask=0;
      for(let slot=0;slot<7;slot++)if(mask&(1<<slot)){
       const input={site:'keymedi',kind:'lounge',date,target:taskHash('keymedi|lounge'),slot,dueAt:opensAt,deadline:closesAt-1};
       if(!this.ledger.consumed(input)){inputs.push(input);safeMask|=1<<slot;}
      }
      if(inputs.length){
       const tickets=this.ledger.reserveBatch(inputs,this.now());if(!tickets)throw Error('duplicate_prevented');
       row.firstEligibleAt??=this.now();row.attemptMask|=safeMask;save();
       if(!valid()||this.now()>=closesAt||!this.ledger.beginDispatchBatch(tickets,this.now()))throw Error('scope_changed');
       row.firstClaimAt??=this.now();row.lastClaimAt=this.now();save();
       const reply=await page.call('keymedi-lounge.js',[{mode:'claim',mask:safeMask,lease,opensAt,closesAt,requireFreshDocument:true}]);
       row.sentMask|=(reply.sentMask??0)&safeMask;lastSent=this.now();
       for(const ticket of tickets)this.ledger.finish(ticket,'unknown',this.now());save();
      }
     }
     save();
    }else if(result.status==='blocked'&&now<opensAt){row.status='blocked';row.reason=safeReason(result.reason);break;}
    if(now>=opensAt&&now<closesAt-3000&&this.now()-lastRefresh>=3000&&this.now()-lastSent>=3000&&refreshes<3){await reload();openedVersion=-1;continue;}
    if(now>=closesAt&&this.now()-lastRefresh>=3000&&refreshes<4){await reload();openedVersion=-1;continue;}
    await this.sleep(now<opensAt?Math.min(400,opensAt-now):150,controller.signal);
   }
   if(row.status==='running'){row.status='unknown';row.reason=controller.signal.aborted?'cancelled':'provider_result_unconfirmed';}
  }catch(error){row.status='unknown';row.reason=safeReason(controller.signal.aborted?'cancelled':error.code??error.message);}
  finally{run.page?.close();this.active=null;if(row.status==='running'){row.status='unknown';row.reason='cancelled';}row.finishedAt=this.now();save();}
  return true;
 }
}
