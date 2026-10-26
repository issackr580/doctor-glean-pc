import {createHash} from 'node:crypto';
import {kstDate,kstInstant} from './schedule.js';
export const taskHash=value=>createHash('sha256').update(value).digest('hex');
export function dailyTicket(task,date,slot=0,now=Date.now()){
 const kind=task.kind.startsWith('brand')?'brand':task.kind;
 return {site:task.site,kind,date,target:taskHash(task.site+'|'+kind),slot,dueAt:now,deadline:Math.min(now+300000,kstInstant(kstDate(now+86400000),'00:00')-1)};
}
