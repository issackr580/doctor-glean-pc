import {firstHmpSlot,hmpDue} from './hmp-policy.js';
import {entrySchedule} from './automation-policy.js';
import {officialIdentity,identityInvalid,officialEntryKey,legacyEntryKey} from './entry-identity.js';
import {kstInstant,kstDate} from './schedule.js';
export function createEntryJob(event,now){
 if(!event||event.historyOnly||identityInvalid(event))return null;
 const timing=entrySchedule(event,now);if(!timing)return null;
 let slot=event.site==='hmp'?firstHmpSlot(timing.start,now):0;if(slot===null)return null;
 const due=event.site==='hmp'?hmpDue(timing.start,slot):Math.max(timing.due,kstInstant(event.date,'00:00')),deadline=event.site==='hmp'?due+90000:timing.deadline,id=officialIdentity(event);if(event.site==='hmp'&&kstDate(due)!==event.date)return null;
 return {key:officialEntryKey(event)??legacyEntryKey(event),site:event.site,date:event.date,time:event.time,title:event.title,start:timing.start,due,deadline,nextAt:due,status:'reserved',slot,retries:0,attempts:[],entryAttempted:false,prepAt:event.site==='hmp'?timing.start-600000:0,...(event.site==='hmp'?{hmpRepeatSchema:2,hmpTiming:'start_0_25_35',hmpAttempts:[]}:{}),...(typeof event.url==='string'?{url:event.url}:{}),...(id?{lectureIdentity:id}:{}),...(['whodadoc','dtalks'].includes(event.site)?{repeatSchema:1}:{}),...(event.site==='docple'?{id:event.id,registrationStatus:event.registrationStatus}:{})};
}
