import {createHash} from 'node:crypto';
import {entrySchedule} from './automation-policy.js';
import {catalogEntryReference} from './entry-reference.js';
import {kstDate,kstInstant} from './schedule.js';

export const detailIdentity=url=>createHash('sha256').update(url).digest('hex');

// A proposal is read-only. Only a fresh exact detail and an unchanged, unused
// reservation can authorize persisting it; it never grants an entry attempt.
export function catalogScheduleRevision(job,results,now){
 if(job?.site!=='doctorville'||job.date!==kstDate(now)||!['reserved','target_missing','button_missing','not_open','network','busy','login','expired','not_registered','unknown'].includes(job.status)||job.slot!==0||job.entryAttempted!==false)return null;
 if(job.status==='unknown'&&job.receipt?.attempted!==false)return null;
 if([job.receipt,...(job.attempts??[])].some(r=>r&&(r.attempted===true||['clicked','manual_clicked','attempting'].includes(r.status)||r.status==='unknown'&&r.attempted!==false)))return null;
 const row=results?.doctorville;
 if(!row||row.stale!==false||!Number.isSafeInteger(row.checkedAt)||row.checkedAt>now||kstDate(row.checkedAt)!==job.date)return null;
 const ref=catalogEntryReference(job,results);if(ref?.status!=='navigate')return null;
 const title=value=>String(value??'').replace(/\s+/g,' ').trim();
 const matches=row.events.filter(e=>e?.site===job.site&&e.date===job.date&&title(e.title)===title(job.title));
 if(matches.some(e=>e.lectureEnded===true))return null;
 const times=[...new Set(matches.map(e=>e.time))];
 const time=times.find(value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value));if(!time)return null;
 const timing=entrySchedule({...job,time},kstInstant(job.date,'00:00')),identity=detailIdentity(ref.url);
 if(!timing||job.scheduleIdentity&&job.scheduleIdentity!==identity)return null;
 const due=Math.max(timing.due,kstInstant(job.date,'00:00'));
 return {key:job.key,before:JSON.stringify(job),reference:ref,identity,catalogAt:row.checkedAt,job:{...job,time,...timing,due,nextAt:Math.max(due,now)}};
}

// Current site evidence can repair an obsolete timer. A late recovery needs
// the original ready entry control and an explicit, still-future end time.
export function confirmedRevisionTiming(job,reply,now){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(reply.observedTime))return null;
 const timing=entrySchedule({...job,time:reply.observedTime},kstInstant(job.date,'00:00'));if(!timing)return null;
 const end=Number.isSafeInteger(reply.endsAt)?reply.endsAt:0;
 if(end&&(kstDate(end)!==job.date||end<=timing.start||end<=now))return null;
 const late=now>timing.deadline,recovered=late||job.status!=='reserved'||now>job.deadline;
 if(late&&(!end||reply.status!=='ready')||recovered&&timing.start<=now&&reply.status!=='ready')return null;
 if(!['ready','not_open'].includes(reply.status))return null;
 const due=late?now:Math.max(timing.due,kstInstant(job.date,'00:00')),deadline=late?Math.min(end,now+600000):timing.deadline;
 const unchanged=!recovered&&job.time===reply.observedTime&&job.start===timing.start&&job.due===due&&job.deadline===deadline;
 return {time:reply.observedTime,start:timing.start,due,deadline,nextAt:unchanged?job.nextAt:Math.max(due,now),recovered,entryClosesAt:late?end:undefined,unchanged};
}
