import {atomicJson,readJson} from './atomic-json.js';
import {doctorvilleDetailNavigation} from './automation-policy.js';
import {officialIdentity} from './entry-identity.js';
import {kstDate,kstInstant} from './schedule.js';
import {createHash} from 'node:crypto';

const list='https://www.doctorville.co.kr/seminar/main';
const fullRefreshInterval=3*60*60*1000;

// Serialized with the original reader. Its date, title and time must come from
// the same parsed row as the observed original detail link.
function readDoctorvilleApplications(profile,metadata){
 const visible=e=>e.getClientRects().length>0&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 const rows=[...document.querySelectorAll(profile.rowSelector)].filter(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
 if(!Array.isArray(metadata)||rows.length!==metadata.length||rows.length>500)return [];
 return rows.flatMap((card,index)=>{
  if(!card.matches('a.list_detail[href*="seminarDetail?"]')||!visible(card))return [];
  const {date,time,title}=metadata[index];
  if(!date||!time||!title)return [];
  let scope=card;
  for(let depth=0;depth<3;depth++){
   const parent=scope.parentElement;
   if(!parent?.matches('li,article,div')||parent.querySelectorAll('a.list_detail').length!==1||parent.querySelectorAll('*').length>250)break;
   scope=parent;
   if(scope.matches('li,article'))break;
  }
  const controls=[...scope.querySelectorAll('a,button,[role="button"],span,strong,em')].filter(e=>visible(e)&&!e.closest('.tit,.time,header,footer,nav,aside,[role="dialog"],[hidden],[aria-hidden="true"]'));
  const statuses=new Set();
  for(const control of controls){
   const label=control.innerText.trim().replace(/\s/g,'');
   if(/^(신청완료|신청취소|등록완료)$/.test(label))statuses.add('registered');
   if(/^(마감|정원마감|정원초과|신청마감|접수마감|강의종료|세미나종료)$/.test(label))statuses.add('closed');
   if(/^입장(?:하기)?$/.test(label))statuses.add('entry_visible');
   if(!control.closest('button:disabled,[disabled],[aria-disabled="true"],.disabled')&&
      (['신청가능','미신청'].includes(label)||/^(신청|신청하기|(?:사전|수강)신청(?:하기)?)$/.test(label)&&control.matches('a,button,[role="button"]')))statuses.add('not_registered');
  }
  if(statuses.delete('entry_visible')&&statuses.has('not_registered'))statuses.add('unknown');
  return [{site:'doctorville',date,time,title,url:card.href,registrationStatus:statuses.size===1?[...statuses][0]:'unknown'}];
 });
}

function doctorvilleCatalogStep(profile,date,previous,catalogStep,collectPage,inspectListControls,applications){
 let applicationRows=[];
 const result=catalogStep(profile,date,previous,(readProfile,day)=>{
  const page=collectPage(readProfile,day);
  if(location.pathname==='/seminar/main'&&Array.isArray(page.catalogRows))applicationRows=applications(readProfile,page.catalogRows);
  return page;
 },inspectListControls);
 if(!result.state?.scopeConfirmed||['login','blocked','error'].includes(result.status))return result;
 if(applicationRows.length)result.applicationRows=applicationRows;
 const byUrl=new Map();
 for(const row of applicationRows)byUrl.set(row.url,byUrl.has(row.url)?'unknown':row.registrationStatus);
 for(const event of result.events)if(byUrl.has(event.url))event.registrationStatus=byUrl.get(event.url);
 if(result.done&&result.state.pcDoctorvilleIncomplete&&result.diagnostics?.listDetails){
  result.coverage=false;
  result.diagnostics.stopReason='current_list_only';
  result.diagnostics.listDetails.status='review';
 }
 if(!result.done||result.diagnostics?.stopReason!=='current_list_only'||result.state.expansions>=8)return result;
 // Use the existing reviewed list selectors and action verifier. Expand only
 // a unique continuation for the unfiltered live list, in its usual window.
 const cards=[...document.querySelectorAll(profile.rowSelector)].filter(e=>e.getClientRects().length);
 const {more,pagers,ambiguous}=inspectListControls(cards);
 if(ambiguous||more.length+pagers.length!==1)return result;
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const shown=e=>e.getClientRects().length&&!e.closest('[aria-disabled="true"],[disabled],.disabled')&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 let next=more[0];
 if(pagers.length){
  const pager=pagers[0];
  const current=[...new Set([...pager.querySelectorAll('[aria-current="page"],.active,.current,.on,strong')].filter(e=>e.getClientRects().length&&/^\d+$/.test(text(e))).map(e=>+text(e)))];
  if(current.length!==1)return result;
  const controls=[...pager.querySelectorAll('a,button')].filter(shown);
  const numbered=controls.filter(e=>text(e)===String(current[0]+1));
  const forward=controls.filter(e=>/^(?:다음|next|[›»>])$/i.test(e.getAttribute('aria-label')||text(e)));
  next=numbered.length===1?numbered[0]:!numbered.length&&forward.length===1?forward[0]:undefined;
 }
 if(!next||!shown(next))return result;
 const signature=[text(next),next.getAttribute('aria-label'),next.getAttribute('title'),...(next.matches('input[type="button"]')?[next.getAttribute('value')]:[]),...Array.from(next.querySelectorAll('img[alt]')).map(e=>e.getAttribute('alt'))].filter(Boolean).join(' ').trim();
 if(!signature||/신청|예약|참여|설문|재생|시청|입장|북마크|로그인|로그아웃|다운로드|다시\s*보기|녹화|VOD|replay/i.test(signature))return result;
 const parts=[];
 for(let el=next;el&&el!==document.documentElement;el=el.parentElement){
  if(!el.parentElement)return result;
  const position=[...el.parentElement.children].filter(e=>e.localName===el.localName).indexOf(el)+1;
  parts.unshift(el.localName+':nth-of-type('+position+')');
 }
 let action={kind:'click',selector:'html > '+parts.join(' > '),signature};
 const href=next.getAttribute('href');
 if(href&&!/^(#|javascript:)/i.test(href)){
  const url=new URL(href,location.href);
  if(url.origin!==location.origin||url.pathname!=='/seminar/main'||url.hash||
     [...url.searchParams].some(([key,value])=>!/^(page|pageNo|pageIndex|currentPage)$/i.test(key)||!/^[1-9]\d*$/.test(value)))return result;
  action={kind:'navigate',url:url.href};
 }
 const marker=JSON.stringify([location.href,result.state.signature,signature]);
 if(result.state.visited.includes(marker))return result;
 if(result.state.listPageChecked&&applicationRows.length===result.diagnostics.rows){
  result.applicationContinuation=JSON.stringify([action.kind,action.url??action.selector,signature,
   ...pagers.map(pager=>text(pager))]);
 }
 result.state.pcDoctorvilleIncomplete||=!result.state.listPageChecked;
 result.state.visited.push(marker);result.state.expansions++;result.state.scrolls=0;
 result.state.pending={at:Date.now(),before:result.state.signature,reason:'다음 목록 페이지',scopeConfirmed:true};
 return {...result,done:false,action};
}

export function doctorvilleCatalogSource(source){
 const entry='return catalogStep(profile,date,state,collectPage,inspectListControls);';
 if(source.split(entry).length!==2)throw Error('doctorville_catalog_source_changed');
 return source.replace(entry,`return (${doctorvilleCatalogStep})(profile,date,state,catalogStep,collectPage,inspectListControls,${readDoctorvilleApplications});`);
}

export function doctorvilleApplicationTargets(rows,now=Date.now()){
 const observed=new Map();
 for(const event of rows){
  if(event?.site!=='doctorville'||!doctorvilleDetailNavigation(list,event.url)||typeof event.title!=='string'||!event.title.trim()||event.title.length>250)continue;
  let start;try{start=kstInstant(event.date,event.time);}catch{continue;}
  const id=officialIdentity(event)?.id;
  if(!id)continue;
  const prior=observed.get(id),matches=prior===undefined||prior?.start===start&&prior.registrationStatus===event.registrationStatus;
  observed.set(id,matches?{id,date:event.date,time:event.time,title:event.title.replace(/[\x00-\x1f\x7f]/g,' ').trim(),url:event.url,start,registrationStatus:event.registrationStatus}:null);
 }
 const today=kstDate(now);
 return [...observed.values()].filter(event=>event?.registrationStatus==='not_registered'&&event.date>today)
  .sort((a,b)=>a.start-b.start||a.title.localeCompare(b.title));
}

function catalogRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>500)return null;
 const parsed=[];
 for(const row of rows){
  const id=officialIdentity(row)?.id;
  if(row?.site!=='doctorville'||!id||!doctorvilleDetailNavigation(list,row.url)||typeof row.title!=='string'||!row.title.trim()||
     row.title.length>250||!['registered','not_registered','closed','unknown'].includes(row.registrationStatus))return null;
  try{kstInstant(row.date,row.time);}catch{return null;}
  parsed.push([row.date,row.time,id,row.title,row.registrationStatus]);
 }
 return parsed;
}

export function doctorvilleApplicationPageSignature(rows,continuation){
 const parsed=catalogRows(rows);
 if(!parsed||typeof continuation!=='string'||!continuation||continuation.length>4096)return null;
 return createHash('sha256').update(JSON.stringify([continuation,parsed])).digest('hex');
}

// Learn the date boundary only from an exhausted list, including every page.
// A load-more page can repeat existing rows. Check the order of newly seen rows.
function doctorvillePageOrder(pages){
 if(pages.length<2||pages.length>9)return null;
 const seen=new Map(),boundaries=[];let lastDay='',direction=0;
 for(const rows of pages){
  const parsed=catalogRows(rows);
  if(!parsed)return null;
  let newRows=0;
  for(const row of parsed){
   const [day,,id]=row,signature=JSON.stringify(row);
   if(seen.has(id)){if(seen.get(id)!==signature)return null;continue;}
   if(lastDay&&day!==lastDay){
    const change=day>lastDay?1:-1;
    if(direction&&change!==direction)return null;
    direction=change;
   }
   seen.set(id,signature);lastDay=day;newRows++;
  }
  if(!newRows)return null;
  boundaries.push(lastDay);
 }
 return direction?{direction,boundaries}:null;
}

export class DoctorvilleApplicationRefresh{
 invalidate(){this.last=null;}
 #previous(owner,now){
  const previous=this.last;
  return previous?.owner===owner&&kstDate(previous.at)===kstDate(now)&&now>=previous.at?previous:null;
 }
 reuse({owner,now,date,signatures,forced}){
  const previous=this.#previous(owner,now);
  if(forced||!previous?.order||now-previous.at>=fullRefreshInterval)return '';
  const {direction,boundaries}=previous.order,boundary=boundaries[signatures.length-1];
  if(!boundary||!signatures.every((value,index)=>!!value&&value===previous.signatures[index]))return '';
  if(direction===1&&date<boundary)return 'after_target_date';
  if(direction===-1&&date>boundary)return 'past_target_date';
  return '';
 }
 finish({owner,now,signatures,pages,complete}){
  if(!complete){this.invalidate();return 0;}
  this.last={owner,at:now,signatures,order:doctorvillePageOrder(pages)};
  return now;
 }
}

export class DoctorvilleApplicationNotices{
 constructor(file){
  this.file=file;
  this.seen=readJson(file,{},data=>data&&typeof data==='object'&&!Array.isArray(data)&&
   Object.entries(data).every(([id,at])=>/^\d{1,10}$/.test(id)&&Number.isSafeInteger(at)&&at>0));
 }
 accept(candidates,now=Date.now()){
  const recent=Object.fromEntries(Object.entries(this.seen).filter(([,at])=>at>=now-31*86400000));
  const targets=candidates.filter(event=>!Object.hasOwn(recent,event.id));
  if(!targets.length)return targets;
  for(const event of targets)recent[event.id]=now;
  atomicJson(this.file,recent);
  this.seen=recent;
  return targets;
 }
}
