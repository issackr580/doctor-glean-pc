import {fileURLToPath} from 'node:url';

const ORIGINS=new Set(['uncaught_exception','unhandled_rejection','automation','control','startup']);
const CODES=new Set(['object_destroyed','navigation_aborted','storage_error','permission_denied','disk_full','type_error','range_error','runtime_error']);
const FILES=['main.js','async-work.js','automation-page.js','automation-controller.js','catalog-page.js','catalog-queue.js','catalog-runner.js','catalog-store.js','electron-catalog-page.js','credential-manager.js','credential-runner.js','credential-attempts.js','credential-vault.js','daily-runner.js','doctorville-quiz-runner.js','entry-runner.js','lounge-runner.js','local-state.js','workflow-store.js','manual-entry-watch.js'];
const SOURCES=new Set(['unknown',...FILES.map(file=>'src/'+file)]);
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const locations=FILES.map(file=>{
 const url=new URL('./'+file,import.meta.url);
 return {source:'src/'+file,pattern:new RegExp('(?:'+[url.href,fileURLToPath(url)].map(escape).join('|')+'):(\\d{1,6}):(\\d{1,5})(?=[)\\s]|$)')};
});
const text=(error,key)=>{try{const value=error?.[key];return typeof value==='string'?value.slice(0,20000):'';}catch{return '';}};
function classify(error){
 const code=text(error,'code'),message=text(error,'message');
 if(/^(?:Object has been destroyed|Object is destroyed)(?:[:.!\s]|$)/i.test(message)||code==='ERR_OBJECT_DESTROYED')return 'object_destroyed';
 if(code==='ERR_ABORTED')return 'navigation_aborted';
 if(code==='ENOSPC')return 'disk_full';
 if(code==='EACCES'||code==='EPERM')return 'permission_denied';
 if(['state_unavailable','catalog_unavailable','storage_error','storage_unavailable'].includes(message))return 'storage_error';
 if(text(error,'name')==='TypeError')return 'type_error';
 if(text(error,'name')==='RangeError')return 'range_error';
 return 'runtime_error';
}
export function safeRuntimeFault(input){
 if(!input||!ORIGINS.has(input.origin)||!CODES.has(input.code))return null;
 const out={origin:input.origin,code:input.code,source:SOURCES.has(input.source)?input.source:'unknown'};
 if(out.source!=='unknown')for(const key of ['line','column'])if(Number.isSafeInteger(input[key])&&input[key]>0&&input[key]<=999999)out[key]=input[key];
 return out;
}
export function faultNotice(fault,{startup=false}={}){
 const code=CODES.has(fault?.code)?fault.code:'runtime_error',storage=['storage_error','permission_denied','disk_full'].includes(code);
 return {
  type:'error',title:storage?'저장 확인 필요':startup?'프로그램 시작 확인 필요':'자동 실행 확인 필요',
  message:(storage?'설정이나 실행 기록을 저장하거나 읽지 못했어요. 저장 공간과 파일 접근 권한을 확인해 주세요.':startup?'프로그램을 시작하는 중 오류가 발생했어요.':'자동 실행 중 오류가 발생해 자동 작업을 중지했어요.')+
   '\n오류 코드: '+code+'\n'+(startup?'기존 파일을 지우지 말고 오류를 알려 주세요.':'오류보고를 저장해 보내 주세요. 기존 계정과 실행 기록은 지우지 마세요.'),
 };
}

// Monitor only: Electron/Node retain their normal exception handling and popup.
// The standard report keeps ten safe rows in memory. Only the existing opt-in
// developer journal may persist them; no raw message, stack, path or URL escapes.
export class RuntimeFaults{
 constructor({onFault=()=>{},now=Date.now}={}){Object.assign(this,{onFault,now});this.events=[];this.total=0;}
 record(origin,error){
  if(!ORIGINS.has(origin))return null;
  let position={source:'unknown'};
  for(const line of text(error,'stack').split('\n').slice(1,30)){
   if(!/^\s+at /.test(line))continue;
   for(const {source,pattern} of locations){const match=line.match(pattern);if(match){position={source,line:Number(match[1]),column:Number(match[2])};break;}}
   if(position.source!=='unknown')break;
  }
  const at=this.now(),row=Object.freeze({at:Number.isSafeInteger(at)&&at>=0?at:0,...safeRuntimeFault({origin,code:classify(error),...position})});
  this.total=Math.min(1_000_000,this.total+1);this.events.push(row);if(this.events.length>10)this.events.shift();
  try{this.onFault({...row});}catch{}
  return row;
 }
 install(target=process){
  if(this.target)return;
  this.target=target;this.listener=(error,origin)=>this.record(origin==='unhandledRejection'?'unhandled_rejection':'uncaught_exception',error);
  target.on('uncaughtExceptionMonitor',this.listener);
 }
 snapshot(){return {scope:'current_process_memory_only',total:this.total,events:structuredClone(this.events)};}
 close(){if(this.target){this.target.removeListener('uncaughtExceptionMonitor',this.listener);this.target=null;}}
}
