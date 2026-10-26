import {randomUUID} from 'node:crypto';
import {credentialSite,allowedCredentialPage,safeCredentialStatus} from './credential-policy.js';
import {waitFor} from './async-work.js';
import {credentialObservation} from './credential-diagnostics.js';
const terminal=new Set(['challenge','rejected','blocked','stale']);
export class CredentialRunner{
 constructor({attempts,now=Date.now,sleep=waitFor}){Object.assign(this,{attempts,now,sleep});}
 async run(site,page,{candidate,readCredentials,validation=false,automatic=false,signal,allowed=()=>true,onChange=()=>{}}){
  const policy=credentialSite(site),nonce=randomUUID().replace(/-/g,''),began=this.now();let attempted=false,submitted=false,at=0,usedProbe=false,reads=0,ready=0,lastVersion=-1,status='unknown',manualSince=0;
  const trace=[],observe=(phase,reply)=>{const row=credentialObservation(site,page,phase,reply,this.now()-began);if(trace.length>=32)trace.splice(1,1);trace.push(row);};
  const live=()=>!signal.aborted&&allowed()&&!page.closed&&this.now()-began<90000&&(!attempted||this.now()-at<(validation?45000:20000));
  const request=mode=>({site,mode,nonce,pageTag:'1:'+Math.max(1,page.version),expectedUrl:page.url,diagnostics:true,validation,...(validation?{validationSubmitted:submitted}:{backgroundRecovery:true,backgroundSubmitted:submitted})});
  const verify=async()=>{
   await page.ready?.();
   const input={...request('verify'),revealCkdMenu:submitted};let reply=await page.call('credential-login.js',[input]);reads++;observe('verify',reply);
   if(site==='keymedi'&&submitted&&reply.status==='unknown'){
    const name=validation?'credential-keymedi-proof.js':'credential-background-keymedi-proof.js';
    reply=await page.call(name,[{...input,serverProbeStart:false,serverProbeAvailable:!usedProbe},reply]);
    if(!usedProbe&&reply.evidence?.serverProbeOutcome==='ready'){usedProbe=true;reply=await page.call(name,[{...input,serverProbeStart:true,serverProbeAvailable:false},reply]);}
    observe('provider',reply);
   }
   return reply;
  };
  page.credentialDialog=true;
  try{
   if(!policy||!live())return {status:'cancelled',attempted:false,submitted:false};
   await page.load(policy.url);observe('open',{status:'ready'});
   while(live()){
    await page.ready?.();if(!live())break;
    if(page.dialogResult){status=safeCredentialStatus(page.dialogResult.status);break;}
    let reply;
    if(attempted){reply=await verify();}
    else{reply=await page.call('credential-login.js',[request('probe')]);reads++;observe('probe',reply);}
    status=safeCredentialStatus(reply.status);onChange(status);
    if(status==='authenticated'){
     if(validation&&(!attempted||!submitted)){status='manual';break;}
     return {status,attempted,submitted,reads,trace,elapsedMs:Math.max(0,this.now()-began)};
    }
    if(terminal.has(status))break;
    if(attempted){if(status==='login_required'&&this.now()-at>4000)break;await this.sleep(350,signal);continue;}
    if(status==='ready'&&allowedCredentialPage(site,page.url)){
     ready=lastVersion===page.version?ready+1:1;lastVersion=page.version;
     if(ready<2){await this.sleep(250,signal);continue;}
     if(!live()){status='cancelled';break;}
     const permit=this.attempts.reserve(site,this.now(),{validation,automatic});if(permit!=='ready'){status=permit;break;}
     attempted=true;at=this.now();onChange('submitted');
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
  }catch(error){status=safeCredentialStatus(signal.aborted?'cancelled':error.code??error.message);}
  finally{
   page.credentialDialog=false;
   // Candidate authentication cannot unlock an older saved account. Only the
   // manager's successful encrypted replacement changes this to "saved".
   if(attempted)this.attempts.finish(site,validation&&status==='authenticated'?'pending':status,this.now());
   observe('finish',{status});
  }
  return {status,attempted,submitted,reads,trace,elapsedMs:Math.max(0,this.now()-began)};
 }
}
