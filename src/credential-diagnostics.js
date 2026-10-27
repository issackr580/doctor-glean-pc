import {credentialSite,allowedCredentialPage,safeCredentialStatus} from './credential-policy.js';
import {allowedNavigation} from './security.js';
const phases=new Set(['open','probe','fill','submit','verify','provider','refresh','finish']);
const evidenceSources=new Set(['none','visible_logout','hmp_server_member','intermd_server_member','keymedi_server_member','keymedi_background_member','dtalks_server_logout','docple_server_calendar']);
export function credentialObservation(site,page,phase,reply,elapsedMs){
 let originAllowed=false;try{originAllowed=credentialSite(site)?.origins.includes(new URL(page.url).origin)===true;}catch{}
 const result={phase:phases.has(phase)?phase:'finish',status:safeCredentialStatus(reply?.status),elapsedMs:Math.min(90000,Math.max(0,Math.round(elapsedMs))),originAllowed,navigationAllowed:allowedNavigation(site,page.url),loginRoute:allowedCredentialPage(site,page.url),documentChanged:reply?.documentChanged===true};
 if(site==='doctorville')try{
  const u=new URL(page.url),policy=credentialSite(site),expected=policy.routes[0].query.cb[0];
  if(u.origin==='https://mims-account.shop.co.kr'){
   result.providerPath=u.pathname==='/login'?'login':u.pathname==='/'?'home':'other';
   const values=u.searchParams.getAll('cb');result.callbackState=values.length>1?'repeated':!values.length?'missing':values[0]===expected?'expected':'mismatch';
  }
 }catch{}
 if(['policy_rejected','invalid_response','page_changed','time_limit','network_error','cancelled','worker_closed','navigation_changed','stale','scope_changed'].includes(reply?.failure))result.failure=reply.failure;
 if(['provider','login','catalog','daily','lounge','brand','quiz','home','other'].includes(page.route))result.route=page.route;
 try{if(site==='doctorville'&&new URL(page.url).pathname==='/mims/directLogin')result.route='callback';}catch{}
 try{if(site==='dtalks'){const path=new URL(page.url).pathname;if(path==='/member/loginConfirm.do')result.route='login_result';else if(path==='/main.do')result.route='home';}}catch{}
 if(Number.isSafeInteger(page.version)&&page.version>=0&&page.version<=1e10)result.documentVersion=page.version;
 for(const key of ['observed','logoutShown','logoutSameOrigin','loginShown','passwordShown','providerMemberPresent','providerLanding','providerBarrier','clientValidationError','dtalksLogoutPresent','dtalksLogoutVisible','dtalksLogoutSafe','dtalksLoginConflict'])if(typeof reply?.evidence?.[key]==='boolean')result[key]=reply.evidence[key];
 if(evidenceSources.has(reply?.evidence?.authEvidenceSource))result.authEvidenceSource=reply.evidence.authEvidenceSource;
 const native=page.diagnostics?.();for(const key of ['navigationBlocked','popupDenied','mainFrameFailures','consoleErrors','credentialRequests','credentialResponses','credentialHttpStatus','credentialNetworkFailures'])if(Number.isSafeInteger(native?.[key])&&native[key]>=0&&native[key]<=1000)result[key]=native[key];
 if(typeof native?.credentialNetworkEnabled==='boolean')result.credentialNetworkEnabled=native.credentialNetworkEnabled;
 if(typeof native?.credentialRequestObservationSupported==='boolean')result.credentialRequestObservationSupported=native.credentialRequestObservationSupported;
 return result;
}
export function recordCredentialObservation(trace,row){
 const shape=value=>{const {elapsedMs,firstElapsedMs,samples,...state}=value;return JSON.stringify(state);};
 const last=trace.at(-1);
 if(last&&shape(last)===shape(row)){
  trace[trace.length-1]={...row,firstElapsedMs:last.firstElapsedMs??last.elapsedMs,samples:Math.min(100000,(last.samples??1)+1)};return;
 }
 if(trace.length>=32){const read=trace.findIndex((value,index)=>index>0&&['verify','provider'].includes(value.phase));trace.splice(read<0?1:read,1);}
 trace.push(row);
}
