import {credentialSite,allowedCredentialPage,safeCredentialStatus} from './credential-policy.js';
const phases=new Set(['open','probe','fill','submit','verify','provider','finish']);
const evidenceSources=new Set(['none','visible_logout','hmp_server_member','intermd_server_member','keymedi_server_member','keymedi_background_member']);
export function credentialObservation(site,page,phase,reply,elapsedMs){
 let originAllowed=false;try{originAllowed=credentialSite(site)?.origins.includes(new URL(page.url).origin)===true;}catch{}
 const result={phase:phases.has(phase)?phase:'finish',status:safeCredentialStatus(reply?.status),elapsedMs:Math.min(90000,Math.max(0,Math.round(elapsedMs))),originAllowed,loginRoute:allowedCredentialPage(site,page.url),documentChanged:reply?.documentChanged===true};
 if(['provider','login','catalog','daily','lounge','brand','quiz','home','other'].includes(page.route))result.route=page.route;
 try{if(site==='doctorville'&&new URL(page.url).pathname==='/mims/directLogin')result.route='callback';}catch{}
 if(Number.isSafeInteger(page.version)&&page.version>=0&&page.version<=1e10)result.documentVersion=page.version;
 for(const key of ['observed','logoutShown','logoutSameOrigin','loginShown','passwordShown','providerMemberPresent'])if(typeof reply?.evidence?.[key]==='boolean')result[key]=reply.evidence[key];
 if(evidenceSources.has(reply?.evidence?.authEvidenceSource))result.authEvidenceSource=reply.evidence.authEvidenceSource;
 const native=page.diagnostics?.();for(const key of ['navigationBlocked','popupDenied','mainFrameFailures'])if(Number.isSafeInteger(native?.[key])&&native[key]>=0&&native[key]<=1000)result[key]=native[key];
 return result;
}
