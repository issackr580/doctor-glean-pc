export function dailyEvidenceLabel(receipt){
 if(receipt?.status!=='complete')return '';
 if(receipt.submitted===true)return 'PC 제출 후 사이트 완료 상태 관찰';
 if(receipt.attempted===true)return 'PC 시도 이력 있음 · 사이트 완료 상태 확인';
 return receipt.attempted===false?'기존 완료 상태 확인 · PC 새 제출 없음':'사이트 완료 상태 확인 · PC 제출 여부 미기록';
}
export function canRegisterEntry(job){return !!job&&!job.entryAttempted&&['reserved','not_registered','login','busy','network','target_missing','button_missing','not_open','unknown','ambiguous','blocked'].includes(job.status);}
export const registrationButtonLabel=row=>row?'신청 상태 확인':'신청하기';
export function registrationReplyLabel(result){
 if(result?.ok){if(result.status==='confirmed')return '사이트에서 신청 완료 상태를 확인했어요. 열린 신청 창을 마치고 목록·자동 입장 예약을 확인해 주세요.';if(result.status==='requested')return '원래 신청 버튼을 실행했어요. 열린 사이트에서 최종 신청·동의를 마친 후 「신청 마침 · 상태 확인」을 눌러 주세요.';return '신청 완료를 확인하지 못했어요. 사이트에서 마무리한 뒤 신청 상태를 다시 확인해 주세요. 같은 신청은 자동으로 다시 보내지 않아요.';}
 if(result?.reason==='storage_error')return result.attempted?'신청 시도 뒤 기록 저장에 문제가 있어요. 사이트에서 결과를 확인해 주세요. 자동으로 다시 보내지 않아요.':'신청 시도 기록을 저장하지 못해 버튼을 실행하지 않았어요.';
 return ({busy:'진행 중인 작업을 마친 뒤 신청해 주세요.',manual_view_open:'이미 열린 해당 사이트 창을 마친 뒤 신청해 주세요.',login_required:'열린 신청 창에서 직접 로그인한 뒤 다시 신청해 주세요.',cancelled:result?.attempted?'신청 시도 뒤 중지됐어요. 사이트에서 결과를 확인해 주세요.':'신청 작업을 중지했어요.',registration_unavailable:'이 강의는 현재 신청할 수 없어요. 날짜·신청 마감과 예약 상태를 확인해 주세요.',invalid_registration:'현재 목록이나 예약의 강의를 선택해 주세요.'})[result?.reason]??'선택한 강의의 신청 버튼을 확인하지 못했어요. 열린 사이트에서 직접 확인해 주세요.';
}
export function entrySummary(entries){
 const summary={reservations:entries.length,waiting:0,pcClickedJobs:0,pcClicks:0,needsAttention:0,manual:0};
 for(const job of entries){
  const attempts=job.attempts?.length?job.attempts:job.receipt?[job.receipt]:[];
  const clicks=attempts.filter(row=>row.status==='clicked').length;
  summary.pcClicks+=clicks;if(clicks)summary.pcClickedJobs++;
  if(job.status==='reserved')summary.waiting++;
  if(job.status==='manual_clicked')summary.manual++;
  if(['login','unknown','blocked','ambiguous','network','target_missing','button_missing','not_registered','expired','not_open'].includes(job.status))summary.needsAttention++;
 }return summary;
}
export function entryFailureLabel(job){
 const r=job.receipt;if(!r)return '';
 const suffix=r.attempted===false?' · PC 입장 클릭 없음':'';
 if(r.titleMatches>0&&r.scheduleMatches===0)return '제목은 찾았지만 날짜·시작 시각을 대조하지 못함'+suffix;
 if(r.matchedTargets>1)return '날짜·제목이 맞는 대상이 여러 개여서 중단'+suffix;
 if(r.targetMatched&&r.entryControls===0)return '대상 강의 확인 · 입장 버튼 미확인'+suffix;
 if(r.reason==='manual_view_open')return '직접 사용하는 사이트 창 때문에 양보함'+suffix;
 if(r.status==='login')return '로그인 필요 · 저장 계정 복구 결과를 확인해 주세요.';
 if(r.status==='unknown'&&r.attempted)return 'PC 입장 시도 후 결과 불확실 · 자동 재제출 안 함';
 return '';
}
export function entryEvidenceLabel(job){
 const r=job.receipt;if(!r)return '실행 결과 없음 · 예약 생성과 실제 입장은 별개예요.';
 if(!r.attempted&&!r.navigationObserved&&r.status!=='clicked')return '';
 const click=r.status==='clicked'?'PC 클릭 확인':r.attempted?'PC 시도 · 클릭 결과 미확인':'PC 클릭 미확인';
 const navigation=r.navigationObserved===true?'강의창 이동 확인':'강의창 이동 미확인';
 const video=r.playback==='playing_observed'?'영상 진행 관찰':r.playback==='inaccessible'?'영상 상태 관찰 불가':'재생 미확인';
 return click+' → '+navigation+' → '+video+' · 출석·적립 미확인';
}
export function entryRunVersion(job){return job.receipt?.checkedAt===job.executionFinishedAt?job.executionVersion??'':'';}
export function entrySessionSummary(entries,startedAt){
 const counts={currentClicks:0,previousClicks:0,undatedClicks:0};
 for(const job of entries)for(const r of job.attempts?.length?job.attempts:job.receipt?[job.receipt]:[])if(r.status==='clicked'){
  if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(r.checkedAt))counts.undatedClicks++;
  else if(r.checkedAt>=startedAt)counts.currentClicks++;else counts.previousClicks++;
 }return counts;
}
export function preflightLabel(receipt){
 if(!receipt)return '';
 if(receipt.status==='complete')return '대상·입장 버튼 확인 · 실제 클릭 없음';
 if(receipt.status==='not_open'&&receipt.reason==='opens_later')return '시작 전 · 입장 버튼 대기 · 실제 클릭 없음';
 if(receipt.status==='login')return '로그인 필요 · 계정 제출 없음';
 if(receipt.status==='cancelled')return '사전 검사 중단 · 실제 클릭 없음';
 if(receipt.status==='ambiguous')return '대상 또는 버튼 여러 개 · 실제 클릭 없음';
 if(receipt.status==='target_missing')return (receipt.titleMatches>0?'제목 후보 확인 · 날짜·시작 시각 확인 못함':receipt.titleMatches===0?'예약한 강의 제목을 목록에서 찾지 못함':'강의 정보 확인 미완료')+' · 실제 클릭 없음';
 if(receipt.status==='button_missing')return '대상 확인 · 입장 버튼 없음 · 실제 클릭 없음';
 if(receipt.status==='blocked')return '사이트에서 직접 확인 필요 · 실제 클릭 없음';
 return '사전 검사 미완료 · 실제 클릭 없음';
}
