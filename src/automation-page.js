import {BrowserWindow} from 'electron';
import {readFileSync} from 'node:fs';
import {allowedNavigation,allowedPopup} from './security.js';
import {pageRole} from './page-role.js';
import {waitFor,boundedWork as bounded} from './async-work.js';
import {credentialPageState} from './credential-page-state.js';
import {isCredentialRequest,bareDoctorvilleProvider} from './credential-policy.js';
import {credentialProviderLanding} from './credential-provider-landing.js';
import {doctorvilleQuizPage} from './doctorville-quiz-page.js';
import {credentialDocpleSession} from './credential-session-page.js';
import {pcEntryPage} from './entry-page.js';
const assets=new Map();
const NAMES=new Set(['daily.js','auto-entry.js','pc-entry.js','keymedi-lounge.js','doctorville-quiz-pilot.js','doctorville-quiz-journey.js','doctorville-quiz-page.js','doctorville-survey.js','credential-login.js','credential-keymedi-proof.js','credential-background-keymedi-proof.js','credential-page-state.js','credential-docple-session.js']);
const failure=code=>Object.assign(Error(code),{code});
export class AutomationPage{
 constructor(site,signal,preferences,{onDialog=()=>({accept:false,status:'unknown',reason:'manual_confirmation'})}={}){
  Object.assign(this,{site,signal,preferences,onDialog});this.windows=[];this.generation=0;this.popupAllowed=false;this.focusPopup=false;this.closed=false;this.dialogResult=null;this.dialogs=0;
  this.runtime={navigationBlocked:0,popupDenied:0,mainFrameFailures:0,consoleErrors:0,credentialRequestObservationSupported:['doctorville','dtalks','whodadoc'].includes(site),credentialNetworkEnabled:false,credentialRequests:0,credentialResponses:0,credentialHttpStatus:0,credentialNetworkFailures:0};this.root=this.#create();this.current=this.root;this.abort=()=>this.close();signal.addEventListener('abort',this.abort,{once:true});
 }
 #create(){
  const window=new BrowserWindow({show:false,width:1100,height:1800,autoHideMenuBar:true,webPreferences:{...this.preferences,backgroundThrottling:false}});
  try{this.#guard(window);return window;}catch{window.destroy();throw failure('worker_closed');}
 }
 #guard(window){
  this.windows.push(window);const contents=window.webContents;
  const guard=(event,url)=>{if(!allowedNavigation(this.site,typeof url==='string'?url:event.url)){this.runtime.navigationBlocked=Math.min(1000,this.runtime.navigationBlocked+1);event.preventDefault();}};
  contents.on('will-navigate',guard);contents.on('will-redirect',(event,url,_inPlace,main)=>{if((main??event.isMainFrame)!==false)guard(event,url);});
  contents.on('will-attach-webview',event=>event.preventDefault());
  contents.on('did-start-navigation',(event,_url,inPlace,main)=>{if((main??event.isMainFrame)&&!(inPlace??event.isInPlace))this.generation++;});
  contents.on('did-fail-load',(_event,code,_description,_url,main)=>{if(main!==false&&code!==-3)this.runtime.mainFrameFailures=Math.min(1000,this.runtime.mainFrameFailures+1);});
  contents.on('console-message',(event,details)=>{const level=typeof details==='number'?details:details?.level??event.level;if(level==='error'||level===3)this.runtime.consoleErrors=Math.min(1000,this.runtime.consoleErrors+1);});
  contents.setWindowOpenHandler(({url})=>{if(this.popupAllowed&&this.windows.length<3&&allowedPopup(this.site,url,contents.getURL()))return {action:'allow',overrideBrowserWindowOptions:{show:false,width:1100,height:1800,webPreferences:{...this.preferences,backgroundThrottling:false}}};this.runtime.popupDenied=Math.min(1000,this.runtime.popupDenied+1);return {action:'deny'};});
  contents.on('did-create-window',child=>{try{this.#guard(child);if(this.focusPopup)this.current=child;}catch{child.destroy();this.dialogResult={status:'unknown',reason:'worker_closed'};}});
  // Browser dialogs are read only to fixed classifications, never logged raw.
  // Unknown confirmations are dismissed; only a task-specific original claim
  // confirmation can be accepted by the host's callback.
  contents.debugger.attach('1.3');contents.debugger.sendCommand('Page.enable').catch(()=>{});
  if(this.credentialNetwork)contents.debugger.sendCommand('Network.enable',{maxPostDataSize:0}).catch(()=>{this.runtime.credentialNetworkEnabled=false;});
  const requests=new Set(),response=status=>{this.runtime.credentialResponses=Math.min(1000,this.runtime.credentialResponses+1);if(Number.isInteger(status)&&status>=100&&status<=599)this.runtime.credentialHttpStatus=status;};
  contents.debugger.on('message',(_event,method,params)=>{
   if(this.credentialDialog&&this.credentialNetwork){
    if(method==='Network.requestWillBeSent'){
     if(requests.has(params.requestId)&&params.redirectResponse){response(params.redirectResponse.status);requests.delete(params.requestId);}
     if(params.request?.method==='POST'&&isCredentialRequest(this.site,params.request.url)){this.runtime.credentialRequests=Math.min(1000,this.runtime.credentialRequests+1);if(requests.size<10)requests.add(params.requestId);}
    }else if(method==='Network.responseReceived'&&requests.has(params.requestId)){response(params.response?.status);requests.delete(params.requestId);}
    else if(method==='Network.loadingFailed'&&requests.has(params.requestId)){this.runtime.credentialNetworkFailures=Math.min(1000,this.runtime.credentialNetworkFailures+1);requests.delete(params.requestId);}
   }
   if(method!=='Page.javascriptDialogOpening')return;
   this.dialogs++;let decision={accept:false,status:'unknown',reason:'manual_confirmation'};
   if(!this.closed&&!this.signal.aborted&&this.dialogs<=5&&allowedNavigation(this.site,contents.getURL()))try{
    decision=this.credentialDialog?{accept:false,status:/비밀번호.*(?:틀|오류|일치하지)|아이디.*(?:틀|오류|일치하지)|invalid.*(?:password|credential)/i.test(params.message)?'rejected':/captcha|보안문자|인증번호|추가인증/i.test(params.message)?'challenge':'manual',reason:'site_dialog'}:this.onDialog(params.message,params.type)??decision;
   }catch{}
   if(decision.status)this.dialogResult={status:decision.status,reason:decision.reason};
   contents.debugger.sendCommand('Page.handleJavaScriptDialog',{accept:decision.accept===true}).catch(()=>{});
  });
 }
 get url(){return this.current&&!this.current.isDestroyed()?this.current.webContents.getURL():'';}
 get route(){return pageRole(this.url);}
 get version(){return this.generation;}
 diagnostics(){return {...this.runtime};}
 async enableCredentialDiagnostics(){
  this.credentialNetwork=true;
  await Promise.all(this.windows.map(async window=>{try{await bounded(window.webContents.debugger.sendCommand('Network.enable',{maxPostDataSize:0}),this.signal,5000);this.runtime.credentialNetworkEnabled=true;}catch{this.runtime.credentialNetworkEnabled=false;}}));
 }
 #alive(){if(this.closed||this.signal.aborted||!this.current||this.current.isDestroyed())throw failure('cancelled');}
 async load(url){
  this.#alive();if(!allowedNavigation(this.site,url))throw failure('policy_rejected');const window=this.current,contents=window.webContents;
  const loading=window.loadURL(url).catch(async error=>{
   if(error.errno!==-3||this.signal.aborted)throw error;
   const until=Date.now()+15000;let version=this.version,stableAt=Date.now();
   while(Date.now()<until){
    this.#alive();if(contents.isDestroyed())throw error;
    if(version!==this.version){version=this.version;stableAt=Date.now();}
    if(!contents.isLoadingMainFrame()&&allowedNavigation(this.site,contents.getURL())&&Date.now()-stableAt>=400)return;
    await waitFor(80,this.signal);
   }throw error;
  });
  await bounded(loading,this.signal,45000);this.#alive();await bounded(this.current.webContents.debugger.sendCommand('Page.enable'),this.signal,10000);
 }
 allowPopups(focus=false){this.popupAllowed=true;this.focusPopup=focus;}
 async ready(){
  this.#alive();const until=Date.now()+10000;
  while((this.current.webContents.isLoadingMainFrame()||this.url==='about:blank')&&Date.now()<until){await waitFor(80,this.signal);this.#alive();}
  if(this.current.webContents.isLoadingMainFrame()||this.url==='about:blank')throw failure('time_limit');
  return {url:this.url,version:this.version};
 }
 async call(name,args,{navigation=false}={}){
  await this.ready();
  const landing=name==='credential-provider-landing.js';
  if(landing){
   const input=args?.[0],keys=['site','mode','nonce','pageTag','expectedUrl','diagnostics','backgroundRecovery','backgroundSubmitted'];
   if(this.site!=='doctorville'||!bareDoctorvilleProvider(this.url)||navigation||args?.length!==1||!input||Object.keys(input).some(key=>!keys.includes(key))||input.site!=='doctorville'||input.mode!=='verify'||input.backgroundRecovery!==true||input.backgroundSubmitted!==false)throw failure('policy_rejected');
  }else if(!NAMES.has(name)||!allowedNavigation(this.site,this.url))throw failure('policy_rejected');
  // This credential-prefixed session read cannot dispatch an attendance action.
  // It retains native document binding and bypasses the recovery wrapper itself.
  if(name==='credential-docple-session.js'&&(this.site!=='docple'||args?.[0]?.site!=='docple'||args[0].mode!=='verify'||args[0].kind!=='attendance'||args[0].autoClaim!==false||args[0].attempted!==false||args[0].phase!==undefined||args[0].action!==undefined||navigation))throw failure('policy_rejected');
  if(name==='pc-entry.js'&&(args?.[0]?.site!==this.site||!['preflight','inspect','click'].includes(args?.[1])||navigation&&args[1]!=='click'))throw failure('policy_rejected');
  if(!assets.has(name))assets.set(name,landing?credentialProviderLanding.toString():name==='pc-entry.js'?pcEntryPage.toString():name==='credential-page-state.js'?credentialPageState.toString():name==='credential-docple-session.js'?credentialDocpleSession.toString():name==='doctorville-quiz-page.js'?doctorvilleQuizPage.toString():readFileSync(new URL('../vendor/'+(name.startsWith('credential-')?'credentials/':'automation/')+name,import.meta.url),'utf8'));
  const contents=this.current.webContents,url=this.url,version=this.version;
  const credential=name.startsWith('credential-'),reading=credential&&['probe','verify','cancel'].includes(args?.[0]?.mode);
  // A read may wait across a POST redirect, but its caller must bind a fresh
  // request after that wait. Never deliver secrets into a replacement document.
  if(credential&&(args?.[0]?.expectedUrl!==url||args?.[0]?.pageTag!=='1:'+Math.max(1,version)))return {status:reading?'loading':'stale',submitted:false,documentChanged:true};
  const script=`(()=>{if(location.href!==${JSON.stringify(url)})return null;return JSON.stringify((${assets.get(name)})(...${JSON.stringify(args)}));})()`;
  let encoded;
  try{encoded=await bounded(contents.executeJavaScript(script,false),this.signal,10000);}
  catch(error){if(navigation&&!this.closed&&!this.signal.aborted&&this.version!==version)return {status:'unknown',reason:'navigation_unconfirmed',navigationObserved:true};throw error;}
  this.#alive();
  if(!navigation&&(this.version!==version||this.url!==url)){if(reading)return {status:'loading',submitted:false,documentChanged:true};throw failure('page_changed');}
  if(typeof encoded!=='string'||encoded.length>500000)throw failure('invalid_response');
  let value;try{value=JSON.parse(encoded);}catch{throw failure('invalid_response');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure('invalid_response');return value;
 }
 async flushSession(){
  this.#alive();const profile=this.current.webContents.session;
  await bounded(profile.cookies.flushStore().then(()=>profile.flushStorageData()),this.signal,3000);
 }
 close(){
  if(this.closed)return;this.closed=true;this.signal.removeEventListener('abort',this.abort);
  for(const window of this.windows)if(!window.isDestroyed()){try{if(window.webContents.debugger.isAttached())window.webContents.debugger.detach();}catch{}window.destroy();}
 }
}
