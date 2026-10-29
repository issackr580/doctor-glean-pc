const FEATURES=[['dailyClaim','출석·캡슐 자동 수령'],['quizAuto','닥터빌 당일 퀴즈 · 조회 후 하루 1회 제출'],['brand','키메디 브랜드관 · 하루 최대 2회'],['entry','오늘 강의 자동 입장'],['morning','매일 오전 8:10 한 번에 실행'],['lounge','평일 00:01:02 닥터라운지 미션']];
import {dailyEvidenceLabel,entrySummary,entrySessionSummary,entryFailureLabel,entryEvidenceLabel,preflightLabel,entryRunVersion,canRegisterEntry,registrationButtonLabel,registrationReplyLabel} from '../src/execution-presentation.js';
const LABELS={complete:'완료',success:'완료',pending:'직접 참여 가능',none:'오늘 참여 기회 없음',offday:'진행 없는 날',scheduled:'시작 전',login:'로그인 필요',ended:'배너 없음 · 오늘 종료',running:'확인 중',reserved:'예약됨',attempting:'버튼 실행 · 결과 확인 중',clicked:'입장 버튼 실행',manual_clicked:'직접 입장 기록',expired:'기한 종료',cancelled:'취소됨',blocked:'사이트에서 직접 확인 필요',ambiguous:'대상 강의 확인 필요',not_registered:'미신청',lecture_ended:'강의 종료',not_open:'입장 버튼 아직 없음',button_missing:'입장 버튼 확인 필요',target_missing:'대상 강의 확인 필요',busy:'다른 창 사용 중',network:'연결 확인 필요',wrong:'오답 안내 · 자동 재제출 안 함',missed:'실행 기한 지남',stopped:'확인 종료',unknown:'결과 확인 필요'};
const reasonLabels={brand_recommendation_unavailable:'추천 배너가 없어 오늘 확인을 종료했어요.',brand_previous_no_banner:'추천 배너가 없어 남은 회차도 종료했어요.',brand_daily_limit:'오늘 참여 기회를 모두 사용했어요.',brand_closed:'선착순 참여가 마감됐어요.',duplicate_prevented:'이미 시도한 기록이 있어 다시 제출하지 않아요.',manual_view_open:'열린 사이트 창을 마친 뒤 다시 확인해 주세요.',login_required:'사이트를 열어 로그인해 주세요.',today_quiz_missing:'오늘 퀴즈를 찾지 못했어요. 제출하지 않았어요.',already_participated:'사이트에서 이미 참여한 상태를 확인했어요.',success_receipt:'사이트의 정답·포인트 완료 안내를 확인했어요.',read_only:'상태만 확인했어요.',navigation_unconfirmed:'강의창 이동을 확인하지 못했어요.'};
const playback={playing_observed:'영상 진행 관찰',requested:'재생 요청 · 확인 필요',gesture_required:'직접 재생 필요',play_failed:'재생 요청 실패',inaccessible:'영상 상태 읽기 불가',no_video:'동영상 확인 못 함',navigation_unconfirmed:'강의창 이동 확인 못 함',not_checked:'재생 미확인',not_ready:'재생 준비 미확인'};
const clock=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(value):'';
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function button(label,action){const b=el('button',label);b.type='button';b.onclick=action;return b;}
export function renderAutomation(state,api,perform){
 const a=state.automation;if(!a)return;
 const features=document.getElementById('features');
 features.replaceChildren(...FEATURES.map(([key,label])=>{
  const row=el('label',undefined,'feature');const check=document.createElement('input');check.type='checkbox';check.checked=a.features[key];check.onchange=()=>perform(()=>api.setFeature(key,check.checked),'자동 실행 기능 설정을 저장했어요.');row.append(check,document.createTextNode(label));return row;
 }));
 const allowed=document.getElementById('resume');allowed.textContent=state.paused?'자동 실행 허용':'자동 실행 중지';allowed.onclick=()=>perform(()=>api.setPaused(!state.paused),state.paused?'선택한 자동 기능의 실행을 허용했어요.':'자동 실행을 중지했어요.');
 const entrySites=document.getElementById('entry-sites');
 entrySites.replaceChildren(...state.sites.filter(site=>['doctorville','medigate','intermd','bluepharm','keymedi','hmp'].includes(site.id)).map(site=>{
  const label=el('label',undefined,'feature');const check=document.createElement('input');check.type='checkbox';check.checked=a.entrySites.includes(site.id);check.onchange=()=>{const ids=check.checked?[...a.entrySites,site.id]:a.entrySites.filter(id=>id!==site.id);perform(()=>api.setEntrySites(ids),'자동 입장 사이트를 저장했어요.');};label.append(check,document.createTextNode(site.name+(site.id==='hmp'?' · 10분 간격 최대 5회':'')+(check.checked&&!site.selected?' · 강의 조회 선택·갱신 필요':'')));return label;
 }));
 document.getElementById('automation-state').textContent=state.paused?'자동 실행 중지됨 · 상태 확인과 수동 조회는 사용할 수 있어요.':a.active?'작업 중 · '+({daily:'출석·퀴즈·브랜드관',entry:'자동 입장',prepare:'한미 입장 준비',lounge:'닥터라운지',preflight:'예약 사전 검사 · 클릭 없음'})[a.active]:'자동 실행 허용됨 · 체크한 기능만 실행해요.';
 document.getElementById('daily-progress').textContent=a.daily.running?(a.daily.readOnly?'상태만 확인 · 제출 없음 · ':'자동 기능 확인 · ')+a.daily.progress:a.queuedDaily.length?'현재 작업을 마치면 출석·퀴즈를 확인해요.':a.daily.readOnly===true?'최근 상태 확인 종료 · 로그인·출석·퀴즈 제출은 하지 않았어요.':a.today.morning?.status==='complete'?'오전 자동 점검 종료 · 사이트별 결과와 실제 제출 여부는 아래에서 확인해 주세요.':'';
 document.getElementById('daily-results').replaceChildren(...state.dailyTasks.map(task=>{
  const r=a.today.daily[task.key],row=el('div',undefined,'task-row');row.append(el('strong',task.label),el('span',r?(LABELS[r.status]??'확인 필요'):'미확인'));
  if(r){const detail=reasonLabels[r.reason]??(r.attempted&&r.status==='unknown'?'실행 결과가 불확실해 다시 제출하지 않아요.':'');if(detail)row.append(el('p',detail,'muted'));const evidence=dailyEvidenceLabel(r);if(evidence)row.append(el('p',evidence+' · 확인 '+clock(r.checkedAt),'muted'));}return row;
 }));
 const entries=a.entries.map(job=>{
  const row=el('article',undefined,'lecture entry-row'),content=el('div'),site=state.sites.find(s=>s.id===job.site)?.name??'';
  content.append(el('p',site+' · '+job.time,'lecture-site'),el('p',job.title,'lecture-title'),el('p',LABELS[job.status]??'확인 필요','site-status'));
  if(job.status==='reserved')content.append(el('p','다음 확인 '+clock(job.nextAt??job.due),'muted'));
  const failure=entryFailureLabel(job);if(failure)content.append(el('p',failure,'site-status'));
  const evidence=entryEvidenceLabel(job);if(evidence)content.append(el('p',evidence,'muted'));
  if(job.receipt?.checkedAt){const version=entryRunVersion(job);content.append(el('p','최근 결과 '+clock(job.receipt.checkedAt)+(job.receipt.checkedAt<state.processStartedAt?' · 이번 프로그램 시작 전 기록':'')+(version&&job.lastStartedAt?' · 실제 시작 '+clock(job.lastStartedAt):'')+(version?' · PC '+version:' · 실행 버전 미기록'),'muted'));}
  if(job.preflight)content.append(el('p','사전 검사 '+clock(job.preflight.checkedAt)+' · '+preflightLabel(job.preflight)+(job.preflight.reads!==undefined?' · 판독 '+job.preflight.reads+'회':''),'muted'));
  const registration=state.registration?.entries[job.key];if(registration)content.append(el('p',(registration.state==='confirmed'?'수강 신청 완료 상태 확인':'수강 신청 시도 · 완료 미확인')+' · '+clock(registration.updatedAt),'muted'));
  if(job.site==='hmp'){
   content.append(el('p','시작 기준 10분 간격 · 최대 5회 · 종료 확인 시 중단','muted'));
   for(const attempt of job.attempts??[])content.append(el('p',clock(attempt.due)+' · '+(LABELS[attempt.status]??'확인 필요')+(attempt.playback?' · '+playback[attempt.playback]:''),'muted'));
  }
  const actions=el('div',undefined,'query-controls');
  if(canRegisterEntry(job)&&api.requestRegistration){const apply=button(registrationButtonLabel(state.registration?.entries[job.key]),()=>perform(()=>api.requestRegistration('entry',job.key),registrationReplyLabel));apply.disabled=!!state.registration?.active||!!a.active||state.collection.running||!!state.credentials?.active||state.registration?.storageUnavailable===true;actions.append(apply);}
  if(api.preflightEntry){const check=button('사전 검사 · 클릭 없음',()=>perform(()=>api.preflightEntry(job.key),'읽기 전용 사전 검사를 마쳤어요. 실제 입장·적립 성공은 별도 확인해 주세요.'));check.disabled=!!a.active||state.collection.running||!!state.credentials?.active;actions.append(check);}
  if(!['clicked','manual_clicked','cancelled','expired','lecture_ended'].includes(job.status))actions.append(button('예약 취소',()=>perform(()=>api.cancelEntry(job.key),'예약을 취소했어요.')),button('직접 입장했어요',()=>perform(()=>api.markManualEntry(job.key),'직접 입장한 기록을 남겼어요.')));
  if(!job.entryAttempted&&['login','busy','network','target_missing','button_missing','not_open','unknown'].includes(job.status))actions.append(button('다시 예약',()=>perform(()=>api.retryEntry(job.key),'원래 기한 안에서 다시 예약했어요.')));
  content.append(actions);row.append(content);return row;
 });
 if(!entries.length)entries.push(el('p','오늘 조회한 강의 중 선택한 사이트의 입장 예약이 여기에 표시돼요.','muted'));
 const summary=entrySummary(a.entries),overview=el('p',`예약 ${summary.reservations}건 · 대기 ${summary.waiting}건 · PC 클릭 ${summary.pcClickedJobs}강의/${summary.pcClicks}회 · 확인 필요 ${summary.needsAttention}건`,'site-status');
 const session=entrySessionSummary(a.entries,state.processStartedAt),sessionInfo=el('p',`이번 프로그램 실행 후 PC 클릭 ${session.currentClicks}회 · 시작 전 기록 ${session.previousClicks}회`+(session.undatedClicks?` · 실행 시각 미기록 ${session.undatedClicks}회`:'')+' · 영상·적립 완료는 별도 확인','muted');
 const batch=button('예정 예약 일괄 사전 검사 · 클릭 없음',()=>perform(()=>api.preflightUpcoming(),'사전 검사 처리를 마쳤어요. 검사 수와 예약별 결과를 확인해 주세요. 입장·적립 성공은 별도예요.'));
 batch.disabled=!api.preflightUpcoming||!!a.active||state.collection.running||!!state.credentials?.active||!a.entries.some(job=>job.status==='reserved'&&job.start>Date.now());
 const progress=a.preflight,progressInfo=el('p',progress?`예약 사전 검사 ${progress.running?'진행 중':'종료'} · 처리 ${progress.completed}/${progress.total}건 · 건너뜀 ${progress.skipped}건`+(progress.ready!==undefined?` · 버튼 확인 ${progress.ready} · 시작 전 대기 ${progress.waiting} · 로그인 필요 ${progress.login} · 확인 필요 ${progress.unresolved}`:'')+(progress.reason==='cancelled'||progress.reason==='entry_priority'?' · 중단됨, 남은 예약은 다시 검사해 주세요.':'')+' · 로그인·입장 제출 없음':'예정 예약을 최대 40건·2분 동안 읽기만 확인해요. 정시 작업이 우선해요.','muted');
 document.getElementById('entry-results').replaceChildren(overview,sessionInfo,batch,progressInfo,...entries);
 const lounge=a.today.lounge;document.getElementById('lounge-result').textContent=lounge?'오늘 닥터라운지 · '+(LABELS[lounge.status]??'결과 확인 필요')+(lounge.reason==='mission_changed'?' · 사이트 미션 구성 변경 확인 필요':'')+(lounge.attemptMask===0?' · PC 제출 없음':'')+' · 사이트 완료 '+(lounge.providerComplete??0)+'/7':a.features.lounge?'다음 준비 '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric'}).format(a.nextLounge):'닥터라운지 자동 실행 꺼짐';
}
