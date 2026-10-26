(function(){const collectPage=(function collectPage(profile,targetDate){
  const doc=document;
  // The unverified HMP PC fallback supplies explicit schedule fields outside
  // its title. Never recover their missing date/time from title or row text.
  const structuralDateOnly=profile.id==='hmp'&&profile.structuralDateOnly===true&&location.href==='https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm';
  const visible=e=>!!e&&!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const text=e=>(e?(typeof e.innerText==='string'?e.innerText:e.textContent||''):'').replace(/\s+/g,' ').trim();
  const select=(s,root=doc)=>s?Array.from(root.querySelectorAll(s)).filter(visible):[];
  const chosen=(s,root)=>s?select(s,root).map(text).join(' '):'';
  const makeDate=(y,m,d)=>{const str=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const dt=new Date(str+'T00:00:00Z');return !isNaN(dt)&&dt.toISOString().slice(0,10)===str?str:null;};
  const dates=str=>{
    const full=[];for(const m of str.matchAll(/(?<!\d)(20\d{2})\s*(?:[./-]|년)\s*(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})(?:일)?(?!\d)/g)){const v=makeDate(+m[1],+m[2],+m[3]);if(v)full.push(v);}
    if(full.length)return [...new Set(full)];
    const partial=[];for(const m of str.matchAll(/(?<![\d./-])(\d{1,2})\s*(?:[/.]|월)\s*(\d{1,2})(?:일)?(?![\d./-])/g)){const years=[+targetDate.slice(0,4)-1,+targetDate.slice(0,4),+targetDate.slice(0,4)+1];const candidates=years.map(y=>makeDate(y,+m[1],+m[2])).filter(Boolean).sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(targetDate))-Math.abs(Date.parse(b)-Date.parse(targetDate)));if(candidates[0])partial.push(candidates[0]);}return [...new Set(partial)];
  };
  const calendarDateFor=row=>{
    if(!structuralDateOnly||!Array.isArray(profile.structuralCalendarDates)||profile.structuralCalendarDates.length>400)return '';
    const bound=profile.structuralCalendarDates.filter(binding=>binding&&typeof binding.selector==='string'&&binding.selector.length<=2000&&/^20\d{2}-\d{2}-\d{2}$/.test(binding.date||'')&&doc.querySelector(binding.selector)===row);
    const values=[...new Set(bound.map(binding=>binding.date))];return values.length===1&&dates(values[0]).length===1?values[0]:'';
  };
  // A title and presenter can use nested strongs; status may be in a DL,
  // LABEL, FONT, or direct text elsewhere in this one bounded lecture row.
  const subjectParts=row=>{
    if(!structuralDateOnly)return null;
    const subjects=select('.subject',row);if(subjects.length!==1)return null;
    const subject=subjects[0],title=select('strong',subject)[0];if(!title)return null;
    let first=null,visited=0;
    const walk=node=>{if(first||++visited>200)return;if(node.nodeType===3){if(/\S/.test(node.nodeValue||''))first=node;return;}if(node.nodeType!==1||!visible(node)||node.matches('script,style,template,noscript,input,textarea,select'))return;for(const child of node.childNodes)walk(child);};
    walk(subject);if(!first||!title.contains(first.parentElement))return null;
    return {title,subject};
  };
  const lectureTitle=row=>{const parts=subjectParts(row);return parts?text(parts.title):chosen(profile.titleSelector,row);};
  const registrationFor=(row,time)=>{
    const parts=subjectParts(row),subjects=select('.subject',row),titleRoots=parts?[parts.title]:subjects;
    const inTitle=e=>titleRoots.some(title=>title===e||title.contains(e));
    const statuses=new Set();
    const statusFor=raw=>{
      const value=String(raw||'').replace(/\s/g,'');
      // A status and its enrollment fraction may share one label. A full
      // class/name substring or the capacity alone is never status evidence.
      const label=value.match(/^(신청완료|등록완료|미신청|신청가능|신청하기|신청마감|접수마감|마감|신청)(.*)$/);
      if(!label)return '';
      if(label[2]){
        const number='(?:0|[1-9]\\d{0,5}|[1-9]\\d{0,2}(?:,\\d{3}){1,2})',fraction=number+'(?:명)?/'+number+'(?:명)?';
        if(!new RegExp('^(?:'+fraction+'|\\('+fraction+'\\))$').test(label[2]))return '';
      }
      if(/^(?:신청완료|등록완료)$/.test(label[1]))return 'registered';
      if(/^(?:미신청|신청가능|신청하기|신청)$/.test(label[1]))return 'not_registered';
      return 'closed';
    };
    const hidden=e=>{for(let parent=e;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(parent.hasAttribute('hidden')||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return true;}return false;};
    const labelText=e=>{
      // Read nested visible fragments as a single bounded label. Do not use
      // textContent, which includes CSS-hidden alternatives in a real WebView.
      let value='',visited=0,valid=true;
      const walk=node=>{
        if(!valid||++visited>64){valid=false;return;}
        if(node.nodeType===3)value+=node.nodeValue||'';
        else if(node.nodeType===1){
          if(inTitle(node)||node.matches('script,style,template,noscript,input,textarea,select')||hidden(node))return;
          for(const child of node.childNodes)walk(child);
        }
        if(value.length>90)valid=false;
      };
      walk(e);return valid?value:'';
    };
    const labels=[row,...select('*',row)].filter(e=>!inTitle(e)&&!e.matches('script,style,template,noscript,input,textarea,select,option')&&!hidden(e));
    // Lifecycle comes only from visible, bounded labels outside the title.
    // It never proves enrollment, authentication, or a successful entry.
    const lifecycle=labels.map(e=>labelText(e).replace(/\s/g,''));
    const ended=lifecycle.some(label=>/^(?:강의종료|방송종료|다시보기)$/.test(label))&&!lifecycle.some(label=>/^(?:시청하기|시청가능|입장하기|방송중|강의중)$/.test(label));
    let textLabels=0,attributeLabels=0,generatedLabels=0;
    const complete=labels.map(e=>({e,status:statusFor(labelText(e))})).filter(label=>label.status);
    for(const label of complete){
      // A child spelling only "신청" in "신청" + "완료" is a fragment,
      // not a second, contradictory button. Independent labels still conflict.
      if(!complete.some(other=>other!==label&&other.e.contains(label.e))){statuses.add(label.status);textLabels++;}
    }
    for(const e of labels){
      if(!complete.some(label=>label.e===e||label.e.contains(e))){
        const direct=Array.from(e.childNodes).filter(node=>node.nodeType===3).map(node=>node.nodeValue||'').join('');
        const status=statusFor(direct);if(status){statuses.add(status);textLabels++;}
      }
      for(const name of ['alt','title','aria-label']){const status=statusFor(e.getAttribute(name));if(status){statuses.add(status);attributeLabels++;}}
      // Browser-resolved literal generated labels are visible text too. Never
      // interpret a class, image filename, arbitrary CSS, or a capacity as status.
      const pseudo=[];for(const side of ['::before','::after']){try{const style=getComputedStyle(e,side),raw=style.content||'';if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')continue;const m=raw.match(/^(?:"([^"\\]{0,90})"|'([^'\\]{0,90})')$/);if(m)pseudo.push(m[1]??m[2]);}catch{}}
      const joined=statusFor(pseudo.join(''));const generated=joined?[joined]:pseudo.map(statusFor).filter(Boolean);
      for(const status of generated){statuses.add(status);generatedLabels++;}
    }
    const status=statuses.size===1?[...statuses][0]:'unknown';
    const evidence={time,status,...(ended?{lectureEnded:true}:{}),reason:statuses.size>1?'conflicting_labels':statuses.size===1?'status_label':'no_status_label',nodes:Math.min(201,labels.length),titleFields:parts?1:0,directStrong:Math.min(200,subjects.flatMap(subject=>Array.from(subject.children)).filter(e=>e.tagName==='STRONG').length),totalStrong:Math.min(200,subjects.flatMap(subject=>Array.from(subject.querySelectorAll('strong'))).length),textLabels:Math.min(400,textLabels),attributeLabels:Math.min(400,attributeLabels),generatedLabels:Math.min(400,generatedLabels)};
    const diag=base.hmpRegistration??={schemaVersion:1,rows:0,registered:0,notRegistered:0,closed:0,unknown:0,details:[]};diag.rows++;diag[status==='not_registered'?'notRegistered':status]++;if(diag.details.length<4)diag.details.push(evidence);
    const watchAvailable=statuses.size<=1&&!statuses.has('not_registered')&&!statuses.has('closed')&&!lifecycle.some(label=>/^(?:강의종료|방송종료|다시보기)$/.test(label))&&labels.some(e=>e.matches('a,button')&&!e.disabled&&!e.closest('[disabled],[aria-disabled="true"],.disabled')&&/^강의시청(?:하기)?$/.test(labelText(e).replace(/\s/g,'')));
    return {registrationStatus:status,...(ended?{lectureEnded:true}:{}),...(watchAvailable?{hmpWatchAvailable:true}:{})};
  };
  const getTime=str=>{const m=str.match(/(?<!\d)(?:(오전|오후)\s*)?([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);if(!m)return null;let h=+m[2];if(m[1]){if(h>12||h===0)return null;h=h%12+(m[1]==='오후'?12:0);}return String(h).padStart(2,'0')+':'+m[3];};
  const base={site:profile.id,events:[],excluded:0,undated:0,untimed:0,untitled:0,matchedRows:0,coverage:false,source:location.href,checkedAt:Date.now(),warnings:[]};
  if(['medigate','hmp','doctorville'].includes(profile.id))base.catalogRows=[];
  try{
    if(select('input[type="password"]').length)return {...base,status:'login',message:'로그인이 필요합니다.'};
    const pageText=text(doc.body);
    if(/Verify you are human|Checking your browser|자동입력 방지|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(pageText))return {...base,status:'blocked',message:'사이트의 접근 확인 화면을 직접 확인해 주세요.'};
    if(profile.readySelector&&!select(profile.readySelector).length)return {...base,status:'loading',message:'강의 목록 로딩을 기다리는 중입니다.'};
    let rows=profile.rowSelector?select(profile.rowSelector):select('a,article,li,tr,[class*="seminar"],[class*="webinar"],[class*="lecture"]').filter(e=>{const t=text(e);return t.length>12&&t.length<1300&&!!getTime(t);});
    if(!profile.rowSelector)rows=rows.filter(e=>!rows.some(other=>other!==e&&e.contains(other)&&getTime(text(other))));
    if(rows.length>500)return {...base,status:'review',message:'너무 많은 요소가 선택됐습니다. 강의 카드 선택을 다시 해 주세요.'};
    base.matchedRows=rows.length;
    const headings=select('h1,h2,h3,h4,h5,dt,th,time,em,strong,span,a,p,div').filter(e=>{const t=text(e);return t.length<45&&/^(?:(?:20\d{2})\s*[./년-]\s*)?\d{1,2}\s*[./월-]\s*\d{1,2}(?:일)?(?:\s*[()월화수목금토일요일\s]*)$/.test(t)&&dates(t).length===1&&!rows.some(r=>r.contains(e)||e.contains(r));});
    const explicitDates=profile.dateSelector?select(profile.dateSelector).flatMap(e=>dates(text(e))):[];
    base.coverage=explicitDates.includes(targetDate)||headings.some(e=>dates(text(e))[0]===targetDate);
    for(const row of rows){
      const t=text(row);const time=getTime(chosen(profile.timeSelector,row)||(structuralDateOnly?'':t));
      const calendarDate=calendarDateFor(row);
      let ds=calendarDate?[calendarDate]:dates(chosen(profile.dateSelector,row)||(structuralDateOnly?'':t));
      // Inline sibling text can concatenate a numeric title and its date. Read separate
      // visible date fragments before falling back to group/headings; ambiguity still fails.
      if(!structuralDateOnly&&ds.length===0){const fragments=select('time,span,em,p,div',row).filter(e=>e.children.length===0&&text(e).length<90).flatMap(e=>dates(text(e)));const independent=[...new Set(fragments)];if(independent.length===1)ds=independent;}

      if(!structuralDateOnly&&!ds.length&&profile.groupSelector){const group=row.closest(profile.groupSelector);if(group)ds=dates(chosen(profile.dateSelector,group)||text(group));}
      if(!structuralDateOnly&&!ds.length){const previous=headings.filter(h=>h.compareDocumentPosition(row)&Node.DOCUMENT_POSITION_FOLLOWING);if(previous.length)ds=dates(text(previous.at(-1)));}
      // Stable list metadata for Medigate: animation labels and attendee counters
      // must not restart pagination waits. Dates use the same parser as the events.
      if(['medigate','hmp','doctorville'].includes(profile.id)){
        const heading=row.querySelector('h1,h2,h3,h4,h5,h6,.tit,.title,[class*="title"],[class*="subject"]');
        const fallback=select('h5,h6,p,span,strong',row).find(e=>e.children.length===0&&text(e).length>=12&&text(e).length<300&&!/\d{1,2}:\d{2}|20\d{2}[.\/-]|^(?:신청|예약|시청|참여)|교수|병원|원장|의원|^(?:좌장|연자)\s*[:：]/.test(text(e)));
        base.catalogRows.push({date:ds.length===1?ds[0]:'',time:time||'',title:(lectureTitle(row)||text(heading)||(profile.id==='medigate'?'':text(fallback))).slice(0,250)});
      }
      if(ds.length!==1){base.undated++;continue;}
      if(ds[0]!==targetDate)continue;
      base.coverage=true;
      if(!time){base.untimed++;continue;}
      if(/(?:강의|방송|행사)\s*취소|취소된\s*(?:강의|행사)/.test(t)){base.excluded++;continue;}
      const labels=[...row.querySelectorAll('[alt],[title],[aria-label]')].filter(visible).map(e=>[e.getAttribute('alt'),e.getAttribute('title'),e.getAttribute('aria-label')].filter(Boolean).join(' ')).join(' ');
      const rewardText=t+' '+labels;
      const hasReward=profile.rewardSelector?select(profile.rewardSelector,row).length>0:profile.filter==='pm'?/(?:^|\s)[PM](?:\s|$)|포인트|미션|\bpoint\b|\bmission\b/i.test(rewardText):/\bBell\b|벨\s*지급/i.test(rewardText);
      if(profile.filter!=='all'&&!hasReward){base.excluded++;continue;}
      const title=(profile.id==='medigate'?base.catalogRows.at(-1)?.title:(lectureTitle(row)||text(row.querySelector('h1,h2,h3,h4,.tit,.title,[class*="title"]'))||t.replace(/^.*?\d{1,2}:\d{2}\s*(?:[~–-]\s*\d{1,2}:\d{2})?\s*/,''))).slice(0,250);
      if(['hmp','doctorville'].includes(profile.id)&&!base.catalogRows.at(-1)?.title){base.untitled++;continue;}
      if(profile.id==='medigate'&&!base.catalogRows.at(-1)?.title){base.untitled++;continue;}
      const advanced=profile.advancedSelector?select(profile.advancedSelector,row).length>0:/심화\s*(?:연계\s*)?설문/.test(t+' '+labels);
      const link=row.matches('a[href]')?row:row.querySelector('a[href]');const href=link?.getAttribute('href')||'';const safeHref=/^(https?:|\/)/i.test(href)?new URL(href,location.href).href:'';
      base.events.push({site:profile.id,date:targetDate,time,title,advanced,id:safeHref||title,url:safeHref,...(structuralDateOnly?registrationFor(row,time):{})});
    }
    const pager=select('.pagination,.paging,.paginate,nav[aria-label*="페이지"]');
    if(!profile.allowNoPagination&&pager.some(e=>select('a,button',e).filter(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true').length>1))base.warnings.push('페이지 나눔 감지: 해당 날짜의 다른 페이지가 있는지 확인 필요');
    if(base.undated)base.warnings.push(`날짜를 확정하지 못한 카드 ${base.undated}개`);
    if(base.untimed)base.warnings.push(`시작시각을 읽지 못한 카드 ${base.untimed}개`);
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
});const catalogStep=(function catalogStep(profile,targetDate,previous,readPage,findControls=inspectListControls){
 const patience=ms=>Math.max(ms,Math.min(45000,Number(profile.networkPatienceMs)||0));
 const now=Date.now(), host=profile.host, expandLists=profile.id==='hmp', checkedList=expandLists||profile.id==='doctorville';
 const state=previous?.version===2&&previous.site===profile.id&&previous.date===targetDate?previous:
  {version:2,site:profile.id,date:targetDate,started:now,events:[],seen:[],pages:0,steps:0,signature:'',quietSince:now,pending:null,visited:[],scrolled:false,monthMoves:0};
 state.expansions=state.expansions||0;state.steps++;
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
  if(/더보기|목록 페이지/.test(reason)){if(state.expansions>=8)return fail('추가 조회 8회에 도달했어요: 읽은 강의만 표시해요');state.expansions++;}
  const a=action(el,'click',label(el));const href=el.getAttribute('href');
  if(href&&!/^(#|javascript:)/i.test(href)){
   const u=validUrl(href),base=new URL(profile.url);
   if(!u||u.pathname!==base.pathname||/token|auth|session|password|email|ticket/i.test(u.search))return fail('목록 밖으로 이동하는 버튼을 제외했어요');
   a.kind='navigate';a.url=u.href;
  }
  state.pending={at:now,before:state.signature,url:publicUrl(location.href),reason,scopeConfirmed:!!state.scopeConfirmed,...expect};state.scrolled=false;
  if(expandLists&&/더보기|목록 페이지/.test(reason)&&!state.hmpPageChecked)state.hmpIncompletePage=true;
  return result('loading',/더보기|목록 페이지/.test(reason)?expanding()+' · '+reason:reason+' 중',false,{action:a});
 };
 const unique=arr=>[...new Set(arr)];
 try{
  if(!validUrl(location.href))return result('login','원래 사이트에서 로그인을 완료해 주세요.',true);
  if(document.readyState&&document.readyState!=='complete')return result('loading','강의 목록 로딩을 기다리는 중');
  const bodyText=text(document.body);
  if(all('input[type="password"]').length)return result('login','로그인이 필요해요. 로그인 후 다시 조회해 주세요.',true);
  if(/Verify you are human|Checking your browser|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(bodyText))return result('blocked','사이트의 접근 확인 화면을 직접 확인해 주세요.',true);
  if(state.steps>100||now-state.started>Math.max(expandLists?80000:30000,patience(0)*2))return fail('조회 시간 초과: 읽은 강의만 표시해요');
  const here=new URL(location.href),entry=new URL(profile.url);
  if(here.pathname!==entry.pathname){
   if(/login|sign.?in|\/intro/i.test(here.pathname))return result('login','로그인 후 자동 조회를 다시 눌러 주세요.',true);
   return fail('예상한 강의 목록에 도착하지 못했어요');
  }
  // Exact Doctorville cards were observed earlier. Other sites use conservative structural
  // discovery and always remain provisional until their authenticated layout is verified.
  let selectors=profile.rowSelector||'',hmpStructural=false,hmpStructuralMode=false,hmpStructuralDates='',hmpStructuralTimes='',hmpStructuralDetails=null,hmpCalendarDates=[],hmpTopology=null,hmpGroupedList=false,hmpListControl=null;
  // The authenticated PC DOM is not a verified card contract. When the old
  // built-in anchors are absent, read only small, unambiguous rendered groups
  // around the two fields observed in the report. Never replace custom rules.
  if(expandLists&&here.href==='https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm'&&profile.url===here.href&&
     selectors==='a.head'&&profile.dateSelector==='.top .date'&&profile.timeSelector==='.top .time'&&profile.titleSelector==='.subject'&&!profile.groupSelector&&!document.querySelector('a.head')){
   const forbidden='header,footer,nav,aside,[role="dialog"],[aria-modal="true"]';
   const shown=e=>{
    if(!visible(e))return false;
    for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(p.hasAttribute('hidden')||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.opacity==='0')return false;}
    return true;
   };
   const outside=e=>{
    if(e.closest(forbidden))return true;
    for(let p=e;p&&p!==document.body;p=p.parentElement){
     if(/(?:^|[\s_-])(?:replay|vod|recording)(?:$|[\s_-])/i.test((p.getAttribute('class')||'')+' '+(p.id||'')))return true;
     if(p.matches('section')&&/다시\s*보기|녹화|\bVOD\b|replay/i.test(text(p.querySelector('h1,h2,h3'))))return true;
    }
    return false;
   };
   // Require a whole visible calendar label outside the title. A title such
   // as "2026.10.16 update" or a drug dose must never supply the lecture date.
   const calendarLabel=/^(?:(?:일시|일정|날짜|강의일|방송일)\s*[:：]?\s*)?(?:(?:20\d{2})\s*(?:[.\/-]|년)\s*)?\d{1,2}\s*(?:[.\/-]|월)\s*\d{1,2}(?:일)?(?:\s*\(?[월화수목금토일](?:요일)?\)?)?(?:\s*(?:[|·,:：]\s*)?(?:오전|오후)?\s*(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[~～∼–—-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)?\s*\.?$/;
   const normalizeCalendarLabel=value=>{
    const m=value.replace(/^(?:일시|일정|날짜|강의일|방송일)\s*[:：]?\s*/,'').match(/^(?:(20\d{2})\s*(?:[.\/-]|년)\s*)?(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})/);
    if(!m)return '';
    const years=m[1]?[+m[1]]:[+targetDate.slice(0,4)-1,+targetDate.slice(0,4),+targetDate.slice(0,4)+1];
    const values=years.map(year=>{const value=year+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),date=new Date(value+'T00:00:00Z');return !isNaN(date)&&date.toISOString().slice(0,10)===value?value:'';}).filter(Boolean);
    return values.sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(targetDate))-Math.abs(Date.parse(b)-Date.parse(targetDate)))[0]||'';
   };
   const dateLabels=(row,seed)=>{
    const labels=Array.from(row.querySelectorAll('time,span,em,p,div,strong,small')).filter(e=>shown(e)&&!e.closest('.subject')&&!e.contains(seed)&&text(e).length<=90&&calendarLabel.test(text(e)));
    return labels.filter(e=>!labels.some(other=>other!==e&&e.contains(other)));
   };
   const seeds=Array.from(document.querySelectorAll('.subject')).filter(e=>shown(e)&&!outside(e)&&!e.querySelector('.subject'));
   // The supplied screen has a month-only weekday calendar and an original
   // list/view selector. Switch that selector rather than inventing a year.
   // Match only one visible, independent control in the calendar's bounded owner.
   if(seeds.length&&seeds.length<=400){
    const tables=unique(seeds.map(e=>e.closest('table')));
    if(tables.length===1&&tables[0]&&shown(tables[0])&&!outside(tables[0])){
     const table=tables[0],headers=Array.from(table.querySelectorAll('tr')).filter(row=>row.closest('table')===table&&Array.from(row.children).map(text).join('|')==='월|화|수|목|금');
     if(headers.length===1){
      for(let owner=table.parentElement,n=0;owner&&owner!==document.body&&n<5;owner=owner.parentElement,n++){
       if(!shown(owner)||outside(owner)||owner.querySelectorAll('*').length>10000)break;
       const headings=Array.from(owner.querySelectorAll('h1,h2,h3,h4,h5,strong,span,em,p,div')).filter(e=>shown(e)&&!outside(e)&&!e.closest('.subject')&&!e.querySelector('.subject')&&/^(?:0?[1-9]|1[0-2])월\s*강의\s*일정$/.test(text(e)));
       if(!headings.length)continue;
       const viewLabel=e=>text(e)||e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('value')||'';
       const controls=Array.from(owner.querySelectorAll('a,button,[role="button"],input[type="button"],[onclick]')).filter(e=>shown(e)&&!outside(e)&&!e.closest('table')&&!e.querySelector('.subject')&&!e.matches('input:not([type="button"]),select,textarea'));
       const list=controls.filter(e=>viewLabel(e).trim()==='리스트'),calendar=controls.filter(e=>viewLabel(e).trim()==='달력');
       if(list.length===1&&calendar.length===1){
        const e=list[0],href=e.getAttribute('href'),u=href?validUrl(href):null;
        if(!e.disabled&&!e.hasAttribute('disabled')&&e.getAttribute('aria-disabled')!=='true'&&
           !(e.closest('form')&&e.matches('button:not([type]),button[type="submit"],input[type="submit"]'))&&
           (!href||/^(#|javascript:)/i.test(href)||u&&u.origin===here.origin&&u.pathname===here.pathname&&!/token|auth|session|password|email|ticket/i.test(u.search)))hmpListControl=e;
       }
       if(list.length||calendar.length)break;
      }
     }
    }
   }
   hmpStructuralMode=seeds.length>0||state.hmpStructuralMode===true;
   if(hmpStructuralMode){state.hmpStructuralMode=true;state.events=[];state.seen=[];state.coverage=false;state.pending=null;}
   const detail=hmpStructuralDetails={schemaVersion:2,subjectSeeds:Math.min(400,seeds.length),candidateRows:0,missingDate:0,ambiguous:0,overlap:0,boundedOut:0,multipleSubjects:0,multipleTimes:0,dateConflict:0,noDateLabel:0,dateParseRejected:0,calendarDays:0,calendarBindings:0};
   // Keep the original seven-column reconstruction and the confirmed weekday
   // table separate. Date ownership must come from a validated rendered group.
   const calendarBindings=new Map();
   if(seeds.length&&seeds.length<=400){
    const monthOf=e=>{
     if(!shown(e)||outside(e)||e.closest('.subject')||e.querySelector('.subject')||e.querySelector('.top .time'))return '';
     const raw=text(e);if(raw.length>90)return '';
     const clean=raw.replace(/(?:PREV(?:IOUS)?|NEXT|이전\s*(?:달|월)?|다음\s*(?:달|월)?)/gi,'').replace(/[‹›«»◀▶〈〉<>]/g,'').trim().replace(/\s*강의\s*일정\s*$/,'').trim();
     const m=clean.match(/^(20\d{2})\s*(?:년|[.\/-]|\s)\s*(0?[1-9]|1[0-2])\s*월?\s*\.?$/);
     return m?m[1]+'-'+m[2].padStart(2,'0'):'';
    };
    const monthNodes=all('h1,h2,h3,h4,h5,strong,span,em,p,div').filter(e=>monthOf(e));
    const dayValue=e=>{
     if(!e||!shown(e)||outside(e))return null;
     const value=text(e);if(!value)return 0;
     const m=value.match(/^(\d{1,2})(?:일)?(?:\s*\(?[월화수목금토일](?:요일)?\)?)?$/);
     return m&&+m[1]>=1&&+m[1]<=31?+m[1]:null;
    };
    const weekday=e=>{
     const t=text(e).replace(/\s/g,'').toLowerCase(),names=[['일','일요일','sun','sunday'],['월','월요일','mon','monday'],['화','화요일','tue','tuesday'],['수','수요일','wed','wednesday'],['목','목요일','thu','thursday'],['금','금요일','fri','friday'],['토','토요일','sat','saturday']];
     return names.findIndex(values=>values.includes(t));
    };
    const cellsOf=(row,width=7)=>{
     const children=Array.from(row.children).filter(shown);
     if(children.length!==width||children.some(e=>+e.getAttribute('colspan')>1||+e.getAttribute('rowspan')>1))return null;
     if(row.matches('tr')&&children.some(e=>!e.matches('td,th')))return null;
     return children;
    };
    const records=all('tr,[role="row"],div,ul,ol').slice(0,2500).flatMap(row=>{const cells=cellsOf(row);return cells?[{row,cells}]:[];});
    const recordOf=new Map(records.map(record=>[record.row,record]));
    const owners=new Map();for(const record of records){const parent=record.row.parentElement;if(!owners.has(parent))owners.set(parent,[]);owners.get(parent).push(record);}
    const withinDay=cell=>{
     const direct=dayValue(cell);if(direct!==null)return direct;
     const first=Array.from(cell.querySelectorAll('.subject')).find(e=>shown(e)&&!outside(e));
     const directText=Array.from(cell.childNodes).filter(node=>node.nodeType===3&&text(node));
     if(directText.length&&directText.every(node=>!first||!!(node.compareDocumentPosition(first)&Node.DOCUMENT_POSITION_FOLLOWING))){
      const m=directText.map(text).join(' ').match(/^(\d{1,2})(?:일)?$/);if(m&&+m[1]>=1&&+m[1]<=31)return +m[1];
     }
     const labels=Array.from(cell.querySelectorAll('time,span,em,p,div,strong,small,b,i,h1,h2,h3,h4,h5,h6')).filter(e=>shown(e)&&!outside(e)&&!e.closest('.subject')&&!e.closest('.top')&&(!first||!e.contains(first))&&!e.querySelector('.top .time')&&dayValue(e)!==null&&dayValue(e)>0&&(!first||!!(e.compareDocumentPosition(first)&Node.DOCUMENT_POSITION_FOLLOWING)));
     const smallest=labels.filter(e=>!labels.some(other=>other!==e&&e.contains(other)));
     const values=[...new Set(smallest.map(dayValue))];return values.length===1?values[0]:null;
    };
    const recognized=[];
    for(const [parent,group]of owners){
     if(group.length<5||group.length>14)continue;
     let owner=parent,month='';
     for(let n=0;owner&&owner!==document.body&&n<6;n++,owner=owner.parentElement){
      if(!shown(owner)||outside(owner)||owner.querySelectorAll('*').length>10000)break;
      const months=[...new Set(monthNodes.filter(node=>owner.contains(node)).map(monthOf))];
      if(months.length===1){month=months[0];break;}if(months.length>1)break;
     }
     if(!month||!owner||owner===document.body)continue;
     const firstMonth=new Date(month+'-01T00:00:00Z'),days=new Date(Date.UTC(firstMonth.getUTCFullYear(),firstMonth.getUTCMonth()+1,0)).getUTCDate();
     const nearbyRows=records.filter(record=>owner.contains(record.row));
     const weekdayValid=values=>values.every((value,i)=>value>=0&&value===(values[0]+i)%7);
     if(nearbyRows.some(record=>{const values=record.cells.map(weekday);return values.filter(value=>value>=0).length>=4&&!weekdayValid(values);}))continue;
     const weekdayRows=nearbyRows.filter(record=>weekdayValid(record.cells.map(weekday)));
     const starts=[...new Set(weekdayRows.map(record=>weekday(record.cells[0])))];
     if(starts.length>1)continue;
     // A complete consecutive month also disambiguates the usual Sunday and
     // Monday starts when the site renders no separate weekday heading row.
     const possibleStarts=starts.length?starts:[0,1];
     const same=group.flatMap(record=>{
      const values=record.cells.map(withinDay);return values.every(value=>value!==null)&&values.some(value=>value>0)?[{...record,values,content:record.cells}]:[];
     });
     const alternating=group.flatMap(record=>{
      if(record.cells.some(cell=>cell.querySelector('.subject')))return [];
      const values=record.cells.map(dayValue),next=recordOf.get(record.row.nextElementSibling);
      if(!values.every(value=>value!==null)||!values.some(value=>value>0)||!next||next.cells.some(cell=>dayValue(cell)>0))return [];
      return [{...record,values,content:next.cells}];
     });
     for(const weeks of [same,alternating])for(const start of possibleStarts){
      const offset=(firstMonth.getUTCDay()-start+7)%7,expectedWeeks=Math.ceil((offset+days)/7);
      if(weeks.length!==expectedWeeks)continue;
      let valid=true;
      for(let i=0;i<weeks.length*7;i++){
       const value=weeks[Math.floor(i/7)].values[i%7],day=i-offset+1,cell=weeks[Math.floor(i/7)].content[i%7];
       const expected=new Date(Date.UTC(firstMonth.getUTCFullYear(),firstMonth.getUTCMonth(),day)).getUTCDate();
       if(day>=1&&day<=days?value!==day:value!==0&&value!==expected){valid=false;break;}
       if((day<1||day>days)&&value===0&&Array.from(cell.querySelectorAll('.subject')).some(shown)){valid=false;break;}
      }
      if(!valid)continue;
      const bindings=[];
      for(let day=1;day<=days;day++){const index=offset+day-1,cell=weeks[Math.floor(index/7)].content[index%7];bindings.push({cell,date:month+'-'+String(day).padStart(2,'0')});}
      recognized.push({owner,bindings,days});
     }
    }
    // The v62 device trace has five TDs per lecture row. The full-resolution
    // screenshot confirms Monday-Friday columns, with weekends omitted. Require
    // the actual weekday header, an explicit year/month and every weekday date;
    // a month-only title must not acquire a year from the requested date or a
    // lecture's enrollment count. Legacy seven-column diagnostics stay schema 1.
    const fiveRecords=all('tr').slice(0,2500).flatMap(row=>{const cells=cellsOf(row,5);return cells?[{row,cells}]:[];});
    const fiveOwners=new Map();
    for(const record of fiveRecords){const parent=record.row.parentElement;if(!fiveOwners.has(parent))fiveOwners.set(parent,[]);fiveOwners.get(parent).push(record);}
    for(const [parent,group]of fiveOwners){
     if(group.length<4||group.length>7||!group.some(record=>record.cells.some(cell=>cell.querySelector('.subject'))))continue;
     const table=parent.closest('table');if(!table)continue;
     const headerRows=fiveRecords.filter(record=>record.row.closest('table')===table&&record.cells.some(cell=>weekday(cell)>=0));
     if(!headerRows.length||headerRows.some(record=>record.cells.some((cell,i)=>weekday(cell)!==i+1)))continue;
     let owner=parent,month='';
     for(let n=0;owner&&owner!==document.body&&n<6;n++,owner=owner.parentElement){
      if(!shown(owner)||outside(owner)||owner.querySelectorAll('*').length>10000)break;
      const months=[...new Set(monthNodes.filter(node=>owner.contains(node)).map(monthOf))];
      if(months.length===1){month=months[0];break;}if(months.length>1)break;
     }
     if(!month||!owner||owner===document.body)continue;
     const firstMonth=new Date(month+'-01T00:00:00Z'),year=firstMonth.getUTCFullYear(),monthIndex=firstMonth.getUTCMonth(),days=new Date(Date.UTC(year,monthIndex+1,0)).getUTCDate(),offset=(firstMonth.getUTCDay()+6)%7;
     const expectedWeeks=Array.from({length:Math.ceil((offset+days)/7)},(_,week)=>Array.from({length:5},(_,column)=>week*7+column-offset+1)).filter(values=>values.some(day=>day>=1&&day<=days));
     let weeks=group.filter(record=>!headerRows.includes(record));
     // The screenshot also has a trailing empty 11.2..11.6 row. Permit that
     // single extra row only when all five explicit month/day labels match
     // the next actual week and no lecture or clock can be discarded with it.
     if(weeks.length===expectedWeeks.length+1){
      const tail=weeks[weeks.length-1],nextMonday=expectedWeeks[expectedWeeks.length-1][0]+7;
      const emptyNextWeek=tail.cells.every((cell,column)=>{
       if(cell.querySelector('.subject,.top .time'))return false;
       const match=text(cell).match(/^(0?[1-9]|1[0-2])\s*[.\/]\s*(\d{1,2})\s*\.?$/),date=new Date(Date.UTC(year,monthIndex,nextMonday+column));
       return match&&+match[1]===date.getUTCMonth()+1&&+match[2]===date.getUTCDate();
      });
      if(emptyNextWeek)weeks=weeks.slice(0,-1);
     }
     if(weeks.length!==expectedWeeks.length)continue;
     const bindings=[];let valid=true;
     for(let week=0;week<weeks.length&&valid;week++)for(let column=0;column<5;column++){
      const cell=weeks[week].cells[column],value=withinDay(cell),day=expectedWeeks[week][column];
      if(day>=1&&day<=days){
       if(value!==day){valid=false;break;}
       bindings.push({cell,date:month+'-'+String(day).padStart(2,'0')});
      }else{
       const expected=new Date(Date.UTC(year,monthIndex,day)).getUTCDate();
       if(value!==0&&value!==expected||Array.from(cell.querySelectorAll('.subject')).some(shown)){valid=false;break;}
      }
     }
     if(valid)recognized.push({owner,bindings,days:bindings.length});
    }
    // Nested equivalent calendar containers are harmless; contradictory day
    // ownership is not. A seed must belong to precisely one rendered day cell.
    for(const seed of seeds){
     const matches=recognized.flatMap(calendar=>calendar.bindings.filter(binding=>binding.cell.contains(seed)));
     const dates=[...new Set(matches.map(binding=>binding.date))],cells=[...new Set(matches.map(binding=>binding.cell))];
     if(dates.length===1&&cells.length===1)calendarBindings.set(seed,matches[0]);
    }
    if(calendarBindings.size)detail.calendarDays=Math.min(400,new Set([...calendarBindings.values()].flatMap(binding=>recognized.filter(calendar=>calendar.bindings.some(item=>item.cell===binding.cell)).flatMap(calendar=>calendar.bindings.map(item=>item.date)))).size);
    // This is a bounded description of the actual rendered topology, not a
    // second recognizer. It never changes bindings, dates, events or actions.
    // Only fixed enums, counts, numeric paths and parsed calendar numbers leave
    // this block: no page text, classes, attributes, links or account values.
    try{
     const count=(value,max=4000)=>Math.min(max,Math.max(0,Number(value)||0));
     const sample=(values,max)=>values.length<=max?values:Array.from({length:max},(_,i)=>values[Math.round(i*(values.length-1)/(max-1))]);
     const tags=new Set('html body main section article div ul ol li table thead tbody tfoot tr td th a span p strong em b i h1 h2 h3 h4 h5 h6 time dl dt dd'.split(' '));
     const tag=e=>{const value=e.tagName?.toLowerCase();return tags.has(value)?value:'other';};
     const path=e=>{const parts=[];while(e&&e!==document.documentElement){const parent=e.parentElement;if(!parent)break;parts.unshift(count(Array.from(parent.children).indexOf(e)+1));e=parent;}return parts.slice(-12);};
     const shape=value=>{
      if(!value)return 'empty';
      if(/^(?:20\d{2})\s*(?:년|[.\/-]|\s)\s*(?:0?[1-9]|1[0-2])\s*월?\s*\.?$/.test(value))return 'year_month';
      if(/^20\d{2}\s*년?$/.test(value))return 'year_only';
      if(/^(?:0?[1-9]|1[0-2])\s*월(?:\s*강의\s*일정)?$/.test(value))return 'month_only';
      if(/20\d{2}\s*(?:년|[.\/-])\s*(?:0?[1-9]|1[0-2])(?:\D|$)/.test(value)||/20\d{2}\D{0,12}(?:0?[1-9]|1[0-2])\s*월/.test(value))return 'year_month_extra';
      const dayMatch=value.match(/^(\d{1,2})(?:일)?(?:\s*\(?[월화수목금토일](?:요일)?\)?)?$/);if(dayMatch&&+dayMatch[1]>=1&&+dayMatch[1]<=31)return 'day';
      if(/^(?:[일월화수목금토](?:요일)?|sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)$/i.test(value))return 'weekday';
      return 'other';
     };
     const ownText=e=>Array.from(e.childNodes).filter(node=>node.nodeType===3).map(text).filter(Boolean).join(' ');
     const day=e=>{const value=withinDay(e);return value===null?-1:value;};
     const subjects=e=>count(Array.from(e.querySelectorAll('.subject')).filter(node=>shown(node)&&!outside(node)&&!node.querySelector('.subject')).length,400);
     const times=e=>count(Array.from(e.querySelectorAll('.top .time')).filter(node=>shown(node)&&!outside(node)&&!node.closest('.subject')).length,400);
     const nearby=e=>!outside(e)&&seeds.some(seed=>e.contains(seed));
     const relevantRows=records.filter(record=>nearby(record.row)||nearby(record.row.parentElement));
     const relevantGroups=[...owners].filter(([parent])=>nearby(parent));
     const flat=all('main,section,table,tbody,tr,[role="grid"],div,ul,ol').slice(0,2500).filter(e=>nearby(e)&&[35,42].includes(Array.from(e.children).filter(shown).length));
     const groupSamples=[...flat.map(parent=>({parent,group:[],flat:true})),...relevantGroups.map(([parent,group])=>({parent,group,flat:false}))];
     const hints=all('h1,h2,h3,h4,h5,h6,strong,span,em,b,i,p,div,caption,label,a').slice(0,2500).filter(e=>shown(e)&&!outside(e)&&!e.closest('.subject,.top,input,textarea,select,button')&&!e.querySelector('.subject,.top .time,input,textarea,select,button')&&text(e).length<=90).map(e=>({node:e,shape:shape(text(e))})).filter(value=>['year_month','year_only','month_only','year_month_extra'].includes(value.shape));
     hmpTopology={schemaVersion:1,monthCandidates:count(monthNodes.length),sevenCellRows:count(records.length),parentGroups:count(owners.size),eligibleGroups:count([...owners.values()].filter(group=>group.length>=5&&group.length<=14).length),recognizedCalendars:count(recognized.length),boundSeeds:count(calendarBindings.size,400),months:[...new Set(monthNodes.map(monthOf))].filter(Boolean).slice(0,4),monthHints:sample(hints,4).map(value=>({tag:tag(value.node),path:path(value.node),shape:value.shape})),
      seeds:sample(seeds,6).map(seed=>{const ancestors=[];for(let e=seed.parentElement;e&&e!==document.body&&ancestors.length<7;e=e.parentElement){if(!shown(e)||outside(e))break;ancestors.push({tag:tag(e),children:count(e.children.length),subjects:subjects(e),times:times(e),day:day(e),textShape:shape(ownText(e))});}return {path:path(seed),ancestors};}),
      rows:sample(relevantRows,6).map(record=>({path:path(record.row),parentPath:path(record.row.parentElement),cells:record.cells.map(day),weekdays:record.cells.map(weekday),subjects:record.cells.map(subjects),times:record.cells.map(times)})),
      groups:sample(groupSamples,4).map(value=>{const children=Array.from(value.parent.children).filter(shown),cells=value.flat?children:value.group.flatMap(record=>record.cells);return {path:path(value.parent),rows:count(value.group.length),children:count(children.length),size:value.flat?children.length:7,cellValues:cells.slice(0,42).map(day)};})};
    }catch{/* Diagnostics must never affect the existing reader decision. */}
   }
   // The device's list view has a date column once per contiguous group and
   // clocks outside .top .time. The trace shows one title per direct sibling
   // row (the date column may be absent on continuation rows). Read only that
   // bounded shape; never carry a date across parents or an unrecognized row.
   const listBindings=new Map();
   if(seeds.length&&seeds.length<=400&&!Array.from(document.querySelectorAll('.top .time')).some(e=>shown(e)&&!e.closest('.subject'))){
    const fields='time,span,em,p,div,strong,small,b,i,h1,h2,h3,h4,h5,h6,a';
    const titleNodes=e=>Array.from(e.querySelectorAll('.subject')).filter(node=>shown(node)&&!outside(node)&&!node.querySelector('.subject'));
    const clockLabel=/^(?:(?:오전|오후)\s*(?:0?[1-9]|1[0-2])|(?:[01]?\d|2[0-3])):[0-5]\d(?:\s*[~～∼–—-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?$/;
    const clocks=(content,seed)=>{
     const labels=Array.from(content.querySelectorAll(fields)).filter(e=>shown(e)&&!outside(e)&&!e.closest('.subject')&&!e.contains(seed)&&clockLabel.test(text(e))&&!!(e.compareDocumentPosition(seed)&Node.DOCUMENT_POSITION_FOLLOWING));
     return labels.filter(e=>!labels.some(other=>other!==e&&e.contains(other)));
    };
    const listDate=e=>{
     if(!shown(e)||outside(e)||e.querySelector('.subject,input,textarea,select')||text(e).length>90)return '';
     const raw=text(e);if(!calendarLabel.test(raw)||raw.includes(':'))return '';
     const date=normalizeCalendarLabel(raw),day=raw.match(/\(([월화수목금토일])(?:요일)?\)\s*\.?$/);
     // Month/day headings are already resolved relative to the requested date
     // by the legacy explicit-date parser. Here also require their shown weekday
     // to agree; a bare month or an enrollment count cannot establish a date.
     if(!date||!day&&!/20\d{2}\s*(?:[.\/-]|년)/.test(raw))return '';
     if(day&&new Date(date+'T00:00:00Z').getUTCDay()!=='일월화수목금토'.indexOf(day[1]))return '';
     return date;
    };
    const parents=new Map();
    for(const seed of seeds){
     for(let row=seed.parentElement,depth=0;row&&row!==document.body&&depth<7;row=row.parentElement,depth++){
      if(!shown(row)||outside(row))break;
      const titles=titleNodes(row);if(titles.length!==1||titles[0]!==seed)break;
      const parent=row.parentElement;if(!parent||!parent.matches('div,ul,ol')||parent.children.length<2||parent.children.length>400)continue;
      if(titleNodes(parent).length<=1)continue;
      if(!row.matches('div,li,article'))break;
      if(!parents.has(parent))parents.set(parent,new Map());parents.get(parent).set(row,seed);break;
     }
    }
    for(const [parent,known]of parents){
     let date='';
     for(const row of Array.from(parent.children)){
      const seed=known.get(row),children=Array.from(row.children).filter(shown);
      if(!shown(row)||!seed||outside(row)||children.length!==row.children.length||children.length<1||children.length>2||text(row).length>1600||text(seed).length<3||text(seed).length>250||row.querySelectorAll('*').length>200){date='';continue;}
      const content=children.at(-1);
      if(!content.contains(seed)||titleNodes(content).length!==1){date='';continue;}
      if(children.length===2){
       const column=children[0];
       if(text(column)||column.querySelector('.subject,input,textarea,select'))date=listDate(column);
       if(!date)continue;
      }
      if(!date)continue;
      const times=clocks(content,seed);
      // A dated live-schedule row can offer 다시보기 after its broadcast.
      // That action neither changes its original start nor ends the sibling
      // date group. Archive regions and explicit VOD-only rows stay excluded.
      if(times.length!==1||Array.from(row.querySelectorAll('a,span,em,p,strong,small,button')).some(e=>shown(e)&&!e.closest('.subject')&&!e.children.length&&/^(?:녹화(?:방송)?|VOD|replay|on\s*demand)$/i.test(text(e)))){date='';continue;}
      const dates=dateLabels(content,seed),explicit=dates.map(e=>normalizeCalendarLabel(text(e)));
      if(explicit.some(value=>!value||value!==date)){date='';continue;}
      listBindings.set(seed,{row,dates:[],time:times[0],resolvedDate:date,groupedList:true});
     }
    }
   }
   const candidates=[];
   if(seeds.length>400)detail.boundedOut=400;
   else for(const seed of seeds){
    if(listBindings.has(seed)){candidates.push(listBindings.get(seed));continue;}
    let found=null,sawGroup=false,sawAmbiguous=false,invalidDate=false,depth=0;
    const binding=calendarBindings.get(seed);
    for(let row=seed.parentElement;row&&row!==document.body&&row!==document.documentElement&&depth<5;row=row.parentElement,depth++){
     if(binding&&!binding.cell.contains(row))break;
     if(!shown(row)||outside(row))break;
     const subjects=Array.from(row.querySelectorAll('.subject')).filter(e=>shown(e)&&!e.querySelector('.subject')),times=Array.from(row.querySelectorAll('.top .time')).filter(e=>shown(e)&&!e.closest('.subject'));
     if(subjects.length!==1||subjects[0]!==seed){detail.multipleSubjects++;sawAmbiguous=true;break;}
     if(times.length>1){detail.multipleTimes++;sawAmbiguous=true;break;}
     if(times.length!==1)continue;
     const content=text(row),title=text(seed);if(content.length>1600||title.length>250||title.length<3||row.querySelectorAll('*').length>200){detail.boundedOut++;break;}
     if(Array.from(row.querySelectorAll('a,span,em,p,strong,small,button')).some(e=>shown(e)&&!e.closest('.subject')&&!e.children.length&&/^(?:다시\s*보기|녹화(?:방송)?|VOD|replay|on\s*demand)$/i.test(text(e))))break;
     sawGroup=true;
     if(binding){
      // Status badges may be in the footer beside the title/time head. Expand
      // only while this remains one lecture inside this one validated day.
      let scope=row,scopeAmbiguous=false;
      for(let parent=row.parentElement,n=0;parent&&parent!==binding.cell&&binding.cell.contains(parent)&&n<5;parent=parent.parentElement,n++){
       if(!shown(parent)||outside(parent)||text(parent).length>1600||parent.querySelectorAll('*').length>200)break;
       const titles=Array.from(parent.querySelectorAll('.subject')).filter(e=>shown(e)&&!e.querySelector('.subject'));
       const clocks=Array.from(parent.querySelectorAll('.top .time')).filter(e=>shown(e)&&!e.closest('.subject'));
       if(titles.length!==1||titles[0]!==seed)break;
       if(clocks.length>1){detail.multipleTimes++;scopeAmbiguous=true;break;}
       if(clocks.length!==1||clocks[0]!==times[0])break;
       scope=parent;
      }
      if(scopeAmbiguous){sawAmbiguous=true;break;}
      if(Array.from(scope.querySelectorAll('a,span,em,p,strong,small,button')).some(e=>shown(e)&&!e.closest('.subject')&&!e.children.length&&/^(?:다시\s*보기|녹화(?:방송)?|VOD|replay|on\s*demand)$/i.test(text(e))))break;
      const explicit=dateLabels(scope,seed).map(e=>normalizeCalendarLabel(text(e)));
      if(explicit.some(value=>!value)){invalidDate=true;break;}
      if(explicit.some(value=>value!==binding.date)){detail.dateConflict++;sawAmbiguous=true;break;}
      found={row:scope,dates:[],time:times[0],calendarDate:binding.date};break;
     }
     const dates=dateLabels(row,seed),normalized=dates.map(e=>normalizeCalendarLabel(text(e)));
     if(normalized.some(value=>!value)){invalidDate=true;break;}
     if(new Set(normalized).size>1){detail.dateConflict++;sawAmbiguous=true;break;}
     if(dates.length){found={row,dates,time:times[0],resolvedDate:normalized[0]};break;}
    }
    if(found)candidates.push(found);
    else if(sawAmbiguous)detail.ambiguous++;
    else if(sawGroup){detail.missingDate++;if(invalidDate)detail.dateParseRejected++;else detail.noDateLabel++;}
    else if(depth>=5)detail.boundedOut++;
   }
   const disjoint=candidates.filter(candidate=>!candidates.some(other=>other!==candidate&&(candidate.row.contains(other.row)||other.row.contains(candidate.row))));
   hmpGroupedList=disjoint.length>0&&disjoint.every(candidate=>candidate.groupedList===true);
   detail.overlap=candidates.length-disjoint.length;detail.candidateRows=disjoint.length;
   detail.calendarBindings=disjoint.filter(candidate=>candidate.calendarDate).length;
   if(disjoint.length){
    hmpStructural=true;selectors=disjoint.map(candidate=>cssPath(candidate.row)).join(',');
    hmpStructuralDates=[...new Set(disjoint.flatMap(candidate=>candidate.dates.map(cssPath)))].join(',');
    hmpStructuralTimes=disjoint.map(candidate=>cssPath(candidate.time)).join(',');
    hmpCalendarDates=disjoint.filter(candidate=>candidate.calendarDate||candidate.resolvedDate).map(candidate=>({selector:cssPath(candidate.row),date:candidate.calendarDate||candidate.resolvedDate}));
   }
  }
  if(!hmpStructuralMode&&state.hmpStructuralMode===true){state.hmpStructuralMode=false;state.events=[];state.seen=[];state.coverage=false;state.signature='';}
  if(!selectors){
   const timed=all('a,article,li,tr,div').filter(e=>{
    const t=text(e);return t.length>=15&&t.length<=1400&&/(?:^|\D)(?:[01]?\d|2[0-3]):[0-5]\d/.test(t)&&
     !e.closest('header,footer,nav,[role="dialog"]')&&!e.querySelector('input[type="password"]');
   });
   let cards=timed.filter(e=>!timed.some(o=>o!==e&&e.contains(o)&&text(o).length>=15));
   // A date/time-only element is not a lecture: climb to a bounded container with title/link.
   cards=unique(cards.map(e=>{
    for(let n=0;n<4&&e&&e!==document.body;n++,e=e.parentElement){
     const t=text(e);if(t.length>1500)return null;
     const link=e.matches('a')?e:e.querySelector('a');
     const title=e.querySelector('h2,h3,h4,h5,h6,.tit,.title,[class*="subject"],[class*="title"]');
     // Medigate presenters share date/time containers with the lecture. Only an
     // explicit, unique title identifies a card; a speaker link/text cannot.
     if(profile.id==='medigate'){
      if(title&&text(title).length>3&&all('h2,h3,h4,h5,h6,.tit,.title,[class*="subject"],[class*="title"]',e).filter(x=>!x.querySelector('h2,h3,h4,h5,h6,.tit,.title,[class*="subject"],[class*="title"]')).length===1)return e;
     }else if(title&&text(title).length>3||link&&text(link).length>5&&/[가-힣A-Za-z]{2}/.test(text(link)))return e;
    }return null;
   }).filter(Boolean));
   cards=cards.filter(e=>!cards.some(o=>o!==e&&e.contains(o)));
   // The observed Medigate list uses ARTICLE rows; the separate H2 hero rotates.
   // Keep hero extraction, but normalize nested list cards to their whole article.
   if(profile.id==='medigate')cards=unique(cards.map(e=>e.closest('article')||e));
   if(cards.length>400)return fail('강의 영역이 너무 많아 구분하지 못했어요');
   selectors=cards.map(cssPath).join(',');
  }
  let rows=selectors?all(selectors):[];
  const extractionProfile={...profile,rowSelector:selectors,...(hmpStructural?{dateSelector:hmpStructuralDates,timeSelector:hmpStructuralTimes,groupSelector:'',structuralDateOnly:true,structuralCalendarDates:hmpCalendarDates}:{}),validated:true,allowNoPagination:true};
  let extracted=rows.length?readPage(extractionProfile,targetDate):{events:[],undated:0,untimed:0,matchedRows:0,coverage:false};
  if(['login','blocked','error'].includes(extracted.status))return result(extracted.status,extracted.message,true);
  if(hmpStructural){
   // Validate the whole candidate set with the existing calendar parser once;
   // only rows with a valid explicit date enter the final extraction.
   const valid=rows.filter((row,i)=>extracted.catalogRows?.[i]?.date);
   if(valid.length!==rows.length){
    hmpStructuralDetails.missingDate+=rows.length-valid.length;hmpStructuralDetails.dateParseRejected+=rows.length-valid.length;hmpStructuralDetails.candidateRows=valid.length;
    rows=valid;selectors=rows.map(cssPath).join(',');
    extracted=rows.length?readPage({...extractionProfile,rowSelector:selectors},targetDate):{events:[],catalogRows:[],undated:0,untimed:0,matchedRows:0,coverage:false};
    if(['login','blocked','error'].includes(extracted.status))return result(extracted.status,extracted.message,true);
   }
   state.coverage=false;extracted.coverage=false;
   // A first arbitrary link in the new container is not a proven lecture URL.
   for(const event of extracted.events||[])event.url='';
  }
  if(expandLists){
   // Coverage cannot require a card ON the selected date: an exhausted, fully
   // dated catalog may legitimately have a gap on that date. Only the observed
   // HMP card contract can establish exhaustion, including pages already left.
   state.hmpPageChecked=!hmpStructuralMode&&(!rows.length||extracted.catalogRows?.length===rows.length&&
    rows.every(e=>e.matches('a.head')&&text(e.querySelector('.top .date'))&&e.querySelector('.subject'))&&
    extracted.catalogRows.every(r=>r.date&&(r.date!==targetDate||r.time&&r.title))&&!extracted.undated&&!extracted.untimed);
  }
  const medigate=profile.id==='medigate',stableCards=medigate||profile.id==='hmp';
  const articleIndexes=medigate?rows.flatMap((e,i)=>e.matches('article')?[i]:[]):[];
  if(articleIndexes.length)state.listRecognized=true;
  const stableIndexes=articleIndexes.length?articleIndexes:rows.map((_,i)=>i);
  const rowIds=stableCards?rows.map((e,i)=>{const r=extracted.catalogRows?.[i];return r?[r.date,r.time,r.title].join('|'):text(e);}):rows.map(e=>(text(e)+'|'+publicUrl(e.getAttribute('href')||'')).slice(0,1600));
  if(checkedList){
   // The URL is not itself a filter. Empty form fields and list navigation
   // parameters can appear after a legitimate more action. Establish the
   // default entry explicitly, and retain that scope only for a true expansion.
   const params=[...here.searchParams],pageKey=k=>/^(?:page|pageNo|pageIndex|currentPage)$/i.test(k);
   const criteriaKey=k=>/^(?:q|query|keyword|search|search(?:Word|Text|Keyword|Value)|(?:search)?(?:Category|Specialty|Dept|Disease|Subject|Status|TypeCd))$/i.test(k);
   const textCriteria=k=>/^(?:q|query|keyword|search|search(?:Word|Text|Keyword|Value))$/i.test(k);
   const neutral=(k,v)=>!v.trim()||!textCriteria(k)&&/^(?:all|전체)$/i.test(v.trim());
   const selected=e=>e.selectedOptions?.[0]||e.querySelector('option[selected]')||e.querySelector('option');
   const allOption=e=>{const option=selected(e);return option&&/^(?:전체|모든|선택|all)(?:\s|$)/i.test(text(option));};
   const defaultFields=all('select').filter(e=>!e.disabled&&!e.closest('header,footer,nav,aside,[role="dialog"]')&&allOption(e));
   const fieldActive=e=>{
    if(e.disabled||e.closest('header,footer,nav,aside,[role="dialog"]'))return false;
    const key=e.getAttribute('name')||e.id||'';if(!criteriaKey(key))return false;
    if(e.matches('input')&&!['text','search','radio','checkbox'].includes((e.getAttribute('type')||'text').toLowerCase()))return false;
    if(e.matches('input[type="radio"],input[type="checkbox"]')&&!e.checked)return false;
    if(e.matches('select')&&allOption(e))return false;
    return !neutral(key,String(e.value||e.getAttribute('value')||''));
   };
   const active=params.some(([k,v])=>criteriaKey(k)&&!neutral(k,v)&&!defaultFields.some(e=>(e.getAttribute('name')||e.id)===k&&String(e.value??selected(e)?.getAttribute('value')??'')===v))||all('input,select').some(fieldActive);
   const duplicate=unique(params.map(([k])=>k.toLowerCase())).length!==params.length;
   const direct=!duplicate&&params.every(([k,v])=>!v.trim()||pageKey(k)&&/^[1-9]\d*$/.test(v))&&
    (state.scopeConfirmed||params.every(([k,v])=>!pageKey(k)||+v<=1));
   // Keep only a local fingerprint, never parameter values in diagnostic state.
   let key=2166136261;for(const c of here.pathname+'?'+params.map(p=>p.join('=')).sort().join('&'))key=Math.imul(key^c.charCodeAt(0),16777619)>>>0;
   const expanded=state.pending?.scopeConfirmed&&/더보기|목록 페이지/.test(state.pending.reason)&&state.seen.length>0&&
    state.seen.every(id=>rowIds.includes(id))&&rowIds.some(id=>!state.seen.includes(id));
   const returned=state.scopeResetPending;
   const remembered=state.scopeConfirmed&&state.scopeKey===key;
   state.scopeSource=active?'active_filter':duplicate?'duplicate_parameters':expanded?'continued_default_list':remembered?state.scopeSource:direct?'default_list':returned?'canonical_entry_return':'unconfirmed_parameters';
   state.scopeConfirmed=!active&&!duplicate&&!!(direct||expanded||remembered||returned);
   state.scopeKey=key;state.scopeResetPending=false;
   state.scopeControls=params.slice(0,12).map(([k,v])=>({label:/^[a-zA-Z_][a-zA-Z0-9_]{0,35}$/.test(k)?k:'other_parameter',reason:criteriaKey(k)&&!neutral(k,v)?'filter_parameter':!v.trim()?'empty_parameter':pageKey(k)?'page_parameter':'navigation_parameter'}));
   if(!hmpStructuralMode&&!state.scopeConfirmed&&!state.scopeResetAttempted){
    // One ordinary navigation clears a saved URL search. No hidden site API or
    // form submission; the next document must still pass login/loading checks.
    state.scopeResetAttempted=true;state.scopeResetPending=true;
    state.events=[];state.seen=[];state.coverage=false;state.pending=null;state.pages=0;state.expansions=0;state.scrolled=false;
    state.visited=[];state.scrolls=0;state.monthMoves=0;state.dateSet=false;state.daySelected=false;state.disabledSince=0;
    state.hmpIncompletePage=false;state.signature='';state.quietSince=now;
    return result('loading','기본 강의 목록으로 돌아가 조회 조건을 확인하는 중',false,{action:{kind:'navigate',url:entry.href},diagnostics:{site:profile.id,targetDate,stopReason:'reset_default_list',listDetails:{status:'review',reason:state.scopeSource,controls:state.scopeControls}}});
   }
  }
  const signature=(profile.id==='hmp'?[...new Set(rowIds)].sort():stableIndexes.map(i=>rowIds[i])).join('\n');
  if(signature!==state.signature){state.signature=signature;state.quietSince=now;state.scrolled=false;}
  for(const id of rowIds)if(!state.seen.includes(id))state.seen.push(id);
  for(const e of extracted.events||[]){
   e.url=e.url?publicUrl(e.url):'';
   // HMP renders the same lecture in more than one card area. Its observed .subject
   // is the title; transient/decorated card links must not create another lecture.
   e.title=String(e.title||'').replace(/\s+/g,' ').trim();
   e.id=profile.id==='hmp'?[e.date,e.time,e.title].join('|'):(e.url||e.id);
   if(profile.id==='medigate'){
    const same=x=>x.date===e.date&&x.time===e.time&&x.title===e.title;
    if(!e.url&&state.events.some(x=>same(x)&&x.url))continue;
    state.events=state.events.filter(x=>!same(x)||(x.url&&e.url&&x.url!==e.url));
   }
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
  const controls=findControls(rows);
  const diagnostics={site:profile.id,path:here.pathname,rows:rows.length,totalRows:state.seen.length,events:state.events.length,undated:extracted.undated||0,untimed:extracted.untimed||0,month:calendar?.value||'',pages:state.pages,targetDate,elapsedMs:now-state.started,expansions:state.expansions||0,searchPhase:state.events.length?'collecting_target':'seeking_target',continuation:{more:controls.more.length,pagers:controls.pagers.length,ambiguous:controls.ambiguous}};
  if(hmpStructuralDetails)diagnostics.hmpStructural=hmpStructuralDetails;
  if(extracted.hmpRegistration)diagnostics.hmpRegistration=extracted.hmpRegistration;
  if(hmpTopology)diagnostics.hmpTopology=hmpTopology;
  if(hmpStructuralMode)diagnostics.cardLayout='hmp_structural_cards';
  // Inspect only the failed, exact HMP entry. These are bounded shape/layout
  // facts, not a new selector or an authentication decision. A covering banner
  // does not itself hide DOM rows; ancestor styles and absent rows are distinct.
  if(expandLists&&!rows.length&&here.href==='https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm'){
   try{
    const bounded=(value,max)=>Number.isFinite(value)?Math.max(0,Math.min(max,Math.floor(value))):0;
    const raw=Array.from(document.querySelectorAll('a.head')).slice(0,1000),styles=new WeakMap();
    const style=e=>{if(!styles.has(e))styles.set(e,getComputedStyle(e));return styles.get(e);};
    let visibleRows=0,zeroRectRows=0,displayNoneRows=0,visibilityHiddenRows=0;
    for(const row of raw){
     if(visible(row))visibleRows++;
     if(!row.getClientRects().length)zeroRectRows++;
     let displayNone=false,visibilityHidden=false;
     for(let node=row;node;node=node.parentElement){const s=style(node);displayNone=displayNone||s.display==='none';visibilityHidden=visibilityHidden||s.visibility==='hidden'||s.visibility==='collapse';}
     if(displayNone)displayNoneRows++;if(visibilityHidden)visibilityHiddenRows++;
    }
    const count=selector=>Math.min(1000,document.querySelectorAll(selector).length),root=document.documentElement,body=document.body;
    const bodyTag=!body?'missing':body.tagName==='BODY'?'body':body.tagName==='FRAMESET'?'frameset':'other';
    const bodyChildElementCount=bounded(body?.childElementCount,1000);
    // A boolean only: never retain or export the document's raw text.
    const bodyHasRawText=!!String(body?.textContent??'').replace(/\s+/g,'');
    const bodyHidden=[root,body].filter(Boolean).some(node=>{const s=style(node);return s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse';});
    const bodyShadowPresent=!!body?.shadowRoot;
    const bodyEmpty=bodyTag==='body'&&bodyChildElementCount===0&&!bodyHasRawText&&!bodyHidden&&!bodyShadowPresent;
    // Fixed categories distinguish a script/style shell from hidden content.
    // Read at most 1000 direct children and 1000 non-script-tree nodes, without
    // retaining tag names, attributes, executable text or editable values.
    const shape={bodyDirectScriptCount:0,bodyDirectStyleCount:0,bodyDirectTemplateCount:0,bodyDirectNoscriptCount:0,bodyDirectInputCount:0,bodyHiddenChildCount:0};
    const tagCounter={SCRIPT:'bodyDirectScriptCount',STYLE:'bodyDirectStyleCount',TEMPLATE:'bodyDirectTemplateCount',NOSCRIPT:'bodyDirectNoscriptCount',INPUT:'bodyDirectInputCount'};
    let child=body?.firstElementChild,childReads=0;
    for(;child&&childReads<1000;child=child.nextElementSibling,childReads++){
     const key=tagCounter[child.tagName];if(key)shape[key]++;
     const s=style(child);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')shape.bodyHiddenChildCount++;
    }
    let node=body?.firstChild,textReads=0,bodyHasNonScriptText=false;
    while(node&&textReads<1000){
     textReads++;
     const skip=node.nodeType===1&&['SCRIPT','STYLE','TEMPLATE','NOSCRIPT'].includes(node.tagName);
     if(node.nodeType===3&&/\S/.test(String(node.nodeValue??'')))bodyHasNonScriptText=true;
     if(!skip&&node.firstChild)node=node.firstChild;
     else{while(node&&node!==body&&!node.nextSibling)node=node.parentNode;node=node&&node!==body?node.nextSibling:null;}
    }
    const mime=typeof document.contentType==='string'?document.contentType.toLowerCase():'',charset=typeof document.characterSet==='string'?document.characterSet.toLowerCase():'';
    diagnostics.pageInspection={schemaVersion:1,
     documentReadyState:['loading','interactive','complete'].includes(document.readyState)?document.readyState:'unknown',
     documentVisibility:['visible','hidden','prerender'].includes(document.visibilityState)?document.visibilityState:'unknown',
     documentMime:mime==='text/html'?'html':mime==='application/xhtml+xml'?'xhtml':mime?'other':'unknown',
     documentCharset:['utf-8','utf8'].includes(charset)?'utf8':['euc-kr','ks_c_5601-1987','windows-949'].includes(charset)?'euckr':charset?'other':'unknown',
     bodyPresent:!!body,bodyHasText:!!bodyText,bodyTag,bodyChildElementCount,bodyHasRawText,bodyHidden,bodyShadowPresent,bodyEmpty,
     ...shape,bodyChildInspectionComplete:!child,bodyHasNonScriptText,bodyTextInspectionComplete:!node,
     exactSelectorCount:raw.length,visibleRows,hiddenRows:raw.length-visibleRows,zeroRectRows,displayNoneRows,visibilityHiddenRows,
     iframeCount:count('iframe'),frameCount:count('frame'),visibleBusyCount:Array.from(document.querySelectorAll('[aria-busy="true"],[role="progressbar"],.loading,.is-loading,.spinner')).slice(0,1000).filter(visible).length,
     subjectCount:count('.subject'),dateFieldCount:count('.top .date'),timeFieldCount:count('.top .time'),
     // Use layout-viewport client dimensions only, without guessing a fallback.
     viewportWidth:bounded(root?.clientWidth,20000),viewportHeight:bounded(root?.clientHeight,20000),
     layoutWidth:bounded(root?.scrollWidth,20000),layoutHeight:bounded(root?.scrollHeight,20000)};
   }catch{/* Diagnostic inspection must not change collection behaviour. */}
  }
  if(checkedList){
   const metadata=extracted.catalogRows||[],unfiltered=!!state.scopeConfirmed;
   const busy=all('[aria-busy="true"],.loading,.is-loading,.spinner').some(e=>!e.closest('header,footer,aside'));
   const dated=metadata.filter(r=>r.date),sorted=dated.map(r=>r.date).sort();
   const target=metadata.filter(r=>r.date===targetDate);
   const cardChecked=expandLists?state.hmpPageChecked:metadata.length===rows.length&&rows.every(e=>e.matches('a.list_detail[href*="seminarDetail?"]')&&e.querySelector('.tit'))&&metadata.every(r=>r.date&&(r.date!==targetDate||r.time&&r.title))&&!extracted.undated&&!extracted.untimed;
   state.listPageChecked=cardChecked;
   const reason=!rows.length?'no_cards':!cardChecked?'card_fields_unconfirmed':state.hmpIncompletePage?'earlier_page_unconfirmed':!unfiltered?'filtered_list':busy?'list_loading':controls.more.length||controls.pagers.length||controls.ambiguous?'continuation_unconfirmed':'settling_list';
   diagnostics.untitled=extracted.untitled||0;
   diagnostics.listDetails={status:'review',reason,rows:rows.length,dated:dated.length,unknown:rows.length-dated.length,untimed:target.filter(r=>!r.time).length,untitled:target.filter(r=>!r.title).length,pages:state.pages+1,targetDate,first:sorted[0]||'',last:sorted.at(-1)||'',filtersConfirmed:unfiltered,source:state.scopeSource,controls:state.scopeControls,
    parts:metadata.flatMap((r,i)=>!r.date||r.date===targetDate&&(!r.time||!r.title)?[{count:i+1,date:r.date,reason:!r.date?'date_missing':!r.time?'time_missing':'title_missing'}]:[]).slice(0,8)};
  }
  // A small opt-in troubleshooting report: rendered lecture fragments and list controls only.
  // No whole-page HTML, credentials, cookies, storage or arbitrary input values are captured.
  diagnostics.samples=rows.slice(0,4).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',text:text(e).slice(0,1200),parts:Array.from(e.querySelectorAll('h2,h3,h4,strong,span,p,div,time')).slice(0,18).map(x=>({tag:x.tagName,classes:x.getAttribute('class')||'',text:text(x).slice(0,220)}))}));
  diagnostics.controls=unique([...all('a,button,[role="button"],input[type="button"]'),...controls.more]).filter(e=>label(e).length<60&&/더\s*보기|이전|다음|next|prev|more|^\d{1,2}$/i.test(label(e))).slice(0,30).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',label:label(e),path:cssPath(e)}));
  diagnostics.monthHeadings=months.slice(0,4).map(m=>({value:m.value,classes:m.el.getAttribute('class')||''}));
  if(profile.id==='medigate'){
   diagnostics.frames=Array.from(document.querySelectorAll('iframe[src]')).slice(0,5).map(e=>{try{const u=new URL(e.getAttribute('src'),location.href);return {origin:u.origin,path:u.pathname};}catch{return {path:''};}});
   diagnostics.candidateCounts={timed:all('p,span,time,div').filter(e=>text(e).length<100&&/\d{1,2}:\d{2}/.test(text(e))).length,images:all('main img,article img').length};
   const listDates=articleIndexes.map(i=>extracted.catalogRows?.[i]?.date||'');
   const dated=listDates.filter(Boolean),distinct=unique(dated);
   const ascending=distinct.length>1&&listDates.every((d,i)=>d&&(!i||d>=listDates[i-1]));
   const descending=distinct.length>1&&listDates.every((d,i)=>d&&(!i||d<=listDates[i-1]));
   diagnostics.dateRange={first:dated[0]||'',last:dated.at(-1)||'',dated:dated.length,order:ascending?'ascending':descending?'descending':'unknown'};
   diagnostics.stableRows=stableIndexes.length;
   diagnostics.ignoredChangingRows=rows.length-stableIndexes.length;
   // A strictly crossed boundary leaves room for all lectures on the target day,
   // including a day split across pages. Unknown or mixed order never stops early.
   diagnostics.dateBoundary=ascending&&dated.at(-1)>targetDate?'after_target_date':descending&&dated.at(-1)<targetDate?'past_target_date':'';
  }

  state.diagnostics=diagnostics;
  if(state.pending){
   const p=state.pending;
   const changed=p.month?calendar?.value!==p.month&&!!calendar&&(signature!==p.before||!rows.length):p.date?extracted.coverage&&signature!==p.before:signature!==p.before;
   if(changed){state.pending=null;state.pages++;state.quietSince=now;state.scrolled=false;}
   else if(now-p.at>patience(18000))return fail(p.reason+' 이후 목록 변화가 확인되지 않아요');
   else return result('loading',p.reason+' 응답을 기다리는 중',false,{diagnostics});
  }
  if(hmpStructuralMode){
   // One original view switch is permitted for the observed month-only calendar.
   // No month/year guessing, settings changes, or lecture actions are allowed.
   state.coverage=false;diagnostics.stopReason='current_list_only';
   if(!rows.length&&hmpListControl&&!state.hmpListViewAt){state.hmpListViewAt=now;return clickAction(hmpListControl,'한미 리스트 보기');}
   if(!rows.length&&state.hmpListViewAt){
    if(now-state.hmpListViewAt<18000)return result('loading','한미 리스트 화면이 나타나기를 기다리는 중',false,{diagnostics});
    return fail('한미 리스트 전환을 확인하지 못했어요. 사이트에서 리스트 화면을 열고 다시 조회해 주세요');
   }
   if(now-state.quietSince<4000)return result('loading','한미 PC 화면의 강의 목록을 확인하는 중',false,{diagnostics,coverage:false});
   state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
   const fieldsRead=hmpGroupedList&&rows.length>0&&hmpStructuralDetails?.subjectSeeds===rows.length&&hmpStructuralDetails.candidateRows===rows.length&&
    extracted.catalogRows?.length===rows.length&&extracted.catalogRows.every(row=>row.date&&row.time&&row.title)&&!extracted.undated&&!extracted.untimed&&!extracted.untitled;
   if(fieldsRead){diagnostics.currentListRead=true;if(diagnostics.listDetails){diagnostics.listDetails.status='read';diagnostics.listDetails.reason='current_page_fields_read';}}
   return result('review',state.events.length?`한미 PC 화면에서 선택일 강의 ${state.events.length}개 수집 · 전체 수집 검증 대기`:fieldsRead?`한미 현재 목록 ${rows.length}개 조회 · 선택일 강의 0개 · 추가 목록 미조회 · 전체 범위 미확인`:'한미 PC 화면의 날짜·내용 확인 필요 · 전체 수집 미확인',true,{coverage:false,diagnostics});
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
  if(calendar&&calendar.value===targetMonth&&!state.coverage&&!state.daySelected){
   const grids=all('table').filter(t=>{const s=text(t);return /일.*월.*화.*수.*목.*금.*토/.test(s)&&s.length<4000;});
   const days=grids.flatMap(g=>all('td a,td button',g)).filter(e=>text(e)===String(+targetDate.slice(8))&&!/detail|view|apply|request|regist|join/i.test(e.getAttribute('href')||''));
   if(days.length===1){state.daySelected=true;return clickAction(days[0],'선택한 날짜 조회',{date:targetDate});}
  }
  if(!rows.length&&!controls.more.length&&!controls.pagers.length){
   if(profile.id==='medigate'&&!state.wakeScrolled&&now-state.started>3500){state.wakeScrolled=true;return result('loading','현재 웹 심포지움의 아래 목록을 불러오는 중',false,{action:{kind:'scroll'},diagnostics});}
   if(now-state.started>patience(25000)){if(expandLists)diagnostics.stopReason=diagnostics.pageInspection?.bodyEmpty?'empty_document':'no_cards';return fail('강의 카드를 찾지 못했어요');}
   return result('loading','강의 목록을 불러오는 중',false,{diagnostics});
  }
  if(medigate&&diagnostics.dateBoundary){
   if(now-state.quietSince<2500)return result('loading',`선택일 강의 ${state.events.length}개 · 날짜 범위를 확인하는 중`,false,{diagnostics});
   diagnostics.stopReason=diagnostics.dateBoundary;
   state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
   return result('review',`선택일 강의 ${state.events.length}개 수집 · 날짜 범위 확인 후 조회 종료 · 전체 수집 검증 대기`,true,{coverage:!!state.coverage,diagnostics});
  }
  if(!state.scrolled){state.scrolls=(state.scrolls||0)+1;if(!expandLists&&state.scrolls>2)return fail('현재 목록 확인을 마쳤어요');state.scrolled=true;state.quietSince=now;return result('loading',expanding()+' · 아래 목록 확인',false,{action:{kind:'scroll'},diagnostics});}
  if(now-state.quietSince<2500)return result('loading','추가 목록을 기다리는 중',false,{diagnostics});
  const badLabel=/신청|예약|참여|설문|재생|시청|입장|북마크|로그인|로그아웃|다운로드/;
  if(expandLists&&controls.ambiguous)return fail('여러 더보기 버튼을 구분하지 못했어요');
  if(expandLists&&controls.more.length)return clickAction(controls.more[0],'다음 강의 더보기');
  const pagers=expandLists?controls.pagers:[];
  const usable=pagers.map(p=>({root:p,controls:all('a,button',p).filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!badLabel.test(label(e)))})).filter(x=>x.controls.length);
  if(usable.length>1)return fail('페이지 나눔 영역이 여러 개예요');
  if(usable.length===1){
   const {root,controls}=usable[0];
   const selected=all('[aria-current="page"],.active,.current,.on,strong',root).filter(e=>/^\d+$/.test(text(e)));
   const current=unique(selected.map(e=>+text(e)));
   if(current.length===1){
    const next=controls.filter(e=>text(e)===String(current[0]+1));
    if(next.length===1){const key=publicUrl(location.href)+'|'+current[0];if(state.visited.includes(key))return fail('같은 목록 페이지가 반복돼요');state.visited.push(key);return clickAction(next[0],'다음 목록 페이지');}
    const forward=controls.filter(e=>/다음|next|^[›»>]$/i.test(label(e)));
    if(forward.length===1&&!/disabled|disable|off/.test(forward[0].className||''))return clickAction(forward[0],'다음 목록 페이지');
   }else if(controls.some(e=>/^\d+$/.test(text(e))))return fail('현재 페이지 번호를 확정하지 못했어요');
  }
  if(now-state.quietSince<(expandLists?4000:3000))return result('loading','마지막 목록을 확인하는 중',false,{diagnostics});
  if(checkedList){
   const unfiltered=!!state.scopeConfirmed;
   const busy=all('[aria-busy="true"],.loading,.is-loading,.spinner').some(e=>!e.closest('header,footer,aside'));
   if(busy)return result('loading','강의 목록의 로딩이 끝나기를 기다리는 중',false,{diagnostics});
   if(rows.length&&state.listPageChecked&&!state.hmpIncompletePage&&unfiltered&&!state.pending&&
      !controls.more.length&&!controls.pagers.length&&!controls.ambiguous){
    state.coverage=true;diagnostics.stopReason=expandLists?'hmp_list_exhausted':'doctorville_list_exhausted';diagnostics.currentListRead=true;
    diagnostics.listDetails={...diagnostics.listDetails,status:'checked',reason:'list_exhausted',totalRows:state.seen.length};
    state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
    return result('review',`${expandLists?'한미':'닥터빌'} 현재 목록 조회 완료 · 선택일 강의 ${state.events.length}개`,true,{coverage:true,diagnostics});
   }
  }
  if(medigate)diagnostics.stopReason='stable_list';
  state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
  const problems=[];if(checkedList&&!state.scopeConfirmed)problems.push('목록 조회 조건 확인 필요');if(checkedList&&extracted.untitled)problems.push('강의 제목 확인 필요 '+extracted.untitled+'개');if(expandLists&&state.hmpIncompletePage)problems.push('이전 목록 날짜·내용 확인 필요');if(!expandLists&&(controls.more.length||controls.pagers.length)){diagnostics.stopReason='current_list_only';problems.push('추가 목록 미조회');}if(extracted.undated)problems.push('날짜 미확정 '+extracted.undated+'개');if(extracted.untimed)problems.push('시각 미확정 '+extracted.untimed+'개');if(!state.coverage)problems.push('선택일 범위 미확인');
  return result('review',`자동 조회로 선택일 강의 ${state.events.length}개 수집 · `+(problems.length?problems.join(' / '):'사이트별 전체 수집 검증 대기'),true,{coverage:!!state.coverage,diagnostics});
 }catch(e){return fail('화면을 읽는 중 오류가 발생했어요');}
});return function(profile,date,state){return catalogStep(profile,date,state,collectPage,inspectListControls);};})()