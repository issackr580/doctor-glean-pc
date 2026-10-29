// PC contract: bounded observations, never an execution permission or receipt.
const SITES=new Set(['doctorville','medigate','intermd','bluepharm','keymedi','hmp']);
export const ENTRY_STAGES=new Set(['reservation_observed','state_observed','work_started','page_started','page_finished','popup_opened','navigation_blocked','popup_blocked','network_error','renderer_gone','dialog_observed','inspect','target_open_requested','target_open_response','click_requested','click_response','navigation_observed','playback_observed','work_finished','retry_scheduled']);
const STATES=new Set(['reserved','running','attempting','ready','complete','clicked','manual_clicked','cancelled','expired','not_open','target_missing','button_missing','ambiguous','not_registered','blocked','login','invalid','navigate','open_target','detail_opened','lecture_ended','busy','network','unknown','already_attempted']);
const REASONS=new Set(['unknown','unknown_result','entry_ready','clicked','entry_clicked','navigation_unconfirmed','duplicate_prevented','entry_control_missing','registered_button_missing','title_unmatched','schedule_unmatched','duplicate_target','multiple_entry_controls','registration_conflict','registration_required','entry_disabled','unsafe_entry_action','login_required','manual_confirmation','document_loading','page_loading','document_origin','policy_rejected','outside_window','cancelled','expired','manual_clicked','manual_view_open','network_error','read_only','opens_later','before_window','target_card','target_card_opened','target_card_unconfirmed','detail_already_opened','hmp_target','hmp_ended','hmp_schedule_unmatched','hmp_title_unmatched','hmp_duplicate_target','hmp_unavailable','lecture_ended','click_already_sent']);
const PLAYBACK=new Set(['not_checked','no_video','requested','playing_observed','gesture_required','play_failed','inaccessible','not_ready','navigation_unconfirmed']);
const integer=(n,max=1e15)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const version=value=>typeof value==='string'&&value.length<=80&&/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value);
export function entryMeta(job,kind='entry'){
 if(!job||!SITES.has(job.site)||!['entry','prepare','preflight'].includes(kind)||typeof job.key!=='string'||!/^[a-f0-9]{64}$/.test(job.key)||typeof job.date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(job.date)||typeof job.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time)||!integer(job.slot,4))return null;
 const date=new Date(job.date+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==job.date)return null;
 const out={reference:job.key,site:job.site,date:job.date,time:job.time,slot:job.slot,entryKind:kind};
 for(const k of ['due','deadline'])if(integer(job[k])&&job[k]>0)out[k]=job[k];return out;
}
export function cleanEntryEvent(input){
 const meta=entryMeta({...input,key:input?.reference},input?.entryKind);if(!meta||!uuid(input.executionId)||!ENTRY_STAGES.has(input.phase)||!integer(input.at)||input.at===0)return null;
 const out={...meta,executionId:input.executionId,phase:input.phase,at:input.at};
 if(typeof input.owner==='string'&&/^[a-f0-9]{32}$/.test(input.owner))out.owner=input.owner;
 if(integer(input.attemptIndex,1000))out.attemptIndex=input.attemptIndex;
 if(input.status!==undefined)out.status=STATES.has(input.status)?input.status:'unknown';
 if(input.reason!==undefined)out.reason=REASONS.has(input.reason)?input.reason:'unknown';
 if(input.playback!==undefined)out.playback=PLAYBACK.has(input.playback)?input.playback:'not_checked';
 if(['pc','original'].includes(input.reader))out.reader=input.reader;
 if(input.targetSource==='catalog')out.targetSource='catalog';
 if(['missing','matched','ambiguous','unsafe'].includes(input.catalogReference))out.catalogReference=input.catalogReference;
 for(const k of ['attempted','submitted','targetMatched','navigationObserved','readOnly','duplicateEquivalent','mainFrame','popup'])if(typeof input[k]==='boolean')out[k]=input[k];
 for(const k of ['candidateCards','titleMatches','dateMatches','timeMatches','scheduleMatches','matchedTargets','entryControls','identifiedTargets','distinctIdentities','stateVariants','navigationBlocked','popupDenied','mainFrameFailures','dateMissingCards','dateInvalidCards','dateConflictCards','dateMismatchCards','startInvalidCards','startMismatchCards','sharedDateCards'])if(integer(input[k],1000))out[k]=input[k];
 for(const k of ['elapsedMs','pageGeneration','retryCount'])if(integer(input[k],k==='elapsedMs'?190000:10000))out[k]=input[k];
 if(version(input.appVersion))out.appVersion=input.appVersion;
 if(version(input.electronVersion))out.electronVersion=input.electronVersion;
 if(version(input.chromiumVersion))out.chromiumVersion=input.chromiumVersion;
 if(typeof input.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(input.sourceCommit))out.sourceCommit=input.sourceCommit;
 return out;
}
export function entryRecords(events){
 const records=new Map(),references=new Map();
 for(const raw of events){
  if(raw.area!=='entry')continue;const row=cleanEntryEvent(raw);if(!row)continue;
  const {reference,owner,phase,executionId,site,date,time,slot,entryKind,due,deadline,at,...detail}=row;
  let record=records.get(executionId);
  if(!record){record={executionId,site,date,time,slot,kind:entryKind,observedAt:at,updatedAt:at,...(due?{due}:{}),...(deadline?{deadline}:{}),events:[]};records.set(executionId,record);references.set(executionId,reference);}
  if(references.get(executionId)!==reference)continue;
  if(record.site!==site||record.date!==date||record.time!==time||record.slot!==slot||record.kind!==entryKind)continue;
  const event={stage:phase,at,...detail};record.events.push(event);record.updatedAt=at;
 }
 let rows=[...records.values()].sort((a,b)=>a.updatedAt-b.updatedAt).slice(-64),droppedRecords=records.size-rows.length;
 for(const row of rows)if(row.events.length>48){row.droppedEvents=row.events.length-48;row.events=row.events.slice(-48);}
 const result=()=>({schemaVersion:1,contract:'pc_entry_observations_v1',retainedDays:7,recordCount:rows.length,...(droppedRecords?{droppedRecords}:{}),records:rows});
 while(Buffer.byteLength(JSON.stringify(result()))>262144&&rows.length){rows.shift();droppedRecords++;}
 return result();
}
export function entryEvidence(record){
 const events=record.events,start=events.findLastIndex(e=>e.stage==='work_started'),index=events.at(-1)?.attemptIndex,scoped=start<0?events:events.slice(start),current=index===undefined?scoped:scoped.filter(e=>e.attemptIndex===index),last=current.at(-1);
 return {terminalRecorded:current.some(e=>e.stage==='work_finished'),attemptRecorded:current.some(e=>e.stage==='click_requested'&&e.attempted===true),clickResponseRecorded:current.some(e=>e.stage==='click_response'&&e.status==='clicked'),navigationRecorded:current.some(e=>e.stage==='navigation_observed'&&e.navigationObserved===true),manualReported:current.some(e=>e.stage==='state_observed'&&e.status==='manual_clicked'),status:last?.status??'unknown',reason:last?.reason??'unknown'};
}
export function focusReport(journal,executionId){
 const record=journal.records.find(row=>row.executionId===executionId);if(!record)return null;
 const evidence=entryEvidence(record),summary=[evidence.terminalRecorded?'이번 실행의 종료 기록이 있어요.':'이번 실행의 종료 기록이 없어요. 원인은 미확인이에요.',evidence.attemptRecorded?'PC가 실행 전에 시도 소비를 기록했어요.':'이번 실행의 PC 시도 소비 기록은 확인하지 못했어요.',evidence.clickResponseRecorded?'로컬 입장 처리기의 클릭 응답을 받았어요.':'로컬 입장 처리기의 클릭 응답은 확인하지 못했어요.',evidence.navigationRecorded?'클릭 뒤 허용된 문서 이동을 관측했어요.':'클릭 뒤 문서 이동은 확인하지 못했어요.','정확한 강의창 도착·출석·포인트 인정은 별도 확인이 필요해요.'];
 if(evidence.manualReported)summary.push('직접 입장 표시는 실제 입장 성공의 증거로 사용하지 않아요.');
 if(record.droppedEvents)summary.push('보관 한도로 일부 경과가 생략됐어요.');
 return JSON.stringify({schemaVersion:1,contract:journal.contract,scope:'selected_pc_entry_only',retainedDays:7,recordCount:1,summary,evidence,limits:{arrivalVerified:false,attendanceVerified:false,missingTerminalCause:'unknown'},records:[record]},null,2)+'\n';
}
