// PC-only exact-card inspection. Preflight never clicks, navigates, logs in,
// changes the clock, or calls the provider's handlers.
export function pcEntryPage(job,mode='preflight'){
 const registration=['registration-inspect','registration-click'].includes(mode);
 const diag={candidateCards:0,titleMatches:0,dateMatches:0,timeMatches:0,scheduleMatches:0,matchedTargets:0,entryControls:0,identifiedTargets:0,distinctIdentities:0,stateVariants:0,targetMatched:false,duplicateEquivalent:false};
 const out=(status,reason)=>({status,reason,...diag});
 const hosts={doctorville:['www.doctorville.co.kr','doctorville.co.kr'],medigate:['new.medigate.net','www.medigate.net','m.medigate.net','medigate.net'],keymedi:['www.keymedi.com','keymedi.com'],hmp:['www.hmp.co.kr','hmp.co.kr'],intermd:['www.intermd.co.kr','moa.intermd.co.kr','intermd.co.kr'],bluepharm:['bluepharmkorea.co.kr','www.bluepharmkorea.co.kr']};
 let here;try{here=new URL(location.href);}catch{return out('blocked','document_origin');}
 const trusted=u=>u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts[job?.site]?.includes(u.hostname);
 if(!trusted(here)||!job||!/^[a-f0-9]{64}$/.test(job.key)||typeof job.title!=='string'||!job.title.trim()||job.title.length>800||!/^20\d{2}-\d{2}-\d{2}$/.test(job.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time)||!Number.isSafeInteger(job.due)||!Number.isSafeInteger(job.deadline)||job.deadline<job.due||!['preflight','inspect','click','registration-inspect','registration-click'].includes(mode))return out('blocked','policy_rejected');
 const doctorDetail=job.site==='doctorville'&&here.pathname==='/seminar/seminarDetail'&&!here.hash&&[...here.searchParams.keys()].length===1&&here.searchParams.getAll('seminarId').length===1&&/^[1-9]\d{0,11}$/.test(here.searchParams.get('seminarId'));
 if(job.site==='doctorville'&&here.pathname==='/seminar/seminarDetail'&&!doctorDetail)return out('blocked','policy_rejected');
 if(mode!=='preflight'&&(Date.now()<job.due||Date.now()>job.deadline))return out('not_open','outside_window');
 if(job.site==='hmp'&&!registration&&mode!=='preflight'&&(job.hmpRepeatSchema!==1||!Number.isInteger(job.hmpSlot)||job.hmpSlot<0||job.hmpSlot>4||job.slot!==job.hmpSlot))return out('blocked','policy_rejected');
 const visible=e=>{
  if(!e?.getClientRects().length||e.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.opacity==='0'||['hidden','collapse'].includes(s.visibility))return false;}return true;
 };
 const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector)).filter(visible),text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim(),norm=s=>String(s??'').replace(/\s+/g,'').toLowerCase();
 if(document.readyState!=='complete')return out('not_open','document_loading');
 if(all('[aria-busy="true"],[role="progressbar"]').length)return out('not_open','page_loading');
 if(all('input[type="password"]').length||/\/(?:login|sign-?in)(?:\.[a-z]+)?\/?$/i.test(here.pathname))return out('login','login_required');
 if(all('[role="dialog"][aria-modal="true"],iframe[src*="captcha"],[name="captcha"]').length||/Verify you are human|Checking your browser|비정상적인 접근|접근이 차단/i.test(text(document.body)))return out('blocked','manual_confirmation');
 const label=e=>norm(e.getAttribute('aria-label')||text(e)||all('img[alt]',e).map(i=>i.getAttribute('alt')).join(' '));
 const controls=root=>[...(root.matches('a,button,[role="button"]')?[root]:[]),...all('a,button,[role="button"]',root)].filter(e=>/^(?:(?:live|라이브|강의|세미나|웨비나|온라인|웹심포지엄|웹심포지움))?(?:입장|입장하기|바로입장|시청하기|시청)$/.test(label(e))||['강의보기','시청하러가기','바로시청하기','라이브보기'].includes(label(e))||job.site==='hmp'&&/^강의시청(?:하기)?$/.test(label(e))||job.site==='bluepharm'&&label(e)==='참여하기'&&all('.W_status.ongoing',root).length>0);
 const sameTitle=value=>norm(value)===norm(job.title)||job.title.length===250&&norm(String(value).replace(/\s+/g,' ').trim().slice(0,250))===norm(job.title);
 const titleSelector=job.site==='hmp'?'.subject':job.site==='doctorville'?(doctorDetail?'.tit,h1,h2,h3,h4,h5,h6,strong,p,span,div':'.tit,h1,h2,h3,h4'):job.site==='medigate'?'h1,h2,h3,h4,h5,h6,.tit,.title,[class*="title"],[class*="subject"]':'h1,h2,h3,h4,h5,h6,p,span,strong,.tit,.title';
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
 const doctorEnded=value=>/^(?:종료된세미나(?:입니다)?[.!。]?|세미나종료|강의종료|방송종료)$/.test(norm(value));
 const doctorDetailSchedule=root=>{
  const titles=all(titleSelector,root).filter(e=>sameTitle(text(e))),forbidden='nav,footer,aside,[role="dialog"],[aria-modal="true"],button,a,[role="button"],input,textarea,select,script,style,template,noscript';
  const clock=value=>{
   const m=value.match(/^(?:(오전|오후)\s*)?([01]?\d|2[0-3]):([0-5]\d)(?:\s*[~～∼–—-]\s*(?:(오전|오후)\s*)?([01]?\d|2[0-3]):([0-5]\d))?$/);if(!m)return null;
   const hour=(h,period)=>period?(+h>=1&&+h<=12?+h%12+(period==='오후'?12:0):-1):+h;
   const start=hour(m[2],m[1]),end=m[5]===undefined?start:hour(m[5],m[4]);if(start<0||end<0||end*60+ +(m[6]??m[3])<start*60+ +m[3])return {invalid:true};
   return {time:String(start).padStart(2,'0')+':'+m[3]};
  };
  const parse=value=>{
   value=value.replace(/^(?:일시|일정|날짜|강의일|방송일)\s*[:：]?\s*/,'');
   const m=value.match(/^(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:일)?(?!\d)\s*\.?\s*(?:\(([월화수목금토일])(?:요일)?\))?\s*(.*)$/);
   if(!m)return clock(value);
   const date=dateValue(m[1],m[2],m[3]),time=m[5]?clock(m[5]):{};if(!time)return null;
   return !date||m[4]&&new Date(date+'T00:00:00Z').getUTCDay()!=='일월화수목금토'.indexOf(m[4])?{invalid:true}:{date,...time};
  };
  const records=[];
  for(const element of [root,...all('time,p,span,div,li,dd,dt,em,strong,small,b',root)]){
   if(element.closest(forbidden)||titles.some(title=>title===element||title.contains(element)))continue;
   const add=value=>{if(value.length>140)return;const parsed=parse(value);if(parsed)records.push({element,...parsed});};
   if(!titles.some(title=>element.contains(title)))add(text(element));
   const direct=Array.from(element.childNodes).filter(node=>node.nodeType===3).map(node=>node.nodeValue).join(' ').replace(/\s+/g,' ').trim();if(direct)add(direct);
  }
  // A full range owns its nested end clock; it is never another start field.
  const fields=records.filter(row=>!records.some(other=>other!==row&&other.time&&other.element!==row.element&&other.element.contains(row.element)));
  const dates=new Set(fields.map(row=>row.date).filter(Boolean)),times=new Set(fields.map(row=>row.time).filter(Boolean));
  if(fields.some(row=>row.invalid)||dates.size!==1||!dates.has(job.date))return false;diag.dateMatches++;
  if(times.size!==1||!times.has(job.time))return false;diag.timeMatches++;return true;
 };
 const schedule=root=>{
  if(/(?:강의|방송|행사|세미나)\s*취소|취소된\s*(?:강의|행사)/.test(text(root)))return false;
  if(doctorDetail)return doctorDetailSchedule(root);
  if(job.site==='doctorville'&&root.matches('a.list_detail')&&root.querySelector('.time .start')){
   // Match the collector's dedicated start field. Dates can be bare text
   // between inline elements; a querySelector leaf cannot see those nodes.
   const starts=all('.time .start',root);if(starts.length!==1)return false;
   const copy=root.cloneNode(true),nodes=Array.from(root.querySelectorAll('*')),clones=Array.from(copy.querySelectorAll('*'));
   nodes.forEach((node,i)=>{if(!visible(node)||node.matches('.tit,h1,h2,h3,h4,.ico_secret,button,[role="button"],.time .start,script,style,template,noscript'))clones[i].remove();});
   copy.querySelectorAll('br,span,div,p,time,em,strong').forEach(node=>node.after(document.createTextNode(' ')));
   const raw=copy.textContent.replace(/\s+/g,' ').trim(),full=[...raw.matchAll(/(?:^|[^\d])(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:일)?\s*\.?\s*(?:\(([월화수목금토일])(?:요일)?\))?(?!\d)/g)];
   const values=full.length?full:[...raw.matchAll(/(?:^|[^\d])(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:일)?\s*\.?\s*(?:\(([월화수목금토일])(?:요일)?\))?(?!\d)/g)].map(m=>[m[0],job.date.slice(0,4),m[1],m[2],m[3]]);
   const dates=values.map(m=>{const date=dateValue(m[1],m[2],m[3]);return !date||m[4]&&new Date(date+'T00:00:00Z').getUTCDay()!=='일월화수목금토'.indexOf(m[4])?'':date;});
   if(!dates.length||dates.some(value=>!value)||new Set(dates).size!==1||dates[0]!==job.date)return false;diag.dateMatches++;
   const m=text(starts[0]).match(/^(?:(오전|오후)\s*)?([01]?\d|2[0-3]):([0-5]\d)$/);if(!m)return false;
   let hour=+m[2];if(m[1]){if(hour<1||hour>12)return false;hour=hour%12+(m[1]==='오후'?12:0);}
   if(String(hour).padStart(2,'0')+':'+m[3]!==job.time)return false;diag.timeMatches++;return true;
  }
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
   const labelled=e=>/^일\s*시\s*[:：]?\s*\d/.test(clean(e));
   let fields=all('span,p,li,div,dd',root).filter(e=>labelled(e)&&!Array.from(e.children).some(labelled)).map(clean);
   if(!fields.length)for(const icon of all('.ico_date',root)){
    let value=icon.nextElementSibling;
    if(value&&/^일\s*시\s*[:：]?\s*$/.test(text(value)))value=value.nextElementSibling;
    if(value&&visible(value)&&!value.matches('.sem_action,.sem_dday,.sem_tit')&&/^(?:일\s*시\s*[:：]?\s*)?\d/.test(clean(value)))fields.push(clean(value));
   }
   if(!fields.length){
    const metadata=all('.sem_detail,.sem_detail_action,.sci_detail',root),candidates=metadata.flatMap(e=>[e,...all('li,p,dd,span,div,time',e)]).filter(e=>!e.closest('.sem_action,.sem_dday,.sem_badges,.sem_tit')&&/^(?:일\s*시\s*[:：]?\s*)?\d/.test(clean(e)));
    fields=candidates.filter(e=>!candidates.some(other=>other!==e&&other.contains(e))).map(clean);
   }
   fields=[...new Set(fields)];
   if(fields.length){
    if(fields.length!==1)return false;
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
  const fields=all('.detail_date,.detail_date_location,.sci_detail,.webinarItem__date,.webinar__info,.mWebinar__date,.top .date,time,.date,.time,[data-date]',root).filter(e=>job.site!=='doctorville'||!e.closest(titleSelector)&&!e.querySelector(titleSelector));
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
  const outside=element=>{
   if(element.closest('header,footer,nav,aside,[role="dialog"],[aria-modal="true"]'))return true;
   for(let e=element;e&&e!==document.body;e=e.parentElement){
    if(/(?:^|[\s_-])(?:replay|vod|recording)(?:$|[\s_-])/i.test((e.getAttribute('class')||'')+' '+(e.id||'')))return true;
    if(e.matches('section')&&/다시\s*보기|녹화|\bVOD\b|replay/i.test(text(e.querySelector('h1,h2,h3'))))return true;
   }return false;
  };
  const seeds=all('.subject').filter(e=>!e.querySelector('.subject')&&!outside(e)),parents=new Map();
  const titles=root=>all('.subject',root).filter(e=>!e.querySelector('.subject')&&!outside(e));
  const clockFields='time,span,em,p,div,strong,small,b,i,h1,h2,h3,h4,h5,h6,a',clockPattern=/^(?:(오전|오후)\s*)?([01]?\d|2[0-3]):([0-5]\d)(?:\s*[~～∼–—-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?$/;
  const hasLegacyClocks=all('.top .time').some(e=>!e.closest('.subject'));
  for(const seed of seeds)for(let row=seed.parentElement,depth=0;row&&row!==document.body&&depth<7;row=row.parentElement,depth++){
   if(!visible(row)||outside(row)||titles(row).length!==1)break;
   const parent=row.parentElement;if(!parent||!parent.matches('div,ul,ol')||parent.children.length<2||parent.children.length>400||titles(parent).length<=1)continue;
   if(!row.matches('div,li,article'))break;
   if(!parents.has(parent))parents.set(parent,new Map());parents.get(parent).set(row,seed);break;
  }
  const parseDate=element=>{
   if(!visible(element)||element.querySelector('.subject,input,textarea,select'))return '';
   const value=text(element).replace(/^(?:일시|일정|날짜|강의일|방송일)\s*[:：]?\s*/,''),m=value.match(/^(?:(20\d{2})\s*[.\/년-]\s*)?(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?:일)?\s*\.?\s*(?:\(([월화수목금토일])(?:요일)?\))?\s*\.?$/);
   if(!m||!m[1]&&!m[4])return '';
   const date=dateValue(m[1]||job.date.slice(0,4),m[2],m[3]);if(m[4]&&new Date(date+'T00:00:00Z').getUTCDay()!=='일월화수목금토'.indexOf(m[4]))return '';return date;
  };
  for(const [parent,known] of parents){let date='';for(const row of Array.from(parent.children)){
   const seed=known.get(row),children=Array.from(row.children).filter(visible);
   if(!visible(row)||!seed||outside(row)||children.length!==row.children.length||children.length<1||children.length>2||text(row).length>1600||row.querySelectorAll('*').length>200){date='';continue;}
   const content=children.at(-1);if(!content.contains(seed)||titles(content).length!==1){date='';continue;}
   if(children.length===2&&(text(children[0])||children[0].querySelector('input,textarea,select')))date=parseDate(children[0]);
   let times=all('.top .time',content).filter(e=>!e.closest('.subject'));
   if(!hasLegacyClocks){
    const labels=all(clockFields,content).filter(e=>!outside(e)&&!e.closest('.subject')&&!e.contains(seed)&&clockPattern.test(text(e))&&!!(e.compareDocumentPosition(seed)&Node.DOCUMENT_POSITION_FOLLOWING));
    times=labels.filter(e=>!labels.some(other=>other!==e&&e.contains(other)));
   }
   const clock=times.length===1?text(times[0]).match(clockPattern):null;
   const datePattern=/^(?:(?:일시|일정|날짜|강의일|방송일)\s*[:：]?\s*)?(?:(?:20\d{2})\s*(?:[.\/-]|년)\s*)?\d{1,2}\s*(?:[.\/-]|월)\s*\d{1,2}(?:일)?(?:\s*\(?[월화수목금토일](?:요일)?\)?)?(?:\s*(?:[|·,:：]\s*)?(?:오전|오후)?\s*(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[~～∼–—-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)?\s*\.?$/;
   const dated=all(clockFields,content).filter(e=>!outside(e)&&!e.closest('.subject')&&!e.contains(seed)&&text(e).length<=90&&datePattern.test(text(e)));
   const explicit=dated.filter(e=>!dated.some(other=>other!==e&&e.contains(other))).map(e=>{const m=text(e).replace(/^(?:일시|일정|날짜|강의일|방송일)\s*[:：]?\s*/,'').match(/^(?:(20\d{2})\s*(?:[.\/-]|년)\s*)?(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})/);return m?dateValue(m[1]||job.date.slice(0,4),m[2],m[3]):'';});
   if(!date||!clock||explicit.some(value=>!value||value!==date)||all('a,span,p,button',content).some(e=>/^(?:VOD|녹화|replay|on demand)$/i.test(text(e)))){date='';continue;}
   if(!sameTitle(text(seed))&&!all('strong',seed).some(e=>sameTitle(text(e))))continue;
   diag.titleMatches++;if(date!==job.date)continue;diag.dateMatches++;
   let hour=+clock[2];if(clock[1]){if(hour<1||hour>12){date='';continue;}hour=hour%12+(clock[1]==='오후'?12:0);}
   if(String(hour).padStart(2,'0')+':'+clock[3]!==job.time)continue;diag.timeMatches++;roots.push(row);
  }}
 }
 // A separate hero/detail can repeat a listed lecture. Its own bounded region
 // must carry the same date and start time; never borrow a neighbouring card.
 for(const heading of all(titleSelector).filter(e=>sameTitle(text(e))&&!e.closest(selectors[job.site]))){
  if(all(titleSelector,heading).some(e=>sameTitle(text(e))))continue;
  diag.titleMatches++;
  for(let p=heading.parentElement,n=0;p&&p!==document.body&&n<5;p=p.parentElement,n++){
   if(text(p).length>6000||all(selectors[job.site],p).length>1)break;
   if(doctorDetail){
    if(p.closest('nav,footer,aside,[role="dialog"],[aria-modal="true"]')||text(p).length>2000||p.querySelectorAll('*').length>200)break;
    if(!controls(p).length&&!all('a,button,[role="button"],span,p,div,em,small',p).some(e=>doctorEnded(text(e))||/^(?:입장하기|신청하기|사전신청(?:하기)?|수강신청(?:하기)?|신청취소|신청완료|등록완료)$/.test(norm(text(e)))))continue;
   }
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
 // A list card can omit the date that its detail exposes. Read one exact,
 // observed detail link; this is never permission to click an entry control.
 // Preflight and click modes do not navigate, and duplicate titles stay put.
 if(job.site==='doctorville'&&['inspect','registration-inspect'].includes(mode)&&!unique.length&&here.origin==='https://www.doctorville.co.kr'&&here.pathname==='/seminar/main'&&!here.search&&!here.hash){
  const matching=cards.filter(titled);
  if(matching.length===1){
   const raw=safeLink(matching[0].getAttribute('href'));
   try{
    const target=new URL(raw),keys=[...target.searchParams.keys()];
    if(target.origin===here.origin&&target.pathname==='/seminar/seminarDetail'&&keys.length===1&&target.searchParams.getAll('seminarId').length===1&&/^[1-9]\d{0,11}$/.test(target.searchParams.get('seminarId')))return {...out('navigate','read_only'),url:target.href};
   }catch{}
  }
 }
 if(unique.length>1&&job.site==='medigate'&&!registration){
  const ids=unique.map(identity),states=unique.map(r=>({registered:/신청완료|등록완료/.test(norm(text(r))),unregistered:/미신청|신청하기|등록하기/.test(norm(text(r))),ended:/강의종료|방송종료|다시보기/.test(norm(text(r)))})),counts=unique.map(r=>controls(r).length);
  diag.identifiedTargets=ids.filter(Boolean).length;diag.distinctIdentities=new Set(ids.filter(Boolean)).size;diag.stateVariants=new Set(states.map(s=>JSON.stringify(s))).size;
  // A read-only hero can repeat the same observed detail link without an
  // entry button. Prefer the one actionable card only when eligibility agrees.
  const same=ids[0]&&ids.every(id=>id===ids[0])&&diag.stateVariants===1;
  const equivalent=counts.every(count=>count===counts[0]),oneAction=counts.filter(count=>count===1).length===1&&counts.every(count=>count<=1)&&states.every(s=>s.registered&&!s.unregistered&&!s.ended);
  if(same&&(equivalent||oneAction)){unique=[unique[oneAction?counts.indexOf(1):0]];diag.duplicateEquivalent=true;}
 }
 diag.entryControls=unique.reduce((count,root)=>count+controls(root).length,0);
 diag.scheduleMatches=unique.length;diag.matchedTargets=unique.length;diag.targetMatched=unique.length===1;
 if(unique.length!==1)return out(unique.length?'ambiguous':'target_missing',unique.length?'duplicate_target':diag.titleMatches?'schedule_unmatched':'title_unmatched');
 const root=unique[0],words=all('button,a,[role="button"],span,p,strong,dt,dd'+(job.site==='doctorville'?',div,em,small':''),root).map(label);
 if(job.site==='doctorville'&&words.some(doctorEnded))return out('lecture_ended','lecture_ended');
 if(registration){
  const buttons=all('button,a,[role="button"],input[type="button"],input[type="submit"]',root).filter(e=>/^(?:신청하기|사전신청|사전신청하기|수강신청|수강신청하기|강의신청|강의신청하기|세미나신청|세미나신청하기|등록하기)$/.test(label(e)||norm(e.value)));
  diag.registrationControls=buttons.length;
  const complete=words.some(s=>/^(?:신청완료|신청완료됨|사전신청완료|수강신청완료|등록완료)$/.test(s)||job.site==='doctorville'&&s==='신청취소');
  if(complete)return out(buttons.length?'ambiguous':'registered',buttons.length?'registration_conflict':'registered');
  if(words.some(s=>/^(?:강의종료|방송종료|다시보기|신청마감|접수마감|신청종료|모집마감)$/.test(s)))return out('lecture_ended','registration_closed');
  if(buttons.length!==1)return out(buttons.length?'ambiguous':'button_missing',buttons.length?'multiple_registration_controls':'registration_control_missing');
  const button=buttons[0];if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open','registration_disabled');
  if(/유료|결제|구매|(?:참가|수강|등록)비|[₩￦]|(?:^|\s)\d[\d,]*\s*원(?:\s|$)/.test(text(root)))return out('blocked','manual_confirmation');
  if(controls(root).length||all('input:not([type="hidden"]):not([type="button"]):not([type="submit"]),textarea,select',root).length)return out('blocked','manual_confirmation');
  const safe=raw=>{try{const u=new URL(raw,here);return trusted(u)&&u.origin===here.origin&&!/(?:logout|payment|order|cart|purchase|delete|withdraw|cancel|token|auth|password|email|ticket)/i.test(decodeURIComponent(u.pathname+u.search));}catch{return false;}};
  const anchor=button.closest('a[href]'),href=anchor?.getAttribute('href'),form=button.closest('form'),action=button.getAttribute('formaction')||form?.getAttribute('action');
  if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safe(href)||form&&(action&&!safe(action)||all('input:not([type="hidden"]):not([type="button"]):not([type="submit"]),textarea,select',form).length))return out('blocked','manual_confirmation');
  if(mode==='registration-inspect')return out('registration_ready','registration_ready');
  if(window.__doctorGleanPcRegistrationAttempt===job.key)return out('already_attempted','registration_already_attempted');
  window.__doctorGleanPcRegistrationAttempt=job.key;button.click();return out('registration_clicked','registration_requested');
 }
 if(words.some(s=>/^(?:미신청|신청하기|사전신청|수강신청|등록하기|신청후입장하기)$/.test(s)))return out('not_registered','registration_required');
 if(words.some(s=>/^(?:강의종료|방송종료|다시보기)$/.test(s)))return out('lecture_ended','lecture_ended');
 const buttons=controls(root);diag.entryControls=buttons.length;
 if(buttons.length!==1)return out(buttons.length?'ambiguous':Date.now()<job.due?'not_open':'button_missing',buttons.length?'multiple_entry_controls':Date.now()<job.due?'opens_later':'entry_control_missing');
 const button=buttons[0];
 if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open','entry_disabled');
 const anchor=button.closest('a[href]'),href=anchor?.getAttribute('href'),form=button.closest('form'),action=button.getAttribute('formaction')||form?.getAttribute('action');
 if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safeLink(href)||form&&action&&!safeLink(action))return out('blocked','unsafe_entry_action');
 if(mode!=='click')return out('ready','entry_ready');
 if(!['doctorville','medigate','keymedi','hmp','bluepharm'].includes(job.site))return out('blocked','policy_rejected');
 const attemptKey=job.key+(job.site==='hmp'?':'+job.hmpSlot:'');
 if(window.__doctorGleanPcEntryAttempt===attemptKey)return out('already_attempted','click_already_sent');
 window.__doctorGleanPcEntryAttempt=attemptKey;button.click();return out('clicked','entry_clicked');
}
