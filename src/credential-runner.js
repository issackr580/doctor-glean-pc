import {randomUUID} from 'node:crypto';
import {credentialSite,allowedCredentialPage,safeCredentialStatus} from './credential-policy.js';
import {waitFor} from './async-work.js';
import {credentialObservation,recordCredentialObservation} from './credential-diagnostics.js';
import {inspectDocpleSession} from './credential-session.js';
const terminal=new Set(['challenge','rejected','blocked','stale']);
export class CredentialRunner{
 constructor({attempts,now=Date.now,sleep=waitFor}){Object.assign(this,{attempts,now,sleep});}
 async run(site,page,{candidate,readCredentials,validation=false,automatic=false,signal,allowed=()=>true,onChange=()=>{}}){
  const policy=credentialSite(site),nonce=randomUUID().replace(/-/g,''),began=this.now();let attempted=false,submitted=false,at=0,usedProbe=false,reads=0,ready=0,lastVersion=-1,status='unknown',manualSince=0,submittedVersion=-1,refreshed=false,settledReads=0;
  let failureCode;
  const trace=[],observe=(phase,reply)=>recordCredentialObservation(trace,credentialObservation(site,page,phase,reply,this.now()-began));
  const live=()=>!signal.aborted&&allowed()&&!page.closed&&this.now()-began<90000&&(!attempted||this.now()-at<(validation?45000:20000));
  // The original background proof rejects candidate-validation fields, even
  // validation:false. Keep candidate validation and saved recovery distinct.
  const request=mode=>({site,mode,nonce,pageTag:'1:'+Math.max(1,page.version),expectedUrl:page.url,diagnostics:true,...(validation?{validation:true,validationSubmitted:submitted}:{backgroundRecovery:true,backgroundSubmitted:submitted})});
  const verify=async()=>{
   await page.ready?.();
   const input={...request('verify'),revealCkdMenu:submitted};let reply=await page.call('credential-login.js',[input]),phase='verify';reads++;
   if(site==='keymedi'&&submitted&&reply.status==='unknown'){
    const name=validation?'credential-keymedi-proof.js':'credential-background-keymedi-proof.js';
    reply=await page.call(name,[{...input,serverProbeStart:false,serverProbeAvailable:!usedProbe},reply]);
    if(!usedProbe&&reply.evidence?.serverProbeOutcome==='ready'){usedProbe=true;reply=await page.call(name,[{...input,serverProbeStart:true,serverProbeAvailable:false},reply]);}
    phase='provider';
   }
   if(site==='doctorville'&&submitted&&reply.status==='unknown'&&allowedCredentialPage(site,page.url)){
    const supplement=await page.call('credential-page-state.js',[input]);
    reply={...reply,...(supplement.status==='manual'?{status:'manual',detail:supplement.detail}:{}),evidence:{...reply.evidence,...supplement.evidence}};phase='provider';
   }
   if(site==='docple'&&['authenticated','unknown','login_required'].includes(reply.status)&&reply.evidence?.passwordShown!==true&&!reply.evidence?.barrierReason){
    const server=await inspectDocpleSession(page,{signal,now:this.now,sleep:this.sleep,allowed,nonce});
    if(page.url===policy.entry||['authenticated','login_required'].includes(server.status)){reply={...server};phase='provider';}
   }
   if(site==='dtalks'&&submitted&&reply.status==='unknown'){
    const state=page.diagnostics?.(),actual=state?.credentialNetworkEnabled===true&&state.credentialRequests>0&&state.credentialResponses>0&&state.credentialHttpStatus>=200&&state.credentialHttpStatus<400;
    const supplement=await page.call('credential-page-state.js',[{...input,dtalksProtectedRead:refreshed,dtalksAuthResponse:actual}]);
    reply={...reply,...(supplement.status==='authenticated'?{status:'authenticated'}:{}),evidence:{...reply.evidence,...supplement.evidence}};phase='provider';
   }
   const network=page.diagnostics?.();
   if(submitted&&['unknown','loading'].includes(reply.status)&&network?.credentialNetworkEnabled===true&&network.credentialResponses>0&&network.credentialHttpStatus>=500){reply={...reply,status:'network_error'};phase='provider';}
   observe(phase,reply);
   return reply;
  };
  page.credentialDialog=true;
  try{
   if(!policy||!live())return {status:'cancelled',attempted:false,submitted:false};
   await page.load(policy.url);await page.enableCredentialDiagnostics?.();observe('open',{status:'ready'});
   while(live()){
    await page.ready?.();if(!live())break;
    if(page.dialogResult){status=safeCredentialStatus(page.dialogResult.status);break;}
    let reply;
    if(attempted){reply=await verify();}
    else{reply=await page.call('credential-login.js',[request('probe')]);reads++;observe('probe',reply);}
    if(!attempted&&!validation&&site==='dtalks'&&['unknown','manual'].includes(reply.status)&&!reply.evidence?.barrierReason){
     const supplement=await page.call('credential-page-state.js',[{...request('verify'),validation:false}]);
     if(supplement.status==='authenticated')reply=supplement;observe('provider',supplement);
    }
    status=safeCredentialStatus(reply.status);onChange(status);
    // Do not close a Docple login worker on a transient SPA logout label.
    // Read the original protected calendar before declaring the profile ready.
    if(site==='docple'&&status==='authenticated'&&reply.evidence?.authEvidenceSource==='docple_server_calendar')refreshed=true;
    if(site==='docple'&&status==='authenticated'&&!refreshed){
     if(validation&&(!attempted||!submitted)){status='manual';break;}
     refreshed=true;observe('refresh',{status:'loading'});await page.load(policy.entry);
     reply=await verify();status=safeCredentialStatus(reply.status);
     if(status!=='authenticated'){if(terminal.has(status)||['manual','network_error','login_required'].includes(status))break;await this.sleep(350,signal);continue;}
    }
    if(status==='authenticated'){
     if(validation&&(!attempted||!submitted)){status='manual';break;}
     return {status,attempted,submitted,reads,trace,elapsedMs:Math.max(0,this.now()-began)};
    }
    if(terminal.has(status)||attempted&&['manual','network_error'].includes(status))break;
    if(attempted){
     // A legacy POST can finish on a blank result document while the server
     // session is already established. Read the fixed protected catalog once;
     // never replay its POST or treat a destination alone as authentication.
     const evidence=reply.evidence;
     // The original Whodadoc handler can choose a destination which navigation
     // policy blocks. Keep that policy; re-read only its fixed PC entry once,
     // after a real auth response and this operation's single submission ACK.
     const native=page.diagnostics?.();
     if(site==='whodadoc'&&submitted&&!refreshed&&['unknown','login_required'].includes(status)&&evidence?.observed===true&&!evidence.barrierReason&&native?.navigationBlocked>0&&native.credentialNetworkEnabled===true&&native.credentialRequests===1&&native.credentialResponses>0&&native.credentialHttpStatus>=200&&native.credentialHttpStatus<400&&this.now()-at>=1200){
      refreshed=true;observe('refresh',{status:'loading'});await page.load(policy.entry);continue;
     }
     if(site==='docple'&&submitted&&!refreshed&&status==='unknown'&&evidence?.observed===true&&evidence.loginShown===false&&evidence.passwordShown===false&&this.now()-at>=1200){
      refreshed=true;observe('refresh',{status:'loading'});await page.load(policy.entry);continue;
     }
     if(site==='dtalks'&&submitted&&!refreshed&&status==='unknown'&&page.version!==submittedVersion&&!allowedCredentialPage(site,page.url)&&evidence?.observed===true&&evidence.loginShown===false&&evidence.passwordShown===false&&evidence.logoutShown===false){
      settledReads++;
      if(settledReads>=2&&this.now()-at>=1200){refreshed=true;observe('refresh',{status:'loading'});await page.load(policy.entry);settledReads=0;continue;}
     }else settledReads=0;
     if(status==='login_required'&&this.now()-at>4000)break;await this.sleep(350,signal);continue;
    }
    if(status==='ready'&&allowedCredentialPage(site,page.url)){
     ready=lastVersion===page.version?ready+1:1;lastVersion=page.version;
     if(ready<2){await this.sleep(250,signal);continue;}
     if(!live()){status='cancelled';break;}
     const permit=this.attempts.reserve(site,this.now(),{validation,automatic});if(permit!=='ready'){status=permit;break;}
     attempted=true;at=this.now();submittedVersion=page.version;onChange('submitted');
     page.allowPopups?.(true);
     // Secrets are decrypted only after a current ready probe and durable lease.
     let credentials=null;
     try{
      credentials=candidate??readCredentials();if(!credentials||!live()){status='cancelled';break;}
      reply=await page.call('credential-login.js',[{...request('fill'),id:credentials.id,password:credentials.password}],{navigation:true});
      submitted=reply.submitted===true;observe('fill',reply);
     }finally{if(credentials&&credentials!==candidate){credentials.id='';credentials.password='';}credentials=null;}
     if(reply.status==='pending')for(let i=0;i<3&&live()&&!submitted;i++){
      await this.sleep(200,signal);reply=await page.call('credential-login.js',[request('submit')],{navigation:true});submitted=reply.submitted===true;observe('submit',reply);if(reply.status!=='pending')break;
     }
     if(terminal.has(reply.status)||['manual','pending'].includes(reply.status)){status=safeCredentialStatus(reply.status);break;}
     await this.sleep(400,signal);continue;
    }
    if(status==='manual'||status==='login_required'){
     manualSince||=this.now();if(this.now()-manualSince>(allowedCredentialPage(site,page.url)?12000:5000))break;
    }else manualSince=0;
    await this.sleep(350,signal);
   }
   if(!live())status=signal.aborted||!allowed()?'cancelled':'time_limit';
  }catch(error){status=safeCredentialStatus(signal.aborted?'cancelled':error.code??error.message);failureCode=signal.aborted?'cancelled':error.code??error.message;}
  finally{
   page.credentialDialog=false;
   // Candidate authentication cannot unlock an older saved account. Only the
   // manager's successful encrypted replacement changes this to "saved".
   if(attempted)this.attempts.finish(site,validation&&status==='authenticated'?'pending':status,this.now());
   observe('finish',{status,failure:failureCode});
  }
  return {status,attempted,submitted,...(trace.some(row=>row.clientValidationError)?{detail:'input_format'}:{}),reads,trace,elapsedMs:Math.max(0,this.now()-began)};
 }
}
