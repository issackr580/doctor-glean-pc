const DAY=86_400_000,KST=9*3_600_000;
export function kstDate(now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)throw Error('invalid_time');
  return new Date(now+KST).toISOString().slice(0,10);
}
export function kstInstant(date,time){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))throw Error('invalid_schedule');
  const day=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==date)throw Error('invalid_schedule');
  return Date.parse(`${date}T${time.length===5?time+':00':time}+09:00`);
}
export function hmpSlots(date,start,endedAt=Infinity){
  const first=kstInstant(date,start);
  if(endedAt!==Infinity&&!Number.isSafeInteger(endedAt))throw Error('invalid_time');
  return Array.from({length:5},(_,slot)=>({slot,dueAt:first+slot*600_000})).filter(row=>row.dueAt<endedAt);
}
export function nextLoungePreparation(now){
  const first=kstDate(now);
  for(let i=0;i<370;i++){
    const day=new Date(Date.parse(first+'T00:00:00Z')+i*DAY);
    if(day.getUTCDay()===0||day.getUTCDay()===6)continue;
    const at=kstInstant(day.toISOString().slice(0,10),'00:00:02');
    if(at>now)return at;
  }
  throw Error('invalid_schedule');
}
export function eligibleNow(job,now){
  try{return !!job&&Number.isSafeInteger(now)&&Number.isSafeInteger(job.dueAt)&&Number.isSafeInteger(job.deadline)&&
    job.dueAt<=job.deadline&&job.date===kstDate(now)&&job.date===kstDate(job.dueAt)&&now>=job.dueAt&&now<=job.deadline;
  }catch{return false;}
}
