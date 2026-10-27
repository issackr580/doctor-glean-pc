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
 if(job.site==='hmp'&&mode!=='preflight'&&(job.hmpRepeatSchema!==1||!Number.isInteger(job.hmpSlot)||job.hmpSlot<0||job.hmpSlot>4||job.slot!==job.hmpSlot))return out('blocked','policy_rejected');
 const visible=e=>{
  if(!e?.getClientRects().length||e.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.opacity==='0'||['hidden','collapse'].includes(s.visibility))return false;}return true;
 };
 const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector)).filter(visible),text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim(),norm=s=>String(s??'').replace(/\s+/g,'').toLowerCase();
 if(document.readyState!=='complete')return out('not_open','document_loading');
 if(all('[aria-busy="true"],[role="progressbar"]').length)return out('not_open','page_loading');
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
   if(job.site==='hmp'&&all('strong',e).some(part=>sameTitle(text(part))))return true;
   if(job.site!=='doctorville'||!/^비공개\s+/.test(job.title)||!e.querySelector('.ico_secret'))return false;
   const copy=e.cloneNode(true);for(const badge of copy.querySelectorAll('.ico_secret'))badge.remove();return norm(copy.textContent)===norm(job.title.replace(/^비공개\s+/,''));
  });
 };
 const dateValue=(year,month,day)=>{
  const value=`${year}-${String(+month).padStart(2,'0')}-${String(+day).padStart(2,'0')}`,d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:'';
 };
 const schedule=root=>{
  if(/(?:강의|방송|행사|세미나)\s*취소|취소된\s*(?:강의|행사)/.test(text(root)))return false;
  if(job.site==='bluepharm'){
   // The collector indexes a continuous seminar by its start. Keep both
   // endpoints together in one labelled metadata field; never borrow a date
   // or clock from the title, badges, another card, or a separate schedule.
   const clean=element=>{
    const copy=element.cloneNode(true),originals=Array.from(element.querySelectorAll('*')),copies=Array.from(copy.querySelectorAll('*'));
    originals.forEach((node,i)=>{if(!visible(node)||node.matches('script,style,template,noscript'))copies[i].remove();});
    copy.querySelectorAll('.sem_action,.sem_dday,.js_sem_countdown,.sem_badges,.sem_tit').forEach(node=>node.remove());
    copy.querySelectorAll('br,span,b,strong,em,time,p,div,li,dt,dd').forEach(node=>node.after(document.createTextNode(' ')));
    return copy.textContent.replace(/\s+/g,' ').trim();
   };
   const metadata=all('.sem_detail,.sem_detail_action,.sci_detail',root),fields=metadata.filter(e=>!metadata.some(other=>other!==e&&other.contains(e))).map(clean).filter(value=>/^(?:일\s*시\s*[:：]?\s*)?\d/.test(value));
   if(fields.length){
    const dateHead=(value,start='')=>{
     const m=value.match(/^(?:(20\d{2})\s*[.\/년-]\s*)?(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?:일)?(?!\d)/);if(!m)return null;
     let year=m[1]?+m[1]:start?+start.slice(0,4):+job.date.slice(0,4);
     if(!m[1]&&start&&start.slice(5,7)==='12'&&+m[2]===1)year++;
     const date=dateValue(year,m[2],m[3]);return date?{date,rest:value.slice(m[0].length).replace(/^\s*\.(?=\s|\()/,'').trim()}:null;
    };
    const clock=value=>{
     value=value.replace(/^\s*\([월화수목금토일](?:요일)?\)\s*/,'').trim();
     const m=value.match(/^(?:(오전|오후)\s*)?([01]?\d|2[0-3])\s*(?::|시\s*)([0-5]\d)(?:분)?(?!\d)/);if(!m)return null;
     let hour=+m[2];if(m[1]){if(hour<1||hour>12)return null;hour=hour%12+(m[1]==='오후'?12:0);}
     return {time:String(hour).padStart(2,'0')+':'+m[3],rest:value.slice(m[0].length).trim()};
    };
    const values=fields.map(value=>{
     const first=dateHead(value.replace(/^일\s*시\s*[:：]?\s*/,''));if(!first)return null;
     const start=clock(first.rest);if(!start)return null;
     if(start.rest){
      const sep=start.rest.match(/^(?:[~～∼–—-]|부터)\s*/);if(!sep)return null;
      const tail=start.rest.slice(sep[0].length).replace(/\s*까지\s*$/,'').trim(),last=dateHead(tail,first.date),end=clock(last?last.rest:tail);
      if(!end||end.rest||last&&last.date<first.date||(!last||last.date===first.date)&&end.time<start.time)return null;
     }
     return first.date+' '+start.time;
    });
    if(values.some(value=>!value)||new Set(values).size!==1)return false;
    const [date,time]=values[0].split(' ');if(date!==job.date)return false;diag.dateMatches++;
    if(time!==job.time)return false;diag.timeMatches++;return true;
   }
  }
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
 if(job.site==='hmp'){
  // The PC collector supports adjacent two-column date groups. Share only a
  // visible date label within that exact sibling group, resetting at every
  // gap/hidden/ambiguous row. A global heading or a calendar month is no date.
  const seeds=all('.subject').filter(e=>!e.querySelector('.subject')&&!e.closest('header,footer,nav,aside,[role="dialog"]')),parents=new Map();
  for(const seed of seeds)for(let row=seed.parentElement,depth=0;row&&row!==document.body&&depth<7;row=row.parentElement,depth++){
   if(!visible(row)||all('.subject',row).length!==1)break;
   const parent=row.parentElement;if(!parent||!parent.matches('div,ul,ol')||parent.children.length<2||parent.children.length>400||all('.subject',parent).length<=1)continue;
   if(!row.matches('div,li,article'))break;
   if(!parents.has(parent))parents.set(parent,new Map());parents.get(parent).set(row,seed);break;
  }
  const parseDate=element=>{
   if(!visible(element)||element.querySelector('.subject,input,textarea,select'))return '';
   const value=text(element),m=value.match(/^(?:(20\d{2})\s*[.\/년-]\s*)?(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?:일)?\s*\.?\s*(?:\(([월화수목금토일])(?:요일)?\))?\s*\.?$/);
   if(!m||!m[1]&&!m[4])return '';
   const date=dateValue(m[1]||job.date.slice(0,4),m[2],m[3]);if(m[4]&&new Date(date+'T00:00:00Z').getUTCDay()!=='일월화수목금토'.indexOf(m[4]))return '';return date;
  };
  for(const [parent,known] of parents){let date='';for(const row of Array.from(parent.children)){
   const seed=known.get(row),children=Array.from(row.children).filter(visible);
   if(!visible(row)||!seed||children.length!==row.children.length||children.length<1||children.length>2||text(row).length>1600||row.querySelectorAll('*').length>200){date='';continue;}
   const content=children.at(-1);if(!content.contains(seed)||all('.subject',content).length!==1){date='';continue;}
   if(children.length===2&&(text(children[0])||children[0].querySelector('input,textarea,select')))date=parseDate(children[0]);
   const times=all('.top .time',content).filter(e=>!e.closest('.subject')),clock=times.length===1?text(times[0]).match(/^([01]?\d|2[0-3]):([0-5]\d)(?:\s*[~～∼–—-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?$/):null;
   const explicit=all('.date,[data-date]',content).filter(e=>text(e)).map(e=>parseDate(e));
   if(!date||!clock||explicit.some(value=>!value||value!==date)||all('a,span,p,button',content).some(e=>/^(?:VOD|녹화|replay|on demand)$/i.test(text(e)))){date='';continue;}
   if(!sameTitle(text(seed))&&!all('strong',seed).some(e=>sameTitle(text(e))))continue;
   diag.titleMatches++;if(date!==job.date)continue;diag.dateMatches++;
   if(clock[1].padStart(2,'0')+':'+clock[2]!==job.time)continue;diag.timeMatches++;roots.push(row);
  }}
 }
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
 if(!['doctorville','medigate','keymedi','hmp'].includes(job.site))return out('blocked','policy_rejected');
 const attemptKey=job.key+(job.site==='hmp'?':'+job.hmpSlot:'');
 if(window.__doctorGleanPcEntryAttempt===attemptKey)return out('already_attempted','click_already_sent');
 window.__doctorGleanPcEntryAttempt=attemptKey;button.click();return out('clicked','entry_clicked');
}
