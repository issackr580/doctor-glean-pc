'use strict';
import {reasonLabels,siteLabel,collectionSummary} from '../src/catalog-presentation.js';
import {renderAutomation} from './automation-view.js';
import {registrationButtonLabel,registrationReplyLabel} from '../src/execution-presentation.js';
import {setupCredentials,renderCredentials,openCredential,credentialLabel,resultLabel} from './credential-view.js';
import {setupReports} from './report-view.js';
import {setupPortOptions} from './port-options.js';
import {setupUpdates} from './update-view.js';
const api=window.doctorGlean,message=document.getElementById('message');let refreshing=false,repeat=false,updateReadySent=false;
const renderUpdate=setupUpdates(api);
const renderPortOptions=setupPortOptions(api,perform);
function say(text){message.textContent=text;}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
async function perform(action,success){try{const r=await action();say(typeof success==='function'?success(r):r?.ok?success:r?.reason==='data_blocked'?'앱 데이터 사용 설정으로 접속을 보류했어요.':r?.reason==='site_wait'?'사이트의 대기 기한 뒤 다시 열어 주세요.':r?.reason==='busy'?'진행 중인 작업이나 직접 사용하는 사이트 창을 마친 뒤 다시 확인해 주세요.':r?.reason==='paused'?'자동 실행을 허용한 뒤 실행해 주세요. 상태만 확인은 중지 중에도 사용할 수 있어요.':r?.reason==='invalid_selection'?'조회할 사이트를 하나 이상 선택해 주세요.':r?.reason==='window_unavailable'?'사이트 창을 만들지 못했어요. 오류보고를 저장해 주세요.':r?.reason==='session_storage_error'?'세션 저장 요청을 마치지 못했어요. 사이트 창을 유지하고 다시 시도해 주세요.':'작업을 완료하지 못했어요.');await refresh();return r;}catch{say('프로그램 상태를 확인하지 못했어요.');}}
function sessionLabel(site){
 const s=site.session;if(!s||s.load==='not_opened'&&!s.authSource)return '';
 const errors={window_unavailable:'사이트 창을 만들지 못했어요. 오류보고를 저장해 주세요.',dns_error:'사이트 주소에 연결하지 못했어요.',offline:'인터넷 연결을 확인해 주세요.',time_limit:'사이트 연결 시간이 지났어요.',certificate_error:'인증서를 확인하지 못했어요.',load_failed:'사이트 화면을 불러오지 못했어요.',renderer_stopped:'사이트 창이 중단됐어요.',popup_blocked:'새 창 열기가 차단됐어요. 「로그인 화면」을 이용해 주세요.',navigation_blocked:'허용하지 않은 화면 이동을 막았어요.'};
 if(s.lastError)return errors[s.lastError]??'사이트 연결을 다시 확인해 주세요.';
 if(s.save==='failed')return '세션 저장 요청을 마치지 못했어요. 창을 유지하고 다시 시도해 주세요.';
 const login=s.authSource==='daily_receipt'?'오늘 출석·퀴즈에서 로그인 확인됨':s.authSource==='verified_profile'?'작업용 프로필에서 로그인 확인됨':({authenticated:'마지막 화면에서 로그인 확인됨',login_required:'마지막 화면은 로그인 화면',not_confirmed:'로그인 성공 미확인',loading:'사이트 여는 중'}[s.login]??'로그인 성공 미확인');
 return login+(s.save==='saving'?' · 세션 보관 중':s.save==='flushed'?' · 세션 저장 요청 완료':site.open?' · 로그인 뒤 상단의 「로그인 마침」을 눌러 주세요.':' · 로그인 뒤 다시 조회해 주세요.');
}
function setupNavigation(){
 const tabs=[...document.querySelectorAll('.app-nav [role="tab"]')];
 function activate(selected){
  for(const tab of tabs){
   const active=tab===selected;
   tab.setAttribute('aria-selected',String(active));
   tab.tabIndex=active?0:-1;
   document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;
  }
  window.scrollTo(0,0);
 }
 for(const [index,tab] of tabs.entries()){
  tab.onclick=()=>activate(tab);
  tab.onkeydown=event=>{
   const offsets={ArrowLeft:-1,ArrowRight:1};
   let next=index;
   if(event.key==='Home')next=0;
   else if(event.key==='End')next=tabs.length-1;
   else if(Object.hasOwn(offsets,event.key))next=(index+offsets[event.key]+tabs.length)%tabs.length;
   else return;
   event.preventDefault();
   activate(tabs[next]);
   tabs[next].focus();
  };
 }
}
const dateLabel=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'UTC'});
function renderAgenda(state,events){
 const isToday=state.date===state.today;
 document.getElementById('schedule-title').textContent=isToday?'오늘 강의':'선택일 강의';
 document.getElementById('date').textContent=dateLabel.format(new Date(state.date+'T00:00:00Z'))+' · 한국 시간';
 document.getElementById('schedule-count').textContent=events.length?'강의 '+events.length+'개':'';
 const today=document.getElementById('today');
 today.disabled=isToday;
 today.onclick=()=>perform(()=>api.setDate(state.today),'오늘 일정으로 이동했어요.');
 const groups=new Map();
 for(const event of events){
  if(!groups.has(event.time))groups.set(event.time,[]);
  groups.get(event.time).push(event);
 }
 const slots=[];
 for(const [time,entries] of groups){
  const slot=node('section',undefined,'agenda-slot'),heading=node('h3',undefined,'agenda-time');
  const clock=node('time',time);
  clock.dateTime=state.date+'T'+time+'+09:00';
  heading.append(clock);
  const list=node('div',undefined,'agenda-slot-list');
  for(const event of entries){
   const row=node('article',undefined,'agenda-row'),detail=node('div',undefined,'agenda-name');
   detail.append(node('p',event.title,'lecture-title'));
   if(event.site==='hmp'){
    const status=event.lectureEnded?'강의 종료':({registered:'신청완료',not_registered:'미신청',closed:'신청마감',unknown:'신청 상태 미확인'})[event.registrationStatus];
    const meta=node('div',undefined,'agenda-registration');
    if(status)meta.append(node('span',status,'site-status'));
    if(event.registrationStatus==='not_registered'&&!event.lectureEnded&&api.requestRegistration){
     const apply=node('button',registrationButtonLabel(state.registration?.lectures[event.id]));
     apply.type='button';
     apply.disabled=event.stale||!!state.registration?.active||!!state.automation?.active||state.collection.running||!!state.credentials?.active||state.registration?.storageUnavailable===true;
     apply.onclick=()=>perform(()=>api.requestRegistration('catalog',state.registration?.lectureKeys[event.id]),registrationReplyLabel);
     meta.append(apply);
    }
    if(meta.childElementCount)detail.append(meta);
   }
   const site=node('div',undefined,'agenda-source');
   site.append(node('span',event.siteName,'site-tag'));
   if(event.stale)site.append(node('span','저장된 목록','muted'));
   row.append(detail,site);list.append(row);
  }
  slot.append(heading,list);slots.push(slot);
 }
 if(!slots.length){
  const empty=node('div',undefined,'agenda-empty');
  empty.append(node('p',state.collection.running?'강의를 조회하고 있어요.':'확인된 강의가 없어요.'),
   node('p',state.collection.running?'':'「강의 조회」를 누르거나 「사이트·계정」에서 조회 상태를 확인하세요.','muted'));
  slots.push(empty);
 }
 document.getElementById('lectures').replaceChildren(...slots);
}
async function refresh(){
 if(refreshing){repeat=true;return;}refreshing=true;
 try{
  if(!api){say('프로그램에서 이 화면을 열어 주세요.');return;}
  const state=await api.state();if(!state?.sites){say('프로그램 상태를 확인하지 못했어요.');return;}
  renderUpdate(state.update);
  const dataMode=document.getElementById('data-mode');dataMode.value=state.dataAccess.mode;
 dataMode.onchange=()=>perform(()=>api.setDataMode(dataMode.value),'데이터 사용 설정을 적용했어요.');
 document.getElementById('data-mode-status').textContent=({wifi_route_unverified:'PC 브라우저와 업데이트의 Wi-Fi 경로를 고정할 수 없어 접속을 보류해요.',storage_error:'데이터 설정 저장소를 확인할 수 없어 접속을 보류해요.',data_off:'예약·사이트 열기·업데이트 통신이 꺼져 있어요.'})[state.dataAccess.reason]??'';
 const usage=state.usage,toggle=document.getElementById('usage-toggle');
  document.getElementById('usage-status').textContent=(usage.enabled?'기록 중 · '+new Date(usage.until).toLocaleString('ko-KR')+' 종료':'기록 꺼짐')+' · API 요청 '+usage.apiRequests+'회 / 본문 '+usage.apiBodyBytes+'바이트 · 브라우저 관측 '+usage.browserEncodedBytes+'바이트 · 목록 DOM 판독 '+usage.domReads+'회 · 전체 범위 확인 '+usage.catalogComplete+'/'+usage.catalogResults+'건 · Windows 전체 사용량 미측정';
  toggle.textContent=usage.enabled?'기록 중지':'7일간 기록';
  toggle.onclick=()=>perform(()=>api.usage(usage.enabled?'stop':'start'),'기록 설정을 저장했어요.');
  document.getElementById('usage-delete').onclick=()=>perform(()=>api.usage('delete'),'사용량 기록을 삭제했어요.');
  document.title=state.appName;document.getElementById('app-name').textContent=state.appName;
  document.getElementById('edition').textContent=state.edition==='developer'?'PC 개발자용 · 검증판':'PC 배포용 · 검증판';
  document.getElementById('version').textContent='PC '+state.version;
  const date=document.getElementById('query-date');date.min=state.today;date.max=state.maxDate;date.value=state.date;
  document.getElementById('collect').disabled=state.collection.running;
  document.getElementById('cancel').hidden=!state.collection.running;
  const runState=document.getElementById('run-state');
  runState.textContent=!state.dataAccess.allowed?'데이터 접속 보류':state.siteWaitUntrusted?'자동 요청 보류':state.paused?'자동 실행 중지':'자동 실행 허용';
  runState.classList.toggle('enabled',state.dataAccess.allowed&&!state.siteWaitUntrusted&&!state.paused);
  document.getElementById('automation-state').textContent=state.siteWaitUntrusted?'PC 시계 또는 사이트 대기 기록을 확인할 수 없어 자동 요청을 보류했어요.':state.paused?'자동 실행을 중지한 상태예요.':'자동 실행을 허용한 상태예요.';
  const rows=state.sites.map(site=>{
   const row=node('div',undefined,'site'),info=node('div',undefined,'site-info'),label=node('label',undefined,'site-name');
   if(site.catalog){
    const check=document.createElement('input');check.type='checkbox';check.checked=site.selected;check.disabled=state.collection.running;check.setAttribute('data-site',site.id);
    check.addEventListener('change',()=>{const ids=[...document.querySelectorAll('input[data-site]:checked')].map(e=>e.getAttribute('data-site'));perform(()=>api.selectSites(ids),'조회 사이트를 저장했어요.');});label.append(check);
   }
   label.append(document.createTextNode(site.name));info.append(label);
   if(site.catalog){
    const current=state.collection.running&&state.collection.site===site.id;
    info.append(node('p',current?'조회 중…':siteLabel(state.results[site.id]),'site-status'));
   }
   const sessionText=sessionLabel(site);if(sessionText)info.append(node('p',sessionText,'session-status'));
   const saved=credentialLabel(site.id,state.credentials);if(saved)info.append(node('p',saved,'session-status'));
   const actions=node('div',undefined,'site-actions');
   const button=node('button',site.open?'열린 창 보기':'사이트 열기');button.type='button';
   button.addEventListener('click',()=>perform(()=>api.openSite(site.id),'로그인 뒤 그 창 위쪽의 「로그인 마침」을 눌러 주세요.'));actions.append(button);
   const wait=site.serverWait;
   if(wait&&(wait.manual||wait.until>Date.now())){
    const message=document.createElement('span');message.textContent=(wait.manual?'서버 403 · 직접 확인 필요 ':'')+(wait.until>Date.now()?'자동 요청 대기 · '+(wait.until>8640000000000000?'장기 대기':new Date(wait.until).toLocaleString('ko-KR')):'');actions.append(message);
    if(wait.manual){const ack=document.createElement('button');ack.textContent='직접 확인했어요';ack.onclick=()=>perform(()=>api.confirmSiteWait(site.id,wait.at,wait.revision),'현재 사이트 상태를 확인했어요.');actions.append(ack);}
   }
   if(site.loginEntry){const login=node('button','로그인 화면');login.type='button';login.addEventListener('click',()=>perform(()=>api.openLogin(site.id),'로그인 화면을 열었어요. 로그인 뒤 상단의 「로그인 마침」을 눌러 주세요.'));actions.append(login);}
   if(site.open){const finish=node('button',site.catalog?'로그인 마침 · 조회':'로그인 마침');finish.type='button';finish.addEventListener('click',()=>perform(()=>api.finishLogin(site.id),'세션 저장 요청을 마쳤어요. 조회 결과에서 로그인 상태를 확인해 주세요.'));actions.append(finish);}
   const account=node('button','계정 저장·복구');account.type='button';account.addEventListener('click',()=>openCredential(site.id));actions.append(account);
   const occupied=!!state.automation?.active||!!state.credentials?.active||state.collection.running||site.open;
   if(site.catalog){
    const retry=node('button','이 사이트만 조회');retry.type='button';retry.disabled=occupied;
    retry.addEventListener('click',()=>perform(()=>api.collectSite(site.id),'이 사이트의 목록을 다시 확인해요.'));actions.append(retry);
    if(state.results[site.id]?.status==='login'&&state.credentials?.vault.sites.some(row=>row.site===site.id)){
     const recover=node('button','저장 계정으로 로그인');recover.type='button';recover.disabled=occupied;
     recover.addEventListener('click',async()=>{try{const r=await api.recoverCredential(site.id);say(resultLabel(r)+(r.ok?' 강의 목록을 다시 확인해요.':''));await refresh();}catch{say('저장 계정의 로그인 상태를 확인하지 못했어요.');}});actions.append(recover);
    }
   }
   row.append(info,actions);return row;
  });document.getElementById('sites').replaceChildren(...rows);
  const selected=state.sites.filter(site=>site.selected),events=selected.flatMap(site=>(state.results[site.id]?.events??[]).map(event=>({...event,siteName:site.name,stale:state.results[site.id].stale}))).sort((a,b)=>a.time.localeCompare(b.time)||a.siteName.localeCompare(b.siteName));
  renderAgenda(state,events);
  const progress=document.getElementById('progress');
  progress.textContent=state.collection.running?`조회 ${state.collection.completed}/${state.collection.total} · ${state.sites.find(site=>site.id===state.collection.site)?.name??''}`:state.collection.reason==='finished'?'조회 종료 · '+collectionSummary(state.results,selected.map(site=>site.id)):reasonLabels[state.collection.reason]??'';
  if(state.pendingQueries?.length)progress.textContent+=' · 로그인 후 조회 대기 '+state.pendingQueries.length+'곳';
  renderAutomation(state,api,perform);renderPortOptions(state);
  renderCredentials(state);
  if(!updateReadySent){updateReadySent=true;api.updateReady().catch(()=>{updateReadySent=false;});}
  if(!state.collection.running&&state.collection.reason==='finished'&&message.textContent==='강의를 조회하고 있어요.')say('강의 조회를 마쳤어요.');
 }finally{refreshing=false;if(repeat){repeat=false;refresh().catch(()=>say('프로그램 상태를 확인하지 못했어요.'));}}
}
document.getElementById('query-date').addEventListener('change',event=>perform(()=>api.setDate(event.target.value),'조회 날짜를 바꿨어요.'));
document.getElementById('collect').addEventListener('click',()=>perform(()=>api.collect(),'강의를 조회하고 있어요.'));
document.getElementById('cancel').addEventListener('click',()=>perform(()=>api.cancelCollection(),'조회를 중지했어요.'));
document.getElementById('copy').addEventListener('click',()=>perform(()=>api.copySchedule(),'간략 목록을 복사했어요.'));
document.getElementById('stop').addEventListener('click',()=>perform(()=>api.setPaused(true),'전체 작업을 중지했어요.'));
document.getElementById('quick').addEventListener('click',()=>perform(()=>api.quickRun(),'오늘 확인을 시작했어요. 켜 둔 자동 기능만 실행해요.'));
document.getElementById('daily-check').addEventListener('click',()=>perform(()=>api.checkDaily(true),'출석·퀴즈 상태를 확인해요. 버튼 제출은 하지 않아요.'));
document.getElementById('quit').addEventListener('click',()=>api.quit());
setupNavigation();
setupReports(api,say);
setupCredentials(api,refresh);
api?.onChanged(()=>refresh().catch(()=>say('프로그램 상태를 확인하지 못했어요.')));
window.addEventListener('focus',()=>refresh().catch(()=>say('프로그램 상태를 확인하지 못했어요.')));
refresh().catch(()=>say('프로그램 상태를 확인하지 못했어요.'));
