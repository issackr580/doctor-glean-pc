const labels={saved:'로그인 검증 후 계정을 암호화 저장했어요.',authenticated:'현재 로그인된 상태를 확인했어요.',rejected:'아이디·비밀번호가 거절됐어요. 계정을 확인해 다시 저장해 주세요.',challenge:'사이트에서 추가 인증을 직접 진행해 주세요.',manual:'로그인 화면이나 추가 안내를 직접 확인해 주세요.',unknown:'로그인 결과를 확인하지 못했어요. 다시 제출하지 않았어요.',time_limit:'확인 시간이 지났어요. 로그인 결과는 직접 확인해 주세요.',cooldown:'최근 로그인 시도가 있어 잠시 기다린 뒤 다시 시도해 주세요.',daily_limit:'오늘 로그인 시도 제한에 도달했어요.',disabled:'자동 복구가 꺼져 있거나 거절된 계정이에요.',busy:'이 사이트의 열린 창이나 진행 중인 작업을 마친 뒤 다시 시도해 주세요.',not_saved:'저장된 계정이 없어요.',storage_unavailable:'Windows 계정 보호 저장소를 사용할 수 없어 계정을 저장하거나 읽지 않았어요.',storage_error:'계정 저장소를 읽거나 쓰지 못했어요. 기존 파일을 지우지 말고 오류보고를 저장해 주세요.',network_error:'사이트 연결을 마치지 못했어요.',cancelled:'계정 작업을 중지했어요.',blocked:'허용된 로그인 화면과 입력값을 확인하지 못했어요.',removed:'저장된 계정을 삭제했어요.'};
labels.stale='로그인 화면이 바뀌어 입력·제출을 중단했어요. 계정은 저장하지 않았어요.';
let currentSite='',state=null,api,refresh,busy=false;
const dialog=()=>document.getElementById('credential-dialog');
function resultLabel(result){
 if(result?.status==='saved')return result.profileStatus==='authenticated'?'계정 저장과 작업용 로그인 확인을 마쳤어요. 강의 목록도 다시 확인해요.':'계정은 저장됐어요. 「저장 계정으로 로그인」을 누르면 작업용 로그인과 강의 목록을 확인해요.';
 if(result?.status==='blocked'&&result.submitted)return '로그인 제출 후 이동한 화면에서 완료 여부를 확인하지 못했어요. 입력한 계정은 저장하지 않았어요.';
 const text=labels[result?.status]??(result?.ok?'계정 설정을 저장했어요.':'계정 작업을 완료하지 못했어요.');
 return ['cooldown','daily_limit'].includes(result?.status)&&result.retryAt>Date.now()?text+' 다음 시도 가능 '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(result.retryAt):text;
}
export function credentialLabel(site,snapshot){
 const saved=snapshot?.vault.sites.find(row=>row.site===site),result=snapshot?.results.find(row=>row.site===site),attempt=snapshot?.attempts.sites.find(row=>row.site===site);
 if(snapshot?.active?.site===site)return snapshot.active.kind==='save'?'계정 로그인 검증 중':'저장 계정으로 로그인 복구 중';
 if(!saved)return result?resultLabel(result):'';
 return '계정 암호화 저장됨 · 자동 복구 '+(saved.automatic?'켜짐':'꺼짐')+(attempt?.disabled?' · 비밀번호 오류로 복구 중단':attempt&&['unknown','time_limit','network_error','manual','challenge'].includes(attempt.status)?' · 최근 결과 미확인으로 자동 재시도 중단':result&&['challenge','manual','storage_error','storage_unavailable'].includes(result.status)?' · '+(labels[result.status]??'직접 확인 필요'):'');
}
function display(){
 if(!currentSite||!state)return;const site=state.sites.find(row=>row.id===currentSite),snapshot=state.credentials,saved=snapshot?.vault.sites.find(row=>row.site===currentSite);
 document.getElementById('credential-title').textContent=site.name+' 계정 저장·복구';
 document.getElementById('credential-storage').textContent=snapshot?.vault.available?'Windows 계정 보호로 암호화해 이 PC에 저장해요. 로그인 검증을 통과한 계정만 저장해요.':'Windows 계정 보호 저장소를 사용할 수 없어요. 계정·비밀번호를 저장하거나 복구하지 않아요.';
 document.getElementById('credential-saved').textContent=saved?'검증된 계정이 저장되어 있어요. 아래 입력은 기존 계정을 바꿀 때만 필요해요.':'저장된 계정이 없어요.';
 document.getElementById('credential-save').disabled=busy||!snapshot?.vault.available;
 document.getElementById('credential-recover').disabled=busy||!saved||!snapshot?.vault.available;
 document.getElementById('credential-remove').disabled=busy||!saved;
 document.getElementById('credential-enable').disabled=busy||!saved||!snapshot?.vault.available;
 document.getElementById('credential-enable').checked=saved?.automatic===true;
}
export function renderCredentials(value){state=value;if(dialog().open)display();}
export function openCredential(site){currentSite=site;document.getElementById('credential-result').textContent='';document.getElementById('credential-id').value='';document.getElementById('credential-password').value='';document.getElementById('credential-new-automatic').checked=false;display();dialog().showModal();}
export function setupCredentials(bridge,refreshState){
 api=bridge;refresh=refreshState;
 const clear=()=>{document.getElementById('credential-id').value='';document.getElementById('credential-password').value='';};
 const close=()=>{clear();if(currentSite)api.cancelCredential(currentSite);dialog().close();};
 document.getElementById('credential-close').onclick=close;dialog().addEventListener('cancel',event=>{event.preventDefault();close();});
 const perform=async action=>{busy=true;display();document.getElementById('credential-result').textContent='로그인 확인 중…';try{const r=await action();document.getElementById('credential-result').textContent=resultLabel(r);}catch{document.getElementById('credential-result').textContent='계정 작업을 완료하지 못했어요.';}finally{busy=false;await refresh();display();}};
 document.getElementById('credential-form').onsubmit=event=>{
  event.preventDefault();let id=document.getElementById('credential-id').value,password=document.getElementById('credential-password').value;const automatic=document.getElementById('credential-new-automatic').checked,site=currentSite;
  clear();const request=api.saveCredential(site,id,password,automatic);id='';password='';perform(()=>request);
 };
 document.getElementById('credential-recover').onclick=()=>perform(()=>api.recoverCredential(currentSite));
 document.getElementById('credential-remove').onclick=()=>perform(()=>api.removeCredential(currentSite));
 document.getElementById('credential-enable').onchange=event=>perform(()=>api.setCredentialAutomatic(currentSite,event.target.checked));
}
