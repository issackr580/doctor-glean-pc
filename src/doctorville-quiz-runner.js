import {randomUUID} from 'node:crypto';
import {kstDate} from './schedule.js';
import {quizNavigationAllowed,safeReason} from './automation-policy.js';
import {dailyTicket} from './task-ticket.js';
import {waitFor} from './async-work.js';
export class DoctorvilleQuizRunner{
 constructor({ledger,store,now=Date.now,sleep=waitFor}){Object.assign(this,{ledger,store,now,sleep});}
 async run(page,date,{signal,allowed,onProgress=()=>{},onSubmit=()=>{}}){
  const began=this.now(),nonce=randomUUID().replace(/-/g,''),visited=new Set();let productName='',phase='today',ticket=null,submitted=false,receipt={status:'unknown',reason:'unknown_result'};
  const valid=()=>!signal.aborted&&date===kstDate(this.now())&&this.now()-began<95000&&allowed();
  const call=(mode,extra={})=>page.call('doctorville-quiz-pilot.js',[{mode,nonce,expectedUrl:page.url,date,openQuiz:true,...extra}]);
  try{
   onProgress('닥터빌 당일 퀴즈 찾는 중');
   await page.load('https://www.doctorville.co.kr/product/main');visited.add(page.url);
   // A user may already have participated on another device. Read the dated
   // provider status before product discovery and never reserve another submit.
   const existing=await page.call('daily.js',[{site:'doctorville',kind:'quiz',date,autoClaim:false,attempted:false,checkId:nonce}]);
   if(existing.status==='complete'&&existing.reason==='today_quiz_visual'){receipt={status:'complete',reason:'already_participated'};return receipt;}
   if(existing.status==='failed'&&existing.reason==='today_quiz_visual'){receipt={status:'wrong',reason:'today_quiz_visual'};return receipt;}
   if(existing.status==='login'){receipt={status:'login',reason:'login_required'};return receipt;}
   let missingAt=0;
   while(valid()){
    if(['login','provider'].includes(page.route)){receipt={status:'login',reason:'login_required'};return receipt;}
    if(!quizNavigationAllowed(page.url))throw Error('policy_rejected');
    const request={phase,date,expectedUrl:page.url,...(productName?{productName}:{})};
    let reply=await page.call('doctorville-quiz-journey.js',[request]);
    if(reply.status==='stopped'&&['product_link_ambiguous','today_link_missing','product_not_found'].includes(reply.reason)){
     const desktop=await page.call('doctorville-quiz-page.js',[request]);
     if(['navigate','loading'].includes(desktop.status))reply=desktop;
    }
    if(reply.status==='loading'){await this.sleep(500,signal);continue;}
    if(reply.status==='stopped'){
     if(['today_quiz_missing','today_link_missing'].includes(reply.reason)){missingAt||=this.now();if(this.now()-missingAt<8000){await this.sleep(700,signal);continue;}}
     receipt={status:reply.reason==='login_required'?'login':'unknown',reason:safeReason(reply.reason)};return receipt;
    }
    if(reply.status!=='navigate'||!quizNavigationAllowed(reply.url)||typeof reply.productName!=='string'||!reply.productName||reply.productName.length>160||productName&&productName!==reply.productName||visited.has(reply.url)||visited.size>=5)throw Error('policy_rejected');
    productName=reply.productName;visited.add(reply.url);await page.load(reply.url);
    if(new URL(page.url).pathname==='/product/productView')break;phase='lookup';
   }
   if(!valid())throw Error('scope_changed');
   onProgress('닥터빌 퀴즈 참여 상태 확인 중');
   let reply=await call('prepare');
   while(valid()&&reply.status==='loading'){await this.sleep(350,signal);reply=await call('read');}
   if(reply.status==='stopped'){
    receipt={status:reply.reason==='already_participated'?'complete':reply.reason==='login_required'?'login':'unknown',reason:safeReason(reply.reason)};return receipt;
   }
   if(reply.status!=='ready'||!Number.isInteger(reply.attemptCount)||reply.attemptCount<0||reply.attemptCount>1)throw Error('unknown_result');
   const input=dailyTicket({site:'doctorville',kind:'quiz'},date,0,this.now());
   if(!valid())throw Error('scope_changed');
   ticket=this.ledger.reserve(input,this.now());
   if(!ticket){receipt={status:'unknown',reason:'duplicate_prevented'};return receipt;}
   if(!valid()||!this.ledger.beginDispatch(ticket,this.now()))throw Error('scope_changed');
   submitted=true;onSubmit();this.store.record(date,'quizAuto',{status:'attempting',reason:'submission_reserved',submitted:true});
   onProgress('닥터빌 퀴즈 1회 제출 · 결과 확인 중');
   reply=await call('submit',{authorized:true,attemptCount:reply.attemptCount});
   while(valid()&&['loading','submitting','ready','waiting'].includes(reply.status)){await this.sleep(400,signal);reply=await call('read');}
   receipt={status:reply.status==='success'&&reply.reason==='success_receipt'?'complete':reply.status==='wrong'?'wrong':'unknown',reason:safeReason(reply.reason),submitted};
   return receipt;
  }catch(error){receipt={status:'unknown',reason:safeReason(signal.aborted?'cancelled':error.code??error.message),submitted};return receipt;}
  finally{
   if(ticket&&submitted)this.ledger.finish(ticket,receipt.status==='complete'?'confirmed':'unknown',this.now());
   if(!page.closed&&quizNavigationAllowed(page.url))try{await call('cancel');}catch{}
   const result={...receipt,submitted,elapsedMs:Math.max(0,this.now()-began)};this.store.record(date,'quizAuto',result);this.store.record(date,'doctorville:quiz',result);
  }
 }
}
