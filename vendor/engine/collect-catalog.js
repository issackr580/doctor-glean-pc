(function collectPage(profile,targetDate){
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
})