import {entrySchedule} from './automation-policy.js';
import {officialIdentity,identityInvalid,officialEntryKey,legacyEntryKey} from './entry-identity.js';
import {kstInstant} from './schedule.js';
export function createEntryJob(event,now){
 if(!event||event.historyOnly||identityInvalid(event))return null;
 const timing=entrySchedule(event,now);if(!timing)return null;
 let slot=0;if(event.site==='hmp')while(slot<5&&now>timing.start+slot*600000+90000)slot++;if(slot===5)return null;
 const due=event.site==='hmp'?timing.start+slot*600000:Math.max(timing.due,kstInstant(event.date,'00:00')),deadline=event.site==='hmp'?due+90000:timing.deadline,id=officialIdentity(event);
 return {key:officialEntryKey(event)??legacyEntryKey(event),site:event.site,date:event.date,time:event.time,title:event.title,start:timing.start,due,deadline,nextAt:due,status:'reserved',slot,retries:0,attempts:[],entryAttempted:false,prepAt:event.site==='hmp'?timing.start-600000:0,...(typeof event.url==='string'?{url:event.url}:{}),...(id?{lectureIdentity:id}:{}),...(['whodadoc','dtalks'].includes(event.site)?{repeatSchema:1}:{}),...(event.site==='docple'?{id:event.id,registrationStatus:event.registrationStatus}:{})};
}
