import {kstDate} from './schedule.js';
const STOP=new Set(['cancelled','manual_clicked','blocked','login','not_registered','lecture_ended']);
const plan=(row,slot)=>({slot,time:row.time,start:row.start,due:row.due,deadline:row.deadline});
// Two explicit timetable checkpoints, each owning a different durable slot.
// No correction creates a third slot or reopens an uncertain external action.
export function attachCheckpoints(job,corrected,now){
 if(!job||job.schedulePairSchema||job.site==='hmp'||job.repeatSchema||job.date!==kstDate(now)||job.time===corrected.time||STOP.has(job.status)||['running','attempting'].includes(job.status)||job.entryAttempted&&job.status!=='clicked'||job.status==='unknown'&&job.receipt?.attempted!==false)return null;
 const plans=[plan(job,0),plan(corrected,1)],done=job.status==='clicked'?[0]:[];
 const available=plans.filter(p=>!done.includes(p.slot)&&p.deadline>=now).sort((a,b)=>Math.max(a.due,now)-Math.max(b.due,now));if(!available.length)return null;
 const chosen=available[0];return {...chosen,slot:chosen.slot,scheduleSlot:chosen.slot,schedulePairSchema:1,schedulePlan:plans,scheduleConsumed:done,nextAt:Math.max(chosen.due,now),status:'reserved',entryAttempted:false,retries:0};
}
export function nextCheckpoint(job,receipt,now){
 if(job.date!==kstDate(now)||job.schedulePairSchema!==1||STOP.has(receipt.status)||receipt.status==='unknown'&&receipt.attempted)return null;
 const done=[...new Set([...(job.scheduleConsumed??[]),job.slot])];
 const next=job.schedulePlan.filter(p=>!done.includes(p.slot)&&p.deadline>=now).sort((a,b)=>Math.max(a.due,now)-Math.max(b.due,now))[0];
 return next?{...next,slot:next.slot,scheduleSlot:next.slot,scheduleConsumed:done,nextAt:Math.max(next.due,now),status:'reserved',entryAttempted:false,retries:0}:null;
}
