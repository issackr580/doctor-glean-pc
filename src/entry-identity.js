import {automaticEntrySite} from './entry-support.js';
import {validHmpCheckpoint,hmpSchema} from './hmp-policy.js';
import {createHash} from 'node:crypto';
import {readLectureIdentity} from '../vendor/identity/lecture-identity.js';
export const ID_SITES=Object.freeze(['doctorville','keymedi','medigate','whodadoc','docple','hmp']);
const kinds={doctorville:'seminar',keymedi:'live',medigate:'symposium',whodadoc:'webi',docple:'webinar',hmp:'schedule'};
const norm=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function parseOfficialIdentity(site,url){return typeof url==='string'&&/^https:\/\//.test(url)?readLectureIdentity(site,url):null;}
export function officialIdentity(row){
 if(!row||!ID_SITES.includes(row.site))return null;
 const meta=row.lectureIdentity,id=parseOfficialIdentity(row.site,row.url);
 if(meta!==undefined&&(!meta||typeof meta!=='object'||Array.isArray(meta)||meta.schemaVersion!==1||meta.kind!==kinds[row.site]||typeof meta.id!=='string'||!['detail_url','hmp_go_detail'].includes(meta.source)||Object.keys(meta).sort().join('|')!=='id|kind|schemaVersion|source'))return null;
 if(id)return meta&&(meta.id!==id.id||meta.kind!==id.kind||meta.source!==id.source)?null:id;
 if(row.site==='hmp'&&(!row.url||/^https:\/\/(?:www\.)?hmp\.co\.kr\/symposium\/schedulerequest\/scheduleList\.hm$/.test(row.url))&&meta?.source==='hmp_go_detail'&&/^[1-9]\d{0,9}$/.test(meta.id))return {...meta};
 return null;
}
export function identityInvalid(row){
 if(row?.lectureIdentity!==undefined&&!officialIdentity(row))return true;
 if(!row?.url||!ID_SITES.includes(row.site))return false;
 try{const p=new URL(row.url).pathname,official=row.site==='doctorville'?/^\/seminar\/(?:seminarDetail|seminarVodReplayDetail)\/?$/.test(p):row.site==='whodadoc'?p==='/webinar/webi/view':row.site==='keymedi'?/^\/meditv\/live\/[A-Za-z0-9_-]{1,80}\/?$/.test(p):row.site==='medigate'?/^\/symposium\/[1-9]\d{0,15}\/?$/.test(p):row.site==='docple'?/^\/webinar\/[1-9]\d{0,15}\/?$/.test(p):false;return official&&!officialIdentity(row);}catch{return false;}
}
export function canonicalIdentity(row){const id=officialIdentity(row);return id?row.site+'|'+id.kind+':'+id.id:'';}
export function sameEntryTarget(a,b){
 if(identityInvalid(a)||identityInvalid(b))return false;
 const x=canonicalIdentity(a),y=canonicalIdentity(b);return x||y?!!x&&x===y:norm(a?.title)===norm(b?.title);
}
export function legacyEntryKey(event){return hash(JSON.stringify([event.site,event.date,event.site==='hmp'?event.time:'',norm(event.title)]));}
export function officialEntryKey(event){
 const id=officialIdentity(event);if(!id)return null;
 const part=canonicalIdentity(event),prefix=event.site==='hmp'?'hmp|'+event.date+'|'+(event.time==='13:10'?'':event.time+'|'):event.site+'|'+event.date+'|';
 return hash(event.site==='docple'?'docple|'+event.date+'|'+id.id:prefix+'official:'+part);
}
export function priorIdentityKeys(jobs,fresh){
 if(!canonicalIdentity(fresh))return [];
 return jobs.filter(p=>p.site===fresh.site&&p.date===fresh.date&&!identityInvalid(p)&&(sameEntryTarget(p,fresh)||!canonicalIdentity(p)&&p.time===fresh.time&&norm(p.title)===norm(fresh.title))).map(p=>p.key);
}
export function duplicateIdentityKeys(jobs){
 const groups=new Map();for(const j of jobs){const id=canonicalIdentity(j);if(!id)continue;const key=j.date+'|'+id,rows=groups.get(key)??[];rows.push(j.key);groups.set(key,rows);}
 return new Set([...groups.values()].filter(a=>a.length>1).flat());
}
export function identityRunnable(job,jobs){return !!job&&automaticEntrySite(job.site)&&validHmpCheckpoint(job)&&job.entryAttempted===false&&!identityInvalid(job)&&!job.identityBlock&&!duplicateIdentityKeys(jobs).has(job.key);}
export function nextIdentityEntry(jobs,now,{date,readyOnly=false,selected,excludeKey}={}){
 const duplicates=duplicateIdentityKeys(jobs);
 return jobs.filter(j=>automaticEntrySite(j.site)&&validHmpCheckpoint(j)&&j.key!==excludeKey&&(!date||j.date===date)&&(!selected||selected.includes(j.site))&&j.status==='reserved'&&j.entryAttempted===false&&!identityInvalid(j)&&!j.identityBlock&&!duplicates.has(j.key)&&Number.isSafeInteger(j.deadline)&&now<=j.deadline&&(!readyOnly||now>=(j.nextAt??j.due))).sort((a,b)=>a.deadline-b.deadline)[0]??null;
}
export function sameWorker(expected,current){
 if(!expected||!current||!sameEntryTarget(expected,current))return false;
 return ['key','site','date','slot','time','start','due','deadline','scheduleRevision','hmpTiming'].every(k=>expected[k]===current[k])&&(expected.site!=='hmp'||hmpSchema(expected)===hmpSchema(current))&&(expected.entryOwner===undefined||expected.entryOwner===current.entryOwner);
}
export function sameReceiptOwner(expected,current){return !!expected&&!!current&&expected.key===current.key&&expected.site===current.site&&expected.date===current.date&&expected.time===current.time&&sameEntryTarget(expected,current);}
// Metadata and aliases are saved in the original workflows transaction. No
// execution key, attempt budget, receipt or cancellation is reconstructed.
export function bindIdentityCatalog(jobs,events,site,date){
 const rows=structuredClone(jobs),targets=[],groups=new Map();
 for(const event of events){if(event.site!==site||event.date!==date||event.historyOnly||identityInvalid(event))continue;const id=canonicalIdentity(event);if(id){const group=groups.get(id)??[];group.push(event);groups.set(id,group);}}
 const processed=new Set();
 for(const event of events){
  if(event.site!==site||event.date!==date||event.historyOnly||identityInvalid(event))continue;
  const id=canonicalIdentity(event);if(!id){targets.push({event,key:null});continue;}if(processed.has(id))continue;processed.add(id);
  const group=groups.get(id),conflict=new Set(group.map(e=>e.time)).size>1||new Set(group.map(e=>e.url??'')).size>1;
  const keys=priorIdentityKeys(rows,event);if(keys.length>1){for(const key of keys)rows.find(j=>j.key===key).identityBlock='identity_conflict';continue;}
  const prior=keys.length===1?rows.find(j=>j.key===keys[0]):null;
  const uncertain=rows.some(j=>j.site===site&&j.date===date&&j.time===event.time&&!canonicalIdentity(j)&&(j.entryAttempted!==false||['clicked','manual_clicked','cancelled','unknown','attempting','running'].includes(j.status))&&j.key!==prior?.key);
  const reason=conflict?'identity_conflict':uncertain?'legacy_identity_unconfirmed':'';
  if(prior){
   prior.lectureIdentity=officialIdentity(event);prior.title=event.title;if(event.url)prior.url=event.url;
   if(reason)prior.identityBlock=reason;else delete prior.identityBlock;
  }
  targets.push({event,key:prior?.key??officialEntryKey(event),blocked:reason});
 }
 return {rows,targets};
}
export function rebookIdentity(previous,event,now){
 if(event?.lectureEnded===true||event?.registrationStatus==='closed'||previous?.status!=='cancelled'||previous.entryAttempted!==false||!canonicalIdentity(previous)||!sameEntryTarget(previous,event)||previous.date!==event.date||previous.time!==event.time||now>previous.deadline)return null;
 return {...structuredClone(previous),title:event.title,url:event.url,lectureIdentity:officialIdentity(event),status:'reserved',nextAt:Math.max(previous.due,now),rebookedAt:now,rebookCount:(previous.rebookCount??0)+1};
}
