export const reasonLabels={manual_view_open:'사이트 창을 닫거나 「로그인 마침 · 이 사이트 조회」를 눌러 주세요.',login_required:'로그인이 필요해요. 사이트에서 로그인한 뒤 다시 조회해 주세요.',security_check:'사이트의 접근 확인 화면을 확인해 주세요.',network_error:'연결을 확인하고 다시 조회해 주세요.',time_limit:'조회 시간이 지났어요.',cancelled:'조회를 중지했어요.',suspended:'PC 절전으로 조회를 중지했어요.',invalid_response:'강의 정보를 읽지 못했어요.',date_mismatch:'날짜가 바뀌어 조회를 중지했어요.',navigation_changed:'사이트 화면이 바뀌었어요. 다시 조회해 주세요.',action_rejected:'목록 이동을 확인하지 못했어요.',storage_error:'조회 결과를 저장하지 못했어요.',list_unconfirmed:'목록은 읽었지만 전체 범위를 확인하지 못했어요.'};
export function resultGroup(result){
 if(!result)return 'unread';
 if(result.status==='login')return 'login';
 if(result.status==='busy')return 'open';
 if(result.status==='blocked')return 'blocked';
 if(result.status==='ok'&&result.coverage&&!result.stale)return 'complete';
 if(result.status==='review'&&result.coverage&&!result.stale&&['list_checked','date_range_checked','calendar_checked'].includes(result.scope))return 'read';
 if(result.status==='review'&&!result.stale&&result.scope==='current_list_checked')return 'current';
 if(result.reason==='list_unconfirmed'||result.reason==='list_read')return 'partial';
 return 'failed';
}
export function siteLabel(result){
 if(!result)return '아직 조회하지 않았어요.';
 if(result.reason==='entry_priority')return '자동 입장을 먼저 확인한 뒤 조회를 이어가요.';
 if(result.reason==='network_error'&&result.inspection?.failure)return ({dns_error:'사이트 주소에 연결하지 못했어요.',offline:'인터넷 연결을 확인해 주세요.',time_limit:'사이트 연결 시간이 지났어요.',certificate_error:'사이트 인증서를 확인하지 못했어요.',navigation_cancelled:'사이트가 연결을 전환하다 멈췄어요. 다시 조회해 주세요.',load_failed:'사이트 연결을 마치지 못했어요.'})[result.inspection.failure]??'사이트 연결을 마치지 못했어요.';
 const label=reasonLabels[result.reason];
 if(result.stale)return '저장된 목록 · '+(label??'최신 조회 미완료');
 if(resultGroup(result)==='complete')return result.events.length?'강의 '+result.events.length+'개':'강의 없음';
 if(resultGroup(result)==='read')return (result.events.length?'강의 '+result.events.length+'개 조회됨':'선택일 강의 없음')+' · '+({list_checked:'현재 목록 끝 확인',date_range_checked:'선택일 날짜 범위 확인',calendar_checked:'월·일정 목록 대조 완료'})[result.scope];
 if(resultGroup(result)==='current')return (result.events.length?'강의 '+result.events.length+'개 조회됨':'현재 목록에서 선택일 강의 0개')+' · 현재 목록만 확인 · 전체 범위 미확인'+continuationLabel(result.inspection);
 if(resultGroup(result)==='partial')return (result.events.length?'강의 '+result.events.length+'개 조회됨':'현재 목록 읽음')+' · 전체 범위 미확인'+continuationLabel(result.inspection);
 return label??'조회를 마치지 못했어요. 다시 조회해 주세요.';
}
export function collectionSummary(results,ids){
 const counts={complete:0,read:0,current:0,login:0,open:0,blocked:0,partial:0,failed:0,unread:0};
 for(const id of ids)counts[resultGroup(results[id])]++;
 const labels={complete:'조회 완료',read:'목록·날짜 확인',current:'현재 목록만 확인',login:'로그인 필요',open:'사이트 창 열림',blocked:'접근 확인 필요',partial:'전체 범위 미확인',failed:'조회 실패',unread:'미조회'};
 return Object.entries(counts).filter(([,count])=>count).map(([key,count])=>labels[key]+' '+count+'곳').join(' · ');
}
function continuationLabel(inspection){
 if(inspection?.continuationAmbiguous)return ' · 추가 목록 구분 필요';
 if(inspection?.continuationMore>0||inspection?.continuationPages>0)return ' · 더보기/다음 목록 남음';
 if(inspection?.calendarStatus==='unconfirmed')return ' · 편성표 강의 로딩 확인 필요';
 return '';
}
