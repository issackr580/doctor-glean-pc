(function collectAdditionalPage(profile,targetDate){
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
})