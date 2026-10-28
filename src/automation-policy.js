import {readFileSync} from 'node:fs';
import {allowedNavigation,siteById} from './security.js';
import {kstDate,kstInstant} from './schedule.js';
const source=JSON.parse(readFileSync(new URL('../vendor/automation/manifest.json',import.meta.url),'utf8'));
const nativeReasons=['idle','running','finished','cancelled','suspended','manual_view_open','entry_priority','network_error','time_limit','storage_error','duplicate_prevented','unknown_result','disabled','paused','expired','reserved','attempting','clicked','confirmed','unknown','manual_clicked','retry_pending','not_registered','lecture_ended','provider_result_unconfirmed','today_status','list_unconfirmed','login_required','session_required','operation_unavailable','date_mismatch','scheduled','missed','read_only','no_banner','already_complete','no_target','page_changed','navigation_unconfirmed','policy_rejected','submission_reserved','discovery_started','success_receipt','scope_changed','worker_closed','task_limit','claim_not_authorized','manual_confirmation','site_dialog','confirmation_started','claim_started','brand_previous_no_banner','brand_daily_limit','brand_previous_unconfirmed','opens_later','day_changed'];
const reasons=new Set([...source.reasons,...nativeReasons]);
export const safeReason=value=>reasons.has(value)?value:'provider_result_unconfirmed';
export function doctorvilleDetailNavigation(from,raw){
 try{
  const before=new URL(from),next=new URL(raw),origin='https://www.doctorville.co.kr';
  return before.origin===origin&&before.pathname==='/seminar/main'&&!before.search&&!before.hash&&next.origin===origin&&!next.username&&!next.password&&!next.port&&!next.hash&&next.pathname==='/seminar/seminarDetail'&&[...next.searchParams.keys()].length===1&&next.searchParams.getAll('seminarId').length===1&&/^[1-9]\d{0,11}$/.test(next.searchParams.get('seminarId'));
 }catch{return false;}
}
export const DAILY_TASKS=Object.freeze([
 {key:'doctorville:attendance',site:'doctorville',kind:'attendance',label:'닥터빌 출석',url:'https://www.doctorville.co.kr/event/attend'},
 {key:'keymedi:attendance',site:'keymedi',kind:'attendance',label:'키메디 출석',url:'https://www.keymedi.com/mypage/attendance'},
 {key:'hmp:capsule',site:'hmp',kind:'capsule',label:'한미 캡슐',url:'https://www.hmp.co.kr/event/attendanceRouletteMain.hm'},
 {key:'docple:attendance',site:'docple',kind:'attendance',label:'닥플 출석',url:'https://docple-plus.com/offerwall/attendance'},
 {key:'doctorville:quiz',site:'doctorville',kind:'quiz',label:'닥터빌 당일 퀴즈',url:'https://www.doctorville.co.kr/product/main'},
 {key:'intermd:quiz',site:'intermd',kind:'quiz',label:'인터엠디 퀴즈 확인',url:'https://www.intermd.co.kr/home.do'},
 {key:'keymedi:brand1',site:'keymedi',kind:'brand1',label:'키메디 브랜드관 1회차',url:'https://www.keymedi.com/brandhall'},
 {key:'keymedi:brand2',site:'keymedi',kind:'brand2',label:'키메디 브랜드관 2회차',url:'https://www.keymedi.com/brandhall'},
]);
export const taskByKey=key=>DAILY_TASKS.find(task=>task.key===key)??null;
export const ENTRY_SITES=Object.freeze(['doctorville','medigate','intermd','bluepharm','keymedi','hmp']);
export const DEFAULT_FEATURES=Object.freeze({dailyClaim:false,quizAuto:false,brand:false,entry:false,morning:false,lounge:false,survey:false});
export function actionAllowed(task,url,action){
 if(!task||!allowedNavigation(task.site,url)||!action||!['claim','claim_confirm','navigate'].includes(action.type)||typeof action.selector!=='string'||!action.selector||action.selector.length>2048||typeof action.label!=='string'||action.label.length>100)return false;
 const u=new URL(url),label=action.label.replace(/\s+/g,'');
 if(task.kind.startsWith('brand')){
  if(u.origin!=='https://www.keymedi.com'||u.search||u.hash)return false;
  if(action.type==='navigate')return u.pathname==='/brandhall'&&action.selector==='a[data-gtm-event-name="banner_click"][data-gtm-click-location="브랜드관 포인트 배너"]'&&label==='추천콘텐츠보러가기';
  return action.type==='claim'&&/^\/brandhall\/detail\/[1-9]\d*$/.test(u.pathname)&&action.selector==='[class~="qojl7Nn43EgKG57VXPWIpA=="] > div > div > img, .max-set > div > div > img'&&label==='브랜드관선물받기';
 }
 if(task.site==='docple')return u.origin==='https://docple-plus.com'&&u.pathname.replace(/\/$/,'')==='/offerwall/attendance'&&action.type==='claim'&&action.selector==='button.gtm-attendance-checkin'&&label==='출석하고캐시받기';
 if(action.type==='navigate')return /퀴즈|출석|캡슐|브랜드존|이벤트/.test(label);
 if(task.kind==='quiz'||u.pathname.replace(/\/$/,'')!==new URL(task.url).pathname.replace(/\/$/,''))return false;
 if(action.type==='claim_confirm')return task.key==='keymedi:attendance'&&label==='광고보고출석하기';
 if(task.kind==='capsule')return /^(?:(?:오늘|금일)의?)?캡슐(?:받기|받아가기)$/.test(label);
 return /^(?:(?:\d{1,2}월\d{1,2}일|오늘|금일)의?)?출석(?:체크)?하기$/.test(label.replace(/[✓✔☑!！]/g,''));
}
export function quizNavigationAllowed(raw){
 try{const u=new URL(raw);return u.origin==='https://www.doctorville.co.kr'&&!u.username&&!u.password&&/^\/product\/[a-zA-Z][a-zA-Z0-9/_-]*$/.test(u.pathname)&&!/logout|delete|remove|submit|regist|create|update|answer|claim/i.test(u.pathname)&&![...u.searchParams.keys()].some(key=>/token|auth|session|password|email|ticket/i.test(key));}catch{return false;}
}
export function dailyDialog(task,message,attempted){
 const s=String(message||'').replace(/\s+/g,'');
 if(/로그인.*(?:필요|해주세요|바랍니다)|로그인후/.test(s))return {accept:false,status:'login',reason:'login_required'};
 if(task.kind==='quiz'&&/^(?:오늘|금일)(?:은|는|의|에는)?(?:(?:공휴일|휴일)(?:이므로|이라|로))?(?:(?:진행|제공)(?:하는|할)|등록된)?퀴즈(?:가|는|를)?(?:없습니다|없어요|없음|제공되지않습니다|진행하지않습니다|등록되지않았습니다)[.!。]?$/.test(s))return {accept:true,status:'none',reason:'today_quiz_unavailable_dialog'};
 if(!attempted)return {accept:false,status:'unknown',reason:'manual_confirmation'};
 if(task.kind==='quiz'||task.kind.startsWith('brand')||task.site==='docple')return {accept:false,status:'unknown',reason:'manual_confirmation'};
 const confirmation=task.kind==='capsule'?/^(?:오늘)?캡슐을?받으시겠습니까[?？]?$/:/^(?:오늘)?출석(?:체크)?(?:을|를)?하시겠습니까[?？]?$/;
 if(confirmation.test(s))return {accept:true};
 if(/실패|오류|완료되지|지급되지|수령되지|받지못/.test(s))return {accept:false,status:'unknown',reason:'manual_confirmation'};
 if(task.kind==='capsule'&&/(?:캡슐.*(?:받았습니다|받으셨|받기완료|지급되었|지급완료|수령완료)|이미.*(?:받았습니다|받으셨|수령))/.test(s))return {accept:true,status:'complete',reason:'site_dialog'};
 if(task.kind==='attendance'&&/(?:출석(?:체크)?(?:이|가)?(?:완료|성공|되었습니다|되었어요)|이미출석)/.test(s))return {accept:true,status:'complete',reason:'site_dialog'};
 return {accept:false,status:'unknown',reason:'manual_confirmation'};
}
export function entrySchedule(event,now=Date.now()){
 if(!event||!ENTRY_SITES.includes(event.site)||event.date!==kstDate(now)||typeof event.title!=='string'||!event.title.trim()||event.title.length>800||event.lectureEnded)return null;
 try{
  const start=kstInstant(event.date,event.time),deadline=start+600000;
  if(now>(event.site==='hmp'?start+4*600000+90000:deadline))return null;
  if(event.site==='hmp'&&!(['registered'].includes(event.registrationStatus)||event.registrationStatus==='unknown'&&event.hmpWatchAvailable===true))return null;
  return {start,due:event.site==='doctorville'?start-3000000:event.site==='hmp'?start:start+30000,deadline:event.site==='hmp'?start+90000:deadline};
 }catch{return null;}
}
export function knownSite(id){return !!siteById(id);}
