const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function setupPortOptions(api,perform){
 let current;
 const memo=document.getElementById('date-memo'),counter=document.getElementById('medigate-counter-page');
 document.getElementById('save-medigate-counter-page').onclick=()=>perform(()=>api.setMedigateCounterPage(counter.value.trim()),'이번 달 집계 주소를 저장했어요.');
 document.getElementById('save-memo').onclick=()=>perform(()=>api.saveMemo(current.date,memo.value),'메모를 저장했어요.');
 return state=>{
  current=state;if(!state.options)return;
  if(document.activeElement!==counter)counter.value=state.medigateCounterPage??'';
  if(document.activeElement!==memo){memo.value=state.options.memos[state.date]??'';}
  document.getElementById('daily-selection').replaceChildren(...state.dailyTasks.map(task=>{
   const label=el('label'),input=el('input');input.type='checkbox';input.checked=state.options.dailyKeys.includes(task.key);input.onchange=()=>perform(()=>api.selectDaily(input.checked?[...state.options.dailyKeys,task.key]:state.options.dailyKeys.filter(k=>k!==task.key)),'일일 작업 선택을 저장했어요.');label.append(input,document.createTextNode(task.label));return label;
  }));
  const rows=(state.automation?.surveys??[]).map((r,i)=>{
   const row=el('p'),open=el('button','설문 화면 열기'),skip=el('button',r.status==='skipped'?'미참여 종료 취소':'미참여로 종료');
   open.disabled=r.status==='skipped';skip.disabled=r.status==='complete';
   open.onclick=()=>perform(()=>api.openSurvey(r.key),'선택한 강의에서 직접 참여해 주세요.');skip.onclick=()=>perform(()=>api.skipSurvey(r.key,r.status!=='skipped'),'설문 상태를 이 PC에 저장했어요.');
   row.append(document.createTextNode((r.title??'설문 '+(i+1))+' · '+({skipped:'미참여 종료',complete:'참여 완료',unknown:'직접 확인',elapsed:'이전 기한 경과',open:'이전에 열림 확인'})[r.status]+' '),open,skip);return row;
  });document.getElementById('survey-results').replaceChildren(...(rows.length?rows:[el('p','조회한 닥터빌 강의가 여기에 표시돼요. 답변은 자동 제출하지 않아요.')]));
 };
}
