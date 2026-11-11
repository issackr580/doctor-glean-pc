import {kstDate,kstInstant} from './schedule.js';
// PC native policy. Receipt history and old checkpoint numbers are never
// renamed or used as proof of a different policy's execution.
const MINUTE=60000,OFFSETS=[0,25,35],UNEXECUTED=new Set(['expired','not_open','button_missing','target_missing','network','busy']);
const STOP=new Set(['login','blocked','permissions','not_registered','ambiguous','cancelled','manual_clicked','automation_paused','lecture_ended','stopped']);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export const hmpSchema=job=>job?.hmpRepeatSchema??1;
export function hmpDue(start,slot){return integer(start)&&Number.isInteger(slot)&&slot>=0&&slot<3?start+OFFSETS[slot]*MINUTE:null;}
export function hmp35Proof(job){
 if(job?.site!=='hmp'||job.hmpRepeatSchema!==2||job.hmpTiming!=='start_0_25_35'||!integer(job.start)||!Array.isArray(job.hmpAttempts))return false;
 const rows=job.hmpAttempts.filter(r=>r?.hmpRepeatSchema===2&&r.slot===1);if(rows.length!==1)return false;
 const r=rows[0],due=hmpDue(job.start,1),deadline=hmpDue(job.start,2)+90000;
 return r.due===due&&integer(r.at)&&r.at>=due&&r.at<=deadline&&(r.entryAttempted===false&&UNEXECUTED.has(r.status)||r.entryAttempted===true&&r.status==='clicked'&&r.playback==='play_failed');
}
export function validHmpCheckpoint(job){
 if(job?.site!=='hmp')return true;
 const due=hmpDue(job.start,job.slot);
 try{return job.hmpRepeatSchema===2&&job.hmpTiming==='start_0_25_35'&&integer(job.start)&&job.start===kstInstant(job.date,job.time)&&due!==null&&kstDate(due)===job.date&&job.due===due&&job.deadline===due+90000&&(job.slot!==2||hmp35Proof(job));}catch{return false;}
}
// Self-contained because this is serialized into the actual isolated renderer.
export function browserHmpCheckpoint(job){
 if(job?.site!=='hmp'||typeof job.key!=='string'||!/^[a-f0-9]{64}$/.test(job.key)||job.hmpRepeatSchema!==2||job.hmpTiming!=='start_0_25_35'||!Number.isSafeInteger(job.start)||!Number.isInteger(job.slot)||job.slot<0||job.slot>2||job.hmpSlot!==undefined&&job.hmpSlot!==job.slot)return false;
 const due=job.start+[0,25,35][job.slot]*60000;if(job.start!==Date.parse(job.date+'T'+job.time+':00+09:00')||new Date(due+32400000).toISOString().slice(0,10)!==job.date||job.due!==due||job.deadline!==due+90000)return false;
 if(job.slot!==2)return true;
 if(!Array.isArray(job.hmpAttempts))return false;const proof=job.hmpAttempts.filter(r=>r?.hmpRepeatSchema===2&&r.slot===1);if(proof.length!==1)return false;
 const r=proof[0];return r.due===job.start+25*60000&&Number.isSafeInteger(r.at)&&r.at>=r.due&&r.at<=job.deadline&&(r.entryAttempted===false&&['expired','not_open','button_missing','target_missing','network','busy'].includes(r.status)||r.entryAttempted===true&&r.status==='clicked'&&r.playback==='play_failed');
}
export function firstHmpSlot(start,now,skipStart=false){
 if(!integer(start)||!integer(now))return null;
 for(const slot of [0,1])if((slot!==0||!skipStart)&&now<=hmpDue(start,slot)+90000)return slot;
 return null;
}
export function hmpHistory(job,receipt,now){
 const rows=job.hmpAttempts??[],legacy=rows.filter(r=>r.hmpRepeatSchema!==2).slice(-5),native=rows.filter(r=>r.hmpRepeatSchema===2);
 return [...legacy,...[...native,{hmpRepeatSchema:2,slot:job.slot,due:job.due,at:now,...(typeof receipt.attempted==='boolean'?{entryAttempted:receipt.attempted}:{}),status:receipt.status,...(receipt.playback?{playback:receipt.playback}:{})}].slice(-3)];
}
export function nextHmpCheckpoint(job,receipt,now,history){
 if(!validHmpCheckpoint(job)||STOP.has(receipt.status))return null;
 let slot=job.slot===0?1:job.slot===1&&hmp35Proof({...job,hmpAttempts:history})?2:null;
 if(slot===null||kstDate(now)!==job.date||kstDate(hmpDue(job.start,slot))!==job.date||now>hmpDue(job.start,slot)+90000)return null;
 const due=hmpDue(job.start,slot);return {slot,due,deadline:due+90000,nextAt:Math.max(due,now),status:'reserved',entryAttempted:false,retries:0,hmpAttempts:history};
}
export function migrateEntryPolicy(row,now,consumed=false){
 const job=structuredClone(row);
 if(job.site==='dtalks'&&['reserved','running','attempting','opening'].includes(job.status))return {...job,status:'cancelled',nextAt:0,policyClosed:'dtalks_automatic_disabled_v156'};
 if(job.site!=='hmp'||hmpSchema(job)===2)return job;
 if(hmpSchema(job)!==1)return {...job,status:'unknown',nextAt:0,policyClosed:'hmp_schema_unconfirmed'};
 if(job.date!==kstDate(now))return job;
 if(['cancelled','manual_clicked','unknown','clicked','lecture_ended','stopped','automation_paused'].includes(job.status))return job;
 if(job.status!=='reserved'||job.entryAttempted!==false||consumed)return {...job,status:'unknown',nextAt:0,policyClosed:'hmp_legacy_execution_unconfirmed'};
 const old=job.hmpAttempts??job.attempts??[],startUsed=job.slot>0||old.some(r=>r?.slot===0||r?.due===job.start);
 const slot=firstHmpSlot(job.start,now,startUsed);
 if(slot===null)return {...job,status:'expired',nextAt:0,policyClosed:'hmp_legacy_window_closed'};
 const due=hmpDue(job.start,slot);
 return {...job,hmpRepeatSchema:2,hmpTiming:'start_0_25_35',hmpAttempts:[...old].slice(-5),slot,due,deadline:due+90000,nextAt:Math.max(due,now)};
}
