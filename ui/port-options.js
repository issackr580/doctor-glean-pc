const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function setupPortOptions(api,perform){
 let current;
 const memo=document.getElementById('date-memo'),hosts=document.getElementById('entry-host-list');
 document.getElementById('save-memo').onclick=()=>perform(()=>api.saveMemo(current.date,memo.value),'메모를 저장했어요.');
 document.getElementById('save-entry-hosts').onclick=()=>{
  const rows=hosts.value.split('\n').map(s=>s.trim()).filter(Boolean).map(s=>({host:s.replace(/^https?:\/\//,''),http:s.startsWith('http://')}));
  return perform(()=>api.setEntryHosts(rows),'입장 서버 설정을 저장했어요. 차단된 요청을 다시 보내지 않아요.');
 };
 return state=>{
  current=state;if(!state.options)return;
  if(document.activeElement!==memo){memo.value=state.options.memos[state.date]??'';}
  if(document.activeElement!==hosts)hosts.value=state.options.entryHosts.map(r=>(r.http?'http://':'https://')+r.host).join('\n');
  document.getElementById('daily-selection').replaceChildren(...state.dailyTasks.map(task=>{
   const label=el('label'),input=el('input');input.type='checkbox';input.checked=state.options.dailyKeys.includes(task.key);input.onchange=()=>perform(()=>api.selectDaily(input.checked?[...state.options.dailyKeys,task.key]:state.options.dailyKeys.filter(k=>k!==task.key)),'일일 작업 선택을 저장했어요.');label.append(input,document.createTextNode(task.label));return label;
  }));
  const rows=(state.automation?.surveys??[]).map((r,i)=>{
   const row=el('p'),open=el('button','설문 화면 열기'),label=el('label'),skip=el('input');skip.type='checkbox';skip.checked=r.excluded;
   open.onclick=()=>perform(()=>api.openSurvey(r.key),'설문은 사이트에서 직접 참여해 주세요.');skip.onchange=()=>perform(()=>api.excludeSurvey(r.key,skip.checked),'설문 알림 제외를 저장했어요.');
   label.append(skip,document.createTextNode('알림 제외'));row.append(document.createTextNode((r.title??'설문 '+(i+1))+' · '+({unknown:'기한 미확인',open:'참여 가능',complete:'참여 완료',elapsed:'마지막 확인 기한 경과'})[r.status]+(r.closesAt?' · 마지막 확인 기한 '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(r.closesAt):'')+' '),open,label);return row;
  });document.getElementById('survey-results').replaceChildren(...(rows.length?rows:[el('p','강의창에서 확인한 설문 상태를 표시해요. 답변은 자동 제출하지 않아요.')]));
 };
}
