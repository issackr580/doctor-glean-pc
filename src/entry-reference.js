import {doctorvilleDetailNavigation} from './automation-policy.js';
import {siteById} from './security.js';

// A locally retained observed link is a read hint, never entry permission.
// The fresh detail still has to prove the title, date, start and original button.
export function catalogEntryReference(job,results){
 if(job?.site!=='doctorville')return null;
 const row=results?.doctorville;
 if(!row||row.site!==job.site||row.date!==job.date||!['ok','review'].includes(row.status)||!Array.isArray(row.events)||row.events.length>400)return null;
 const title=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
 const matches=row.events.filter(event=>event?.site===job.site&&event.date===job.date&&event.time===job.time&&title(event.title)===title(job.title));
 if(!matches.length)return null;
 const urls=matches.map(event=>event.url);
 if(urls.some(url=>typeof url!=='string'||url.length>4096||!doctorvilleDetailNavigation(siteById(job.site).url,url)))return {status:'blocked',reason:'policy_rejected'};
 const unique=[...new Set(urls.map(url=>new URL(url).href))];
 return unique.length===1?{status:'navigate',reason:'read_only',url:unique[0]}:{status:'ambiguous',reason:'duplicate_target'};
}

