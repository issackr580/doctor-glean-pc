import {readFileSync} from 'node:fs';
export const CREDENTIAL_SITES=Object.freeze(JSON.parse(readFileSync(new URL('../vendor/credentials/sites.json',import.meta.url),'utf8')));
export const credentialSite=id=>CREDENTIAL_SITES.find(site=>site.id===id)??null;
export const credentialInput=input=>input&&typeof input==='object'&&typeof input.id==='string'&&input.id.length>0&&input.id.length<=512&&typeof input.password==='string'&&input.password.length>0&&input.password.length<=4096&&!/[\x00-\x1f\x7f]/.test(input.id+input.password);
export const CREDENTIAL_STATUSES=new Set(['idle','ready','loading','submitted','authenticated','login_required','manual','challenge','blocked','stale','already_submitted','unknown','rejected','pending','saved','removed','disabled','cooldown','daily_limit','cancelled','storage_unavailable','storage_error','network_error','time_limit','busy','not_saved','probe_unready']);
export const safeCredentialStatus=value=>CREDENTIAL_STATUSES.has(value)?value:'unknown';
export function isCredentialRequest(site,raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&(site==='doctorville'&&u.origin==='https://mims-account.shop.co.kr'&&u.pathname==='/apis/auth/login'||site==='dtalks'&&u.origin==='https://www.dtalks.kr'&&u.pathname==='/member/loginConfirm.do'||site==='whodadoc'&&u.origin==='https://hcp.whodadoc.com'&&u.pathname==='/auth/login');}catch{return false;}
}
export function allowedCredentialPage(id,raw){
 const site=credentialSite(id);if(!site)return false;
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&site.routes.some(route=>u.origin===route.origin&&u.pathname===route.path&&Object.entries(route.query??{}).every(([key,values])=>u.searchParams.getAll(key).length<=1&&values.includes(u.searchParams.get(key)??'')));}catch{return false;}
}
