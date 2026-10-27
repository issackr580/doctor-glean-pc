export function dailyEvidenceLabel(receipt){
 if(receipt?.status!=='complete')return '';
 if(receipt.submitted===true)return 'PC 제출 후 사이트 완료 상태 관찰';
 if(receipt.attempted===true)return 'PC 시도 이력 있음 · 사이트 완료 상태 확인';
 return receipt.attempted===false?'기존 완료 상태 확인 · PC 새 제출 없음':'사이트 완료 상태 확인 · PC 제출 여부 미기록';
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
export function preflightLabel(receipt){
 if(!receipt)return '';
 if(receipt.status==='complete')return '대상·입장 버튼 확인 · 실제 클릭 없음';
 if(receipt.status==='not_open'&&receipt.reason==='opens_later')return '시작 전 · 입장 버튼 대기 · 실제 클릭 없음';
 if(receipt.status==='login')return '로그인 필요 · 계정 제출 없음';
 if(receipt.status==='cancelled')return '사전 검사 중단 · 실제 클릭 없음';
 if(receipt.status==='ambiguous')return '대상 또는 버튼 여러 개 · 실제 클릭 없음';
 if(receipt.status==='target_missing')return '날짜·시각·제목 대조 미완료 · 실제 클릭 없음';
 if(receipt.status==='button_missing')return '대상 확인 · 입장 버튼 없음 · 실제 클릭 없음';
 if(receipt.status==='blocked')return '사이트에서 직접 확인 필요 · 실제 클릭 없음';
 return '사전 검사 미완료 · 실제 클릭 없음';
}
