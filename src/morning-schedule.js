import {createHmac,randomBytes} from 'node:crypto';
import {atomicJson,readJson} from './atomic-json.js';
import {kstDate,kstInstant} from './schedule.js';

export class MorningSchedule {
 constructor(file){
  this.file=file;
  try{
   this.state=readJson(file,null,s=>s?.version===1&&/^[0-9a-f]{64}$/.test(s.seed)&&(!s.date||Number.isSafeInteger(s.at)&&s.at>=kstInstant(s.date,'08:10')&&s.at<=kstInstant(s.date,'08:12')));
   if(!this.state){this.state={version:1,seed:randomBytes(32).toString('hex')};atomicJson(file,this.state);}
  }catch{this.failed=true;}
 }
 quizDue(date){
  if(this.failed||[0,6].includes(new Date(date+'T00:00:00Z').getUTCDay()))return 0;
  return kstInstant(date,'08:00:30')+createHmac('sha256',Buffer.from(this.state.seed,'hex')).update('intermd:'+date).digest().readUInt32BE()%120001;
 }
 next(now){
  if(this.failed)return 0;
  const today=kstDate(now),date=now>=kstInstant(today,'08:40')?kstDate(now+86400000):today;
  const start=kstInstant(date,'08:10'),offset=createHmac('sha256',Buffer.from(this.state.seed,'hex')).update(date).digest().readUInt32BE()%120001;
  const due=Math.min(start+offset,this.state.date===date?this.state.at:Infinity);
  if(this.state.date!==date||due!==this.state.at){
   const next={...this.state,date,at:due};try{atomicJson(this.file,next);this.state=next;}catch{this.failed=true;return 0;}
  }
  return due;
 }
}
