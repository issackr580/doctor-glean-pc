'use strict';
(()=>{
 const tools=window.doctorGleanDeveloper;if(!tools)return;
 const section=document.createElement('section');section.className='control';section.style.marginTop='20px';
 const title=document.createElement('h2');title.textContent='개발자용 진단';
 const description=document.createElement('p');description.textContent='진단 파일에는 현재 사이트별 조회·창·세션 보관 상태가 항상 포함돼요. 7일 진단을 켜면 이후 작업 단계와 앱 주 프로세스의 메모리 수치도 추가해요. 계정·쿠키·페이지 원문은 기록하지 않아요.';
 const status=document.createElement('p');status.className='muted';
 const result=document.createElement('p');result.setAttribute('role','status');
 const actions=document.createElement('div');actions.className='query-controls';
 let enabled=false;
 async function update(){const state=await tools.status();enabled=state.enabled;status.textContent=(state.unavailable?'진단 기록을 확인하지 못했어요.':enabled?'7일 진단 켜짐':'7일 진단 꺼짐')+' · 기록 '+state.eventCount+'개'+(state.dailyLimitReached?' · 오늘 기록 한도 도달 · 이후 이력이 누락될 수 있어요.':'');toggle.textContent=enabled?'진단 끄기':'7일 진단 켜기';if(!enabled)reset();await list();}
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();await update();}catch{result.textContent='진단 도구를 실행하지 못했어요.';}finally{b.disabled=false;}};actions.append(b);return b;}
 const toggle=button('7일 진단 켜기',async()=>{const r=await tools.setEnabled(!enabled);result.textContent=r.ok?'진단 설정을 저장했어요.':'진단 설정을 저장하지 못했어요.';});
 button('진단 파일 저장',async()=>{const r=await tools.export();result.textContent=r.ok?r.cancelled?'저장을 취소했어요.':'진단 파일을 저장했어요.':'진단 파일을 저장하지 못했어요.';});
 button('진단 삭제',async()=>{const r=await tools.clear();result.textContent=r.ok?'진단을 끄고 기록을 삭제했어요.':'진단 기록을 삭제하지 못했어요.';});
 button('연결 정책 점검',async()=>{const r=await tools.policyCheck();const passed=r.checks?.filter(row=>row.passed).length??0;result.textContent='연결 정책 점검 '+passed+'/'+(r.checks?.length??0)+' 통과 · 실제 사이트 접속 검사는 아니에요.';});
 const focus=document.createElement('div'),heading=document.createElement('h3');heading.textContent='입장 회차별 경과·보고';
 const info=document.createElement('p');info.textContent='진단을 켠 뒤 관찰한 회차만 표시해요. 종료 기록이 없으면 원인은 미확인이에요. 버튼 요청·응답·화면 이동은 실제 입장·출석 성공과 달라요.';
 const select=document.createElement('select');select.id='entry-report-select';select.setAttribute('aria-label','보고할 입장 회차');
 const preview=document.createElement('textarea');preview.id='entry-report-preview';preview.readOnly=true;preview.rows=12;preview.style.width='100%';preview.setAttribute('aria-label','가림 처리한 회차 보고서 미리보기');
 const summary=document.createElement('p');summary.id='entry-report-summary';
 const note=document.createElement('p');note.textContent='미리본 내용 그대로 저장·복사해요. 파일·클립보드의 사본은 진단 삭제 후에도 남을 수 있어요.';
 let token;
 function reset(){token=undefined;preview.value='';summary.textContent='';save.disabled=true;copy.disabled=true;}
 const labels={doctorville:'닥터빌',keymedi:'키메디',hmp:'한미',intermd:'인터엠디',medigate:'메디게이트',bluepharm:'블루팜'};
 async function list(){const r=await tools.entryList(),old=select.value;select.replaceChildren();for(const row of r.records??[]){const option=document.createElement('option');option.value=row.executionId;option.textContent=(labels[row.site]??row.site)+' · '+row.date+' '+row.time+' · '+(row.kind==='entry'?'입장':row.kind==='prepare'?'준비':'사전 검사')+' '+(row.slot+1)+'회차 · '+(row.manualReported?'직접 입장 표시':row.clickResponseRecorded?'클릭 응답 있음':row.attemptRecorded?'실행 요청 있음':'클릭 응답 없음')+(row.terminalRecorded?' · 종료 기록 있음':' · 종료 미기록');select.append(option);}if([...select.options].some(o=>o.value===old))select.value=old;else reset();}
 function action(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await fn();}catch{result.textContent='회차 보고서를 처리하지 못했어요.';}finally{b.disabled=!token&&b!==show&&b!==reload;}};return b;}
 const reload=action('회차 목록 새로고침',list),show=action('선택 회차 미리보기',async()=>{reset();const r=await tools.entryPreview(select.value);if(r.ok){token=r.token;preview.value=r.text;summary.textContent=r.summary.join(' ');save.disabled=false;copy.disabled=false;}else result.textContent='진단을 켠 뒤 기록한 회차를 선택해 주세요.';});
 const save=action('미리본 보고서 저장',async()=>{const r=await tools.entrySave(token);result.textContent=r.ok?r.cancelled?'저장을 취소했어요.':'회차 보고서를 저장했어요.':'미리보기가 만료됐어요. 다시 미리봐 주세요.';}),copy=action('미리본 보고서 복사',async()=>{const r=await tools.entryCopy(token);result.textContent=r.ok?'회차 보고서를 복사했어요.':'미리보기가 만료됐어요. 다시 미리봐 주세요.';});
 save.disabled=true;copy.disabled=true;select.onchange=reset;
 focus.append(heading,info,select,reload,show,summary,preview,save,copy,note);
 section.append(title,description,status,actions,result,focus);document.querySelector('footer').before(section);update().catch(()=>{status.textContent='진단 상태를 확인하지 못했어요.';});
})();
