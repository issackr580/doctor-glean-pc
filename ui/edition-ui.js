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
 async function update(){const state=await tools.status();enabled=state.enabled;status.textContent=(state.unavailable?'진단 기록을 확인하지 못했어요.':enabled?'7일 진단 켜짐':'7일 진단 꺼짐')+' · 기록 '+state.eventCount+'개'+(state.dailyLimitReached?' · 오늘 기록 한도 도달 · 이후 이력이 누락될 수 있어요.':'');toggle.textContent=enabled?'진단 끄기':'7일 진단 켜기';}
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();await update();}catch{result.textContent='진단 도구를 실행하지 못했어요.';}finally{b.disabled=false;}};actions.append(b);return b;}
 const toggle=button('7일 진단 켜기',async()=>{const r=await tools.setEnabled(!enabled);result.textContent=r.ok?'진단 설정을 저장했어요.':'진단 설정을 저장하지 못했어요.';});
 button('진단 파일 저장',async()=>{const r=await tools.export();result.textContent=r.ok?r.cancelled?'저장을 취소했어요.':'진단 파일을 저장했어요.':'진단 파일을 저장하지 못했어요.';});
 button('진단 삭제',async()=>{const r=await tools.clear();result.textContent=r.ok?'진단을 끄고 기록을 삭제했어요.':'진단 기록을 삭제하지 못했어요.';});
 button('연결 정책 점검',async()=>{const r=await tools.policyCheck();const passed=r.checks?.filter(row=>row.passed).length??0;result.textContent='연결 정책 점검 '+passed+'/'+(r.checks?.length??0)+' 통과 · 실제 사이트 접속 검사는 아니에요.';});
 section.append(title,description,status,actions,result);document.querySelector('footer').before(section);update().catch(()=>{status.textContent='진단 상태를 확인하지 못했어요.';});
})();
