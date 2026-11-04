export function setupReports(api,say){
 const dialog=document.getElementById('report-dialog'),text=document.getElementById('report-preview');let token='';
 document.getElementById('report').onclick=async()=>{try{const result=await api.previewReport();if(!result?.token)return;token=result.token;text.value=result.text;dialog.showModal();}catch{say('보고서를 준비하지 못했어요.');}};
 document.getElementById('report-close').onclick=()=>dialog.close();
 document.getElementById('report-copy').onclick=async()=>{const r=await api.copyReport(token);say(r?.ok?'미리 본 보고서를 복사했어요.':'미리보기를 다시 열어 주세요.');};
 document.getElementById('report-save').onclick=async()=>{const r=await api.exportReport(token);say(r?.ok?r.cancelled?'저장을 취소했어요.':'미리 본 오류보고를 저장했어요.':'미리보기를 다시 열어 주세요.');if(r?.ok&&!r.cancelled)dialog.close();};
}
