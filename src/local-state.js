import {readFileSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {siteById} from './security.js';
import {eligibleNow,kstInstant,kstDate} from './schedule.js';

const KINDS=new Set(['entry','attendance','capsule','quiz','brand','lounge','daily_login']);
const STATES=new Set(['reserved','attempting','confirmed','unknown']);
const FIELDS=['site','kind','date','target','slot','dueAt','deadline'];
const MAX_BYTES=1_048_576,MAX_JOBS=1000;
const keyOf=job=>createHash('sha256').update(JSON.stringify([job.site,job.kind,job.date,job.target,job.slot])).digest('hex');
const copy=value=>structuredClone(value);

function validInput(job){
  if(!job||typeof job!=='object'||Array.isArray(job)||Object.keys(job).sort().join('|')!==[...FIELDS].sort().join('|'))return false;
  if(!siteById(job.site)||!KINDS.has(job.kind)||typeof job.target!=='string'||!/^[a-f0-9]{64}$/.test(job.target)||!Number.isInteger(job.slot)||job.slot<0||job.slot>127)return false;
  try{
    kstInstant(job.date,'00:00');
    return Number.isSafeInteger(job.dueAt)&&Number.isSafeInteger(job.deadline)&&job.dueAt>0&&
      job.date===kstDate(job.dueAt)&&job.deadline>=job.dueAt&&job.deadline-job.dueAt<=6*3_600_000;
  }catch{return false;}
}

function validState(state){
  if(!state||Object.keys(state).sort().join('|')!=='epoch|jobs|paused|schemaVersion'||state.schemaVersion!==1||typeof state.paused!=='boolean'||!Number.isSafeInteger(state.epoch)||state.epoch<0||!state.jobs||Array.isArray(state.jobs)||typeof state.jobs!=='object'||Object.keys(state.jobs).length>MAX_JOBS)return false;
  for(const [key,row] of Object.entries(state.jobs)){
    if(!row||Object.keys(row).sort().join('|')!==[...FIELDS,'state','epoch','updatedAt'].sort().join('|'))return false;
    const input=Object.fromEntries(FIELDS.map(field=>[field,row[field]]));
    if(!validInput(input)||key!==keyOf(input)||!STATES.has(row.state)||!Number.isSafeInteger(row.epoch)||row.epoch<0||row.epoch>state.epoch||!Number.isSafeInteger(row.updatedAt)||row.updatedAt<0)return false;
  }
  return true;
}

function atomicCommit(file,state){
  const raw=JSON.stringify(state,null,2)+'\n';
  if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('state_unavailable');
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+randomUUID()+'.tmp';
  let fd;
  try{
    fd=openSync(temporary,'wx',0o600);writeFileSync(fd,raw,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined;
    renameSync(temporary,file);
  }finally{
    if(fd!==undefined)try{closeSync(fd);}catch{}
    try{unlinkSync(temporary);}catch{}
  }
}

/** One application process owns this file. External actions are never done here. */
export class LocalState{
  #data;#file;#commit;#failed=false;
  constructor(file,{commit=atomicCommit}={}){
    this.#file=file;this.#commit=commit;
    let state={schemaVersion:1,paused:true,epoch:0,jobs:{}};
    try{
      if(statSync(file).size>MAX_BYTES)throw Error('state_unavailable');
      state=JSON.parse(readFileSync(file,'utf8'));
      if(!validState(state))throw Error('state_unavailable');
    }catch(error){if(error.code!=='ENOENT')throw Error('state_unavailable');}
    this.#data=state;
    const recovered=copy(state);let changed=false;
    for(const row of Object.values(recovered.jobs))if(row.state==='reserved'||row.state==='attempting'){row.state='unknown';changed=true;}
    if(changed)this.#save(recovered);
  }
  #save(next){
    try{this.#commit(this.#file,next);this.#data=next;}
    catch{this.#failed=true;throw Error('state_unavailable');}
  }
  snapshot(){const out=copy(this.#data);if(this.#failed)out.paused=true;return out;}
  setPaused(value){
    if(typeof value!=='boolean')throw Error('invalid_setting');
    if(value)this.#failed=true;
    const next=copy(this.#data);next.paused=value;next.epoch++;
    this.#save(next);this.#failed=false;
  }
  reserve(input,now=Date.now()){
    return this.reserveBatch([input],now)?.[0]??null;
  }
  reserveBatch(inputs,now=Date.now()){
    if(this.#failed||this.#data.paused||!Array.isArray(inputs)||!inputs.length||inputs.length>7||inputs.some(input=>!validInput(input)||!eligibleNow(input,now)))return null;
    const keys=inputs.map(keyOf);if(new Set(keys).size!==keys.length)return null;
    const next=copy(this.#data),first=kstDate(Math.max(0,now-7*86_400_000));
    for(const [key,row] of Object.entries(next.jobs))if(row.date<first)delete next.jobs[key];
    if(keys.some(key=>Object.hasOwn(next.jobs,key))||Object.keys(next.jobs).length+keys.length>MAX_JOBS)return null;
    inputs.forEach((input,i)=>{next.jobs[keys[i]]={...input,state:'reserved',epoch:next.epoch,updatedAt:now};});
    this.#save(next);return keys.map(key=>Object.freeze({key,epoch:next.epoch}));
  }
  // Grants a single dispatch; this is not evidence that a button or server ran.
  beginDispatch(ticket,now=Date.now()){
    return this.beginDispatchBatch([ticket],now);
  }
  beginDispatchBatch(tickets,now=Date.now()){
    if(this.#failed||this.#data.paused||!Array.isArray(tickets)||!tickets.length||tickets.length>7||new Set(tickets.map(ticket=>ticket?.key)).size!==tickets.length)return false;
    for(const ticket of tickets){const row=this.#data.jobs[ticket?.key];if(!row||row.state!=='reserved'||row.epoch!==ticket.epoch||ticket.epoch!==this.#data.epoch||!eligibleNow(row,now))return false;}
    const next=copy(this.#data);for(const ticket of tickets){next.jobs[ticket.key].state='attempting';next.jobs[ticket.key].updatedAt=now;}
    this.#save(next);return true;
  }
  consumed(input){return validInput(input)&&Object.hasOwn(this.#data.jobs,keyOf(input));}
  releaseUnexecuted(ticket,executed){
    const row=this.#data.jobs[ticket?.key];
    if(this.#failed||executed!==false||!row||row.state!=='attempting'||row.epoch!==ticket.epoch)return false;
    const next=copy(this.#data);delete next.jobs[ticket.key];this.#save(next);return true;
  }
  finish(ticket,state,now=Date.now()){
    const row=this.#data.jobs[ticket?.key];
    if(this.#failed||!row||row.state!=='attempting'||row.epoch!==ticket.epoch||!['confirmed','unknown'].includes(state)||!Number.isSafeInteger(now)||now<row.updatedAt)return false;
    const next=copy(this.#data);next.jobs[ticket.key].state=state;next.jobs[ticket.key].updatedAt=now;this.#save(next);return true;
  }
}
