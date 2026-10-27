// PC-only exact-card inspection. Preflight never clicks, navigates, logs in,
// changes the clock, or calls the provider's handlers.
export function pcEntryPage(job,mode='preflight'){
 const diag={candidateCards:0,titleMatches:0,dateMatches:0,timeMatches:0,scheduleMatches:0,matchedTargets:0,entryControls:0,targetMatched:false,duplicateEquivalent:false};
 const out=(status,reason)=>({status,reason,...diag});
 const hosts={doctorville:['www.doctorville.co.kr','doctorville.co.kr'],medigate:['new.medigate.net','www.medigate.net','m.medigate.net','medigate.net'],keymedi:['www.keymedi.com','keymedi.com'],hmp:['www.hmp.co.kr','hmp.co.kr'],intermd:['www.intermd.co.kr','moa.intermd.co.kr','intermd.co.kr'],bluepharm:['bluepharmkorea.co.kr','www.bluepharmkorea.co.kr']};
 let here;try{here=new URL(location.href);}catch{return out('blocked','document_origin');}
 const trusted=u=>u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts[job?.site]?.includes(u.hostname);
 if(!trusted(here)||!job||!/^[a-f0-9]{64}$/.test(job.key)||typeof job.title!=='string'||!job.title.trim()||job.title.length>800||!/^20\d{2}-\d{2}-\d{2}$/.test(job.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time)||!Number.isSafeInteger(job.due)||!Number.isSafeInteger(job.deadline)||job.deadline<job.due||!['preflight','inspect','click'].includes(mode))return out('blocked','policy_rejected');
 if(mode!=='preflight'&&(Date.now()<job.due||Date.now()>job.deadline))return out('not_open','outside_window');
 const visible=e=>{
  if(!e?.getClientRects().length||e.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||['hidden','collapse'].includes(s.visibility))return false;}return true;
 };
 const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector)).filter(visible),text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim(),norm=s=>String(s??'').replace(/\s+/g,'').toLowerCase();
 if(document.readyState!=='complete')return out('not_open','document_loading');
 if(all('input[type="password"]').length||/\/(?:login|sign-?in)(?:\.[a-z]+)?\/?$/i.test(here.pathname))return out('login','login_required');
 if(all('[role="dialog"][aria-modal="true"],iframe[src*="captcha"],[name="captcha"]').length||/Verify you are human|Checking your browser|비정상적인 접근|접근이 차단/i.test(text(document.body)))return out('blocked','manual_confirmation');
 const sameTitle=value=>norm(value)===norm(job.title)||job.title.length===250&&norm(String(value).replace(/\s+/g,' ').trim().slice(0,250))===norm(job.title);
 const titleSelector=job.site==='hmp'?'.subject':job.site==='doctorville'?'.tit,h1,h2,h3,h4':job.site==='medigate'?'h1,h2,h3,h4,h5,h6,.tit,.title,[class*="title"],[class*="subject"]':'h1,h2,h3,h4,h5,h6,p,span,strong,.tit,.title';
 const selectors={doctorville:'a.list_detail',medigate:'article',keymedi:'[data-gtm-event-name="content_click"][data-gtm-content-category="메디 TV_메디TV Live"]',hmp:'.area',intermd:'.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item',bluepharm:'.sem_info,.sem_cal_item'};
 const cards=all(selectors[job.site]);diag.candidateCards=cards.length;
 const titled=root=>{
  if(job.site==='keymedi'&&sameTitle(root.getAttribute('data-gtm-content-title')))return true;
  return all(titleSelector,root).some(e=>{
   if(sameTitle(text(e)))return true;
   if(job.site!=='doctorville'||!/^비공개\s+/.test(job.title)||!e.querySelector('.ico_secret'))return false;
   const copy=e.cloneNode(true);for(const badge of copy.querySelectorAll('.ico_secret'))badge.remove();return norm(copy.textContent)===norm(job.title.replace(/^비공개\s+/,''));
  });
 };
 const dateValue=(year,month,day)=>{
  const value=`${year}-${String(+month).padStart(2,'0')}-${String(+day).padStart(2,'0')}`,d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:'';
 };
 const schedule=root=>{
  if(/(?:강의|방송|행사|세미나)\s*취소|취소된\s*(?:강의|행사)/.test(text(root)))return false;
  const fields=all('.detail_date,.detail_date_location,.sci_detail,.webinarItem__date,.webinar__info,.mWebinar__date,.top .date,time,.date,.time,[data-date]',root);
  const leaves=all('span,p,div,time',root).filter(e=>!e.querySelector('span,p,div,time')&&!e.closest('h1,h2,h3,h4,h5,h6,.tit,.title,.subject,[class*="title"],[class*="subject"]')&&!sameTitle(text(e)));
  const values=[...new Set([...fields,...leaves].map(e=>e.getAttribute('data-date')||text(e)))];
  const raw=values.join(' '),full=[...raw.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/g)],dates=new Set(full.map(m=>dateValue(m[1],m[2],m[3])).filter(Boolean));
  if(!full.length)for(const m of raw.matchAll(/(?:^|[^\d])(\d{1,2})\s*[.\/월]\s*(\d{1,2})(?!\d)/g)){const value=dateValue(job.date.slice(0,4),m[1],m[2]);if(value)dates.add(value);}
  if(dates.size!==1||!dates.has(job.date))return false;diag.dateMatches++;
  const m=raw.match(/(?:^|[^\d])(?:(오전|오후)\s*)?([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
  if(!m)return false;let hour=+m[2];if(m[1]){if(hour<1||hour>12)return false;hour=hour%12+(m[1]==='오후'?12:0);}
  if(`${String(hour).padStart(2,'0')}:${m[3]}`!==job.time)return false;diag.timeMatches++;return true;
 };
 const roots=[];
 for(const card of cards)if(titled(card)){diag.titleMatches++;if(schedule(card))roots.push(card);}
 // A separate hero/detail can repeat a listed lecture. Its own bounded region
 // must carry the same date and start time; never borrow a neighbouring card.
 for(const heading of all(titleSelector).filter(e=>sameTitle(text(e))&&!e.closest(selectors[job.site]))){
  if(all(titleSelector,heading).some(e=>sameTitle(text(e))))continue;
  diag.titleMatches++;
  for(let p=heading.parentElement,n=0;p&&p!==document.body&&n<5;p=p.parentElement,n++){
   if(text(p).length>6000||all(selectors[job.site],p).length>1)break;
   if(schedule(p)){roots.push(p);break;}
  }
 }
 let unique=[...new Set(roots)].filter(r=>!roots.some(other=>other!==r&&r.contains(other)));
 if(job.site==='bluepharm')unique=[...new Set(unique.map(r=>{const p=r.parentElement;return r.matches('.sem_info')&&p&&p!==document.body&&all('.sem_info,.sem_cal_item',p).length===1&&all('.sem_action',p).some(a=>!r.contains(a))&&text(p).length<6000?p:r;}))];
 const sensitive=/(?:login|logout|regist|apply|enroll|payment|order|cart|token|auth|session|password|email|ticket|delete|withdraw)/i;
 const safeLink=raw=>{try{if(!raw||/^\s*(?:#|javascript:)/i.test(raw))return '';const u=new URL(raw,here);if(!trusted(u)||sensitive.test(decodeURIComponent(u.pathname+u.search)))return '';u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_(?:source|medium|campaign|term|content)$/.test(key))u.searchParams.delete(key);u.searchParams.sort();return u.href;}catch{return '';}};
 const identity=root=>{
  const links=[...(root.matches('a[href]')?[root]:[]),...all('a[href]',root)].map(a=>safeLink(a.getAttribute('href'))).filter(Boolean);
  const detail=[...new Set(links.filter(raw=>{const u=new URL(raw);return raw!==safeLink(here.href)&&(/\/[a-z0-9_-]*\d[a-z0-9_-]*(?:\/|\.[a-z]+)?$/i.test(u.pathname)||[...u.searchParams.entries()].some(([k,v])=>/^(?:seminarId|webinarId|symposiumId|id|idx|no|seq)$/i.test(k)&&/^[a-zA-Z0-9_-]+$/.test(v)));}))];
  return detail.length===1?detail[0]:'';
 };
 const label=e=>norm(e.getAttribute('aria-label')||text(e)||all('img[alt]',e).map(i=>i.getAttribute('alt')).join(' '));
 const controls=root=>[...(root.matches('a,button,[role="button"]')?[root]:[]),...all('a,button,[role="button"]',root)].filter(e=>/^(?:(?:live|라이브|강의|세미나|웨비나|온라인|웹심포지엄|웹심포지움))?(?:입장|입장하기|바로입장|시청하기|시청)$/.test(label(e))||['강의보기','시청하러가기','바로시청하기','라이브보기'].includes(label(e))||job.site==='hmp'&&/^강의시청(?:하기)?$/.test(label(e))||job.site==='bluepharm'&&label(e)==='참여하기'&&all('.W_status.ongoing',root).length>0);
 if(unique.length>1&&job.site==='medigate'){
  const ids=unique.map(identity),states=unique.map(r=>({buttons:controls(r).length,registered:/신청완료|등록완료/.test(norm(text(r))),unregistered:/미신청|신청하기|등록하기/.test(norm(text(r)))}));
  if(ids[0]&&ids.every(id=>id===ids[0])&&states.every(s=>JSON.stringify(s)===JSON.stringify(states[0]))){unique=[unique[0]];diag.duplicateEquivalent=true;}
 }
 diag.scheduleMatches=unique.length;diag.matchedTargets=unique.length;diag.targetMatched=unique.length===1;
 if(unique.length!==1)return out(unique.length?'ambiguous':'target_missing',unique.length?'duplicate_target':diag.titleMatches?'schedule_unmatched':'title_unmatched');
 const root=unique[0],words=all('button,a,[role="button"],span,p,strong,dt,dd',root).map(label);
 if(words.some(s=>/^(?:미신청|신청하기|사전신청|수강신청|등록하기|신청후입장하기)$/.test(s)))return out('not_registered','registration_required');
 if(words.some(s=>/^(?:강의종료|방송종료|다시보기)$/.test(s)))return out('lecture_ended','lecture_ended');
 const buttons=controls(root);diag.entryControls=buttons.length;
 if(buttons.length!==1)return out(buttons.length?'ambiguous':Date.now()<job.due?'not_open':'button_missing',buttons.length?'multiple_entry_controls':Date.now()<job.due?'opens_later':'entry_control_missing');
 const button=buttons[0];
 if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open','entry_disabled');
 const anchor=button.closest('a[href]'),href=anchor?.getAttribute('href'),form=button.closest('form'),action=button.getAttribute('formaction')||form?.getAttribute('action');
 if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safeLink(href)||form&&action&&!safeLink(action))return out('blocked','unsafe_entry_action');
 if(mode!=='click')return out('ready','entry_ready');
 if(!['doctorville','medigate','keymedi'].includes(job.site))return out('blocked','policy_rejected');
 if(window.__doctorGleanPcEntryAttempt===job.key)return out('already_attempted','click_already_sent');
 window.__doctorGleanPcEntryAttempt=job.key;button.click();return out('clicked','entry_clicked');
}
