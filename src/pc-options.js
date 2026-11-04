import {atomicJson,readJson} from './atomic-json.js';
import {DAILY_TASKS} from './automation-policy.js';
import {SITES} from './sites.js';
import {kstInstant} from './schedule.js';

export function validEntryHost(host){
 return typeof host==='string'&&host.length<=253&&host===host.toLowerCase()&&/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)&&!/(?:^|\.)(?:localhost|local|internal|home|lan|invalid)$/.test(host)&&!SITES.some(site=>site.hosts.some(h=>host===h||host.endsWith('.'+h)))&&!/(?:^|\.)(?:github\.com|githubusercontent\.com|mims-account\.shop\.co\.kr)$/.test(host);
}
const validDate=d=>{try{kstInstant(d,'00:00');return true;}catch{return false;}};
const initial=()=>({schemaVersion:1,dailyKeys:DAILY_TASKS.map(t=>t.key),memos:{},entryHosts:[],surveyExcluded:[]});
function valid(d){return d?.schemaVersion===1&&Object.keys(d).sort().join('|')==='dailyKeys|entryHosts|memos|schemaVersion|surveyExcluded'&&Array.isArray(d.dailyKeys)&&new Set(d.dailyKeys).size===d.dailyKeys.length&&d.dailyKeys.every(k=>DAILY_TASKS.some(t=>t.key===k))&&d.memos&&typeof d.memos==='object'&&!Array.isArray(d.memos)&&Object.keys(d.memos).length<=31&&Object.entries(d.memos).every(([date,text])=>validDate(date)&&typeof text==='string'&&text.length<=2000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))&&Array.isArray(d.entryHosts)&&d.entryHosts.length<=16&&new Set(d.entryHosts.map(r=>r.host)).size===d.entryHosts.length&&d.entryHosts.every(r=>r&&Object.keys(r).sort().join('|')==='host|http'&&validEntryHost(r.host)&&typeof r.http==='boolean')&&Array.isArray(d.surveyExcluded)&&d.surveyExcluded.length<=400&&new Set(d.surveyExcluded).size===d.surveyExcluded.length&&d.surveyExcluded.every(k=>/^[a-f0-9]{64}$/.test(k));}
export class PcOptions{
 constructor(file,{commit=atomicJson}={}){Object.assign(this,{file,commit});this.failed=false;this.data=readJson(file,initial(),valid);}
 snapshot(){return structuredClone(this.data);}
 save(change){const next={...structuredClone(this.data),...structuredClone(change)};if(!valid(next))throw Error('invalid_setting');try{this.commit(this.file,next);this.data=next;}catch{this.failed=true;throw Error('storage_error');}}
 selectDaily(keys){this.save({dailyKeys:keys});}
 memo(date,text){if(!validDate(date)||typeof text!=='string')throw Error('invalid_setting');const memos={...this.data.memos,[date]:text};for(const day of Object.keys(memos).sort().slice(0,-31))delete memos[day];this.save({memos});}
 hosts(rows){this.save({entryHosts:rows});}
 excludeSurvey(key,value){if(!/^[a-f0-9]{64}$/.test(key)||typeof value!=='boolean')throw Error('invalid_setting');this.save({surveyExcluded:value?[...new Set([...this.data.surveyExcluded,key])]:this.data.surveyExcluded.filter(k=>k!==key)});}
 allowsEntry(site,raw){
  if(this.failed||site!=='medigate'||typeof raw!=='string'||raw.length>8192)return false;
  try{const u=new URL(raw);if(u.username||u.password||u.port||u.hash||!['https:','http:'].includes(u.protocol)||/\.(?:exe|dll|msi|zip|apk|bat|cmd|ps1)(?:$|\/)/i.test(u.pathname))return false;return this.data.entryHosts.some(r=>r.host===u.hostname&&(u.protocol==='https:'||r.http));}catch{return false;}
 }
}
