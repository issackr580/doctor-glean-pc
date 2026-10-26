(function(){const inspectBluepharmCalendar=(function inspectBluepharmCalendar(targetDate,previous,readRows){
 const now=Date.now(),month=targetDate.slice(0,7),day=+targetDate.slice(8);
 const state=previous?.date===targetDate?previous:{date:targetDate,started:now,moves:0};
 const text=e=>(e?.innerText??e?.textContent??'').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
 const visible=e=>{
  if(!e||!e.getClientRects().length)return false;
  for(let p=e;p&&p!==document;p=p.parentElement){const s=getComputedStyle(p);if(p.matches('script,style,template,noscript,[hidden]')||s.display==='none'||s.visibility==='hidden')return false;}
  return true;
 };
 const all=(s,root=document)=>Array.from(root.querySelectorAll(s)).filter(visible);
 const names=e=>[text(e),e.getAttribute('aria-label'),e.getAttribute('title'),...Array.from(e.querySelectorAll('img[alt]')).map(x=>x.getAttribute('alt'))].filter(Boolean);
 const label=e=>names(e).join(' ').trim();
 const title=s=>/^(?:세미나|웨비나|웹\s*심포지[엄움])\s*(?:캘린더|달력)(?:\s*보기)?$/.test(s);
 const cssPath=e=>{const parts=[];while(e&&e!==document.documentElement){const p=e.parentElement;if(!p)break;parts.unshift(e.tagName.toLowerCase()+':nth-of-type('+(Array.from(p.children).filter(x=>x.tagName===e.tagName).indexOf(e)+1)+')');e=p;}return 'html > '+parts.join(' > ');};
 const result=(status,reason,extra={})=>({state,status,reason,...extra});
 const safe=e=>{
  if(!visible(e)||e.disabled||e.getAttribute('aria-disabled')==='true'||e.closest('form')||/신청|예약|참여|설문|재생|시청|입장|로그인|다운로드/.test(label(e)))return false;
  const href=e.getAttribute('href')||'';
  if(!href||/^(#|javascript:)/i.test(href))return true;
  try{const u=new URL(href,location.href),here=new URL(location.href);return u.origin===here.origin&&u.pathname===here.pathname&&u.search===here.search&&!u.username&&!u.password;}catch{return false;}
 };
 const click=(e,reason)=>{
  if(!safe(e))return result('unconfirmed','calendar_control_unsafe');
  // Each planned filter/month/day action has its own response and settling
  // phase. Do not spend the next phase's budget waiting for the previous one.
  // A hard total limit still bounds slow or constantly changing pages.
  state.deadlineAt=Math.min(state.started+30000,now+12000);
  return result('loading',reason,{action:{kind:'click',selector:cssPath(e),signature:label(e)}});
 };
 const unique=a=>[...new Set(a)];
 const timedOut=now>(state.deadlineAt||state.started+12000);
 const headings=all('h1,h2,h3,h4,button,a,[role="button"],p,span,div').filter(e=>title(text(e))&&!Array.from(e.children).some(x=>title(text(x))));
 const roots=all('.wc_calendar');
 // A generic date picker is a calendar source only next to an explicit seminar
 // calendar heading. A shopping/search date picker elsewhere is never evidence.
 for(const heading of headings){
  for(let p=heading.parentElement,n=0;p&&p!==document.body&&n<5;p=p.parentElement,n++){
   if(!visible(p))continue;
   if(all('.ui-datepicker',p).length===1){roots.push(p);break;}
  }
 }
 const scopes=unique(roots).filter(p=>!roots.some(q=>q!==p&&p.contains(q)));
 if(scopes.length!==1){
  if(timedOut)return result('unconfirmed','calendar_timeout');
  if(scopes.length>1)return result('unconfirmed','calendar_ambiguous');
  const openers=all('button,a,[role="button"],div[onclick],span[onclick]').filter(e=>names(e).some(title)&&safe(e));
  if(openers.length===1&&!state.opened){state.opened=true;state.openedAt=now;return click(openers[0],'calendar_open');}
  if(state.opened&&now-state.openedAt<6000)return result('loading','calendar_opening');
  return result('unavailable','calendar_not_found');
 }
 const root=scopes[0],legacy=root.matches('.wc_calendar');
 const layout=legacy?'wc_calendar':'seminar_datepicker';
 if(timedOut){
  const header=root.querySelector(legacy?'.calendar_right .tit':'.ui-datepicker-title');
  const mt=text(header).match(/(20\d{2})\s*(?:[.\/-]|년)?\s*(1[0-2]|0?[1-9])(?!\d)\s*월?/);
  return result('unconfirmed','calendar_timeout',{layout,month:mt?mt[1]+'-'+mt[2].padStart(2,'0'):''});
 }
 const active=e=>e.getAttribute('aria-selected')==='true'||e.getAttribute('aria-pressed')==='true'||e.getAttribute('aria-checked')==='true'||e.checked===true||Array.from(e.classList).some(c=>/^(?:is[_-])?(?:active|on|selected|checked)$/i.test(c));
 const filterGroups=all('.sem_cal_filter .filter_group',root);
 let filtersConfirmed=false;
 if(filterGroups.length){
  if(filterGroups.length!==2)return result('unconfirmed','calendar_filters_unknown');
  for(const [i,group] of filterGroups.entries()){
   const options=all('button,a,span,li,label,[role="button"],[role="tab"]',group).filter(e=>text(e)==='전체'&&!Array.from(e.children).some(c=>text(c)==='전체'));
   if(options.length!==1)return result('unconfirmed','calendar_filters_unknown');
   const option=options[0];let chosen=false;
   for(let p=option;p&&p!==group;p=p.parentElement)if(active(p))chosen=true;
   if(chosen)continue;
   state.filterRequested=state.filterRequested||{};
   if(state.filterRequested[i])return result(now-state.filterRequested[i]<4000?'loading':'unconfirmed','calendar_filter_unconfirmed');
   state.filterRequested[i]=now;delete state.signature;
   return click(option,'calendar_filter_all');
  }
  filtersConfirmed=true;
 }
 const grid=legacy?all('.calendar_right',root)[0]:all('.ui-datepicker',root)[0];
 if(!grid)return result('unconfirmed','calendar_grid_unknown');
 const header=legacy?grid.querySelector('.tit'):grid.querySelector('.ui-datepicker-title');
 const mt=text(header).match(/(20\d{2})\s*(?:[.\/-]|년)?\s*(1[0-2]|0?[1-9])(?!\d)\s*월?/);
 if(!mt)return result('unconfirmed','calendar_month_unknown',{layout});
 const shownMonth=mt[1]+'-'+mt[2].padStart(2,'0');
 if(state.waitMonth){
  if(shownMonth!==state.waitMonth){delete state.waitMonth;state.quietSince=now;delete state.signature;delete state.dayRequested;}
  else if(now-state.monthAt<5000)return result('loading','calendar_month_loading',{layout,month:shownMonth});
  else return result('unconfirmed','calendar_month_unchanged',{layout,month:shownMonth});
 }
 if(shownMonth!==month){
  if(state.moves>=2)return result('unconfirmed','calendar_month_limit',{layout,month:shownMonth});
  const selector=shownMonth<month?(legacy?'.nextMonth':'.ui-datepicker-next'):(legacy?'.prevMonth':'.ui-datepicker-prev');
  const controls=all(selector,grid);
  if(controls.length!==1)return result('unconfirmed','calendar_month_control_unknown',{layout,month:shownMonth});
  state.waitMonth=shownMonth;state.monthAt=now;state.moves++;
  return click(controls[0],'calendar_month');
 }
 const cells=all(legacy?'.date > .num':'.ui-datepicker-calendar td',grid).filter(e=>!e.matches('.ui-datepicker-other-month'));
 const expectedDays=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate();
 const mapped=[];
 for(const cell of cells){
  const numbers=all(legacy?'span':'a,span,button',cell).map(text).filter(t=>/^(?:[1-9]|[12]\d|3[01])$/.test(t));
  if(numbers.length!==1)continue;
  const year=cell.getAttribute('data-year'),m=cell.getAttribute('data-month');
  if(year!==null&&year!==month.slice(0,4)||m!==null&&+m!==+month.slice(5)-1)continue;
  const date=cell.getAttribute('data-date');if(date&&date!==month+'-'+numbers[0].padStart(2,'0'))continue;
  mapped.push({el:cell,day:+numbers[0]});
 }
 if(mapped.length!==expectedDays||new Set(mapped.map(x=>x.day)).size!==expectedDays||mapped.some(x=>x.day<1||x.day>expectedDays))return result('unconfirmed','calendar_month_incomplete',{layout,month:shownMonth});
 const selected=mapped.find(x=>x.day===day).el;
 const isSelected=selected.matches('.active,[aria-selected="true"]')||all('.ui-state-active,[aria-selected="true"]',selected).length>0;
 if(!isSelected){
  if(state.dayRequested){if(now-state.dayAt<4000)return result('loading','calendar_date_loading',{layout,month:shownMonth});return result('unconfirmed','calendar_date_unconfirmed',{layout,month:shownMonth});}
  const links=legacy?[selected]:all('a,button',selected);
  if(links.length!==1||!safe(links[0]))return result('unconfirmed','calendar_date_control_unknown',{layout,month:shownMonth});
  state.dayRequested=true;state.dayAt=now;delete state.signature;
  return click(links[0],'calendar_date');
 }
 // Some calendars put the day result beside the date-picker wrapper. Expand
 // only within the same single-calendar component, never into the main list.
 let evidenceRoot=root;
 for(let n=0;n<2;n++){
  const p=evidenceRoot.parentElement;
  if(!p||p===document.body||p.matches('main,header,footer,nav,form')||all('.sem_tit,.wc_calendar',p).some(x=>x!==root)||all('.ui-datepicker',p).length!==(legacy?0:1))break;
  evidenceRoot=p;
 }
 if(all('[aria-busy="true"],.loading,.is-loading,.spinner',evidenceRoot).length)return result('loading','calendar_loading',{layout,month:shownMonth});
 const snapshot=evidenceRoot.cloneNode(true);snapshot.querySelectorAll('script,style,template,noscript,.sem_action,.sem_dday,.js_sem_countdown').forEach(e=>e.remove());
 const marks=all('.mark_blive,.mark_webi',grid),selectedMarks=all('.mark_blive,.mark_webi',selected);
 const signature=shownMonth+'|'+day+'|'+text(snapshot)+'|'+marks.map(e=>cssPath(e)).join('|');
 if(signature!==state.signature){state.signature=signature;state.quietSince=now;}
 if(now-state.quietSince<3000)return result('loading','calendar_settling',{layout,month:shownMonth,date:targetDate});
 if(legacy&&selectedMarks.length)return result('checked','calendar_events_present',{layout,month:shownMonth,date:targetDate,empty:false});
 // Strong empty evidence: an explicitly dated, visible empty result within
 // this calendar; an unrelated global "no results" label cannot be borrowed.
 const emptyText=s=>/^(?:(?:선택한|선택하신|해당|오늘의|오늘)\s*(?:날짜|일자|일|날)?(?:에|의)?\s*)?(?:(?:등록된|예정된|진행하는|진행되는|진행\s*중인|진행\s*예정인)\s*)?(?:세미나|강의|웨비나|일정)(?:가|이|는)?\s*(?:없습니다|없어요|없음)[.!]?$/.test(s);
 const datesIn=p=>{
  const raw=text(p),dates=[];
  const full=/(20\d{2})\s*[.\/년-]\s*(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?:일)?/g;
  for(const m of raw.matchAll(full))dates.push(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));
  // Month/day headings may omit the year; it comes from the validated month.
  const rest=raw.replace(full,' ');
  for(const m of rest.matchAll(/(?:^|[^0-9])([0-9]{1,2})\s*(?:월\s*|[.\/])\s*([0-9]{1,2})(?:일)?(?=$|[^0-9])/g))dates.push(month.slice(0,4)+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'));
  const explicit=p.getAttribute('data-date');if(explicit)dates.push(explicit);
  return dates;
 };
 // 0.6.38 screenshot: "9월 9일(수) Today / 오늘 세미나 1건"
 // contains a 9/8–12/8 ongoing seminar. The calendar is NOT empty, but there
 // are zero seminars starting on 9/9. Reconcile its count with its own rows.
 // Date-selected results can use a small/b/em tag and punctuation. Require
 // a complete counter label, never a bare number from a filter or archive.
 const countPattern=/^(?:(?:오늘(?:의)?|선택일|해당일|(?:선택한|선택된|해당)\s*(?:날짜|일자)(?:의)?|전체|총)\s*)?(?:세미나|강의|웨비나)\s*(?:수\s*)?[:：]?\s*[([]?\s*(?:총\s*)?([0-9]+)\s*(?:건|개)\s*[)\]]?$/;
 const outsideGrid=e=>!grid.contains(e)&&!e.contains(grid)&&!e.closest('.sem_cal_filter,.sem_tit,.sem_detail,.sem_detail_action');
 const resultElement=e=>outsideGrid(e)&&!e.closest('form,input,select,textarea,button,a,header,footer,aside,.all_sem_pagination_wrap');
 // 25359.jpg / 0.6.42: js_sem_cal_count contains "9월 14일(월) 세미나 1건".
 // Keep this entire field so a nested bare count cannot hide a stale date.
 const namedCounters=all('.js_sem_cal_count',evidenceRoot).filter(resultElement);
 const counters=namedCounters.length?namedCounters:all('*',evidenceRoot).filter(e=>resultElement(e)&&countPattern.test(text(e))&&!Array.from(e.children).some(c=>visible(c)&&countPattern.test(text(c))));
 const readCounter=e=>{
  const raw=text(e),dated=raw.match(/^((?:(?:20\d{2})\s*[.\/년-]\s*)?\d{1,2}\s*[.\/월-]\s*\d{1,2}(?:일)?\s*(?:\([월화수목금토일](?:요일)?\))?)\s*(.+)$/);
  const count=(dated?dated[2]:raw).match(countPattern);
  return count?{count:+count[1],dates:datesIn(e),dated:!!dated}:null;
 };
 if(!legacy&&counters.length&&typeof readRows==='function'){
  const counter=counters.length===1?readCounter(counters[0]):null;
  const details={classes:root.getAttribute('class')||'',count:counter?.count??-1,filtersConfirmed,rows:0,parts:[]};
  const uncertain=reason=>result('unconfirmed',reason,{layout,month:shownMonth,date:targetDate,details});
  if(counters.length!==1)return uncertain('calendar_count_ambiguous');
  if(!counter)return uncertain('calendar_count_unconfirmed');
  if(counter.dates.length)details.date=counter.dates[0];
  if(counter.dated&&!counter.dates.length||counter.dates.some(d=>d!==targetDate))return uncertain('calendar_result_date_mismatch');
  if(!filtersConfirmed)return uncertain('calendar_filters_unknown');
  // Locate the nearest result panel with an exact day heading, not dates
  // borrowed from a seminar schedule or the highlighted date-picker cell.
  const dayHeading=e=>{
   if(!outsideGrid(e)||counters.some(c=>c.contains(e)))return false;
   const s=text(e).replace(/(?:Today|오늘)/gi,'').trim();
   return /^(?:(?:20\d{2})\s*[.\/년-]\s*)?\d{1,2}\s*[.\/월-]\s*\d{1,2}(?:일)?\s*(?:\([월화수목금토일](?:요일)?\))?\s*$/.test(s)&&!Array.from(e.children).some(c=>visible(c)&&dayHeading(c));
  };
  let panel=null;
  for(let p=counters[0].parentElement;p&&evidenceRoot.contains(p);p=p.parentElement){
   const headings=all('*',p).filter(e=>resultElement(e)&&dayHeading(e));
   if(headings.length){
    if(headings.length!==1||datesIn(headings[0]).some(d=>d!==targetDate))return uncertain('calendar_result_date_mismatch');
    // The heading and count are often siblings of the result list. Keep the
    // scope to the known calendar component (which also contains its grid).
    const list=counters[0].closest('.sem_cal_list_wrap');
    panel=list&&evidenceRoot.contains(list)?list:evidenceRoot;break;
   }
   if(p===evidenceRoot)break;
  }
  if(!panel)return uncertain('calendar_result_date_missing');
  const calendarItems=all('.sem_cal_item',panel);
  if(calendarItems.length&&calendarItems.length!==details.count){details.rows=calendarItems.length;return uncertain('calendar_count_mismatch');}
  const titles=all('.sem_tit',panel).filter(e=>!grid.contains(e));
  let cards=unique(titles.map(title=>{
   for(let p=title.parentElement,n=0;p&&panel.contains(p)&&n<5;p=p.parentElement,n++){
    if(p===panel||p.contains(grid)||all('.sem_tit',p).length!==1)break;
    if(p.querySelector('.sem_detail,.sem_detail_action,.ico_date'))return p;
   }return null;
  }).filter(Boolean));
  let scheduleOnly=false,scheduleMismatch=false;
  if(details.count===0||cards.length!==details.count||titles.length!==cards.length){
   // 0.6.39 device report: count=1, filters/date confirmed, but zero sem_tit
   // cards matched. The screenshot shows a labelled "일시" line in a compact
   // calendar result. Read that line independent of the main-card class names.
   const clean=e=>{
    const c=e.cloneNode(true),originals=Array.from(e.querySelectorAll('*')),copies=Array.from(c.querySelectorAll('*'));
    originals.forEach((o,i)=>{if(!visible(o))copies[i].remove();});
    c.querySelectorAll('br,span,b,strong,em,time,p,div,li,dt,dd').forEach(x=>x.after(document.createTextNode(' ')));
    return text(c);
   };
   const labelled=e=>/^일\s*시(?:\s*[:：]|\s+\S|\s*\d)/.test(clean(e));
   const fields=all('li,p,dd,dl,div,span,time',panel).filter(e=>!grid.contains(e)&&!e.contains(grid)&&!e.closest('.sem_cal_filter,form,header,footer,aside')&&(!calendarItems.length||calendarItems.some(item=>item.contains(e)))&&labelled(e));
   // Keep a split start/end value together. Separate labelled schedule lines
   // remain separate rows, so they must still agree with the displayed count.
   const leaves=fields.filter(e=>!fields.some(other=>other!==e&&e.contains(other)));
   const schedules=unique(leaves.map(e=>{
    for(let p=e.parentElement;p&&p!==panel&&!p.contains(grid)&&fields.includes(p);p=p.parentElement){
     if(leaves.filter(x=>p.contains(x)).length!==1)break;
     e=p;
    }return e;
   }));
   if(calendarItems.some(item=>schedules.filter(e=>item.contains(e)).length!==1)){details.rows=calendarItems.length;return uncertain('calendar_schedule_unconfirmed');}
   if(schedules.length===details.count&&titles.length<=schedules.length){cards=schedules;scheduleOnly=true;}
   else {
    scheduleMismatch=schedules.length>0;
    details.samples=schedules.slice(0,4).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',shape:clean(e).replace(/[0-9]/g,'#').replace(/[^# .:/()~～∼–—+,：|\-]/g,'?').slice(0,160)}));
    // Preserve useful structure when no date field matches; the old report
    // returned parts:[] at this exact failure and hid the result-row layout.
    if(!details.samples.length)details.samples=all('h3,h4,h5,li,p,dl,dd,div,span',panel).filter(e=>!grid.contains(e)&&!e.contains(grid)&&!e.closest('.sem_cal_filter')&&!countPattern.test(text(e))&&!dayHeading(e)).slice(0,8).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',shape:clean(e).replace(/[0-9]/g,'#').replace(/[^# .:/()~～∼–—+,：|\-]/g,'?').slice(0,160)}));
   }
  }
  details.source=scheduleOnly?'calendar_schedule_fields':'calendar_sem_tit';
  details.rows=cards.length;
  if(scheduleMismatch||details.count>32||(!scheduleOnly&&titles.length!==cards.length)||cards.length!==details.count)return uncertain('calendar_count_mismatch');
  if(all('.loading,.spinner,[aria-busy="true"],.pagination,.paging,[class*="pagination"],[class*="load_more"]',panel).some(e=>!grid.contains(e)))return uncertain('calendar_results_incomplete');
  const parsed=cards.length?readRows(cards.map(cssPath).join(','),scheduleOnly):{events:[],matchedRows:0,startDateRows:0,undated:0,untimed:0,untitled:0,excluded:0,scheduleRows:[]};
  Object.assign(details,{startDateRows:parsed.startDateRows||0,undated:parsed.undated||0,untimed:parsed.untimed||0,untitled:parsed.untitled||0,excluded:parsed.excluded||0,events:scheduleOnly?(parsed.rowDates||[]).filter(d=>d===targetDate).length:parsed.events?.length||0});
  details.parts=(parsed.scheduleRows||[]).map(r=>({date:r.date,endDate:r.endDate,time:r.time,reason:r.reason}));
  if(['error','login','blocked','loading'].includes(parsed.status)||parsed.matchedRows!==cards.length||details.startDateRows!==cards.length||details.undated||details.untimed||details.untitled)return uncertain('calendar_schedule_unconfirmed');
  if(details.parts.some(r=>r.date>targetDate||!r.endDate||r.endDate<targetDate))return uncertain('calendar_schedule_outside_date');
  let events=parsed.events||[],delivery=parsed.delivery||[],eventsRead=!scheduleOnly;
  if(scheduleOnly&&details.events>0&&calendarItems.length===cards.length&&calendarItems.length){
   // Main-list cards can disappear after a live seminar ends while the dated
   // calendar keeps its own compact items. Read only those already counted,
   // settled items, using their own title and schedule. Date-only evidence
   // remains incomplete; it never becomes a manufactured lecture title.
   const items=readRows(calendarItems.map(cssPath).join(','),false,true);
   const itemParts=(items.scheduleRows||[]).map(r=>({date:r.date,endDate:r.endDate,time:r.time,reason:r.reason}));
   const sameSchedules=JSON.stringify(itemParts)===JSON.stringify(details.parts);
   if(!['error','login','blocked','loading'].includes(items.status)&&items.matchedRows===calendarItems.length&&items.startDateRows===calendarItems.length&&!items.undated&&!items.untimed&&sameSchedules){
    events=items.events||[];
    delivery=items.delivery||[];
    eventsRead=!items.untitled;
    details.titleRows=events.length;
    details.untitled=items.untitled||0;
    if(items.untitled)details.samples=calendarItems.flatMap(item=>all('.sci_content > *',item)).slice(0,8).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||''}));
    if(eventsRead){details.events=events.length;details.excluded=items.excluded||0;details.source='calendar_items';}
   }
  }
  return result('checked','calendar_start_dates',{layout,month:shownMonth,date:targetDate,empty:details.events===0,details,events,delivery,eventsRead});
 }
 const empty=all('*',evidenceRoot).filter(e=>resultElement(e)&&emptyText(text(e))&&!Array.from(e.children).some(x=>visible(x)&&emptyText(text(x))));
 const details={classes:root.getAttribute('class')||'',count:empty.length,parts:[]};
 for(const e of empty){
  let dates=[];
  for(let p=e,n=0;p&&evidenceRoot.contains(p)&&n<5;p=p.parentElement,n++){
   if(grid===p||p.contains(grid))break;
   dates=datesIn(p);
   if(dates.length){
    if(dates.every(d=>d===targetDate))return result('checked','dated_empty_message',{layout,month:shownMonth,date:targetDate,empty:true,details});
    break; // A contradictory nearer date cannot be overridden by a parent.
   }
  }
  if(details.parts.length<4)details.parts.push({tag:e.tagName,classes:e.getAttribute('class')||'',reason:dates.length?'other_date':'missing_result_date',date:dates[0]||''});
 }
 if(!empty.length){
  // Structural evidence only: no page text, HTML, input values or handlers.
  details.parts=all('*',evidenceRoot).filter(e=>resultElement(e)&&text(e)&&!Array.from(e.children).some(c=>visible(c)&&text(c)===text(e))).slice(0,12).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',shape:text(e).replace(/[0-9]/g,'#').replace(/[^# .:/()~～∼–—+,：|\-]/g,'?').slice(0,120)}));
 }

 // The old public wc_calendar stylesheet identifies event marks explicitly.
 // A complete month with known marks provides a control for an unmarked day.
 if(legacy&&marks.length)return result('checked',selectedMarks.length?'calendar_events_present':'month_event_markers',{layout,month:shownMonth,date:targetDate,empty:selectedMarks.length===0});
 // A date picker can highlight the requested day before its result handler
 // has run. Re-select once, then require the same dated/count evidence.
 if(!legacy&&filtersConfirmed&&!state.resultReloaded){
  const links=all('a,button',selected);
  if(links.length===1&&safe(links[0])){state.resultReloaded=true;delete state.signature;return click(links[0],'calendar_result_reload');}
 }
 return result('unconfirmed','calendar_result_unconfirmed',{layout,month:shownMonth,date:targetDate,details});
});const inspectWhodadocPages=(function inspectWhodadocPages(profile,targetDate,state,rows,controls,readPage){
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const visible=e=>{for(let p=e;p&&p!==document;p=p.parentElement){if(p.hidden||p.getAttribute('aria-hidden')==='true'||!p.getClientRects().length||getComputedStyle(p).display==='none'||getComputedStyle(p).visibility==='hidden')return false;}return !!e;};
 const out=(status,reason,extra={})=>({status,reason,...extra});
 const scan=state.whodadocPages||(state.whodadocPages={snapshots:[]});
 if(!rows.length||rows.some(e=>!e.matches('a.anchor-view')))return out('unconfirmed','unknown_card_layout');
 // Use the same parser as lecture extraction, including replay dates.
 const parsed=readPage({...profile,rowSelector:'a.anchor-view',validated:true,allowNoPagination:true},targetDate);
 const meta=parsed.catalogRows||[];
 if(parsed.undated||meta.length!==rows.length||meta.some(x=>!x.date))return out('unconfirmed','unparsed_card_dates');
 const cards=meta.map((x,i)=>({key:rows[i].getAttribute('href')+'|'+x.date+'|'+text(rows[i].querySelector('h3')).replace(/다시\s*보기|예약가능/g,''),date:x.date,replay:x.replay}));
 const evidence={rows:cards.length,dated:cards.length,pages:scan.snapshots.length,first:cards[0]?.date||'',last:cards.at(-1)?.date||''};
 if(controls.ambiguous||controls.more.length||controls.pagers.length>1)return out('unconfirmed','ambiguous_continuation',{evidence});
 if((controls.pagerDetails||[]).some(x=>['pager_loading','inactive_controls'].includes(x.reason)))return out('unconfirmed','pager_not_ready',{evidence});
 let pager=controls.pagers[0],current=1,next=null;
 if(!pager){const page=[...new URL(location.href).searchParams].filter(([k])=>/^(?:page|pageNo|pageIndex|page_no)$/i.test(k));if(page.length===1&&/^[1-9]\d*$/.test(page[0][1]))current=+page[0][1];}
 if(pager){
  const selected=Array.from(pager.querySelectorAll('[aria-current="page"],.active,.current,.on,.selected,strong,em,span')).filter(visible).filter(e=>/^\d+$/.test(text(e))&&!e.closest('a,button'));
  // Active anchors are valid current-page markers too.
  selected.push(...Array.from(pager.querySelectorAll('a[aria-current="page"],a.active,a.current,a.on,a.selected')).filter(visible));
  const numbers=[...new Set(selected.map(e=>+text(e)).filter(Number.isInteger))];
  if(numbers.length!==1||numbers[0]<1)return out('unconfirmed','current_page_unknown',{evidence});
  current=numbers[0];
  const enabled=e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.closest('.disabled,.disable,[aria-disabled="true"]');
  const links=Array.from(pager.querySelectorAll('a,button')).filter(enabled);
  const direct=links.filter(e=>text(e)===String(current+1));
  const forward=links.filter(e=>/^(?:다음(?:\s*\d+\s*페이지)?|next|[›»>])$/i.test(text(e)+'')||e.matches('.next'));
  if(direct.length===1)next=direct[0];
  else if(direct.length>1||forward.length>1)return out('unconfirmed','next_page_ambiguous',{evidence});
  else if(forward.length===1)next=forward[0];
  else if(Array.from(pager.querySelectorAll('a,button')).filter(visible).some(e=>/^\d+$/.test(text(e))&&+text(e)>current))return out('unconfirmed','next_page_unknown',{evidence});
 }
 const previous=scan.snapshots.at(-1);
 const here=new URL(location.href);
 // A canonical first-page load plus an explicit current-page marker is the
 // entry proof. Later pages must follow the observed next number in sequence.
 const ordinaryEntry=()=>[...here.searchParams].every(([k,v])=>
  /^(?:page|pageNo|pageNum|pageIndex|page_no|currentPage|currentPageNo)$/i.test(k)?v==='1':
  /^(?:search|searchType|searchCondition|searchKeyword|searchWord|keyword|srchType|srchWord|srchText)$/i.test(k)?v==='':
  /^(?:pageSize|pageUnit|recordCountPerPage|limit)$/i.test(k)&&/^\d{1,3}$/.test(v));
 if(!previous){
  if(current!==1||!ordinaryEntry())return out('unconfirmed','first_page_unconfirmed',{evidence});
 }else if(current!==previous.current+1)return out('unconfirmed','nonsequential_page',{evidence});
 evidence.pages=scan.snapshots.length+1;
 // Reported layout: featured future cards may repeat out of order, followed
 // by a descending ordinary list. Only a single crossing of the selected day
 // is evidence; a newer date reappearing after the past boundary rejects it.
 // No replay badge is needed: in the report several dated past rows lack one.
 const pastAt=cards.findIndex(x=>x.date<targetDate);
 const past=cards.slice(pastAt<0?cards.length:pastAt);
 if(!previous&&pastAt>0&&past.length>=2&&past.every((x,i)=>x.date<targetDate&&(!i||past[i-1].date>=x.date))){
  return out('checked','target_date_boundary',{evidence:{...evidence,targetDate,dateBoundary:past[0].date,futureRows:pastAt,pastRows:past.length,order:'target_partition'}});
 }
 // Only explicitly marked replay rows may establish the archive boundary.
 // Both changing page portions must be fully past the selected day. A pinned
 // future card is not included in this chronology test.
 if(previous){
  const oldKeys=new Set(previous.cards.map(x=>x.key)),newKeys=new Set(cards.map(x=>x.key));
  const before=previous.cards.filter(x=>!newKeys.has(x.key)),after=cards.filter(x=>!oldKeys.has(x.key));
  const descending=a=>a.length>=2&&a.every((x,i)=>x.replay&&x.date<targetDate&&(!i||a[i-1].date>=x.date));
  if(descending(before)&&descending(after)&&after[0].date<=before.at(-1).date)return out('checked','replay_archive_boundary',{evidence});
 }
 if(!next)return out('checked','list_exhausted',{evidence});
 if(scan.snapshots.length>=2)return out('unconfirmed','page_limit',{evidence});
 // Do not loop on a no-op next link or follow a lecture/action URL. Native
 // navigation policy also checks the returned destination before execution.
 const href=next.getAttribute('href')||'';
 if(/신청|예약|참여|시청|입장|로그인|다운로드/.test(text(next)))return out('unconfirmed','unsafe_page_control',{evidence});
 if(href&&!/^(#|javascript:)/i.test(href)){
  const u=new URL(href,location.href);
  const safeRoute=u=>u.protocol==='https:'&&u.origin===here.origin&&u.pathname===here.pathname&&!u.username&&!u.password&&u.href.length<=2048;
  if(!safeRoute(u))return out('unconfirmed','page_route_mismatch',{evidence});
  const sensitive=k=>/token|auth|session|password|email|ticket|redirect|callback|returnurl|action|command|delete|remove|submit|apply|register/i.test(k);
  const pairs=Array.from(pager.querySelectorAll('a[href]')).filter(visible).filter(e=>/^\d+$/.test(text(e))).map(e=>{
   try{return {number:+text(e),url:new URL(e.getAttribute('href'),location.href)};}catch{return null;}
  }).filter(x=>x&&safeRoute(x.url));
  const numbered=[...new Set(pairs.map(x=>x.number))];
  const keys=[...u.searchParams.keys()];
  if(new Set(keys).size!==keys.length||keys.some(sensitive))return out('unconfirmed','unsafe_page_parameters',{evidence});
  // Infer nonstandard page keys only from two or more rendered numbered links.
  // Every other parameter must retain a default empty search or a fixed size.
  const pageKeys=keys.filter(k=>u.searchParams.get(k)===String(current+1)&&
   (/^(?:page|pageNo|pageNum|pageIndex|page_no|currentPage|currentPageNo)$/i.test(k)||
    numbered.length>=2&&pairs.every(x=>x.url.searchParams.getAll(k).length===1&&x.url.searchParams.get(k)===String(x.number))));
  if(pageKeys.length!==1)return out('unconfirmed','page_parameter_ambiguous',{evidence});
  const key=pageKeys[0];
  const fixed=keys.filter(k=>k!==key);
  const defaultValue=(k,v)=>v===''&&/^[a-z][a-z0-9_]{0,39}$/i.test(k)||/^(?:pageSize|pageUnit|recordCountPerPage|limit)$/i.test(k)&&/^\d{1,3}$/.test(v);
  if(fixed.some(k=>!defaultValue(k,u.searchParams.get(k))||pairs.some(x=>x.url.searchParams.getAll(k).length!==1||x.url.searchParams.get(k)!==u.searchParams.get(k))))return out('unconfirmed','page_filters_changed',{evidence});
  if(pairs.some(x=>[...x.url.searchParams.keys()].some(k=>sensitive(k)||!keys.includes(k))))return out('unconfirmed','page_parameters_inconsistent',{evidence});
  evidence.type='numbered_page_link';evidence.count=fixed.length;
  if(u.href===here.href)return out('unconfirmed','unchanged_page_link',{evidence});
 }
 scan.snapshots.push({current,cards});
 return out('next','next_catalog_page',{element:next,evidence});
});const collectAdditionalPage=(function collectAdditionalPage(profile,targetDate){
  const doc=document;
  const visible=e=>!!e&&!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const text=e=>(e?(typeof e.innerText==='string'?e.innerText:e.textContent||''):'').replace(/\s+/g,' ').trim();
  const select=(s,root=doc)=>s?Array.from(root.querySelectorAll(s)).filter(visible):[];
  const chosen=(s,root)=>s?select(s,root).map(text).join(' '):'';
  const blueDelivery=row=>{
    // Read only the card's delivery badge, never a title, global filter or advert.
    // CSS-only badges have no text. Explicit online participation wins for hybrid cards.
    let offline=false,online=false;
    for(const badge of select('.W_badge_type',row)){
      let shown=true;for(let e=badge;e&&e!==row;e=e.parentElement)if(!visible(e)){shown=false;break;}
      if(!shown)continue;
      const labels=[text(badge),badge.getAttribute('aria-label'),badge.getAttribute('title'),...select('img[alt]',badge).map(e=>e.getAttribute('alt'))].filter(Boolean).map(s=>s.replace(/\s+/g,'').toLowerCase());
      online=online||badge.classList.contains('online')||labels.some(s=>/^(?:온라인(?:전용)?|on-?line(?:only)?|온[·ㆍ/,&+\-]?오프라인|온라인[·ㆍ/,&+\-]?오프라인|오프라인[·ㆍ/,&+\-]?온라인|on-?line[·/,&+\-]off-?line|hybrid|하이브리드)$/.test(s));
      offline=offline||badge.classList.contains('offline')||labels.some(s=>/^(?:오프라인(?:전용)?|off-?line(?:only)?)$/.test(s));
    }
    return online?'online':offline?'offline':'unknown';
  };
  const makeDate=(y,m,d)=>{const str=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const dt=new Date(str+'T00:00:00Z');return !isNaN(dt)&&dt.toISOString().slice(0,10)===str?str:null;};
  const dates=str=>{
    const full=[];for(const m of str.matchAll(/(?<!\d)(20\d{2})\s*(?:[./-]|년)\s*(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})(?:일)?(?!\d)/g)){const v=makeDate(+m[1],+m[2],+m[3]);if(v)full.push(v);}
    if(full.length)return [...new Set(full)];
    const partial=[];for(const m of str.matchAll(/(?<![\d./-])(\d{1,2})\s*(?:[/.]|월)\s*(\d{1,2})(?:일)?(?![\d./-])/g)){const years=[+targetDate.slice(0,4)-1,+targetDate.slice(0,4),+targetDate.slice(0,4)+1];const candidates=years.map(y=>makeDate(y,+m[1],+m[2])).filter(Boolean).sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(targetDate))-Math.abs(Date.parse(b)-Date.parse(targetDate)));if(candidates[0])partial.push(candidates[0]);}return [...new Set(partial)];
  };
  const getTime=str=>{const m=str.match(/(?<!\d)(?:(오전|오후)\s*)?([01]?\d|2[0-3])\s*(?::|시\s*)([0-5]\d)(?:분)?(?!\d)/);if(!m)return null;let h=+m[2];if(m[1]){
    // Whodadoc renders a redundant 오후 before 24-hour values (observed: 오후 13시 00분).
    if(h>12){if(profile.id!=='whodadoc'||m[1]!=='오후')return null;}
    else {if(h===0)return null;h=h%12+(m[1]==='오후'?12:0);}
  }return String(h).padStart(2,'0')+':'+m[3];};
  const blueSchedules=row=>{
    // A schedule field is inspected repeatedly while locating the smallest
    // labelled node. Reuse its normalized clone only during this synchronous
    // read; the next poll must observe changed dates, visibility and badges.
    const cleaned=new WeakMap();
    // Read a labelled schedule or the date icon's adjacent value, within this
    // card only. A split label and an unlabelled icon value are both supported.
    const clean=e=>{
      if(cleaned.has(e))return cleaned.get(e);
      const c=e.cloneNode(true);
      if(profile.blueCalendarScheduleOnly){
        const original=Array.from(e.querySelectorAll('*')),copies=Array.from(c.querySelectorAll('*'));
        original.forEach((x,i)=>{if(!visible(x)||x.matches('script,style,template,noscript,[hidden]'))copies[i].remove();});
      }
      c.querySelectorAll('.sem_action,.sem_dday,.js_sem_countdown,.sem_badges').forEach(x=>x.remove());
      // Detached clones lose rendered line breaks/gaps. Preserve the boundaries
      // of date/time fragments rather than concatenating two numeric values.
      c.querySelectorAll('br,span,b,strong,em,time,p,div,li').forEach(x=>x.after(doc.createTextNode(' ')));
      const value=text(c);cleaned.set(e,value);return value;
    };
    const labelled=e=>/^일\s*시\s*[:：]?\s*\d/.test(clean(e));
    // Calendar rows can have different title/classes from the main catalog.
    // This path is supplied only with the calendar's bounded, labelled date
    // fields. It reads their whole value and never manufactures lecture titles.
    if(profile.blueCalendarScheduleOnly)return [clean(row)];
    const candidates=select('span,p,li,div,dd',row).filter(e=>labelled(e)&&!Array.from(e.children).some(labelled)).map(clean);
    if(candidates.length)return [...new Set(candidates)];
    for(const icon of select('.ico_date',row)){
      let value=icon.nextElementSibling;
      if(value&&/^일\s*시\s*[:：]?\s*$/.test(text(value)))value=value.nextElementSibling;
      if(value&&visible(value)&&!value.matches('.sem_action,.sem_dday,.sem_tit')&&/^(?:일\s*시\s*[:：]?\s*)?\d/.test(clean(value)))candidates.push(clean(value));
    }
    if(candidates.length)return [...new Set(candidates)];
    // Bare date values are accepted only inside this card's schedule metadata,
    // and only if the entire field parses as a date/time or continuous range.
    // This supports icon + text-node and dt/dd layouts without scanning titles,
    // presenter descriptions, badges or another card for a convenient date.
    const metadata=select(profile.blueCalendarItemOnly?'.sci_detail':'.sem_detail,.sem_detail_action',row);
    const fields=metadata.flatMap(e=>[e,...select('li,p,dd,span,div,time',e)]).filter(e=>
      !e.closest('.sem_action,.sem_dday,.sem_badges,.sem_tit')&&/^(?:일\s*시\s*[:：]?\s*)?\d/.test(clean(e)));
    // Preserve the whole outer field even when invalid; a valid first <span>
    // must not hide an unparsed second schedule in its parent's text nodes.
    for(const e of fields.filter(e=>!fields.some(other=>other!==e&&other.contains(e))))candidates.push(clean(e));
    return [...new Set(candidates)];
  };
  const blueStart=s=>{
    // A continuous range is one lecture, indexed by its START date. Separate
    // schedules (slashes, multiple labelled values, etc.) remain unresolved.
    const dateHead=(value,start='')=>{
      const m=value.match(/^(?:(20\d{2})\s*[.\/년-]\s*)?(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?:일)?(?!\d)/);
      if(!m)return null;
      let year=m[1]?+m[1]:start?+start.slice(0,4):+(dates(m[0])[0]||'').slice(0,4);
      if(!m[1]&&start&&start.slice(5,7)==='12'&&+m[2]===1)year++;
      const date=makeDate(year,+m[2],+m[3]);
      return date?{date,rest:value.slice(m[0].length).replace(/^\s*\.(?=\s|\()/,'').trim()}:null;
    };
    const endpoint=value=>{
      value=value.replace(/^\s*\([월화수목금토일](?:요일)?\)\s*/,'').trim();
      const m=value.match(/^(?:(?:오전|오후)\s*)?(?:[01]?\d|2[0-3])\s*(?::|시\s*)[0-5]\d(?:분)?(?!\d)/);
      return {time:m?getTime(m[0]):null,rest:m?value.slice(m[0].length).trim():value};
    };
    const first=dateHead(s.replace(/^일\s*시\s*[:：]?\s*/,''));if(!first)return null;
    const start=endpoint(first.rest);
    if(!start.rest||/^시간\s*미정$/.test(start.rest))return {date:first.date,endDate:first.date,time:start.time,range:false};
    const separator=start.rest.match(/^(?:[~～∼–—-]|부터)\s*/);if(!separator)return null;
    const tail=start.rest.slice(separator[0].length).replace(/\s*까지\s*$/,'').trim();
    const last=dateHead(tail,first.date);
    const end=endpoint(last?last.rest:tail);
    if(end.rest||(!last&&!end.time)||(!last&&!start.time))return null;
    if(last&&last.date<first.date)return null;
    if((!last||last.date===first.date)&&start.time&&end.time&&end.time<start.time)return null;
    return {date:first.date,endDate:last?last.date:first.date,time:start.time,range:!!last&&last.date!==first.date};
  };
  const base={site:profile.id,events:[],rowDates:[],excluded:0,undated:0,targetUndated:0,untimed:0,untitled:0,matchedRows:0,coverage:false,source:location.href,checkedAt:Date.now(),warnings:[]};
  if(profile.id==='whodadoc')base.catalogRows=[];
  if(profile.id==='bluepharm'){base.delivery=[];base.deliverySignature=[];base.startDateRows=0;base.dateRangeRows=0;base.scheduleRows=[];}
  try{
    if(select('input[type="password"]').length)return {...base,status:'login',message:'로그인이 필요합니다.'};
    const pageText=text(doc.body);
    if(/Verify you are human|Checking your browser|자동입력 방지|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(pageText))return {...base,status:'blocked',message:'사이트의 접근 확인 화면을 직접 확인해 주세요.'};
    if(profile.readySelector&&!select(profile.readySelector).length)return {...base,status:'loading',message:'강의 목록 로딩을 기다리는 중입니다.'};
    let rows=profile.rowSelector?select(profile.rowSelector):select('a,article,figure,li,tr,[class*="seminar"],[class*="webinar"],[class*="lecture"]').filter(e=>{const t=text(e);return t.length>12&&t.length<1300&&!!getTime(t);});
    if(!profile.rowSelector)rows=rows.filter(e=>!rows.some(other=>other!==e&&e.contains(other)&&getTime(text(other))));
    if(rows.length>500)return {...base,status:'review',message:'너무 많은 요소가 선택됐습니다. 강의 카드 선택을 다시 해 주세요.'};
    base.matchedRows=rows.length;
    const headings=select('h1,h2,h3,h4,h5,dt,th,time,em,strong,span,a,p,div').filter(e=>{const t=text(e);return t.length<45&&/^(?:(?:20\d{2})\s*[./년-]\s*)?\d{1,2}\s*[./월-]\s*\d{1,2}(?:일)?(?:\s*[()월화수목금토일요일\s]*)$/.test(t)&&dates(t).length===1&&!rows.some(r=>r.contains(e)||e.contains(r));});
    const explicitDates=profile.dateSelector?select(profile.dateSelector).flatMap(e=>dates(text(e))):[];
    base.coverage=explicitDates.includes(targetDate)||headings.some(e=>dates(text(e))[0]===targetDate);
    for(const row of rows){
      const delivery=profile.id==='bluepharm'?blueDelivery(row):'unknown';
      if(base.deliverySignature)base.deliverySignature.push(delivery);
      const t=text(row);const replayBadge=profile.id==='whodadoc'&&Array.from(row.querySelectorAll('.tag-label')).some(e=>/^다시\s*보기$/.test(text(e)));if(row.closest('[class*="replay"],[id*="replay"]')||/^(?:VOD|다시보기|녹화강의)(?:\s|$)/i.test(t)){base.excluded++;continue;}
      // Bluepharm's countdown is a clock too. Only the labelled event date/time
      // belongs to a sem_tit card; never borrow a surrounding card's schedule.
      const blueCalendarItem=profile.id==='bluepharm'&&profile.blueCalendarItemOnly===true&&row.matches('.sem_cal_item');
      const blue=profile.id==='bluepharm'&&(!!row.querySelector('.sem_tit')||profile.blueCalendarScheduleOnly===true||blueCalendarItem);
      const intermd=profile.id==='intermd'&&row.matches('.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item');
      if(intermd&&select('.webinarBadge__VOD',row).length){base.excluded++;continue;}
      const intermdSchedule=intermd?chosen('.webinarItem__date,.webinar__info,.mWebinar__date',row):'';
      const schedule=blue?blueSchedules(row):[];
      const start=blue&&schedule.length===1?blueStart(schedule[0]):null;
      if(blue&&base.scheduleRows.length<32){
        // Only a format skeleton is exported for failed schedules: every digit
        // is # and every word is ?. No raw labels, IDs, titles or form values.
        const shape=s=>s.replace(/\d/g,'#').replace(/[^#\s.:/()~～∼–—+,：-]+/g,'?').replace(/\s+/g,' ').trim().slice(0,160);
        base.scheduleRows.push({count:rows.indexOf(row)+1,reason:start?'parsed_start':schedule.length>1?'multiple_schedules':schedule.length?'invalid_schedule':'missing_schedule',
          date:start?.date||'',endDate:start?.endDate||'',time:start?.time||'',parts:schedule.slice(0,2).flatMap(s=>dates(s).slice(0,3).map(date=>({date}))),shape:schedule.slice(0,2).map(shape).join(' | ')});
      }
      const time=blue?(start?.time||null):getTime(intermd?intermdSchedule:chosen(profile.timeSelector,row)||t);
      let ds=intermd?dates(intermdSchedule):blue?(start?[start.date]:[]):profile.calendarOnly?[]:dates(chosen(profile.dateSelector,row)||t);
      if(start){base.startDateRows++;if(start.range)base.dateRangeRows++;}
      // Inline sibling text can concatenate a numeric title and its date. Read separate
      // visible date fragments before falling back to group/headings; ambiguity still fails.
      if(ds.length===0&&!blue&&!intermd&&!profile.calendarOnly){const fragments=select('time,span,em,p,div',row).filter(e=>e.children.length===0&&text(e).length<90).flatMap(e=>dates(text(e)));const independent=[...new Set(fragments)];if(independent.length===1)ds=independent;}

      if(!ds.length&&profile.calendarOnly&&Array.isArray(profile.calendarCellDates)){
        const cell=row.closest('.calendar_grid > .day');
        const resolved=profile.calendarCellDates.find(x=>cell&&document.querySelector(x.selector)===cell);
        if(resolved?.date)ds=dates(resolved.date);
      }
      if(!ds.length&&profile.calendarOnly&&!Array.isArray(profile.calendarCellDates)){
        const dated=row.closest('[data-date]');
        if(dated)ds=dates(dated.getAttribute('data-date')||'');
        if(!ds.length&&profile.calendarMonth){
          const cell=row.closest('td,[role="gridcell"],.calendar_grid > .day');
          if(cell){
            const dayNumber=e=>{const m=text(e).match(/^([1-9]|[12]\d|3[01])\s*일?$/);return m?+m[1]:null;};
            const dayNodes=Array.from(cell.querySelectorAll(cell.matches('.day')?':scope > .day_txt, :scope > .day_txt > *':'a,button,span,strong,em,p,div')).filter(e=>dayNumber(e)!==null&&!rows.some(r=>r.contains(e)));
            const days=[...new Set(dayNodes.map(dayNumber))];
            if(days.length===1&&!/other|outside|prev|next|last_month/i.test(cell.className||'')){
              const v=makeDate(+profile.calendarMonth.slice(0,4),+profile.calendarMonth.slice(5),days[0]);if(v)ds=[v];
            }
          }
        }
      }
      if(!ds.length&&!blue&&!intermd&&!profile.calendarOnly&&profile.groupSelector){const group=row.closest(profile.groupSelector);if(group)ds=dates(chosen(profile.dateSelector,group)||text(group));}
      if(!ds.length&&!blue&&!intermd&&!profile.calendarOnly){const previous=headings.filter(h=>h.compareDocumentPosition(row)&Node.DOCUMENT_POSITION_FOLLOWING);if(previous.length)ds=dates(text(previous.at(-1)));}
      if(ds.length!==1){
        if(delivery==='offline'){base.excluded++;continue;}
        base.undated++;
        // An unresolved card elsewhere in the catalog is not evidence that a
        // selected-day lecture was missed. Keep the full count for diagnostics,
        // and separately flag ambiguous schedules that mention the selected day.
        const candidates=blue?schedule.flatMap(dates):ds;
        if(candidates.includes(targetDate))base.targetUndated++;
        continue;
      }
      base.rowDates.push(ds[0]);
      if(base.catalogRows)base.catalogRows.push({date:ds[0],replay:replayBadge});
      if(profile.blueCalendarScheduleOnly)continue;
      if(ds[0]!==targetDate)continue;
      if(replayBadge){base.excluded++;continue;}
      base.coverage=true;
      if(!time){if(delivery==='offline')base.excluded++;else base.untimed++;continue;}
      if(/(?:강의|방송|행사)\s*취소|취소된\s*(?:강의|행사)/.test(t)){base.excluded++;continue;}
      const labels=[...row.querySelectorAll('[alt],[title],[aria-label]')].filter(visible).map(e=>[e.getAttribute('alt'),e.getAttribute('title'),e.getAttribute('aria-label')].filter(Boolean).join(' ')).join(' ');
      const rewardText=t+' '+labels;
      const hasReward=profile.rewardSelector?select(profile.rewardSelector,row).length>0:profile.filter==='pm'?/(?:^|\s)[PM](?:\s|$)|포인트|미션|\bpoint\b|\bmission\b/i.test(rewardText):/\bBell\b|벨\s*지급/i.test(rewardText);
      if(profile.filter!=='all'&&!hasReward){base.excluded++;continue;}
      const semanticTitle=select('h5,h6,p,span,strong',row).filter(e=>e.children.length===0&&text(e).length>=12&&text(e).length<300&&!/\d{1,2}:\d{2}|20\d{2}[.\/-]|^(?:신청|예약|시청|참여)|교수|병원/.test(text(e))).map(text)[0]||'';
      let title=(chosen(profile.titleSelector,row)||text(row.querySelector('h1,h2,h3,h4,.tit,.title,.subject,[class*="title"],[class*="subject"]'))||semanticTitle||t.replace(/^.*?\d{1,2}:\d{2}\s*(?:[~–-]\s*\d{1,2}:\d{2})?\s*/,'')).slice(0,250);
      if(blueCalendarItem){
        // Calendar titles belong to this one bounded item. A schedule field,
        // presenter, action label or neighboring card never supplies a title.
        const contents=select('.sci_content',row),titles=select('.sci_content > a',row).filter(e=>!e.closest('.sci_detail'));
        title=contents.length===1&&titles.length===1?text(titles[0]).slice(0,250):'';
        if(!title||!/[가-힣A-Za-z]{2}/.test(title)||/^(?:일\s*시|연자|신청|참여|예약|설문|입장|시청|로그인|로그아웃|다시\s*보기|VOD)(?:\s|[:：]|하기|$)/i.test(title)||/^(?:20\d{2}[.\/-]|\d{1,2}\s*[.\/월])/u.test(title)){
          base.untitled++;continue;
        }
      }
      if(intermd){
        title=chosen('.webinarItem__topic,.webinar__topic,.mWebinar__topic',row).slice(0,250);
        if(!title){base.untitled++;continue;}
      }
      if(profile.id==='whodadoc'&&row.matches('a.anchor-view')){
        const heading=row.querySelector('h3')?.cloneNode(true);
        if(heading){heading.querySelectorAll('.tag-label').forEach(e=>e.remove());title=text(heading).slice(0,250)||title;}
      }
      if(base.delivery){
        base.delivery.push({key:[targetDate,time,title].join('|'),mode:delivery});
        if(delivery==='offline'){base.excluded++;continue;}
      }
      const advanced=profile.advancedSelector?select(profile.advancedSelector,row).length>0:/심화\s*(?:연계\s*)?설문/.test(t+' '+labels);
      const link=row.matches('a[href]')?row:row.querySelector('a[href]');const href=link?.getAttribute('href')||'';const safeHref=/^(https?:|\/)/i.test(href)?new URL(href,location.href).href:'';
      const presenter=chosen(intermd?'.webinarItem__lecturer,.webinar__lecturer':'.speaker,.lecturer,[class*="speaker"],[class*="lecturer"]',row)||(t.match(/([가-힣]{2,5})\s*(?:교수|원장|과장)/)||[])[0]||'';
      base.events.push({site:profile.id,date:targetDate,time,title,advanced,presenter,id:safeHref||title,url:safeHref});
    }
    if(base.delivery){
      const online=new Set(base.delivery.filter(x=>x.mode==='online').map(x=>x.key));
      const offline=new Set(base.delivery.filter(x=>x.mode==='offline'&&!online.has(x.key)).map(x=>x.key));
      base.events=base.events.filter(e=>!offline.has([e.date,e.time,e.title].join('|')));
    }
    const pager=select('.pagination,.paging,.paginate,nav[aria-label*="페이지"]');
    if(!profile.allowNoPagination&&pager.some(e=>select('a,button',e).filter(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true').length>1))base.warnings.push('페이지 나눔 감지: 해당 날짜의 다른 페이지가 있는지 확인 필요');
    if(base.undated)base.warnings.push(`날짜를 확정하지 못한 카드 ${base.undated}개`);
    if(base.untimed)base.warnings.push(`시작시각을 읽지 못한 카드 ${base.untimed}개`);
    if(base.untitled)base.warnings.push(`제목을 읽지 못한 카드 ${base.untitled}개`);
    const explicitEmpty=profile.emptySelector&&select(profile.emptySelector).length>0;
    if(!rows.length&&!explicitEmpty)base.warnings.push('강의 카드를 찾지 못함: 목록 주소·선택 확인 필요');
    if(!base.coverage)base.warnings.push('조회 날짜가 현재 화면에 표시됐는지 확인 필요');
    if(!profile.validated)base.warnings.push('최초 추출 결과 검증 필요');
    return {...base,status:base.warnings.length?'review':'ok',message:base.warnings.join(' / ')||'조회 완료'};
  }catch(error){return {...base,status:'error',message:'선택 설정을 확인해 주세요: '+String(error.message).slice(0,180)};}
});const inspectListControls=(function inspectListControls(rows){
 const visible=e=>{if(!e||!e.getClientRects().length)return false;for(let p=e;p&&p!==document;p=p.parentElement){const style=getComputedStyle(p);if(p.matches('script,style,template,noscript,[hidden]')||style.display==='none'||style.visibility==='hidden')return false;}return true;};
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const names=e=>[text(e),e.getAttribute('aria-label'),e.getAttribute('title'),...(e.matches('input[type="button"]')?[e.getAttribute('value')]:[]),...Array.from(e.querySelectorAll('img[alt]')).map(x=>x.getAttribute('alt'))].filter(Boolean);
 const forbidden=/신청|예약|참여|설문|재생|시청|입장|북마크|로그인|로그아웃|다운로드|다시\s*보기|녹화|VOD|replay/i;
 const replay=p=>p.matches('header,footer,aside,[role="dialog"],[class*="replay"],[id*="replay"]')||p.matches('section')&&/다시\s*보기|녹화|VOD|replay/i.test(text(p.querySelector('h1,h2,h3,h4')));
 const scope=(e,adjacent=false)=>{
  if(e.closest('header,footer,aside,[role="dialog"],.ui-datepicker,.ui-datepicker-inline,.calendar_grid,.day_box,.swiper-pagination')||rows.some(r=>r===e||r.contains(e)))return null;
  for(let p=e.parentElement;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){
   if(replay(p))return null;
   if(rows.some(r=>p.contains(r)))return p;
   if(!rows.length&&p.matches('main,section,[role="main"]')&&Array.from(p.querySelectorAll('h1,h2,h3')).some(h=>/^(?:(?:LIVE|라이브|온라인|예정|전체)\s*)?(?:웹\s*)?(?:심포지[엄움]|세미나|웨비나)(?:\s*(?:목록|일정))?$/i.test(text(h))))return p;
  }
  // Some older layouts put their pager immediately after the main list.
  const sibling=e.previousElementSibling;
  return adjacent&&sibling?.matches('main,[role="main"]')&&rows.length&&rows.every(r=>sibling.contains(r))?sibling:null;
 };
 const isMore=s=>{
  const clean=s.replace(/[+＋↓⌄∨▼▾]/g,' ').replace(/\b(?:expand_more|keyboard_arrow_down)\b/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:(?:(?:LIVE|라이브|온라인|예정|전체|지난|이전)\s*)?(?:웹\s*)?(?:강의|세미나|심포지[엄움]|웨비나|목록|일정)\s*)?더\s*보기(?:\s*\(?\d+\s*(?:\/\s*\d+)?\)?(?:\s*개)?)?$|^(?:load\s+more|show\s+more|more)(?:\s*\(\d+(?:\s*\/\s*\d+)?\))?$/i.test(clean);
 };
 const candidates=Array.from(document.querySelectorAll('button,a,[role="button"],input[type="button"],div[onclick],span[onclick],div[class*="more"],span[class*="more"],div[class*="More"],span[class*="More"]')).filter(visible).filter(e=>!forbidden.test(names(e).join(' '))&&names(e).some(isMore)).map(e=>({el:e,scope:scope(e)})).filter(x=>x.scope);
 // Nested interactive wrappers are one control. Two controls in the same region
 // remain ambiguous; independent known lecture lists can be expanded in sequence.
 const distinct=candidates.filter(x=>!candidates.some(y=>y!==x&&x.el.contains(y.el)));
 const ambiguous=distinct.some((a,i)=>distinct.slice(i+1).some(b=>a.scope===b.scope||a.scope.contains(b.scope)||b.scope.contains(a.scope)));
 const pagerSelector='.pagination,.paging,.paginate,[class*="pagination"],[class*="paging"],nav[aria-label*="페이지"]';
 const dateOrSlide=e=>!!e.closest('.ui-datepicker,.ui-datepicker-inline,.ui-datepicker-header,.ui-datepicker-calendar,[class*="swiper-pagination"]');
 const pagerDetails=[];
 const pagers=Array.from(document.querySelectorAll(pagerSelector)).filter(visible).filter(e=>scope(e,true)&&!dateOrSlide(e)).filter(e=>{
  const custom='a,button,[role="button"],[role="link"],input[type="button"],[onclick],[tabindex="0"]';
  const links=Array.from(e.querySelectorAll(custom)).filter(visible).filter(x=>!dateOrSlide(x));
  const blue=e.matches('.all_sem_pagination_wrap');
  const clone=e.cloneNode(true),originals=Array.from(e.querySelectorAll('*')),copies=Array.from(clone.querySelectorAll('*'));
  originals.forEach((node,i)=>{if(!visible(node)||dateOrSlide(node))copies[i].remove();});
  const label=text(clone).replace(/[\u200b-\u200d\ufeff]/g,'').trim();
  const mask=t=>t.replace(/[0-9]/g,'#').replace(/[^# .:/()~～∼–—+,：|\-]/g,'?').slice(0,160);
  const inactive=x=>{
   for(let n=x;n&&n!==e;n=n.parentElement){
    if(n.matches('[aria-current="page"],[aria-current="true"],.active,.current,.selected,.disabled')||blue&&n.matches('.hit,.on'))return true;
    if(n.getAttribute('aria-disabled')==='true'||n.disabled||getComputedStyle(n).pointerEvents==='none')return true;
   }return false;
  };
  const enabled=links.filter(x=>!inactive(x));
  const detail={classes:e.getAttribute('class')||'',count:links.length,enabled:enabled.length,shape:mask(label),parts:links.slice(0,6).map(x=>({tag:x.tagName,classes:x.getAttribute('class')||'',shape:mask(text(x)),disabled:inactive(x)}))};
  const decide=(more,reason)=>{detail.reason=reason;pagerDetails.push(detail);return more;};
  const loading=Array.from(e.querySelectorAll('[aria-busy="true"],.loading,.is-loading,.spinner')).some(visible)||e.getAttribute('aria-busy')==='true';
  if(loading)return decide(true,'pager_loading');
  if(!links.length){
   if(/^(?:1)?$/.test(label))return decide(false,'empty_or_first_page');
   if(/^1\s*(?:\/|of)\s*1$/i.test(label))return decide(false,'single_page_counter');
   if(blue&&/^(?:(?:전체|총)\s*)?(?:세미나|강의)?\s*\d+\s*(?:개|건)(?:의)?\s*(?:세미나|강의)?$/.test(label))return decide(false,'seminar_total');
   // Bluepharm's wrapper can include a seminar total or decorative arrow text.
   // Its name and non-empty text alone do not establish an unvisited page.
   // Keep explicit page counts, numeric page labels and uncertain loading labels.
   const pageText=/페이지|pages?|불러|로딩|loading|준비|잠시|확인\s*중|[0-9]\s*(?:\/|of)\s*[0-9]|^[0-9]+$|(?:^|\s)\d+(?:\s+\d+)+/i.test(label);
   const numbers=Array.from(clone.querySelectorAll('*')).filter(x=>!x.children.length&&/^\d+$/.test(text(x))).map(x=>+text(x));
   if(blue&&!pageText&&!numbers.some(n=>n>1))return decide(false,'non_navigation_wrapper');
   return decide(true,'page_text_unconfirmed');
  }
  if(!enabled.length)return decide(false,'inactive_controls');
  // A solitary first-page control on the entry page cannot lead to another page.
  // Do not apply this on an explicitly later-page URL or alongside any other control.
  let firstPage=false;try{const u=new URL(location.href);firstPage=[...u.searchParams].filter(([k])=>/^(?:page|page_no|pageno|pageindex)$/i.test(k)).every(([,v])=>v==='1');}catch{}
  if(blue&&firstPage&&links.every(x=>text(x)==='1')&&/^(?:1\s*)+$/.test(label))return decide(false,'first_page_control');
  return decide(true,'enabled_page_control');
 });
 return {more:distinct.map(x=>x.el),pagers:pagers.filter(p=>!pagers.some(q=>q!==p&&p.contains(q))),ambiguous,pagerDetails};
});const additionalCatalogStep=(function additionalCatalogStep(profile,targetDate,previous,readPage,findControls=inspectListControls,readCalendar=inspectBluepharmCalendar,readWhodadoc=inspectWhodadocPages){
 const patience=ms=>Math.max(ms,Math.min(45000,Number(profile.networkPatienceMs)||0));
 const now=Date.now(), host=profile.host;
 const state=previous?.version===5&&previous.site===profile.id&&previous.date===targetDate?previous:
  {version:5,site:profile.id,date:targetDate,started:now,events:[],seen:[],pages:0,steps:0,signature:'',quietSince:now,pending:null,visited:[],scrolled:false,monthMoves:0,expansions:0};
 const bounded=profile.id==='whodadoc';
 state.steps++;
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
 const all=(s,root=document)=>Array.from(root.querySelectorAll(s)).filter(visible);
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const label=e=>[text(e),e.getAttribute('aria-label'),e.getAttribute('title'),...(e.matches('input[type="button"]')?[e.getAttribute('value')]:[]),...Array.from(e.querySelectorAll('img[alt]')).map(x=>x.getAttribute('alt'))].filter(Boolean).join(' ').trim();
 const validUrl=raw=>{try{const u=new URL(raw,location.href);return u.protocol==='https:'&&(u.hostname===host||u.hostname.endsWith('.'+host))&&!u.username&&!u.password?u:null;}catch{return null;}};
 const publicUrl=raw=>{const u=validUrl(raw);if(!u)return '';for(const k of [...u.searchParams.keys()])if(/token|auth|session|password|email|code|ticket/i.test(k))u.searchParams.delete(k);u.hash='';return u.href;};
 const cssPath=e=>{const parts=[];while(e&&e!==document.documentElement){const p=e.parentElement;if(!p)break;const n=Array.from(p.children).filter(x=>x.tagName===e.tagName).indexOf(e)+1;parts.unshift(e.tagName.toLowerCase()+':nth-of-type('+n+')');e=p;}return 'html > '+parts.join(' > ');};
 const result=(status,message,done=false,extra={})=>({site:profile.id,crawler:profile.crawler,status,message,done,events:state.events,matchedRows:state.seen.length,coverage:false,checkedAt:now,pages:state.pages,diagnostics:state.diagnostics||null,state,...extra});
 const finish=message=>result('review',message,true);
 const fail=message=>finish(message+' · 전체 수집 미확인');
 const expanding=()=>state.events.length?'당일 강의가 더 있는지 조회':'선택일 미발견 · 조회 범위 확대';
 const action=(el,kind,signature,value)=>({kind,selector:cssPath(el),signature,value});
 const clickAction=(el,reason,expect={})=>{
  if(!el)return fail(reason+' 버튼을 찾지 못했어요');
  if(el.disabled||el.getAttribute('aria-disabled')==='true'){
   state.disabledSince=state.disabledSince||now;
   if(now-state.disabledSince>=patience(18000))return fail(reason+' 버튼이 계속 비활성 상태예요');
   return result('loading',reason+' 버튼이 준비되기를 기다리는 중');
  }
  state.disabledSince=0;
  if(/더보기|목록 페이지/.test(reason)){if(state.expansions>=20)return fail('추가 조회 20회에 도달했어요: 읽은 강의만 표시해요');state.expansions++;}
  const a=action(el,'click',label(el));const href=el.getAttribute('href');
  if(href&&!/^(#|javascript:)/i.test(href)){
   const u=validUrl(href),base=new URL(profile.url);
   if(!u||u.pathname!==base.pathname||u.searchParams.get('pn')!==base.searchParams.get('pn')||/token|auth|session|password|email|ticket/i.test(u.search))return fail('목록 밖으로 이동하는 버튼을 제외했어요');
   a.kind='navigate';a.url=u.href;a.catalog=true;
  }
  state.pending={at:now,before:state.signature,url:publicUrl(location.href),reason,...expect};state.scrolled=false;
  return result('loading',/더보기|목록 페이지/.test(reason)?expanding()+' · '+reason:reason+' 중',false,{action:a});
 };
 const unique=arr=>[...new Set(arr)];
 try{
  if(state.alternateRequested)state.diagnostics={site:profile.id,targetDate,stage:'mobile_catalog',alternateCatalog:true,primaryResult:state.primaryRead||null,elapsedMs:now-state.started};
  if(!validUrl(location.href))return result('login','원래 사이트에서 로그인을 완료해 주세요.',true);
  const bodyText=text(document.body);
  if(all('input[type="password"]').length){
   if(state.alternateRequested)state.diagnostics={site:profile.id,stage:'mobile_catalog_login',targetDate,alternateCatalog:true,stopReason:'login_required'};
   return result('login',state.alternateRequested?'인터엠디 모바일 목록 확인에 로그인이 필요해요.':'로그인이 필요해요. 로그인 후 다시 조회해 주세요.',true);
  }
  if(/Verify you are human|Checking your browser|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(bodyText))return result('blocked','사이트의 접근 확인 화면을 직접 확인해 주세요.',true);
  if(state.steps>80||now-state.started>Math.max(35000,patience(0)*2))return fail('조회 시간 초과: 읽은 강의만 표시해요');
  if(bounded&&(state.steps>60||now-state.started>patience(25000)))return fail('선택일 조회 시간에 도달했어요: 읽은 강의만 표시해요');
  const here=new URL(location.href),entry=new URL(profile.url);
  const menuKey=s=>s.replace(/\s+/g,'').toLowerCase();
  if(profile.discoverMenu&&!state.catalogUrl){
   if(/login|sign.?in|\/intro/i.test(here.pathname+here.search))return result('login','로그인 후 자동 조회를 다시 눌러 주세요.',true);
   const labels=(profile.menuLabels||[]).map(menuKey);
   // Resolve actual site-rendered menu links. No guessed endpoint, enrollment or login click.
   const candidates=Array.from(document.querySelectorAll('a[href],button,[role="link"]')).filter(e=>
    labels.includes(menuKey(text(e)))&&!e.closest('[class*="login"],[class*="Login"],form')&&
    (visible(e)||e.closest('nav,header,[class*="gnb"],[class*="menu"],[class*="Menu"]')));
   const usable=candidates.map(e=>({el:e,u:validUrl(e.getAttribute('href')||'')})).filter(x=>x.u&&!/^(#|javascript:)/i.test(x.el.getAttribute('href')||'')&&!/login|logout|regist|apply|detail|view\.do/i.test(x.u.pathname)&&!/token|auth|session|password|email|ticket/i.test(x.u.search));
   const urls=unique(usable.map(x=>x.u.href));
   if(urls.length===1){
    state.catalogUrl=publicUrl(urls[0]);state.catalogEntryFrom=publicUrl(location.href);
    if(state.catalogUrl!==publicUrl(location.href))return result('loading','강의 목록 메뉴로 이동 중',false,{action:{kind:'navigate',url:urls[0],catalog:true}});
   }else if(urls.length>1){
    // Prefer an exact leaf menu over a combined webinar/conference menu.
    const leaf=usable.filter(x=>menuKey(text(x.el))===labels[0]);const exact=unique(leaf.map(x=>x.u.href));
    if(exact.length===1){state.catalogUrl=publicUrl(exact[0]);return result('loading','강의 목록 메뉴로 이동 중',false,{action:{kind:'navigate',url:exact[0],catalog:true}});}
    return fail('웨비나 목록 메뉴가 여러 개여서 구분하지 못했어요');
   }else {
    const clickable=[...new Map(candidates.filter(visible).filter(e=>e.getAttribute('onclick')||/^javascript:/i.test(e.getAttribute('href')||'')).map(e=>[text(e)+'|'+(e.getAttribute('onclick')||e.getAttribute('href')),e])).values()];
    if(clickable.length===1&&!state.menuClicked){state.menuClicked=true;state.menuAt=now;state.menuFrom=publicUrl(location.href);return result('loading','강의 목록 메뉴를 여는 중',false,{action:action(clickable[0],'click',label(clickable[0]))});}
    if(state.menuClicked&&(publicUrl(location.href)!==state.menuFrom||all('main h1,main h2,h1').some(e=>labels.includes(menuKey(text(e)))&&/\d{1,2}\s*(?::|시)\s*\d{2}/.test(bodyText)))){state.catalogUrl=publicUrl(location.href);}
    else {
     state.diagnostics={site:profile.id,path:here.pathname,rows:0,events:0,menuCandidates:candidates.slice(0,8).map(e=>({text:text(e),path:validUrl(e.getAttribute('href')||'')?.pathname||''}))};
     if(now-state.started>patience(18000))return fail('로그인 뒤의 웨비나 목록 메뉴를 찾지 못했어요');
     return result('loading','웨비나 메뉴를 찾는 중');
    }
   }
  }
  if(state.catalogUrl)profile={...profile,url:state.catalogUrl};
  const actualEntry=new URL(profile.url);
  if(here.pathname!==actualEntry.pathname){
   if(/login|sign.?in|\/intro/i.test(here.pathname))return result('login','로그인 후 자동 조회를 다시 눌러 주세요.',true);
   // The optional mobile catalog can redirect to the ordinary homepage on an
   // empty day. Retain only this scan's fully dated, settled PRIMARY list;
   // the homepage itself is never evidence of an empty catalog. Login, blocked,
   // timeout and unread/ambiguous primary lists still take the failure path.
   if(profile.id==='intermd'&&state.alternateRequested&&state.primaryEmpty&&here.origin==='https://www.intermd.co.kr'&&here.pathname==='/home.do'){
    state.diagnostics={...state.primaryEmpty,primaryListRetained:true,alternateCatalog:true,
     alternateResult:{path:here.pathname,reason:'catalog_route_mismatch'},elapsedMs:now-state.started};
    delete state.primaryEmpty;
    return result('review','기본 웨비나 목록에서 선택일 강의 0개 조회 · 모바일 목록은 홈으로 연결됨',true);
   }
   state.diagnostics={...(state.diagnostics||{}),site:profile.id,targetDate,path:here.pathname,reason:'catalog_route_mismatch'};
   return fail('예상한 강의 목록에 도착하지 못했어요');
  }
  // These new authenticated layouts remain provisional until device verification.
  let selectors=profile.rowSelector||'';
  if(!selectors&&profile.id==='whodadoc'&&all('a.anchor-view').length)selectors='a.anchor-view';
  // InterMD has LIVE, upcoming and compact cards in separate list regions.
  // Their explicit boundaries survive nested video clocks, short topics and
  // long multi-session titles that the generic leaf/length heuristic discards.
  // Classes are corroborated by the site's public style_pc.css.
  const intermdCards=profile.id==='intermd'?all('.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item').filter(e=>
   !e.closest('header,footer,nav,[class*="replay"],[id*="replay"]')&&
   !/^(?:웨비나\s*)?(?:다시\s*보기|VOD|녹화\s*강의)/i.test(text(e.closest('section')?.querySelector('h1,h2,h3,h4')))):[];
  const intermd=intermdCards.length>0;
  if(intermd)selectors=intermdCards.filter(e=>!intermdCards.some(o=>o!==e&&e.contains(o))).map(cssPath).join(',');
  const blue=profile.id==='bluepharm'&&all('.sem_tit').length>0;
  if(blue){
   // Both hero and list cards have sem_tit. A sem_detail without that title is
   // only a fragment. Climb from the title so one sibling cannot borrow another.
   const cards=unique(all('.sem_tit').map(title=>{
    let fallback=null;
    for(let e=title.parentElement,n=0;e&&e!==document.body&&n<5;e=e.parentElement,n++){
     if(e.querySelectorAll('.sem_tit').length!==1)break;
     if(e.matches('.sem_info'))fallback=e;
     // Some list cards put the schedule beside sem_info, not inside it.
     // Keep climbing within a single title's boundary before using the fallback.
     if(e.querySelector('.sem_detail,.sem_detail_action,.ico_date'))return e;
    }return fallback;
   }).filter(Boolean));
   selectors=cards.map(cssPath).join(',');
   profile={...profile,titleSelector:'.sem_tit'};
  }
  if(!selectors&&!blue&&!intermd){
   const replay=e=>{const s=e.closest('section');return !!s&&/^(?:웨비나\s*)?(?:다시\s*보기|VOD|녹화\s*강의)/i.test(text(s.querySelector('h1,h2,h3,h4')));};
   const timed=all('a,article,figure,li,tr,div').filter(e=>{
    // Compact calendar rows use the separately validated day/count reader.
    // With no main sem_tit cards, a generic date/action fragment must not
    // produce a second lecture whose supposed title is the end time.
    if(profile.id==='bluepharm'&&(e.closest('.sem_cal_item,.sem_cal_list_wrap,.seminar_calendar_wrap,.wc_calendar,.ui-datepicker')||e.querySelector('.sem_cal_item,.ui-datepicker,.wc_calendar')))return false;
    const t=text(e);return (!profile.scopeSelector||document.querySelector(profile.scopeSelector)?.contains(e))&&t.length>=15&&t.length<=1400&&/(?:^|\D)(?:[01]?\d|2[0-3])\s*(?::|시\s*)[0-5]\d(?:분)?/.test(t)&&
     !e.closest('header,footer,nav,[class*="replay"],[id*="replay"]')&&(!e.closest('[role="dialog"]')||profile.calendarOnly&&profile.scopeSelector)&&!replay(e)&&!e.querySelector('input[type="password"]');
   });
   let cards=timed.filter(e=>!timed.some(o=>o!==e&&e.contains(o)&&text(o).length>=15));
   // A date/time-only element is not a lecture: climb to a bounded container with title/link.
   cards=unique(cards.map(e=>{
    for(let n=0;n<4&&e&&e!==document.body;n++,e=e.parentElement){
     const t=text(e);if(t.length>1500)return null;
     const link=e.matches('a')?e:e.querySelector('a');
     const title=e.querySelector('h2,h3,h4,.tit,.title,[class*="subject"],[class*="title"]') || (Array.from(e.querySelectorAll('h5,h6,p,span,strong')).find(x=>x.children.length===0&&text(x).length>=12&&text(x).length<300&&!/\d{1,2}:\d{2}|20\d{2}[.\/-]|^(?:신청|예약|시청|참여)|교수|병원/.test(text(x))));
     if(title&&text(title).length>3||link&&text(link).length>5&&/[가-힣A-Za-z]{2}/.test(text(link)))return e;
    }return null;
   }).filter(Boolean));
   cards=cards.filter(e=>!cards.some(o=>o!==e&&e.contains(o)));
   if(cards.length>400)return fail('강의 영역이 너무 많아 구분하지 못했어요');
   selectors=cards.map(cssPath).join(',');
  }
  const rows=selectors?all(selectors):[];
  const extracted=rows.length?readPage({...profile,rowSelector:selectors,validated:true,allowNoPagination:true},targetDate):{events:[],undated:0,untimed:0,matchedRows:0,coverage:false};
  if(['login','blocked','error'].includes(extracted.status))return result(extracted.status,extracted.message,true);
  const rowIds=rows.map(e=>{
   const stable=e.cloneNode(true);
   if(blue)stable.querySelectorAll('.sem_action,.sem_dday,.js_sem_countdown,.sem_badges').forEach(x=>x.remove());
   if(intermd)stable.querySelectorAll('.webinarItem__videoWrap,.webinarItem__video,.webinarItem__btngroup,.webinarItem__topRt').forEach(x=>x.remove());
   return (text(stable)+'|'+publicUrl(e.getAttribute('href')||'')).slice(0,1600);
  });
  // Countdown/reward badges can tick freely; delivery changes must restart settling.
  const signature=rowIds.join('\n')+(blue?'\n'+(extracted.deliverySignature||[]).join('|'):'');
  if(signature!==state.signature){state.signature=signature;state.quietSince=now;state.scrolled=false;}
  for(const id of rowIds)if(!state.seen.includes(id))state.seen.push(id);
  if(profile.id==='bluepharm'){
   state.blueDelivery=state.blueDelivery||{};
   const modes=new Map();
   for(const d of extracted.delivery||[]){
    if(d.mode==='online'||d.mode==='offline'&&modes.get(d.key)!=='online')modes.set(d.key,d.mode);
   }
   // Retain a known offline classification if a duplicate loses its badge on rerender.
   // A later explicit online badge can restore a lecture whose delivery has changed.
   for(const [key,mode] of modes)state.blueDelivery[key]=mode;
   // Bluepharm reads one current list, not successive archive pages. Rebuild it
   // so a delayed start-date correction cannot retain yesterday's event.
   state.events=[];
  }
  for(const e of extracted.events||[]){
   e.url=e.url?publicUrl(e.url):'';
   // Repeated hero/list cards share a title/date/time identity.
   e.title=String(e.title||'').replace(/\s+/g,' ').trim();
   if(profile.id==='bluepharm'&&state.blueDelivery[[e.date,e.time,e.title].join('|')]==='offline')continue;
   e.id=[e.date,e.time,e.title,blue?'':e.presenter||''].join('|');
   const key=[e.date,e.time,e.id,e.title].join('|');
   state.events=state.events.filter(x=>[x.date,x.time,x.id,x.title].join('|')!==key);state.events.push(e);
  }
  state.coverage=state.coverage||extracted.coverage;
  // Short, visible year/month headings with a nearby pair of navigation controls.
  const months=all('h1,h2,h3,h4,strong,span,em,p,div').map(e=>{
   const t=text(e);const m=t.length<=28&&t.match(/^(20\d{2})\s*(?:[.\/-]|년)\s*(0?[1-9]|1[0-2])\s*월?\s*\.?$/);
   return m?{el:e,value:m[1]+'-'+m[2].padStart(2,'0')}:null;
  }).filter(Boolean).filter(x=>!rows.some(r=>r.contains(x.el)));
  let calendar=null;
  for(const m of months){
   let container=m.el.parentElement;
   for(let n=0;n<4&&container&&container!==document.body;n++,container=container.parentElement){
    if(text(container).length>2500||rows.some(r=>container.contains(r)))break;
    const controls=all('a,button,[role="button"]',container).filter(e=>label(e).length<70);
    const isNext=e=>/다음\s*(?:달|월)|다음달|next\s*month|^다음$|^next$|^[›»>]$/i.test(label(e))||/(?:^|[_\s-])next(?:$|[_\s-])/.test(e.className||'');
    const isPrev=e=>/이전\s*(?:달|월)|이전달|prev(?:ious)?\s*month|^이전$|^prev$|^[‹«<]$/i.test(label(e))||/(?:^|[_\s-])prev(?:$|[_\s-])/.test(e.className||'');
    const next=controls.filter(isNext),prev=controls.filter(isPrev);
    if(next.length===1&&prev.length===1){calendar={...m,container,next:next[0],prev:prev[0]};break;}
   }
   if(calendar)break;
  }
  const targetMonth=targetDate.slice(0,7);
  const rowDates=extracted.rowDates||[];
  const controls=findControls(rows);
  // Period seminars can remain identical across a month boundary. A changed
  // month heading confirms navigation, not empty coverage. Give the dedicated
  // calendar reader a fresh, bounded scan of the newly rendered month.
  if(blue&&state.pending?.month&&calendar&&calendar.value!==state.pending.month){
   state.pending=null;state.pages++;state.quietSince=now;state.scrolled=false;
   delete state.blueCalendar;
  }
  const blueCalendar=profile.id==='bluepharm'?readCalendar(targetDate,state.blueCalendar,(selector,scheduleOnly=false,calendarItems=false)=>readPage({...profile,rowSelector:selector,titleSelector:calendarItems?'.sci_content > a':'.sem_tit',blueCalendarScheduleOnly:scheduleOnly,blueCalendarItemOnly:calendarItems,validated:true,allowNoPagination:true},targetDate)):null;
  if(blueCalendar)state.blueCalendar=blueCalendar.state;
  if(blueCalendar?.status==='checked'){
   const online=new Set([...(extracted.delivery||[]),...(blueCalendar.delivery||[])].filter(d=>d.mode==='online').map(d=>d.key));
   state.blueDelivery=state.blueDelivery||{};
   for(const d of blueCalendar.delivery||[])if(d.mode==='online'||d.mode==='offline')state.blueDelivery[d.key]=online.has(d.key)?'online':d.mode;
   state.events=state.events.filter(e=>state.blueDelivery[[e.date,e.time,e.title].join('|')]!=='offline');
  }
  if(blueCalendar?.status==='checked')for(const event of blueCalendar.events||[]){
   // The calendar is a second current source. Dedupe its real item by the same
   // title/start/date identity as hero/list cards, never by a date alone.
   const title=String(event.title||'').replace(/\s+/g,' ').trim(),key=[event.date,event.time,title].join('|');
   if(event.date!==targetDate||!title||state.blueDelivery[key]==='offline'||state.events.some(e=>[e.date,e.time,e.title].join('|')===key))continue;
   state.events.push({...event,title,url:event.url?publicUrl(event.url):'',id:key});
  }
  const diagnostics={site:profile.id,path:here.pathname,rows:rows.length,totalRows:state.seen.length,events:state.events.length,undated:extracted.undated||0,untimed:extracted.untimed||0,month:calendar?.value||'',pages:state.pages,targetDate,elapsedMs:now-state.started,expansions:state.expansions||0,searchPhase:state.events.length?'collecting_target':'seeking_target',continuation:{more:controls.more.length,pagers:controls.pagers.length,ambiguous:controls.ambiguous}};
  if(blueCalendar){
   diagnostics.calendarStatus=blueCalendar.status;diagnostics.calendarReason=blueCalendar.reason;
   diagnostics.calendarLayout=blueCalendar.layout||'';diagnostics.calendarMonth=blueCalendar.month||'';diagnostics.calendarDate=blueCalendar.date||'';
   diagnostics.calendarChecked=blueCalendar.status==='checked';diagnostics.calendarEmpty=blueCalendar.empty===true;
   if(blueCalendar.details)diagnostics.calendarDetails=blueCalendar.details;
  }
  if(blue||blueCalendar?.eventsRead&&blueCalendar.events?.length){
   const route=here.searchParams.get('pn')||'';
   diagnostics.route=/^[a-zA-Z0-9_.-]{1,80}$/.test(route)?route:'';
   diagnostics.selectedEvents=state.events.map(e=>({date:e.date,time:e.time,title:e.title}));
   diagnostics.cardLayout=blue?'sem_tit':'calendar_items';
   diagnostics.targetUndated=extracted.targetUndated||0;
   diagnostics.excluded=extracted.excluded||0;
   diagnostics.startDateRows=extracted.startDateRows||0;
   diagnostics.dateRangeRows=extracted.dateRangeRows||0;
   diagnostics.scheduleRows=extracted.scheduleRows||[];
  }
  diagnostics.pagerDetails=controls.pagerDetails?.slice(0,4)||controls.pagers.slice(0,4).map(e=>({classes:e.getAttribute('class')||'',count:all('a,button,[role="button"]',e).length}));
  if(profile.id==='intermd'){
   diagnostics.alternateCatalog=!!state.alternateRequested;
   diagnostics.cardLayout=intermd?'intermd_cards':'generic';
   diagnostics.selectedEvents=state.events.map(e=>({date:e.date,time:e.time,title:e.title}));
   diagnostics.excluded=extracted.excluded||0;
   diagnostics.untitled=extracted.untitled||0;
   diagnostics.cardCounts=Object.fromEntries(['webinarItem--live','webinarItem--main','webinarItem--brand','webinarItem--home','webinar__boxLink','mWebinar__item'].map(c=>[c,all('.'+c).length]));
   diagnostics.dateSamples=rows.slice(0,12).map(e=>({classes:e.className,date:text(e.querySelector('.webinarItem__date,.webinar__info .date,.mWebinar__date')).slice(0,90)}));
  }
  if(bounded){diagnostics.dateRange={first:rowDates[0]||'',last:rowDates.at(-1)||'',dated:rowDates.length,expansions:state.expansions,order:rowDates.every((d,i)=>!i||rowDates[i-1]>=d)?'descending':'mixed'};diagnostics.scheduleRows=(extracted.catalogRows||[]).slice(0,24).map(x=>({date:x.date,type:x.replay?'replay':'lecture'}));}
  // A small opt-in troubleshooting report: rendered lecture fragments and list controls only.
  // No whole-page HTML, credentials, cookies, storage or arbitrary input values are captured.
  // Put unparsed Bluepharm cards first: earlier reports repeatedly contained
  // only four valid hero cards, hiding the structure of the five failures.
  const sampleRows=blue?unique([...(extracted.scheduleRows||[]).filter(x=>x.reason!=='parsed_start').map(x=>rows[x.count-1]).filter(Boolean),...rows]):rows;
  diagnostics.samples=sampleRows.slice(0,4).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',text:text(e).slice(0,1200),parts:Array.from(e.querySelectorAll('h2,h3,h4,strong,span,p,div,time,ul,li,dl,dt,dd,i')).slice(0,18).map(x=>({tag:x.tagName,classes:x.getAttribute('class')||'',text:text(x).slice(0,220)}))}));
  diagnostics.controls=unique(blue?[...controls.more,...controls.pagers.flatMap(e=>all('a,button,[role="button"]',e))]:[...all('a,button,[role="button"],input[type="button"]'),...controls.more]).filter(e=>label(e).length<60&&/더\s*보기|이전|다음|next|prev|more|^\d{1,2}$/i.test(label(e))).slice(0,30).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',label:label(e),path:cssPath(e)}));
  diagnostics.monthHeadings=months.slice(0,4).map(m=>({value:m.value,classes:m.el.getAttribute('class')||''}));
  {
   diagnostics.frames=Array.from(document.querySelectorAll('iframe[src]')).slice(0,5).map(e=>{try{const u=new URL(e.getAttribute('src'),location.href);return {origin:u.origin,path:u.pathname};}catch{return {path:''};}});
   diagnostics.candidateCounts={timed:all('p,span,time,div').filter(e=>text(e).length<100&&/\d{1,2}:\d{2}/.test(text(e))).length,images:all('main img,article img').length};
  }

  state.diagnostics=diagnostics;
  if(blueCalendar?.status==='loading')return result('loading','세미나 캘린더에서 선택일을 확인하는 중',false,{diagnostics,...(blueCalendar.action?{action:blueCalendar.action}:{})});
  if(!rows.length&&blueCalendar?.status==='unconfirmed'&&['calendar_count_mismatch','calendar_schedule_unconfirmed','calendar_schedule_outside_date','calendar_result_date_mismatch'].includes(blueCalendar.reason)){
   // A settled calendar contradiction cannot be resolved by guessing a main
   // card. Preserve its specific failure instead of waiting for a timeout.
   diagnostics.stopReason='seminar_calendar_unconfirmed';
   return result('review','캘린더의 날짜·건수·강의 내용이 일치하는지 확인하지 못했어요',true,{diagnostics});
  }
  if(blueCalendar?.status==='checked'&&blueCalendar.empty&&state.events.length===0){
   diagnostics.stopReason='seminar_calendar_empty';
   return result('review','세미나 캘린더에서 선택일에 시작하는 강의 없음 확인',true,{coverage:true,diagnostics});
  }
  if(blueCalendar?.status==='checked'&&!blueCalendar.empty&&state.events.length===0&&!blueCalendar.eventsRead){
   diagnostics.stopReason='seminar_calendar_conflict';
   return result('review','캘린더의 일정 표시는 있지만 강의 내용을 확인하지 못했어요',true,{diagnostics});
  }
  if(blueCalendar?.status==='checked'&&blueCalendar.eventsRead&&blueCalendar.events?.length){
   const calendarKeys=new Set(blueCalendar.events.map(e=>[e.date,e.time,String(e.title||'').replace(/\s+/g,' ').trim()].join('|')));
   if(state.events.some(e=>!calendarKeys.has([e.date,e.time,e.title].join('|')))){
    diagnostics.stopReason='seminar_calendar_conflict';
    return result('review','목록과 캘린더의 강의 내용이 달라 전체 조회를 확인하지 못했어요',true,{diagnostics});
   }
   diagnostics.stopReason='seminar_calendar_read';diagnostics.currentListRead=true;
   state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
   return result('review',`세미나 캘린더에서 선택일 강의 ${state.events.length}개 조회 · 날짜·제목·시각 확인`,true,{coverage:true,diagnostics});
  }
  if(state.pending){
   const p=state.pending;
   const changed=p.month?calendar?.value!==p.month&&!!calendar&&(blue||signature!==p.before||!rows.length):p.date?extracted.coverage&&signature!==p.before:signature!==p.before;
   if(changed){state.pending=null;state.pages++;state.quietSince=now;state.scrolled=false;if(bounded)state.scrolls=0;}
   else if(now-p.at>patience(18000))return fail(p.reason+' 이후 목록 변화가 확인되지 않아요');
   else return result('loading',p.reason+' 응답을 기다리는 중',false,{diagnostics});
  }
  const monthSelects=all('select').filter(e=>Array.from(e.options||[]).some(o=>/^20\d{2}[.\/-]\d{1,2}$/.test(o.value))&&!e.closest('form[action*="login"]'));
  if(monthSelects.length===1&&!state.monthSelectSet){
   const el=monthSelects[0],option=Array.from(el.options).find(o=>o.value.replace(/[.\/]/g,'-')===targetMonth);
   if(option&&el.value!==option.value){state.monthSelectSet=true;state.events=[];state.pending={at:now,before:signature,reason:'선택한 달 조회'};return result('loading','선택한 달 조회 중',false,{action:action(el,'month','',option.value),diagnostics});}
  }
  if(calendar&&calendar.value!==targetMonth){
   if(state.monthMoves>=18)return fail('월 이동 범위를 초과했어요');
   state.monthMoves++;state.events=[];state.coverage=false;
   return clickAction(calendar.value<targetMonth?calendar.next:calendar.prev,'선택한 달로 이동',{month:calendar.value});
  }
  // A native date filter is the only form value this crawler changes. No arbitrary text fields.
  const dates=all('input[type="date"]').filter(e=>!e.closest('[role="dialog"]'));
  if(dates.length===1&&!state.dateSet){
   state.dateSet=true;
   if(dates[0].value!==targetDate){state.pending={at:now,before:signature,reason:'선택한 날짜 조회',date:targetDate};state.events=[];
    return result('loading','선택한 날짜 조회 중',false,{action:action(dates[0],'date','',targetDate),diagnostics});}
  }
  // For a calendar/list split, select the target day only inside an unambiguous date grid.
  if(calendar&&calendar.value===targetMonth&&!state.coverage&&!state.daySelected&&!(blue&&rows.length&&!extracted.undated)){
   const grids=all('table').filter(t=>{const s=text(t);return /일.*월.*화.*수.*목.*금.*토/.test(s)&&s.length<4000;});
   const days=grids.flatMap(g=>all('td a,td button',g)).filter(e=>text(e)===String(+targetDate.slice(8))&&!/detail|view|apply|request|regist|join/i.test(e.getAttribute('href')||''));
   if(days.length===1){state.daySelected=true;return clickAction(days[0],'선택한 날짜 조회',{date:targetDate});}
  }
  if(!rows.length&&profile.calendarOnly&&profile.calendarMonth===targetMonth&&all('[data-date]').some(e=>e.getAttribute('data-date')===targetDate)&&now-state.quietSince>=3000){
   diagnostics.stopReason='target_calendar_cell';
   return result('review','선택일 편성표에서 읽힌 강의가 없어요 · 전체 수집 미확인',true,{diagnostics});
  }
  if(!rows.length&&!controls.more.length&&!controls.pagers.length){
   if(!state.wakeScrolled&&now-state.started>3500){state.wakeScrolled=true;return result('loading','아래 강의 목록을 불러오는 중',false,{action:{kind:'scroll'},diagnostics});}
   if(now-state.started>patience(12000))return fail('강의 카드를 찾지 못했어요');
   return result('loading','강의 목록을 불러오는 중',false,{diagnostics});
  }
  // A descending list that has passed the selected day need not walk the archive.
  // This is observed ordering, not a claim that an unverified site is complete.
  if(bounded&&!extracted.undated&&rowDates.length>=2&&rowDates.every((d,i)=>i===0||rowDates[i-1]>=d)&&rowDates.at(-1)<targetDate){
   if(now-state.quietSince<2500)return result('loading','선택일의 날짜 범위를 확인하는 중',false,{diagnostics});
   diagnostics.stopReason='past_target_date';
   state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
   return result('review',`선택일 강의 ${state.events.length}개 수집 · 과거 날짜 구간에서 조회 종료 · 전체 수집 검증 대기`,true,{coverage:!!state.coverage,diagnostics});
  }
  if(!state.scrolled){
   state.scrolls=state.scrolls||0;if(state.scrolls>=2)return fail('추가 조회 범위에 도달했어요: 선택일의 읽은 강의만 표시해요');state.scrolls++;
   state.scrolled=true;state.quietSince=now;return result('loading',expanding()+' · 아래 목록 확인',false,{action:{kind:'scroll'},diagnostics});
  }
  if(now-state.quietSince<2500)return result('loading','추가 목록을 기다리는 중',false,{diagnostics});
  if(now-state.quietSince<3000)return result('loading','현재 목록을 확인하는 중',false,{diagnostics});
  if(bounded){
   const listing=readWhodadoc(profile,targetDate,state,rows,controls,readPage);
   diagnostics.listDetails={...listing.evidence,status:listing.status,reason:listing.reason};
   if(listing.status==='next')return clickAction(listing.element,'다음 목록 페이지');
   if(listing.status==='checked'){
    diagnostics.stopReason='whodadoc_date_checked';diagnostics.currentListRead=true;
    state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
    return result('review',`후다닥 목록에서 선택일 강의 ${state.events.length}개 조회 · 날짜 범위 확인`,true,{coverage:true,diagnostics});
   }
  }
  diagnostics.stopReason='current_list_only';
  if(profile.id==='intermd'&&!state.events.length&&!state.alternateRequested&&profile.alternateCatalogUrl==='https://moa.intermd.co.kr/mobile/webinar/list.do'){
   // Official mobile destination observed in /login/bridge.do. This is one
   // alternate current list, never an archive/pagination or authentication API.
   // Retain the reason an unread primary list was rejected as well, so a
   // redirect report is sufficient to distinguish missing cards from dates.
   state.primaryRead={site:profile.id,targetDate,path:here.pathname,rows:rows.length,
    cardLayout:diagnostics.cardLayout,undated:extracted.undated||0,untimed:extracted.untimed||0,
    untitled:extracted.untitled||0,continuation:diagnostics.continuation,currentListRead:rows.length>0};
   if(intermd&&rows.length&&!extracted.undated&&!extracted.untimed&&!extracted.untitled&&!controls.more.length&&!controls.pagers.length&&!controls.ambiguous)
    state.primaryEmpty={...diagnostics,currentListRead:true};
   // The user's weekend/holiday pattern only avoids the optional mobile visit
   // after a settled, dated PRIMARY list actually returned no selected events.
   // It never supplies an empty result for an unread/login/blocked page and
   // never overrides a lecture. Keep the current-list scope and coverage.
   if(state.primaryEmpty&&rowDates.length&&here.origin==='https://www.intermd.co.kr'&&here.pathname==='/webinar/list.do'){
    const day=/^\d{4}-\d{2}-\d{2}$/.test(targetDate)?new Date(targetDate+'T00:00:00Z'):null;
    if(day&&!isNaN(day)&&day.toISOString().slice(0,10)===targetDate){
     const weekend=day.getUTCDay()===0||day.getUTCDay()===6;
     // KASI 2026 calendar announcement: only the verified remaining dates.
     // https://www.kasi.re.kr/kor/post/newsMaterial/32031
     const holiday=['2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-05','2026-10-09','2026-12-25'].includes(targetDate);
     if(weekend||holiday){
      diagnostics.currentListRead=true;
      diagnostics.reason=weekend?'weekend_primary_empty':'holiday_primary_empty';
      return result('review','기본 웨비나 목록에서 선택일 강의 0개 조회 · 주말·공휴일 운영 패턴으로 모바일 추가 조회 생략',true,{diagnostics});
     }
    }
   }
   state.alternateRequested=true;state.catalogUrl=profile.alternateCatalogUrl;
   state.signature='';state.scrolled=false;state.scrolls=0;state.quietSince=now;
   return result('loading','인터엠디 모바일 목록에서 선택일을 확인하는 중',false,{action:{kind:'navigate',url:state.catalogUrl,catalog:true},diagnostics});
  }
  state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
  // This means the current rendered list settled, not that every future lecture
  // is published or that the selected day must have a lecture.
  diagnostics.currentListRead=rows.length>0;
  if(blue){
   diagnostics.startDatesRead=rows.length>0&&!extracted.undated;
   state.coverage=diagnostics.startDatesRead&&!extracted.untimed&&!extracted.untitled&&!controls.more.length&&!controls.pagers.length&&!controls.ambiguous;
  }
  const problems=[];if(controls.more.length||controls.pagers.length)problems.push('추가 목록 미조회');if(extracted.undated)problems.push('날짜 미확정 '+extracted.undated+'개');if(extracted.untimed)problems.push('시각 미확정 '+extracted.untimed+'개');if(!state.coverage)problems.push('선택일 범위 미확인');
  if(extracted.untitled)problems.push('제목 미확정 '+extracted.untitled+'개');
  return result('review',`자동 조회로 선택일 강의 ${state.events.length}개 수집 · `+(problems.length?problems.join(' / '):'사이트별 전체 수집 검증 대기'),true,{coverage:!!state.coverage,diagnostics});
 }catch(e){return fail('화면을 읽는 중 오류가 발생했어요');}
});const dtalksStep=(function dtalksStep(profile,targetDate,previous,readStep,readPage,findControls){
 const patience=ms=>Math.max(ms,Math.min(45000,Number(profile.networkPatienceMs)||0));
 const now=Date.now();
 const state=previous?.version===1&&previous.site===profile.id&&previous.date===targetDate?previous:
  {version:1,site:profile.id,date:targetDate,started:now,events:[]};
 const result=(status,message,done=false,extra={})=>({site:profile.id,crawler:profile.crawler,status,message,done,events:state.events,checkedAt:now,state,diagnostics:{site:profile.id,targetDate,stage:'schedule_menu',elapsedMs:now-state.started,menuCandidates:state.menuCandidates||[],...state.entryDiagnostics},...extra});
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const path=e=>{const parts=[];while(e&&e!==document.documentElement){const p=e.parentElement;if(!p)break;parts.unshift(e.tagName.toLowerCase()+':nth-of-type('+(Array.from(p.children).filter(x=>x.tagName===e.tagName).indexOf(e)+1)+')');e=p;}return 'html > '+parts.join(' > ');};
 const label=e=>[text(e),e.getAttribute('aria-label'),e.getAttribute('title'),...Array.from(e.querySelectorAll('img[alt]')).map(x=>x.getAttribute('alt'))].filter(Boolean).join(' ').trim();
 const scheduleLabel=s=>/^(?:(?:웹)?심포지[엄움]|월간|주간|전체)?편성표(?:보기)?$/.test(s.replace(/\s+/g,''));
 const safe=raw=>{try{const u=new URL(raw,location.href);return u.protocol==='https:'&&(u.hostname==='dtalks.kr'||u.hostname==='www.dtalks.kr')&&!u.username&&!u.password&&!/token|auth|session|password|email|ticket/i.test(u.search)&&!/login|logout|regist|apply|userLiveView|vodView/i.test(u.pathname)?u:null;}catch{return null;}};
 try{
  const here=new URL(location.href);
  const onSite=here.protocol==='https:'&&['dtalks.kr','www.dtalks.kr'].includes(here.hostname)&&!here.username&&!here.password;
  const loginRoute=/^\/(?:member\/)?login(?:Confirm)?\.do$/i.test(here.pathname);
  const passwordVisible=Array.from(document.querySelectorAll('input[type="password"]')).some(visible);
  // Current-page authentication and safe menu destinations are separate checks.
  // A backUrl/query word or an unexpected landing page is not proof of logout.
  state.entryDiagnostics={path:['/login.do','/member/login.do','/member/loginConfirm.do','/main.do','/websim/vodList.do'].includes(here.pathname)?here.pathname:'',loginRoute,passwordVisible};
  if(!onSite){state.entryDiagnostics.stopReason='unexpected_origin';return result('review','디톡스 화면 이동을 확인하지 못했어요 · 편성표 미조회',true);}
  // Empty dates require two full observation windows separated by one GET.
  // Reserve navigation/poll overhead as well; two 45s waits cannot fit in 90s.
  // The native 150s site budget and the single-reload limit remain unchanged.
  if(now-state.started>Math.max(40000,patience(0)*2+10000))return result('review','디톡스 편성표 로딩 완료를 확인하지 못했어요 · 확인 시간 초과',true);
  if(document.readyState&&document.readyState!=='complete'){state.calendarSignature='';state.calendarObserved=0;return result('loading','디톡스 화면 이동을 기다리는 중');}
  if(loginRoute||passwordVisible){
   state.entryDiagnostics.stopReason='login_required';
   return result('login','디톡스 로그인 화면으로 이동했어요 · 편성표를 조회하지 못했어요.',true);
  }
  const monthValues=()=>[...new Set(Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,span,em,p,div')).filter(visible).map(e=>{
   const t=text(e),m=t.length<28&&t.match(/^(20\d{2})\s*(?:[./-]|년)\s*(0?[1-9]|1[0-2])\s*월?\s*\.?$/);return m?m[1]+'-'+m[2].padStart(2,'0'):'';
  }).filter(Boolean))];
  const calendarVisible=()=>monthValues().length===1&&Array.from(document.querySelectorAll('table,[role="grid"],[data-date],.calendar_box.active .calendar_grid')).some(visible);
  if(state.menuClick){
   const target=state.tabTarget?document.getElementById(state.tabTarget):null;
   if(here.href!==state.menuFrom||target&&visible(target)||calendarVisible()){
    state.catalogUrl=here.href;state.menuClick=false;state.scheduleReady=true;
   }else if(now-state.menuAt>patience(7000))return result('review','편성표를 눌렀지만 화면 전환을 확인하지 못했어요.',true);
   else return result('loading','디톡스 편성표를 여는 중');
  }
  if(!state.catalogUrl&&Array.from(document.querySelectorAll('.calendar_box.active .calendar_grid')).filter(visible).length===1){state.catalogUrl=here.href;state.scheduleReady=true;}
  if(!state.catalogUrl){
   const candidates=Array.from(document.querySelectorAll('a,button,[role="tab"],[role="button"]')).filter(e=>
    [text(e),e.getAttribute('title')||'',e.getAttribute('aria-label')||''].some(scheduleLabel)&&
    !e.closest('form,[class*="login"],[role="dialog"]')&&(visible(e)||e.closest('header,nav')));
   state.menuCandidates=candidates.slice(0,6).map(e=>({label:text(e).slice(0,50),path:safe(e.getAttribute('href')||'')?.pathname||''}));
   const links=candidates.map(e=>({e,raw:e.getAttribute('href')||''})).filter(x=>x.raw&&!/^(#|javascript:)/i.test(x.raw)).map(x=>({...x,u:safe(x.raw)})).filter(x=>x.u);
   const routes=links.filter(x=>!x.u.hash||x.u.pathname!==here.pathname||x.u.search!==here.search);
   const urls=[...new Set(routes.map(x=>x.u.href))];
   if(urls.length===1){
    state.catalogUrl=urls[0];state.scheduleReady=true;
    if(here.href!==state.catalogUrl)return result('loading','디톡스 편성표로 이동 중',false,{action:{kind:'navigate',url:state.catalogUrl,catalog:true}});
   }else if(urls.length>1)return result('review','디톡스 편성표 메뉴가 여러 개여서 구분하지 못했어요.',true);
   else {
    const clicks=candidates.filter(visible).filter(e=>e.matches('button,[role="tab"],[role="button"]')||e.getAttribute('onclick')||/^#/.test(e.getAttribute('href')||'')||links.some(x=>x.e===e&&!!x.u.hash));
    if(clicks.length===1){
     const e=clicks[0],raw=e.getAttribute('href')||'';
     if(e.getAttribute('aria-selected')==='true'&&calendarVisible()){state.catalogUrl=here.href;state.scheduleReady=true;}
     else {state.menuClick=true;state.menuAt=now;state.menuFrom=here.href;state.tabTarget=e.getAttribute('aria-controls')||e.getAttribute('data-modal')||((e.getAttribute('data-target')||e.getAttribute('data-bs-target')||safe(raw)?.hash||raw).match(/^#([\w-]+)$/)||[])[1]||'';
      return result('loading','디톡스 편성표를 여는 중',false,{action:{kind:'click',selector:path(e),signature:label(e)}});}
    }else if(calendarVisible()&&Array.from(document.querySelectorAll('h1,h2,h3,[aria-selected="true"]')).filter(visible).some(e=>scheduleLabel(text(e)))){state.catalogUrl=here.href;state.scheduleReady=true;}
    else if(now-state.started>patience(8000))return result('review','디톡스 편성표 메뉴를 찾지 못했어요 · 강의 없음으로 처리하지 않아요.',true);
    else return result('loading','디톡스 편성표 메뉴를 찾는 중');
   }
  }
  if(here.pathname!==new URL(state.catalogUrl).pathname)return result('review','디톡스 편성표에 도착하지 못했어요.',true);
  // The reported calendar is a DIV grid, not a table. Read all cards in its
  // active month once; the per-card 더보기 opens details and is never pagination.
  const calendars=Array.from(document.querySelectorAll('.calendar_box.active')).filter(e=>visible(e)&&e.querySelector('.calendar_grid'));
  if(calendars.length===1){
   const box=calendars[0],wrap=box.closest('.calendar_wrap')||box.parentElement;
   const monthRoot=wrap.querySelector('.btn_month_wrap.active');
   if(!monthRoot){
    const monthButton=wrap.querySelector('.btn_calendar_box .btn_month');
    if(visible(monthButton)&&!state.monthModeClicked){state.monthModeClicked=true;return result('loading','디톡스 월간 편성표를 여는 중',false,{action:{kind:'click',selector:path(monthButton),signature:label(monthButton)}});}
    return result('review','디톡스 월간 편성표의 연월을 확인하지 못했어요.',true);
   }
   const values=[...new Set([monthRoot,...monthRoot.querySelectorAll('.date_txt,.date')].map(e=>{const m=text(e).match(/^(20\d{2})\s*(?:[./-]|년)\s*(0?[1-9]|1[0-2])\s*월?\s*\.?$/);return m?m[1]+'-'+m[2].padStart(2,'0'):'';}).filter(Boolean))];
   if(values.length!==1)return result('review','디톡스 편성표의 연월을 구분하지 못했어요.',true);
   const month=values[0];
   const busy=[wrap,...wrap.querySelectorAll('[aria-busy="true"],.loading,.is-loading,.spinner')].some(e=>visible(e)&&(e.getAttribute('aria-busy')==='true'||e.matches('.loading,.is-loading,.spinner')));
   if(busy){state.calendarSignature='';state.calendarObserved=0;state.calendarReads=0;state.calendarQuiet=now;state.events=[];return result('loading','디톡스 편성표 로딩을 기다리는 중');}
   if(state.monthPending){if(state.monthPending===month)return result('loading','선택한 달의 편성표를 기다리는 중');state.monthPending='';}
   if(month!==targetDate.slice(0,7)){
    const button=monthRoot.querySelector(month<targetDate.slice(0,7)?'.btn_next_month':'.btn_last_month');
    if(!visible(button)||(state.monthMoves||0)>=18)return result('review','디톡스 편성표의 월 이동을 확인해 주세요.',true);
    state.monthMoves=(state.monthMoves||0)+1;state.monthPending=month;state.events=[];state.calendarSignature='';state.calendarObserved=0;
    return result('loading','디톡스 선택한 달로 이동 중',false,{action:{kind:'click',selector:path(button),signature:label(button)}});
   }
   const gridCells=Array.from(box.querySelectorAll('.calendar_grid > .day')).filter(visible);
   const outside=e=>/last_month|next_month|outside|other|prev/i.test(e.className||'');
   const iso=d=>d.toISOString().slice(0,10);
   const first=new Date(month+'-01T00:00:00Z'),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));
   const daysInMonth=last.getUTCDate();
   const info=gridCells.map(e=>{
    const label=text(e.querySelector(':scope > .day_txt'));
    const m=label.match(/^([1-9]|[12]\d|3[01])(?:\s*일)?(?:\s*[(（][월화수목금토일](?:요일)?[)）]|\s+[월화수목금토일](?:요일)?)?$/);
    const attr=e.getAttribute('data-date')||'',d=/^20\d{2}-\d{2}-\d{2}$/.test(attr)?new Date(attr+'T00:00:00Z'):null;
    const explicit=d&&!isNaN(d)&&iso(d)===attr?attr:'';
    return {day:m?+m[1]:explicit&&!label?+explicit.slice(8):null,explicit,invalid:!!attr&&(!explicit||!!m&&+m[1]!==+explicit.slice(8))};
   });
   const headings=Array.from(box.querySelectorAll('.day_wrap > .day')).filter(visible).map(e=>text(e).replace(/요일$/,''));
   const weekdayDates=(from,to)=>{const values=[];for(let d=new Date(from);d<=to;d.setUTCDate(d.getUTCDate()+1))if(![0,6].includes(d.getUTCDay()))values.push(iso(d));return values;};
   const weekdays=weekdayDates(first,last),start=new Date(first),end=new Date(last);
   start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
   end.setUTCDate(end.getUTCDate()+((7-end.getUTCDay())%7));
   // The 0.7.6 report has 25 slots, including adjacent months. Prove the whole
   // weekday sequence before assigning those slots to months. An isolated gap,
   // a missing/duplicate slot or contradictory weekday heading is insufficient.
   const headerAgrees=!headings.length||headings.join(',')==='월,화,수,목,금';
   const sequence=headerAgrees?[weekdays,weekdayDates(start,end)].find(dates=>dates.length===gridCells.length&&dates.every((d,i)=>{
    const x=info[i];return !x.invalid&&x.day===+d.slice(8)&&(!x.explicit||x.explicit===d)&&(!outside(gridCells[i])||d.slice(0,7)!==month);
   })):null;
   const dates=sequence||info.map((x,i)=>x.invalid?'':x.explicit||(!outside(gridCells[i])&&x.day&&x.day<=daysInMonth?month+'-'+String(x.day).padStart(2,'0'):''));
   if(!sequence){
    const counts=new Map();for(const d of dates)if(d)counts.set(d,(counts.get(d)||0)+1);
    // Without a complete sequence, repeated numeric days have no proven month.
    // Retain explicit ISO dates, but never guess which duplicate is October 1.
    for(let i=0;i<dates.length;i++)if(!info[i].explicit&&counts.get(dates[i])>1)dates[i]='';
   }
   const targetCells=dates.filter(d=>d===targetDate).length;
   const coverage=targetCells===1||targetCells===0&&!!sequence&&!weekdays.includes(targetDate)&&targetDate>=iso(first)&&targetDate<=iso(last);
   // Pass the same resolved dates to card extraction. Unknown slots deliberately
   // suppress the collector's numeric-day fallback; October 1 must not become September 1.
   const cells=gridCells.filter((e,i)=>!outside(e)||dates[i]?.slice(0,7)===month);
   const cards=cells.flatMap(e=>Array.from(e.querySelectorAll('.day_box'))).filter(visible);
   const calendarCellDates=gridCells.map((e,i)=>({selector:path(e),date:dates[i]}));
   const r=cards.length?readPage({...profile,calendarOnly:true,calendarMonth:month,calendarCellDates,rowSelector:cards.map(path).join(','),timeSelector:'.time',titleSelector:'.memo',validated:true,allowNoPagination:true},targetDate):{events:[],undated:0,untimed:0};
   if(['login','blocked','error'].includes(r.status))return result(r.status,r.message,true);
   if(r.status==='loading'){state.calendarSignature='';state.calendarObserved=0;state.calendarReads=0;state.events=[];return result('loading','디톡스 강의 목록 준비를 기다리는 중');}
   state.events=[...new Map((r.events||[]).map(e=>[[e.date,e.time,e.title].join('|'),e])).values()].sort((a,b)=>a.time.localeCompare(b.time));
   // Date cells can precede their asynchronously rendered lectures. A short
   // quiet period proves neither a loaded empty day nor an authenticated list.
   const signature=JSON.stringify([month,headings,dates,gridCells.map(e=>text(e)),state.events]);
   if(signature!==state.calendarSignature){state.calendarSignature=signature;state.calendarQuiet=now;state.calendarReads=0;state.calendarObserved=now;}
   if(!state.calendarObserved)state.calendarObserved=now;
   state.calendarReads=(state.calendarReads||0)+1;
   const dateChecked=coverage&&!r.undated&&!r.untimed&&!r.untitled;
   const empty=!state.events.length;
   const quiet=now-state.calendarQuiet>=2000&&state.calendarReads>=3;
   const emptyWait=now-state.calendarObserved>=patience(8000);
   // One bounded GET of the observed schedule URL, with the existing cookie
   // store. Never submit login, guess an endpoint, clear storage or loop reloads.
   if(empty&&dateChecked&&quiet&&emptyWait&&!state.emptyReloaded){
    const reload=safe(here.href);
    if(!reload)return result('review','디톡스 편성표를 다시 확인하지 못했어요 · 사이트를 열어 확인해 주세요.',true);
    state.emptyReloaded=true;state.calendarSignature='';state.calendarObserved=0;state.calendarReads=0;
    // A GET replaces the document and can close the schedule overlay or reset
    // its month controls. Rediscover it in the new document; retaining this
    // URL as proof of an open calendar would read the underlying VOD page.
    delete state.catalogUrl;delete state.tabTarget;delete state.reader;
    state.scheduleReady=false;state.menuClick=false;state.monthModeClicked=false;state.monthPending='';
    return result('loading','빈 날짜의 강의를 놓치지 않도록 편성표를 한 번 다시 불러오는 중',false,{action:{kind:'navigate',url:reload.href,catalog:true}});
   }
   const done=quiet&&(!empty||emptyWait);
   // An entirely bare month has no lecture-load evidence. Keep it unresolved
   // even after the recheck; it must not become the UI's “강의 없음”.
   const checked=done&&dateChecked&&(!empty||state.emptyReloaded&&cards.length>0);
   const calendarReason=coverage?(targetCells===1?'selected_day_cell':sequence===weekdays?'complete_weekday_month':'complete_weekday_grid'):'calendar_day_unconfirmed';
   const diagnostics={site:profile.id,path:here.pathname,targetDate,month,rows:cards.length,totalRows:cards.length,events:state.events.length,undated:r.undated||0,untimed:r.untimed||0,pages:0,expansions:0,elapsedMs:now-state.started,scheduleMenu:true,stopReason:'selected_month_calendar',continuation:{more:0,pagers:0,ambiguous:false},calendarChecked:checked,calendarEmpty:checked&&!state.events.length,calendarReason,calendarDate:targetDate,calendarMonth:month,calendarDetails:{source:calendarReason,count:gridCells.length,dated:dates.filter(Boolean).length,unknown:dates.filter(d=>!d).length,parts:dates.map((date,i)=>({date,reason:info[i].invalid?'conflicting_date':date?'parsed_date':'unresolved_date',value:info[i].day?String(info[i].day):'',classes:gridCells[i].className})),controls:headings.map(label=>({label}))},selectedEvents:state.events.map(e=>({date:e.date,time:e.time,title:e.title})),samples:cards.slice(0,4).map(e=>({classes:e.className,day:text(e.closest('.day')?.querySelector('.day_txt')),text:text(e).slice(0,600)}))};
   diagnostics.calendarStatus=checked?'checked':done?'unconfirmed':'waiting';
   diagnostics.listDetails={status:checked?'read':done?'unconfirmed':'waiting',reason:empty?(checked?'rechecked_empty':'lecture_load_unconfirmed'):(state.emptyReloaded?'events_after_recheck':'selected_events_read'),rows:cards.length,pages:state.emptyReloaded?2:1,reads:state.calendarReads,elapsedMs:now-state.calendarObserved,targetDate};
   return result(done?'review':'loading',done?(empty&&!checked&&dateChecked?'디톡스 강의 로딩 완료를 확인하지 못했어요 · 사이트를 열어 확인해 주세요.':`현재 편성표에서 선택일 강의 ${state.events.length}개 수집`+(checked?' · 전체 수집 검증 대기':' · 날짜·시각 확인 필요')):empty?'디톡스 빈 날짜의 강의가 늦게 표시되는지 재확인하는 중':'디톡스 편성표를 확인하는 중',done,{coverage,diagnostics});
  }
  const months=monthValues();
  const r=readStep({...profile,url:state.catalogUrl,discoverMenu:false,calendarOnly:true,scopeSelector:state.tabTarget&&visible(document.getElementById(state.tabTarget))?path(document.getElementById(state.tabTarget)):'',calendarMonth:months.length===1?months[0]:''},targetDate,state.reader,readPage,findControls);
  state.reader=r.state;state.events=r.events||[];
  if(r.diagnostics){r.diagnostics.scheduleMenu=true;r.diagnostics.elapsedMs=now-state.started;}
  if(r.done&&!state.events.length&&!['login','blocked','error'].includes(r.status)){
   r.status='review';r.message='디톡스 강의 로딩 완료를 확인하지 못했어요 · 사이트를 열어 확인해 주세요.';
   if(r.diagnostics){r.diagnostics.calendarChecked=false;r.diagnostics.calendarEmpty=false;r.diagnostics.calendarStatus='unconfirmed';}
  }
  return {...r,state};
 }catch{return result('review','디톡스 편성표 구조를 읽지 못했어요 · 전체 수집 미확인',true);}
});return function(profile,date,state){return profile.id==="dtalks"?dtalksStep(profile,date,state,additionalCatalogStep,collectAdditionalPage,inspectListControls):additionalCatalogStep(profile,date,state,collectAdditionalPage,inspectListControls);};})()