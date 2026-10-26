(function(job,mode,manualTarget){const hmpAutoEntryPage=(function hmpAutoEntryPage(job, mode='inspect') {
 const diag={candidateCards:0,titleMatches:0,scheduleMatches:0,matchedTargets:0,entryControls:0,targetMatched:false};
 const out=(status,reason='hmp_target')=>({status,reason,...diag});
 let here;try{here=new URL(location.href);}catch{return out('blocked','document_origin');}
 const trusted=u=>u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname==='hmp.co.kr'||u.hostname.endsWith('.hmp.co.kr'));
 if(!trusted(here))return out('blocked','document_origin');
 if(!job||job.hmpRepeatSchema!==1||job.site!=='hmp'||!Number.isInteger(job.hmpSlot)||job.hmpSlot<0||job.hmpSlot>4||!job.key||!job.title||!/^\d{4}-\d{2}-\d{2}$/.test(job.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time))return out('invalid');
 if(Date.now()<job.due||Date.now()>job.deadline)return out('outside_window');
 const norm=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
 const visible=e=>!!e&&e.getClientRects().length>0&&!e.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(e).visibility!=='hidden';
 const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector)).filter(visible);
 const text=e=>e?.innerText||e?.textContent||'';
 if(all('input[type="password"]').length||/\/login\//i.test(here.pathname))return out('login');
 if(all('[role="dialog"][aria-modal="true"]').length||/Verify you are human|Checking your browser|비정상적인 접근|접근이 차단/i.test(text(document.body)))return out('blocked');
 if(document.readyState&&document.readyState!=='complete')return out('not_open');
 // Playback is a separate observation after native code proves a new document.
 if(mode==='playback_start'||mode==='playback_probe'){
   const videos=[];let inaccessible=false;
   const collect=(doc,depth)=>{for(const v of doc.querySelectorAll('video'))videos.push(v);if(depth<2)for(const f of doc.querySelectorAll('iframe')){try{if(f.contentDocument)collect(f.contentDocument,depth+1);else inaccessible=true;}catch{inaccessible=true;}}};
   collect(document,0);if(videos.length!==1)return {status:videos.length?'inaccessible':inaccessible?'inaccessible':'no_video'};
   const video=videos[0],key=job.key+':'+job.hmpSlot;
   if(!window.__doctorGleanHmpPlayback||window.__doctorGleanHmpPlayback.key!==key)window.__doctorGleanHmpPlayback={key,video,started:false,status:'not_checked',time:video.currentTime,at:Date.now()};
   const state=window.__doctorGleanHmpPlayback;
   if(state.video!==video)return {status:'not_ready'};
   if(mode==='playback_start'&&!state.started){
     state.started=true;state.status='requested';video.muted=true;
     try{const promise=video.play();if(promise?.catch)promise.catch(e=>{state.status=e?.name==='NotAllowedError'?'gesture_required':'play_failed';});}catch(e){state.status=e?.name==='NotAllowedError'?'gesture_required':'play_failed';}
   }
   if(!video.paused&&!video.ended&&video.readyState>=2&&Number.isFinite(video.currentTime)&&video.currentTime>state.time+0.1&&Date.now()>state.at)return {status:'playing_observed'};
   return {status:state.status};
 }
 if(mode!=='inspect'&&mode!=='click')return out('invalid');
 const cards=all('.area').filter(c=>all('.subject',c).length===1);diag.candidateCards=cards.length;
 const wanted=norm(job.title),matches=[];let inheritedDate='';
 // Fixed count-only observations explain a failed exact match without exporting
 // page text, titles, links or player data. Alternate normalization never
 // participates in eligibility or click selection.
 const subjects=Array.from(document.querySelectorAll('.subject')),shownSubjects=subjects.filter(visible);
 const exact=e=>norm(text(e))===wanted||all('strong',e).some(x=>norm(text(x))===wanted);
 const compatibility=s=>norm(String(s||'').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,''));
 diag.subjectNodes=Math.min(400,subjects.length);diag.visibleSubjects=Math.min(400,shownSubjects.length);
 diag.titleOutsideCards=Math.min(400,shownSubjects.filter(e=>exact(e)&&!cards.some(c=>c.contains(e))).length);
 diag.titleAttributeMatches=Math.min(400,shownSubjects.filter(e=>[e,...all('[title],[aria-label]',e)].some(x=>[x.getAttribute('title'),x.getAttribute('aria-label')].some(v=>v&&norm(v)===wanted))).length);
 diag.titleNormalizedMatches=Math.min(400,shownSubjects.filter(e=>[e,...all('strong',e)].some(x=>compatibility(text(x))===compatibility(job.title))).length);
 for(const card of cards){
   const dateField=card.querySelector('.date'),dateText=visible(dateField)?text(dateField):'';
   const full=dateText.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/);
   const short=dateText.match(/(?:^|\s)(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/);
   if(full)inheritedDate=`${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')}`;
   else if(short)inheritedDate=`${job.date.slice(0,4)}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`;
   else if(norm(dateText))inheritedDate='';
   // An empty date may only inherit within the same adjacent card list.
   if(!full&&!short&&cards.indexOf(card)>0&&card.previousElementSibling!==cards[cards.indexOf(card)-1])inheritedDate='';
   const subject=card.querySelector('.subject');
   const titleMatch=norm(text(subject))===wanted||all('strong',subject).some(e=>norm(text(e))===wanted);
   if(!titleMatch)continue;diag.titleMatches++;
   const clockField=card.querySelector('.time');const clock=(visible(clockField)?text(clockField):'').match(/(?:^|\s)([0-2]?\d):([0-5]\d)(?!\d)/);
   if(inheritedDate!==job.date||!clock||`${clock[1].padStart(2,'0')}:${clock[2]}`!==job.time)continue;
   diag.scheduleMatches++;matches.push(card);
 }
 diag.matchedTargets=matches.length;diag.targetMatched=matches.length===1;
 if(matches.length!==1)return out(matches.length?'ambiguous':'target_missing',matches.length?'hmp_duplicate_target':diag.titleMatches?'hmp_schedule_unmatched':'hmp_title_unmatched');
 const card=matches[0],state=card.querySelector('.state')||card;
 const labels=all('button,a,input[type="button"],input[type="submit"],span,p,strong',state).filter(e=>!e.closest('.subject')).map(e=>norm(e.getAttribute('aria-label')||e.value||text(e)));
 if(labels.some(s=>/^(?:강의종료|방송종료|다시보기)$/.test(s)))return out('lecture_ended','hmp_ended');
 if(labels.some(s=>/^(?:강의취소|신청마감|신청하기|미신청|사전신청)$/.test(s)))return out('not_open','hmp_unavailable');
 const controls=all('button,a,input[type="button"],input[type="submit"]',state).filter(e=>/^강의시청(?:하기)?$/.test(norm(e.getAttribute('aria-label')||e.value||text(e))));
 diag.entryControls=controls.length;if(controls.length!==1)return out(controls.length?'ambiguous':labels.some(s=>s==='신청완료'||s==='등록완료')?'not_open':'button_missing');
 const button=controls[0];if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open');
 const safe=raw=>{try{const u=new URL(raw,here);return trusted(u)&&!/(?:login|logout|apply|regist|enroll|payment|order|token|auth|session|password|email|ticket|delete|withdraw)/i.test(decodeURIComponent(u.pathname+u.search));}catch{return false;}};
 const href=button.closest('a[href]')?.getAttribute('href'),form=button.closest('form'),action=button.getAttribute('formaction')||form?.getAttribute('action');
 if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safe(href)||form&&action&&!safe(action))return out('blocked');
 if(mode==='inspect')return out('ready');
 const key=job.key+':'+job.hmpSlot;if(window.__doctorGleanHmpEntryAttempt===key)return out('already_attempted');
 window.__doctorGleanHmpEntryAttempt=key;button.click();return out('clicked');
});const siteAutoEntryPage=(function siteAutoEntryPage(job, mode='inspect', manualTarget=null) {
  const hosts={keymedi:'keymedi.com',medigate:'medigate.net',intermd:'intermd.co.kr',bluepharm:'bluepharmkorea.co.kr'};
  const host=hosts[job?.site];
  const diag={candidateCards:0,matchedTargets:0,entryControls:0,targetMatched:false};
  const out=(status,reason,extra={})=>({status,reason,...diag,...extra});
  const trusted=u=>u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname===host||u.hostname.endsWith('.'+host));
  const here=new URL(location.href);
  if(!host||!trusted(here))return out('blocked','document_origin');
  const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
  const visible=e=>!!e&&e.getClientRects().length>0&&!e.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(e).visibility!=='hidden';
  const all=(s,r=document)=>Array.from(r.querySelectorAll(s)).filter(visible);
  const text=e=>e?.innerText||e?.textContent||'';
  const body=text(document.body);
  if(/Verify you are human|Checking your browser|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(body))return out('blocked','security_check');
  if(/\/(?:login|loginView|sign-?in|logon)(?:\.(?:do|jsp|html?|hm))?\/?$/i.test(here.pathname)||all('input[type="password"]').length)return out('login','login_page');
  if(!job.title||!job.key||!/^\d{4}-\d{2}-\d{2}$/.test(job.date)||!/^\d{2}:\d{2}$/.test(job.time))return out('invalid','invalid_job');
  // Scheduling limits constrain automatic work, not a trusted user click on
  // the exact entry control. Native ownership still binds a today's job.
  if(mode!=='manual_click'&&(Date.now()<job.due||Date.now()>job.deadline))return out('outside_window','outside_window');
  if(document.readyState&&document.readyState!=='complete'||all('[aria-busy="true"],[role="progressbar"]').length)return out('not_open','page_loading');
  const title=norm(job.title);
  // Use exactly the collector's 250-character truncation, never a loose prefix.
  const sameTitle=s=>norm(s)===title||(String(job.title).length===250&&norm(String(s).replace(/\s+/g,' ').trim().slice(0,250))===title);
  const selectors={intermd:'.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item',bluepharm:'.sem_info,.sem_cal_item',medigate:'article',keymedi:'[data-gtm-event-name="content_click"][data-gtm-content-category="메디 TV_메디TV Live"]'};
  const selector=selectors[job.site];
  const cards=all(selector);
  diag.candidateCards=cards.length;
  const titleSelector=job.site==='medigate'?'h1,h2,h3,h4,h5,h6,.tit,.title,[class*="title"],[class*="subject"]':'h1,h2,h3,h4,h5,h6,p,span,strong,a,div';
  const titleNodes=all(titleSelector).filter(e=>sameTitle(text(e)));
  const leaves=titleNodes.filter(e=>!titleNodes.some(x=>x!==e&&e.contains(x)));
  diag.titleMatches=leaves.length;
  const cardTitleMatches=r=>{
    if(leaves.some(e=>r===e||r.contains(e)))return true;
    if(job.site==='keymedi')return sameTitle(r.getAttribute('data-gtm-content-title'));
    if(job.site==='intermd'){
      const topics=all('.webinarItem__topic,.webinar__topic,.mWebinar__topic',r);
      return topics.length>0&&sameTitle(topics.map(e=>text(e).replace(/\s+/g,' ').trim()).join(' '));
    }
    return false;
  };
  const label=e=>norm(e.getAttribute('aria-label')||text(e)||all('img[alt]',e).map(i=>i.getAttribute('alt')).join(' '));
  const controls=r=>[...(r.matches('a,button,[role="button"]')?[r]:[]),...all('a,button,[role="button"]',r)];
  const sameSchedule=r=>{
    if(/(?:강의|방송|행사|세미나)\s*취소|취소된\s*(?:강의|행사)/.test(text(r)))return false;
    const fields=all('.detail_date,.detail_date_location,.sci_detail,.webinarItem__date,.webinar__info,.mWebinar__date,time,.date,.time',r);
    const values=(fields.length?fields:[r]).map(text);
    // Date fields remain separate from the title and the first time is the start,
    // not an end time or a clock in a neighbouring lecture.
    for(const value of values){
      const m=value.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/);
      const short=!m&&value.match(/(?:^|\s)(\d{1,2})\s*[.\/월]\s*(\d{1,2})(?!\d)/);
      const date=m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:short?`${job.date.slice(0,4)}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`:'';
      if(!date)continue;
      if(date!==job.date)return false;
      const time=(/\d{1,2}:[0-5]\d/.test(values.join(' '))?values.join(' '):text(r)).match(/(?:^|[^\d])(?:(오전|오후)\s*)?([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
      if(!time)return false;
      let hour=+time[2];if(time[1]){if(hour<1||hour>12)return false;hour=hour%12+(time[1]==='오후'?12:0);}
      return `${String(hour).padStart(2,'0')}:${time[3]}`===job.time;
    }
    return false;
  };
  const roots=[];
  for(const card of cards)if(cardTitleMatches(card)&&sameSchedule(card))roots.push(card);
  for(const leaf of leaves){
    if(leaf.closest(selector))continue;
    for(let p=leaf.parentElement,n=0;p&&p!==document.body&&n<6;p=p.parentElement,n++){
      if(text(p).length>6000||all(selector,p).length>1)break;
      if(job.site==='medigate'&&all(titleSelector,p).filter(e=>!e.querySelector(titleSelector)).length>1)break;
      if(sameSchedule(p)&&controls(p).length){roots.push(p);break;}
    }
  }
  let unique=[...new Set(roots)].filter(r=>!roots.some(x=>x!==r&&r.contains(x)));
  if(job.site==='bluepharm')unique=unique.map(r=>{
    // Some cards place .sem_action beside .sem_info, not inside it.
    const p=r.parentElement;
    return r.matches('.sem_info')&&p&&p!==document.body&&all('.sem_info,.sem_cal_item',p).length===1&&all('.sem_action',p).some(a=>!r.contains(a))&&text(p).length<6000?p:r;
  });
  unique=[...new Set(unique)];diag.scheduleMatches=unique.length;diag.matchedTargets=unique.length;diag.targetMatched=unique.length===1;
  if(unique.length>1)return out('ambiguous','duplicate_target');
  const sensitive=/(?:login|logout|regist|apply|enroll|payment|order|cart|token|auth|session|password|email|ticket|delete|withdraw)/i;
  const safeLink=raw=>{try{if(!raw||/^\s*(?:#|javascript:)/i.test(raw))return '';const u=new URL(raw,location.href);return trusted(u)&&!sensitive.test(decodeURIComponent(u.pathname+u.search))?u.href:'';}catch{return '';}};
  if(!unique.length){
    if(mode==='inspect'&&job.site==='bluepharm'){
      const links=[...new Set(all('header a[href],nav a[href],a[href*="webcast.main"]').filter(e=>['세미나','웹심포지움','웹심포지엄','웨비나','웹세미나'].includes(label(e))).map(e=>safeLink(e.getAttribute('href'))).filter(u=>u&&u!==here.href))];
      if(links.length===1)return out('navigate','catalog_link',{url:links[0]});
    }
    return out(leaves.length?'button_missing':'target_missing',leaves.length?'schedule_unmatched':'title_unmatched');
  }
  const root=unique[0];
  if(job.site==='keymedi'){
    const states=new Set(all('span',root).map(label).filter(s=>['신청완료','강의중'].includes(s)));
    diag.targetCardState=states.size===1?(states.has('신청완료')?'registered':'live'):'unknown';
  }
  const isEntry=e=>{
    const s=label(e);
    if(/^(?:(?:live|라이브|강의|세미나|웨비나|온라인|웹심포지움|웹심포지엄))?(?:입장|입장하기|바로입장|시청하기|시청)$/.test(s))return true;
    if(['medigate','keymedi','intermd'].includes(job.site)&&['강의보기','시청하러가기','바로시청하기','라이브보기'].includes(s))return true;
    return job.site==='bluepharm'&&s==='참여하기'&&all('.W_status.ongoing',root).length>0;
  };
  const buttons=controls(root).filter(isEntry);diag.entryControls=buttons.length;
  const evidence=all('a,button,[role="button"],span,p,strong,dt,dd',root).filter(e=>!leaves.some(l=>e===l||e.contains(l)));
  const unregistered=evidence.some(e=>/^(?:(?:사전|강의|세미나|웨비나|수강|참가))?(?:미신청|미등록|신청하기|수강신청|사전신청|등록하기|신청후입장하기)$/.test(label(e))||/^(?:(?:사전)?(?:신청|등록)(?:을|이)?(?:하지않은|되지않은|필요한)강의(?:입니다)?[.!]?|미신청강의(?:입니다)?[.!]?)$/.test(label(e)));
  const registered=evidence.some(e=>/^(?:(?:사전|수강|강의|참가))?(?:신청완료|등록완료|신청취소|등록취소|신청내역)$/.test(label(e)));
  // A DOM modal is accepted only as explicit evidence within the matched card.
  if(all('[role="dialog"][aria-modal="true"]').some(e=>!root.contains(e)))return out('blocked','unbound_dialog');
  if(unregistered)return out(buttons.length||registered?'ambiguous':'not_registered',buttons.length||registered?'registration_conflict':'registration_required');
  if(buttons.length>1)return out('ambiguous','multiple_entry_controls');
  if(!buttons.length){
    // The official LIVE list uses an onClick on the GTM div/li itself. Opening
    // that exact card is a separate one-shot step, never an entry success. The
    // site's handler owns detail routing (or its external-link click log); no
    // URL is guessed and nested bookmark/application controls are not clicked.
    const keymediCard=job.site==='keymedi'&&['www.keymedi.com','keymedi.com'].includes(here.hostname)&&/^\/meditv\/live\/?$/.test(here.pathname)&&root.matches(selector)&&root.matches('div,li')&&sameTitle(root.getAttribute('data-gtm-content-title'));
    const cardStatus=keymediCard&&['registered','live'].includes(diag.targetCardState);
    if(cardStatus&&!root.closest('[disabled],[aria-disabled="true"],.disabled')){
      if(job.detailOpened||window.__doctorGleanDetailAttempt===job.key)return out('button_missing','detail_already_opened');
      if(mode==='inspect')return out('open_target','target_card');
      if(mode==='open_target'){
        window.__doctorGleanDetailAttempt=job.key;
        try{root.click();return out('detail_opened','target_card_opened');}catch{return out('unknown','target_card_unconfirmed');}
      }
    }
    if(mode==='inspect'){
      const links=[...new Set(controls(root).filter(a=>a.matches('a[href]')&&!/(신청|등록|결제|예약|다시보기)/.test(text(a))).map(a=>safeLink(a.getAttribute('href'))).filter(u=>u&&u!==here.href))];
      if(links.length===1)return out('navigate','target_detail',{url:links[0]});
    }
    return out('button_missing',registered?'registered_button_missing':'entry_control_missing');
  }
  const button=buttons[0];
  if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open','entry_disabled');
  const href=button.closest('a[href]')?.getAttribute('href');
  if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safeLink(href))return out('blocked','unsafe_entry_action');
  const form=button.closest('form'),action=button.getAttribute('formaction')||form?.getAttribute('action');
  if(form&&action&&!safeLink(action))return out('blocked','unsafe_entry_action');
  if(mode==='manual_click'){
    let matched=false;try{
      const target=manualTarget?.nodeType===1?manualTarget:manualTarget?.parentElement;
      matched=manualTarget===button||!!target&&button.contains(target)&&target.closest('a,button,[role="button"]')===button;
    }catch{}
    return out(matched?'manual_clicked':'ready',matched?'entry_clicked':'entry_ready');
  }
  if(mode!=='click')return out('ready','entry_ready');
  if(window.__doctorGleanEntryAttempt===job.key)return out('already_attempted','click_already_sent');
  window.__doctorGleanEntryAttempt=job.key;button.click();return out('clicked','entry_clicked');
});return (function autoEntryPage(job, mode='inspect', manualTarget=null) {
  if(job?.site==='hmp')return hmpAutoEntryPage(job,mode);
  if(['medigate','keymedi','bluepharm','intermd'].includes(job?.site))return siteAutoEntryPage(job,mode,manualTarget);
  const hosts={doctorville:'doctorville.co.kr',keymedi:'keymedi.com',medigate:'medigate.net',intermd:'intermd.co.kr',bluepharm:'bluepharmkorea.co.kr'};
  const host=hosts[job?.site], here=new URL(location.href);
  const diag={candidateCards:0,titleMatches:0,scheduleMatches:0,matchedTargets:0,entryControls:0,targetMatched:false};
  const out=(status,extra={})=>({status,...diag,...extra});
  const trusted=u=>u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname===host||u.hostname.endsWith('.'+host));
  if(!host||!trusted(here))return out('blocked');
  const norm=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
  const visible=e=>!!e&&e.getClientRects().length>0&&!e.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(e).visibility!=='hidden';
  const all=(s,r=document)=>Array.from(r.querySelectorAll(s)).filter(visible);
  const text=e=>e?.innerText||e?.textContent||'';
  if(/\/(?:login|loginView|sign-?in|logon)(?:\.(?:do|jsp|html?|hm))?\/?$/i.test(here.pathname)||all('input[type="password"]').length)return out('login');
  if(/Verify you are human|Checking your browser|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(text(document.body))||all('[role="dialog"][aria-modal="true"]').length)return out('blocked');
  if(!job.title||!job.key||!/^\d{4}-\d{2}-\d{2}$/.test(job.date)||!/^\d{2}:\d{2}$/.test(job.time))return out('invalid');
  // A user can enter before the app's alarm is due. The native manual watcher
  // binds today's reservation and accepts trusted clicks; this mode only reads
  // the target and never performs its action.
  if(mode!=='manual_click'&&(Date.now()<job.due||Date.now()>job.deadline))return out('outside_window');
  if(document.readyState&&document.readyState!=='complete'||all('[aria-busy="true"],[role="progressbar"]').length)return out('not_open');
  const title=norm(job.title), clock=norm(job.time);
  const sensitive=/(?:login|logout|regist|apply|enroll|payment|order|cart|token|auth|session|password|email|ticket|delete|withdraw)/i;
  const safeLink=raw=>{try{const u=new URL(raw,location.href);return trusted(u)&&!sensitive.test(decodeURIComponent(u.pathname+u.search))?u.href:'';}catch{return '';}};
  const titles=all('h1,h2,h3,h4,h5,h6,p,span,strong,a,div.tit').filter(e=>norm(text(e))===title);
  if(job.site==='doctorville'){
    const cards=all('a.list_detail');diag.candidateCards=cards.length;
    for(const card of cards){
      const heading=card.querySelector('.tit');
      // A rendered private badge is presentation text, not part of the lecture title.
      // Never remove a plain title prefix without that exact site's badge evidence.
      if(!visible(heading)||!all('.ico_secret',card).length||!/^비공개\s+/.test(job.title))continue;
      const copy=heading.cloneNode(true);for(const badge of copy.querySelectorAll('.ico_secret'))badge.remove();
      if(norm(text(copy))===norm(job.title.replace(/^비공개\s+/,'')))titles.push(heading);
    }
  }
  const leaves=[...new Set(titles)].filter(e=>!titles.some(x=>x!==e&&e.contains(x)));diag.titleMatches=leaves.length;
  if(!leaves.length){
    if(mode==='inspect'&&job.site==='bluepharm'){
      const links=[...new Set(all('header a[href],nav a[href],a[href*="webcast.main"]').filter(e=>['세미나','웹심포지움','웹심포지엄','웨비나','웹세미나'].includes(norm(text(e)))).map(e=>safeLink(e.getAttribute('href'))).filter(u=>u&&u!==here.href))];
      if(links.length===1)return out('navigate',{url:links[0]});
    }
    return out('target_missing');
  }
  const selectors={doctorville:'a.list_detail',intermd:'.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item',bluepharm:'.sem_info,.sem_cal_item',medigate:'article',keymedi:'[data-gtm-event-name="content_click"][data-gtm-content-category="메디 TV_메디TV Live"]'};
  const sameSchedule=root=>{
    if(/(?:강의|방송|행사|세미나)\s*취소|취소된\s*(?:강의|행사)/.test(text(root)))return false;
    if(mode==='manual_click'){
      // A matching end time is not the start of this reservation. Prefer the
      // site's visible schedule fields so clocks in the title cannot take
      // precedence; without those fields, accept only the first root clock.
      const firstClock=value=>{
        const m=value.match(/(?:(오전|오후)\s*)?(\d+):(\d+)/);
        // An invalid earlier clock must not make a valid end clock the start.
        if(!m||!/^([01]?\d|2[0-3])$/.test(m[2])||!/^([0-5]\d)$/.test(m[3]))return '';
        let hour=+m[2];if(m[1]){if(hour<1||hour>12)return '';hour=hour%12+(m[1]==='오후'?12:0);}
        return `${String(hour).padStart(2,'0')}:${m[3]}`;
      };
      const field=all('.detail_date,.time,time,.date',root).find(e=>/\d+:\d+/.test(text(e)));
      if(firstClock(text(field||root))!==job.time)return false;
    }else if(!norm(text(root)).includes(clock))return false;
    const when=root.querySelector('.detail_date,.webinarItem__date,.sci_detail,time,.date')||root;
    const value=text(when);
    const full=value.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/);
    if(full)return `${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')}`===job.date;
    const short=value.match(/(?:^|\s)(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일|\s*\()/);
    return !!short&&`${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`===job.date.slice(5);
  };
  const roots=[];
  for(const leaf of leaves){
    const known=selectors[job.site]?leaf.closest(selectors[job.site]):null;
    if(known){if(sameSchedule(known))roots.push(known);continue;}
    for(let p=leaf.parentElement,n=0;p&&p!==document.body&&n<6;p=p.parentElement,n++){
      if(text(p).length>6000)break;
      if(sameSchedule(p)&&all('a,button,[role="button"]',p).length){roots.push(p);break;}
    }
  }
  const unique=[...new Set(roots)].filter(r=>!roots.some(x=>x!==r&&r.contains(x)));
  // Conflicting duplicate cards are not proof of this reservation's eligibility.
  diag.matchedTargets=unique.length;diag.scheduleMatches=unique.length;diag.targetMatched=unique.length===1;
  if(unique.length>1)return out('ambiguous');
  const entryLabel=e=>norm(e.getAttribute('aria-label')||text(e));
  const isEntry=(e,root)=>{
    const label=entryLabel(e);
    if(/^(?:(?:live|라이브|강의|세미나|웨비나|온라인)\s*)?(?:입장|입장하기|바로입장|시청하기|시청)$/.test(label))return true;
    // Bluepharm's participation control is accepted only on a running seminar.
    return job.site==='bluepharm'&&label==='참여하기'&&all('.W_status.ongoing',root).length>0;
  };
  const controls=[...new Set(unique.flatMap(root=>[...(root.matches('a,button,[role="button"]')?[root]:[]),...all('a,button,[role="button"]',root)].filter(e=>isEntry(e,root))))];
  diag.entryControls=controls.length;
  const evidence=unique.flatMap(root=>all('a,button,[role="button"],span,p,strong,dt,dd',root).filter(e=>!e.contains(leaves[0])));
  const unregistered=evidence.some(e=>/^(?:(?:사전|강의|세미나|웨비나|수강|참가))?(?:미신청|미등록|신청하기|수강신청|사전신청|등록하기|신청후입장하기)$/.test(entryLabel(e))||/^(?:(?:사전)?(?:신청|등록)(?:을|이)?(?:하지않은|되지않은|필요한)강의(?:입니다)?[.!]?|미신청강의(?:입니다)?[.!]?)$/.test(entryLabel(e)));
  const registered=evidence.some(e=>/^(?:(?:사전|수강|강의|참가))?(?:신청완료|등록완료|신청취소|등록취소|신청내역)$/.test(entryLabel(e)));
  if(unregistered)return out(controls.length||registered?'ambiguous':'not_registered');
  if(controls.length>1)return out('ambiguous');
  if(!controls.length){
    if(mode==='inspect'){
      const links=[...new Set(unique.map(r=>r.matches('a[href]')?r:r.querySelector('a[href]')).filter(Boolean).filter(a=>!/(신청|등록|결제|예약)/.test(text(a))).map(a=>safeLink(a.getAttribute('href'))).filter(u=>u&&u!==here.href))];
      if(links.length===1)return out('navigate',{url:links[0]});
    }
    return out('button_missing');
  }
  const button=controls[0];
  if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open');
  // Existing same-page JavaScript handlers retain native navigation guards.
  // Also reject unsafe explicit network actions
  // before a click can submit a registration/payment or navigate off site.
  const anchor=button.closest('a[href]'),href=anchor?.getAttribute('href');
  if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safeLink(href))return out('blocked');
  const form=button.closest('form'),action=button.getAttribute('formaction')||form?.getAttribute('action');
  if(form&&action&&!safeLink(action))return out('blocked');
  if(mode==='manual_click'){
    let matched=false;try{
      const target=manualTarget?.nodeType===1?manualTarget:manualTarget?.parentElement;
      matched=manualTarget===button||!!target&&button.contains(target)&&target.closest('a,button,[role="button"]')===button;
    }catch{}
    return out(matched?'manual_clicked':'ready');
  }
  if(mode!=='click')return out('ready');
  if(window.__doctorGleanEntryAttempt===job.key)return out('already_attempted');
  window.__doctorGleanEntryAttempt=job.key;
  // Never auto-accept a dialog, submit enrollment/payment, or synthesize viewing.
  button.click();
  return out('clicked');
})(job,mode,manualTarget);})