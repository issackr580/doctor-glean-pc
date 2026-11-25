const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function setupPortOptions(api,perform){
 let current;
 const memo=document.getElementById('date-memo'),counter=document.getElementById('medigate-counter-page');
 const mode=document.getElementById('survey-mode'),delay=document.getElementById('survey-delay'),reminder=document.getElementById('survey-reminder');
 for(const input of [mode,delay,reminder])input.onchange=()=>perform(()=>api.surveySettings({mode:mode.value,delay:Number(delay.value),reminder:reminder.checked}),'닥터빌 설문 설정을 저장했어요.');
 document.getElementById('save-medigate-counter-page').onclick=()=>perform(()=>api.setMedigateCounterPage(counter.value.trim()),'이번 달 집계 주소를 저장했어요.');
 document.getElementById('save-memo').onclick=()=>perform(()=>api.saveMemo(current.date,memo.value),'메모를 저장했어요.');
 return state=>{
  current=state;if(!state.options)return;
  if(document.activeElement!==counter)counter.value=state.medigateCounterPage??'';
  if(document.activeElement!==memo){memo.value=state.options.memos[state.date]??'';}
  const settings=state.automation?.surveySettings;
  if(settings){mode.value=settings.mode;delay.value=String(settings.delay);reminder.checked=settings.reminder;}
  document.getElementById('survey-status').textContent=state.automation?.surveyStorageUnavailable?'설문 상태를 저장할 수 없어 자동 확인을 중단했어요.':'';
  document.getElementById('survey-usage').replaceChildren(...(state.usage?.surveys??[]).map(row=>el('p',
    (row.phase==='survey_reminder'?'설문 마감 알림 확인':'설문 개시 확인')+' · PC '+row.appVersion+' · 확인 '+row.attempts+'회 · 문서 '+row.mainFrameLoads+'회 · 리디렉션 '+row.redirects+'회 · 브라우저 관측 '+(row.browserEncodedBytes===null?'미측정':row.browserEncodedBytes+'바이트'))));
  document.getElementById('daily-selection').replaceChildren(...state.dailyTasks.map(task=>{
   const label=el('label'),input=el('input');input.type='checkbox';input.checked=state.options.dailyKeys.includes(task.key);input.onchange=()=>perform(()=>api.selectDaily(input.checked?[...state.options.dailyKeys,task.key]:state.options.dailyKeys.filter(k=>k!==task.key)),'일일 작업 선택을 저장했어요.');label.append(input,document.createTextNode(task.label));return label;
  }));
  const rows=(state.automation?.surveys??[]).map((r,i)=>{
   const row=el('p'),open=el('button','설문 화면 열기'),skip=el('button',r.status==='skipped'?'미참여 종료 취소':'미참여로 종료');
   open.disabled=r.status==='skipped';skip.disabled=r.status==='complete';
   open.onclick=()=>perform(()=>api.openSurvey(r.key),'선택한 강의에서 직접 참여해 주세요.');skip.onclick=()=>perform(()=>api.skipSurvey(r.key,r.status!=='skipped'),'설문 상태를 이 PC에 저장했어요.');
   const pending=r.status==='open'&&settings?.reminder&&!r.reminderReads&&r.reminderAt>Date.now()?' · 마감 확인 '+new Date(r.reminderAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}):'';
   row.append(document.createTextNode((r.title??'설문 '+(i+1))+' · '+({skipped:'미참여 종료',complete:'참여 완료',unknown:'직접 확인',elapsed:'마감',open:'이전에 열림 확인'})[r.status]+pending+' '),open,skip);return row;
  });document.getElementById('survey-results').replaceChildren(...(rows.length?rows:[el('p','조회한 닥터빌 강의가 여기에 표시돼요. 답변은 자동 제출하지 않아요.')]));
 };
}
