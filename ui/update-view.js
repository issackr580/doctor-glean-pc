const busy=new Set(['checking','github_login','downloading','verifying','installing','starting']);
export function updateLabel(result={}){
  const version=result.version?'PC '+result.version:'';
  if(result.status==='checking')return '업데이트를 확인하고 있어요.';
  if(result.status==='available')return version+' 업데이트가 있어요.';
  if(result.status==='current')return '현재 제공되는 최신 버전이에요.';
  if(result.status==='github_login')return '업데이트 창에서 GitHub 로그인을 마치면 개발자용 다운로드가 시작돼요.';
  if(result.status==='downloading')return '업데이트 다운로드 중'+(result.total?' · '+Math.min(100,Math.floor(result.received/result.total*100))+'%':'');
  if(result.status==='verifying')return '업데이트 파일을 검증하고 있어요.';
  if(result.status==='ready_busy')return '다운로드를 마쳤어요. 진행 중인 작업·사이트 창을 마치면 업데이트할 수 있어요. 강의 입장이 곧 예정된 경우에는 입장을 먼저 처리해요.';
  if(result.status==='installing')return '업데이트를 설치하고 다시 시작해요. 로그인·설정·예약 기록은 유지돼요.';
  if(result.status==='starting')return '업데이트 후 시작 상태를 확인하고 있어요.';
  if(result.status==='updated')return version+' 업데이트를 마쳤어요.';
  if(result.status==='rolled_back')return '새 버전을 시작하지 못해 이전 버전으로 복구했어요. 오류보고와 함께 알려 주세요.';
  if(result.status==='full_required')return '이번 버전은 전체 설치 파일이 필요해요. 공식 배포 페이지에서 받아 주세요.';
  if(result.status==='unsupported')return '버튼 업데이트는 Windows x64 실행판에서 사용할 수 있어요.';
  if(result.status==='failed'){
    if(result.reason==='update_cancelled')return '업데이트를 취소했어요. 기존 앱은 그대로 사용할 수 있어요.';
    if(result.reason==='update_permission')return '프로그램 폴더에 쓸 수 없어요. 쓰기 가능한 폴더에서 실행하거나 전체 파일로 업데이트해 주세요.';
    if(['update_signature','update_hash','update_package','update_size'].includes(result.reason))return '업데이트 파일 검증에 실패해 설치하지 않았어요. 다시 확인해 주세요.';
    if(result.reason==='update_runtime')return '실행 환경이 달라 작은 패치를 적용할 수 없어요. 전체 파일로 업데이트해 주세요.';
    return '업데이트를 마치지 못했어요. 연결과 GitHub 접근 권한을 확인한 뒤 다시 시도해 주세요.';
  }
  if(result.status==='unknown')return '업데이트를 확인하지 못했어요. 최신 버전이라는 뜻은 아니에요.';
  return '버튼을 눌러 PC 업데이트를 확인할 수 있어요.';
}
export function setupUpdates(api){
  const check=document.getElementById('update-check'),install=document.getElementById('update-install'),page=document.getElementById('update-page'),text=document.getElementById('update-result');
  const render=(result={})=>{text.textContent=updateLabel(result);check.disabled=busy.has(result.status);install.disabled=busy.has(result.status);install.hidden=!['available','ready_busy'].includes(result.status);install.textContent=result.status==='ready_busy'?'업데이트하고 재시작':'다운로드·업데이트';page.hidden=!['available','full_required'].includes(result.status);};
  check.onclick=async()=>{check.disabled=true;try{render(await api.checkUpdate());}catch{render({status:'failed'});}};
  install.onclick=async()=>{install.disabled=true;try{render(await api.installUpdate());}catch{render({status:'failed'});}};
  page.onclick=()=>api.openUpdatePage().catch(()=>{text.textContent='공식 배포 페이지를 열지 못했어요.';});return render;
}
