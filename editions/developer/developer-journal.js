import {readFileSync,statSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

const DAY=86_400_000,WINDOW=7*DAY,MAX_BYTES=4_194_304,MAX_EVENTS=2000;
const AREAS=new Set(['collection','browser','control','process']);
const PHASES=new Set(['start','finish','phase','document_ready','document_load_failed','navigation_blocked','popup_blocked','window_opened','window_open_failed','login_fallback','session_flushed','session_flush_failed','enable','disable']);
const SITES=new Set(['','doctorville','keymedi','hmp','intermd','whodadoc','medigate','ckd','bluepharm','dtalks','docple']);
const REASONS=new Set(['idle','reading','finished','cancelled','suspended','date_mismatch','time_limit','storage_error','manual_view_open']);
const kstDay=at=>new Date(at+9*3_600_000).toISOString().slice(0,10);
const number=value=>Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000_000_000;
function clean(input,now){
 if(!input||!AREAS.has(input.area)||!PHASES.has(input.phase)||!SITES.has(input.site??'')||!number(input.at)||input.at>now)return null;
 const out={area:input.area,phase:input.phase,site:input.site??'',at:input.at};
 for(const key of ['completed','total','heapUsedKb','rssKb'])if(number(input[key]))out[key]=input[key];
 if(REASONS.has(input.reason))out.reason=input.reason;
 return out;
}
function persist(file,data){
 const raw=JSON.stringify(data)+'\n';if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('diagnostics_unavailable');
 mkdirSync(dirname(file),{recursive:true,mode:0o700});const temporary=file+'.'+randomUUID()+'.tmp';let fd;
 try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,raw,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,file);}
 finally{if(fd!==undefined)try{closeSync(fd);}catch{}try{unlinkSync(temporary);}catch{}}
}
export class DeveloperJournal{
 #file;#data={schemaVersion:1,startedAt:0,until:0,events:[]};#commit;#unavailable=false;#writeFailures=0;
 constructor(file,{commit=persist}={}){
  this.#file=file;this.#commit=commit;
  try{
   if(statSync(file).size>MAX_BYTES)throw Error();
   const raw=JSON.parse(readFileSync(file,'utf8'));
   if(raw.schemaVersion!==1||!number(raw.startedAt)||!number(raw.until)||raw.until>raw.startedAt+WINDOW||!Array.isArray(raw.events)||raw.events.length>7*MAX_EVENTS)throw Error();
   this.#data={schemaVersion:1,startedAt:raw.startedAt,until:raw.until,events:raw.events};
  }catch(error){if(error.code!=='ENOENT')this.#unavailable=true;}
 }
 #pruned(now){
  const first=kstDay(Math.max(0,now-6*DAY)),last=kstDay(now),events=[];const count=new Map();
  for(const input of this.#data.events){
   const row=clean(input,now);if(!row)continue;
   const day=kstDay(row.at);if(day<first||day>last||(count.get(day)??0)>=MAX_EVENTS)continue;
   count.set(day,(count.get(day)??0)+1);events.push(row);
  }
  return {...this.#data,events};
 }
 #save(next){try{this.#commit(this.#file,next);this.#data=next;return true;}catch{this.#unavailable=true;this.#writeFailures++;return false;}}
 status(now=Date.now()){
  const next=this.#pruned(now);
  if(!this.#unavailable&&JSON.stringify(next.events)!==JSON.stringify(this.#data.events))this.#save(next);
  return {enabled:!this.#unavailable&&now>=this.#data.startedAt&&now<this.#data.until,startedAt:this.#data.startedAt,until:this.#data.until,eventCount:next.events.length,writeFailures:this.#writeFailures,unavailable:this.#unavailable};
 }
 setEnabled(value,now=Date.now()){
  if(typeof value!=='boolean'||!number(now))return false;
  if(this.#unavailable)return false;
  const next=this.#pruned(now);next.startedAt=value?now:next.startedAt;next.until=value?now+WINDOW:0;
  return this.#save(next);
 }
 event(input,now=Date.now()){
  if(!this.status(now).enabled)return;
  const row=clean({...input,at:now},now);if(!row)return;
  const next=this.#pruned(now),day=kstDay(now);
  if(next.events.filter(event=>kstDay(event.at)===day).length>=MAX_EVENTS)return;
  next.events.push(row);this.#save(next);
 }
 export(now=Date.now()){
  const next=this.#pruned(now);return {schemaVersion:1,scope:'developer_opt_in_local_only',memoryScope:'electron_main_process_only',status:this.status(now),retainedKoreaCalendarDays:7,maxEventsPerDay:MAX_EVENTS,events:next.events};
 }
 clear(){
  try{this.#commit(this.#file,{schemaVersion:1,startedAt:0,until:0,events:[]});this.#data={schemaVersion:1,startedAt:0,until:0,events:[]};this.#unavailable=false;return true;}
  catch{this.#unavailable=true;this.#writeFailures++;return false;}
 }
}
