(function dailyPage(request) {
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const compact = s => clean(s).replace(/\s/g, '');
  // These caches live for one synchronous read only; later reads see fresh DOM.
  const visibilityCache=new WeakMap(),textCache=new WeakMap(),semanticCache=new WeakMap();
  const visible = e => {if(!e)return false;if(!visibilityCache.has(e))visibilityCache.set(e,e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden');return visibilityCache.get(e);};
  const all = (s, root = document) => Array.from(root.querySelectorAll(s)).filter(visible);
  const text = e => {if(!e)return '';if(!textCache.has(e))textCache.set(e,clean(e.innerText||e.textContent));return textCache.get(e);};
  const semantic = e => {if(!semanticCache.has(e))semanticCache.set(e,clean(text(e)+' '+all('img[alt]',e).map(n=>n.getAttribute('alt')).join(' ')));return semanticCache.get(e);};
  const label = e => clean(text(e) || e.getAttribute('aria-label') || e.getAttribute('title') || (e.tagName==='INPUT'&&/^(button|submit)$/i.test(e.getAttribute('type'))?e.getAttribute('value'):'') || all('img[alt]', e).map(n => n.getAttribute('alt')).join(' '));
  const hosts = {doctorville:'doctorville.co.kr',keymedi:'keymedi.com',hmp:'hmp.co.kr',intermd:'intermd.co.kr',docple:'docple-plus.com'};
  const kind = request.kind, quiz = kind === 'quiz', host = hosts[request.site];
  const doctorvilleQuiz=request.site==='doctorville'&&quiz;
  const intermdQuiz=request.site==='intermd'&&quiz;
  const hmpCapsule=request.site==='hmp'&&kind==='capsule'&&location.origin==='https://www.hmp.co.kr'&&location.pathname==='/event/attendanceRouletteMain.hm';
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const actual = dateParts.year+'-'+dateParts.month+'-'+dateParts.day;
  const diagnostics = {site:request.site,kind,date:request.date,path:location.pathname,reason:'',candidates:[]};
  const result = (status, reason, extra = {}) => ({status,reason,diagnostics:{...diagnostics,reason},...(request.phase==='execute'?{executed:false}:{}),...extra});
  if (!host || location.protocol !== 'https:' || !(location.hostname === host || location.hostname.endsWith('.'+host))) return result('unknown','outside_site');
  if (request.date !== actual) return result('unknown','day_changed');
  const [year,month,day] = request.date.split('-').map(Number);
  const body = text(document.body);
  if (/사람인지 확인|로봇이 아닙니다|Verify you are human|Checking your browser/i.test(body)) return result('unknown','human_verification');
  if (all('input[type="password"]').length || /\/(?:login|intro)(?:[/.]|$)/i.test(location.pathname)) return result('login','login_page');
  // Reviewed public Keymedi brandhall client: recommendation Link preserves
  // router bannerClickStatus, which exposes this original gift after 5 seconds.
  // Never synthesize router state, timers, stay logs, playback or reward APIs.
  if(request.site==='keymedi' && /^(?:brand1|brand2)$/.test(kind)) {
    if(location.origin!=='https://www.keymedi.com' || location.search || location.hash)return result('unknown','brand_route_required');
    const listing=location.pathname==='/brandhall',detail=/^\/brandhall\/detail\/[1-9][0-9]*$/.test(location.pathname);
    if(!listing&&!detail)return result('unknown','brand_route_required');
    const offerSelector='a[data-gtm-event-name="banner_click"][data-gtm-click-location="브랜드관 포인트 배너"]';
    const giftSelector='[class~="qojl7Nn43EgKG57VXPWIpA=="] > div > div > img, .max-set > div > div > img';
    const enabled=e=>e&&e.isConnected&&!e.disabled&&!e.hasAttribute('disabled')&&e.getAttribute('aria-disabled')!=='true'&&!e.closest('[inert],fieldset[disabled]');
    const originalGift=e=>{
      const value=e.getAttribute('src')||'';if(value.length!==11334||!value.startsWith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABk'))return false;
      let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619)>>>0;
      return hash===0x419dd1b8;
    };
    const offer=e=>{try{const u=new URL(e.getAttribute('href'),location.href);return u.origin===location.origin&&!u.search&&!u.hash&&!u.username&&!u.password&&/^\/brandhall\/detail\/[1-9][0-9]*$/.test(u.pathname);}catch{return false;}};
    const nodes=listing?all(offerSelector).filter(e=>enabled(e)&&offer(e)):all(giftSelector).filter(e=>enabled(e)&&originalGift(e));
    const lock='__doctorGleanBrandGift';
    const attempted=request.attempted===true||window[lock]===request.date+'|'+kind;
    // Only the site's scoped, visible response dialog is a receipt. An absent
    // banner, article text, totals, or a dispatched click never proves reward.
    const receipts=all('.modal-body .modal-body-text').map(e=>compact(text(e)));
    if(detail&&attempted){
      if(receipts.includes('포인트획득완료!브랜드관의다른콘텐츠도확인해보세요.'))return result('complete','brand_reward_success');
      if(receipts.includes('100포인트가적립되었습니다.내일다시만나요!'))return result('complete','brand_reward_final');
      if(receipts.includes('오늘의참여기회를모두사용하셨습니다.내일또방문해주세요'))return result('none','brand_daily_limit');
      if(receipts.includes('선착순참여가종료되었습니다.내일다시참여해주세요'))return result('none','brand_closed');
      if(receipts.includes('오류가발생하였습니다.잠시후다시시도해주세요'))return result('unknown','brand_reward_error');
    }
    if(receipts.length||all('.modal-body,[role="dialog"]').length)return result('unknown','brand_dialog_unconfirmed');
    const action={type:listing?'navigate':'claim',selector:listing?offerSelector:giftSelector,label:listing?'추천 콘텐츠 보러가기':'브랜드관 선물 받기'};
    if(request.phase==='execute'){
      if(!request.action || request.action.type!==action.type || request.action.selector!==action.selector || request.action.label!==action.label || nodes.length!==1)return result('unknown','action_changed');
      if(!listing){
        if(attempted)return result('unknown','brand_claim_unconfirmed',{executed:true});
        if(request.autoClaim!==true||request.allowClaim!==true)return result('unknown','claim_not_authorized');
        window[lock]=request.date+'|'+kind;
      }
      try{nodes[0].click();}catch{return result('unknown','brand_dispatch_uncertain',{executed:true});}
      return result('unknown',listing?'brand_recommendation_opened':'brand_claim_verifying',{executed:true});
    }
    if(attempted)return result('unknown','brand_claim_unconfirmed');
    if(nodes.length>1)return result('unknown','brand_control_ambiguous');
    if(nodes.length===1){
      if(!listing&&request.autoClaim!==true)return result('pending','brand_reward_available');
      return result('action',listing?'brand_recommendation_available':'brand_gift_available',{action});
    }
    return result('unknown',listing?'brand_recommendation_unavailable':'brand_gift_waiting');
  }
  // Docple Plus's public attendance client uses this GET for its calendar.
  // A native-authorized claim uses the site's observed attendance button;
  // the site owns its POST/authentication flow. Recheck the calendar afterward.
  // Its unauthenticated/error UI defaults to an empty calendar, so that UI is
  // not evidence of non-attendance. Only a valid current-month API result is.
  if (request.site==='docple') {
    if(kind!=='attendance' || location.origin!=='https://docple-plus.com' || location.pathname.replace(/\/$/,'')!=='/offerwall/attendance')return result('unknown','docple_attendance_page_required');
    try {
      const check=String(request.checkId||'default')+'|'+request.date;
      let state=window.__doctorGleanDocpleAttendance;
      const attempted=request.attempted || window.__doctorGleanDocpleClaimDate===request.date;
      const selector='button.gtm-attendance-checkin';
      const claimButton=()=>{
        const buttons=all(selector);
        const e=buttons.length===1?buttons[0]:null;
        return e && e.isConnected && !e.disabled && !e.hasAttribute('disabled') && !e.closest('fieldset[disabled]') && e.getAttribute('aria-disabled')!=='true' && compact(label(e))==='출석하고캐시받기'?e:null;
      };
      if(request.phase==='execute'){
        const action=request.action,e=claimButton();
        if(attempted)return result('unknown','duplicate_prevented',{executed:true});
        if(!request.autoClaim || !request.allowClaim || !action || action.type!=='claim' || action.selector!==selector || compact(action.label)!=='출석하고캐시받기')return result('unknown','claim_not_authorized');
        if(!state || state.check!==check || state.status!=='pending' || Date.now()-state.settledAt>10000 || !e)return result('unknown','action_changed');
        // Persisted native attempt already exists. Lock the page before dispatch
        // too, including if a handler throws or the execution reply is lost.
        window.__doctorGleanDocpleClaimDate=request.date;
        delete window.__doctorGleanDocpleAttendance;
        try{e.click();}catch{return result('unknown','docple_claim_dispatch_uncertain',{executed:true});}
        return result('unknown','docple_claim_verifying',{executed:true});
      }
      const cookies=String(document.cookie||'').split(';').map(s=>s.trim());
      const cookie=name=>{const c=cookies.find(s=>s.startsWith(name+'='));return c?decodeURIComponent(c.slice(name.length+1)):'';};
      const token=cookie('accessToken')||cookie('check-accessToken');
      if(!token){
        const login=all('a,button').some(e=>compact(label(e))==='로그인');
        return result(login?'login':'unknown',login?'login_required':'docple_session_unconfirmed');
      }
      if(typeof window.fetch!=='function')return result('unknown','reader_unavailable');
      if(!state || state.check!==check){
        state={check,status:'unknown',reason:'docple_calendar_loading',reads:0,loading:false,settledAt:0};
        window.__doctorGleanDocpleAttendance=state;
      }
      if(!state.reads || attempted && !state.loading && state.status!=='complete' && state.status!=='login' && state.reads<12 && Date.now()-state.settledAt>=1500){
        state.loading=true;state.reads++;
        const api='https://docple-plus.com/api/season2/mission/attendance/calendar';
        const controller=new AbortController();let done=false;
        const settle=(status,reason)=>{if(done)return;done=true;clearTimeout(timer);state.status=status;state.reason=reason;state.loading=false;state.settledAt=Date.now();};
        const timer=setTimeout(()=>{settle('unknown','docple_calendar_timeout');controller.abort();},8000);
        Promise.resolve().then(()=>window.fetch(api,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:controller.signal})).then(async response=>{
          if(response.redirected || response.url && response.url!==api){settle('unknown','docple_calendar_redirect');return;}
          if(response.status===401){settle('login','session_unauthorized');return;}
          if(response.status===403){settle('unknown','docple_access_restricted');return;}
          if(!response.ok){settle('unknown','docple_calendar_http_error');return;}
          const data=(await response.json())?.data;
          const monthKey=request.date.slice(0,7),days=data?.attendedDates;
          const validDate=d=>typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d.slice(0,7)===monthKey && d<=request.date && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d;
          if(!data || data.yearMonth!==monthKey.replace('-','') || !Array.isArray(days) || days.length>31 || !days.every(validDate) || new Set(days).size!==days.length){settle('unknown','docple_calendar_unrecognized');return;}
          settle(days.includes(request.date)?'complete':'pending','docple_current_month_calendar');
        }).catch(()=>settle('unknown','docple_calendar_request_failed'));
      }
      // Neither credentials, member data nor historical dates leave the page.
      if(state.status==='pending'){
        if(attempted)return result('unknown','docple_claim_unconfirmed');
        if(request.autoClaim){
          if(!claimButton())return result('unknown','docple_claim_button_unavailable');
          return result('action','docple_attendance_available',{action:{type:'claim',selector,label:'출석하고 캐시 받기'}});
        }
      }
      return result(state.status,state.reason);
    }catch{return result('unknown','docple_inspection_error');}
  }
  const visibleControls = all('a,button,[role="button"],input[type="button"],input[type="submit"]');
  const controls = visibleControls.filter(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true');
  const topic = quiz ? /퀴즈|quiz/i : kind === 'capsule' ? /캡슐|capsule/i : /출석|attend/i;
  const topicText = quiz ? /퀴즈/ : kind === 'capsule' ? /캡슐/ : /출석/;
  // Disabled completion buttons are evidence, even though they cannot be actions.
  const evidenceNodes = all('h1,h2,h3,h4,h5,strong,p,span,div,section,article,td,li,button,input[type="button"],input[type="submit"],img[alt]');
  const names = controls.map(e => ({e,l:label(e)})).filter(x => x.l.length < 100 && topicText.test(x.l));
  diagnostics.candidates = names.slice(0,12).map(x => ({tag:x.e.tagName,classes:String(x.e.className || '').slice(0,100),label:x.l}));
  const scopes = new Set();
  for (const e of evidenceNodes) {
    const s = label(e), metadata = String(e.className || '')+' '+e.id;
    if ((topic.test(metadata) || topicText.test(s) && s.length < 70) && !e.closest('header,nav,footer')) {
      let n = e;
      for (let i=0; n && n !== document.body && i<5; i++,n=n.parentElement) {
        if (text(n).length > 14000) break;
        scopes.add(n);
      }
    }
  }
  // The complete page may be a dedicated calendar, but a header menu is never one.
  if (topic.test(location.pathname) && !/login|intro/i.test(location.pathname)) scopes.add(document.querySelector('main') || document.body);
  const fullDate = s => {
    const m = clean(s).match(/(20\d{2})\s*[年년./-]\s*(\d{1,2})\s*[月월./-]\s*(\d{1,2})(?:\s*[日일])?/);
    return m ? [+m[1],+m[2],+m[3]] : null;
  };
  const isToday = s => {const v=fullDate(s);return v && v[0]===year && v[1]===month && v[2]===day;};
  const monthCorrect = root => {
    const candidates=all('h1,h2,h3,h4,strong,caption,[class*="month"],[class*="title"],[class*="year"],[class*="head"]',root).map(text).filter(s=>s.length<100);
    // The benefit calendar's month may be plain text, without a semantic heading.
    candidates.push(...all('div,p,span',root).map(text).filter(s=>/^20\d{2}\s*[년./-]\s*\d{1,2}\s*월?$/.test(s)));
    candidates.push(text(root).slice(0,180));
    const dated=candidates.map(s=>s.match(/(20\d{2})\s*[年년./-]\s*(\d{1,2})(?:\s*월)?/)).filter(Boolean);
    if (dated.length) return dated.every(m=>+m[1]===year && +m[2]===month);
    // Current year must also be present in this task area, so an old calendar is not today.
    const monthMatches=candidates.some(s=>new RegExp('(?:^|\\D)0?'+month+'\\s*월').test(s));
    const datedButton=visibleControls.some(e=>root.contains(e)&&new RegExp('^0?'+month+'월\\s*0?'+day+'일\\s*출석').test(label(e)));
    return monthMatches && (new RegExp('(?:^|\\D)'+year+'(?:\\D|$)').test(text(root)) || request.site==='doctorville'&&!quiz&&datedButton);
  };
  const todayCells = new Set();
  for (const root of scopes) {
    for (const cell of all('td,li,article,[data-date],[data-day],[class*="day"],[class*="cell"]',root)) {
      const attr = cell.getAttribute('data-date') || cell.getAttribute('datetime') || '';
      if (isToday(attr)) {todayCells.add(cell);continue;}
      if (attr && fullDate(attr)) continue;
      if(isToday(text(cell).slice(0,65)) && text(cell).length<1000){todayCells.add(cell);continue;}
      const leafs = Array.from(cell.children).filter(visible);
      const hasDay = leafs.some(e=>new RegExp('^0?'+day+'(?:일)?$').test(compact(text(e)))) || new RegExp('^0?'+day+'(?:일)?(?:\\s|$)').test(text(cell));
      // A quiz result can be drawn entirely by CSS on an otherwise day-only
      // calendar cell. Keep the cell, but not its inner day-number span.
      const calendarCell=doctorvilleQuiz && (cell.matches('td,li,[role="gridcell"]'));
      if (hasDay && (calendarCell || !new RegExp('^0?'+day+'(?:일)?$').test(compact(semantic(cell)))) && monthCorrect(root)) todayCells.add(cell);
    }
  }
  // Nested date containers may repeat the same card. Count the most specific meaningful one.
  for(const cell of [...todayCells])if([...todayCells].some(other=>other!==cell&&cell.contains(other)))todayCells.delete(cell);
  diagnostics.todayCells = todayCells.size;
  const submitted = /이미\s*정답을?\s*제출(?:하셨|했|하였)|정답을?\s*이미\s*제출(?:하셨|했|하였)/;
  const completion = quiz ? request.site === 'doctorville' ? /성공|정답(?:입니다|이에요)|퀴즈\s*(?:완료|성공)/ : /참여\s*완료|응모\s*완료|이미\s*(?:참여|응모)|퀴즈\s*완료/ : kind === 'capsule' ? /(?:캡슐.*(?:받았|받기\s*완료|수령\s*완료|지급\s*완료))|(?:이미|오늘).*(?:받았|수령했)/ : /출석\s*(?:체크\s*)?(?:이|가)?\s*(?:완료|성공|했)|이미\s*출석|출석이\s*(?:완료|확인)/;
  const completed = s => completion.test(s)&&!/실패|오류|완료되지|완료\s*후|지급되지|수령되지|받지\s*못/.test(s);
  const quizVisuals=[];
  if(doctorvilleQuiz){
    const exactStatus=s=>/^(?:성공|퀴즈\s*성공|정답|참여\s*완료|퀴즈\s*완료)[!！.]?$/.test(clean(s))?'complete':/^(?:실패|오답|퀴즈\s*실패)[!！.]?$/.test(clean(s))?'failed':'';
    const cssContent=s=>clean(String(s||'').replace(/\\([0-9a-f]{1,6})\s?/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16))).replace(/^["']|["']$/g,''));
    for(const cell of todayCells){
      const signals=[],markerClasses=[],add=(status,source)=>{if(status&&!signals.some(x=>x.status===status&&x.source===source))signals.push({status,source});};
      let imageBadge=false;
      const nodes=[cell,...all('span,em,b,i,strong,div,img,svg,[role="img"]',cell)].slice(0,64);
      // The observed Doctorville success stamp uses a shared sprite, with no
      // readable text or success filename. Require both markers in the same
      // already date-validated calendar cell; a generic clear icon is not proof.
      if(cell.matches('td.pass') && cell.closest('table')){
        const stamp=nodes.some(node=>{
          if(node===cell || !node.matches('.ico_comm3.ico_clear') || node.closest('td')!==cell)return false;
          for(let e=node;e;e=e.parentElement){
            let style;try{style=getComputedStyle(e);}catch{return false;}
            if(!visible(e)||!style||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;
          }
          return true;
        });
        if(stamp)add('complete','doctorville_pass_stamp');
      }
      for(const node of nodes){
        for(const attr of ['aria-label','title','alt'])add(exactStatus(node.getAttribute(attr)),attr);
        const classes=String(node.className?.baseVal??node.className??'');
        if(classes&&markerClasses.length<8&&!markerClasses.includes(classes))markerClasses.push(classes.slice(0,120));
        if(/(?:^|[\s_-])(?:success|succeeded|quiz[_-]?(?:complete|correct))(?:$|[\s_-])/i.test(classes))add('complete','status_class');
        if(/(?:^|[\s_-])(?:fail|failed|failure|quiz[_-]?(?:wrong|incorrect))(?:$|[\s_-])/i.test(classes))add('failed','status_class');
        for(const pseudo of [null,'::before','::after']){
          let style;try{style=getComputedStyle(node,pseudo);}catch{continue;}
          if(!style||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')continue;
          if(pseudo){const raw=String(style.content||'');if(!raw||raw==='none'||raw==='normal')continue;add(exactStatus(cssContent(raw)),pseudo);}
          const background=String(style.backgroundImage||'');
          if(background.includes('url(')){
            imageBadge=true;
            const filename=background.split(/[?#]/)[0].split('/').pop();
            if(/(?:^|[_-])(?:success|quiz[_-]?(?:complete|correct))(?:[_.-]|$)/i.test(filename))add('complete','status_image');
            if(/(?:^|[_-])(?:fail|failed|failure|quiz[_-]?(?:wrong|incorrect))(?:[_.-]|$)/i.test(filename))add('failed','status_image');
          }
        }
        if(node.tagName==='IMG'){
          imageBadge=true;let filename='';try{filename=new URL(node.getAttribute('src')||'',location.href).pathname.split('/').pop();}catch{}
          if(/(?:^|[_-])(?:success|quiz[_-]?(?:complete|correct))(?:[_.-]|$)/i.test(filename))add('complete','status_image');
          if(/(?:^|[_-])(?:fail|failed|failure|quiz[_-]?(?:wrong|incorrect))(?:[_.-]|$)/i.test(filename))add('failed','status_image');
        }
      }
      quizVisuals.push({cell,signals,markerClasses,imageBadge,calendar:cell.matches('td,li,[role="gridcell"]')||!!cell.closest('table,[role="grid"]')});
    }
    // Only today's cell structure and recognized status signals are retained.
    // Never include account text, full HTML, image URLs or quiz answers.
    diagnostics.quizToday=quizVisuals.slice(0,4).map(x=>({tag:x.cell.tagName,classes:String(x.cell.className||'').slice(0,120),calendar:x.calendar,signals:x.signals,markerClasses:x.markerClasses,imageBadge:x.imageBadge}));
    const statuses=new Set(quizVisuals.flatMap(x=>x.signals.map(s=>s.status)));
    if(statuses.size>1)return result('unknown','conflicting_today_quiz_status');
    if(statuses.has('complete'))return result('complete','today_quiz_visual');
    if(statuses.has('failed'))return result('failed','today_quiz_visual');
  }
  const keymediAttendance = request.site==='keymedi' && kind==='attendance' && /^\/mypage\/attendance\/?$/.test(location.pathname);
  // Keymedi initially renders "출석완료" with a zero total while data loads.
  // Require a loaded nonzero total as well; a +1 calendar label is not a stamp.
  const keymediTotalLoaded=keymediAttendance && all('div,p,span').some(e=>text(e).length<80 && /^(?:이번달총출석수[1-9]\d*일|출석[1-9]\d*\/\d+)$/.test(compact(text(e))));
  if(keymediTotalLoaded && visibleControls.some(e=>compact(label(e))==='출석완료' && Array.from(scopes).some(root=>root.contains(e)&&monthCorrect(root))))return result('complete','keymedi_attendance_button');
  if(keymediAttendance && request.confirmationAttempted && all('.modal-body-text,.modal-body,[role="alert"]').some(e=>/^출석체크가 완료되었습니다\./.test(text(e)) && !/실패|오류/.test(text(e))))return result('complete','keymedi_attendance_receipt');
  // Look outward from the status, stopping at the nearest explicit date. In-page
  // InterMD dialogs stay on home.do; their monthly history is not today's result.
  const datedContext = node => {
    for(let e=node;e&&e!==document.body;e=e.parentElement){
      const attr=e.getAttribute('data-date')||e.getAttribute('datetime')||'';
      if(fullDate(attr))return !!isToday(attr);
      if(intermdQuiz&&e.matches('td,[role="gridcell"]')&&e.closest('table,[role="grid"]'))return todayCells.has(e);
      let s=text(e);if(s.length>6000)break;
      if(hmpCapsule){
        // The dedicated capsule page wraps today's receipt in a long-running
        // campaign (e.g. 2023.08.28 ~ 2099.12.31). That start date is not the
        // receipt's date. Ignore only valid periods containing today's request;
        // an explicit nearby receipt date/attribute still takes precedence.
        let invalidPeriod=false;
        const dateKey=(y,m,d)=>{const key=y+'-'+String(+m).padStart(2,'0')+'-'+String(+d).padStart(2,'0'),value=new Date(key+'T00:00:00Z');return Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===key?key:'';};
        s=s.replace(/(?<!\d)(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})(?:\s*일)?\s*[~～∼–—]\s*(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})(?:\s*일)?(?!\d)/g,(_,sy,sm,sd,ey,em,ed)=>{
          const start=dateKey(sy,sm,sd),end=dateKey(ey,em,ed);
          if(!start||!end||start>request.date||end<request.date)invalidPeriod=true;
          return ' ';
        });
        if(invalidPeriod)return false;
      }
      const d=fullDate(s);if(d)return d[0]===year&&d[1]===month&&d[2]===day;
    }
    return null;
  };
  // The dedicated attendance page labels its completed button with month/day,
  // not a year or "today". Match that whole visible receipt and its calendar
  // context; enrollment totals, historical dates and prose are not receipts.
  if(request.site==='doctorville'&&kind==='attendance'&&location.origin==='https://www.doctorville.co.kr'&&location.pathname==='/event/attend'){
    const receipt=new RegExp('^0?'+month+'월0?'+day+'일출석(?:체크)?완료$');
    if(visibleControls.some(e=>e.tagName==='BUTTON'&&receipt.test(compact(label(e)))&&datedContext(e)!==false&&Array.from(scopes).some(root=>root.contains(e)&&root.querySelector('table')&&monthCorrect(root))))return result('complete','doctorville_attendance_button');
  }
  let intermdHolidaySchedule=false,intermdBeforeOpen=false,intermdCurrentResult=false;
  if(intermdQuiz){
    const notices=evidenceNodes.filter(e=>text(e).length<180&&submitted.test(text(e)));
    if(notices.some(e=>datedContext(e)===true))return result('complete','today_quiz_submitted');
    if(notices.length)return result('unknown','quiz_date_unconfirmed');
    const inQuizArea=e=>Array.from(scopes).some(root=>root.contains(e)&&/오늘의?\s*퀴즈|이달의\s*퀴즈/.test(text(root)));
    // A real current question takes precedence over a holiday notice or an
    // empty participation-history cell. Never select or submit an answer.
    const currentQuestion=all('input[type="radio"],input[type="checkbox"]').some(e=>datedContext(e)===true&&inQuizArea(e));
    const currentPlay=controls.some(e=>/^(?:(?:오늘의?|이달의)\s*)?퀴즈\s*(?:풀기|참여하기|참여)$/.test(label(e))&&inQuizArea(e)&&(datedContext(e)===true||Array.from(todayCells).some(cell=>cell.contains(e))));
    if(currentQuestion||currentPlay)return result('pending',currentQuestion?'today_quiz_question':'today_quiz_available');
    // Same verified 2026 dates as the webinar reader. The date is a guard for
    // a visible non-operating notice, never evidence of absence by itself.
    const weekday=new Date(request.date+'T00:00:00Z').getUTCDay();
    const holiday=['2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-05','2026-10-09','2026-12-25'].includes(request.date);
    const weekend=weekday===0||weekday===6;
    intermdBeforeOpen=!weekend&&!holiday&&Number(dateParts.hour)<8;
    const cancellation=s=>/취소(?:되었|됐|하였|했|합니다|입니다)|퀴즈(?:는|가)?\s*취소[.!]?$/.test(s);
    const noQuiz=s=>/퀴즈/.test(s)&&(/(?:없습니다|없어요|없음|미운영|쉬는\s*날|(?:진행|운영|제공)(?:\s*(?:을|이))?\s*(?:하지|되지)\s*않)/.test(s)||cancellation(s))&&!/참여|응모|정답|내역|이력|현황|오류|실패|로딩|불러오|연결|접속|권한|인증|로그인|회원|제한/.test(s);
    // The dialog title is not part of its notice: joining "오늘의 퀴즈"
    // to a permanent holiday policy must not turn that policy into today's news.
    const noticeStatement=e=>{
      let s=semantic(e);
      for(const heading of all('h1,h2,h3,h4,h5,strong,span',e))if(/^오늘의?\s*퀴즈$/.test(text(heading)))s=s.replace(text(heading),'');
      return clean(s);
    };
    const directTodayHoliday=s=>/(?:오늘|금일)(?:은|에는)?\s*(?:공휴일|휴일|주말)(?:이라|이므로|이어서|이기\s*때문에)/.test(s);
    const oldDateAttribute=node=>{
      for(let e=node;e&&e!==document.body;e=e.parentElement){
        const d=e.getAttribute('data-date')||e.getAttribute('datetime')||'';
        if(fullDate(d))return !isToday(d);
      }
      return false;
    };
    const currentNotices=evidenceNodes.filter(e=>{
      const s=semantic(e);
      const context=datedContext(e),statement=noticeStatement(e);
      const explicitToday=/(?:오늘|금일)(?:은|의|에는)?\s*(?:(?:진행하는|등록된|제공되는)\s*)?퀴즈/.test(statement);
      const quizArea=inQuizArea(e)||explicitToday&&Array.from(scopes).some(root=>root.contains(e));
      return s.length<180&&!e.closest('header,nav,footer')&&quizArea&&(context===true||context===null&&explicitToday)&&!oldDateAttribute(e)&&noQuiz(s)&&!Array.from(e.children).filter(visible).some(child=>noQuiz(semantic(child)));
    });
    const cancelled=currentNotices.some(e=>{
      const s=noticeStatement(e);
      return datedContext(e)===true&&(isToday(s)||/(?:오늘|금일)(?:은|의|에는)?\s*퀴즈/.test(s)||directTodayHoliday(s))&&(cancellation(s)||/미운영|(?:진행|운영|제공)(?:\s*을)?\s*하지\s*않/.test(s))&&(!/주말|공휴일|휴일/.test(s)||directTodayHoliday(s));
    });
    // A policy such as "주말·공휴일에는 퀴즈를 제공하지 않습니다" also
    // appears on working days; then it says nothing about today's availability.
    const absent=currentNotices.some(e=>{
      const s=noticeStatement(e);
      if(!/주말|공휴일|휴일/.test(s)||directTodayHoliday(s))return true;
      if(/주말/.test(s)&&weekend)return true;
      if(/공휴일/.test(s)&&holiday)return true;
      return !/주말|공휴일/.test(s)&&/휴일/.test(s)&&holiday;
    });
    const hasResult=Array.from(todayCells).some(cell=>completed(semantic(cell))||/실패|오답|미참여|참여하기|퀴즈\s*풀기/.test(semantic(cell)));
    intermdCurrentResult=hasResult;
    if(cancelled&&!hasResult)return result('none','intermd_quiz_cancelled_today');
    if(absent&&!hasResult&&!intermdBeforeOpen)return result('none',currentNotices.some(e=>/주말|공휴일|휴일/.test(semantic(e)))?'intermd_holiday_quiz_notice':'intermd_dated_quiz_empty');
    // The user's public-holiday operating rule is separate from confirmed
    // absence. Apply it only to an actually loaded current quiz/history area;
    // an empty history cell alone cannot prove that no quiz exists.
    if(holiday&&!hasResult&&location.origin==='https://www.intermd.co.kr'&&location.pathname==='/home.do'){
      for(const root of scopes){
        if(root===document.body||root.closest('header,nav,footer')||text(root).length>6000||datedContext(root)!==true)continue;
        if(!all('h1,h2,h3,h4,strong',root).some(e=>/^오늘의?\s*퀴즈$/.test(text(e)))||!/이달의\s*퀴즈\s*참여현황/.test(text(root)))continue;
        if(/로딩|불러오|오류|실패|연결|접속|잠시\s*기다/.test(text(root)))continue;
        for(const table of all('table',root)){
          let monthKnown=false;
          for(let area=table;area&&root.contains(area);area=area.parentElement){
            const labels=all('caption,h1,h2,h3,h4,[class*="month"],p,div,span',area).map(text).filter(s=>s.length<70&&!fullDate(s)&&/^(?:20\d{2}\s*[년./-]\s*\d{1,2}\s*월?|20\d{2}\s*[년./-]\s*\d{1,2}\s*월?\s*이달의\s*퀴즈\s*참여현황)$/.test(s));
            if(labels.length){monthKnown=labels.every(s=>{const m=s.match(/(20\d{2})\s*[년./-]\s*(\d{1,2})/);return +m[1]===year&&+m[2]===month;});break;}
          }
          if(!monthKnown)continue;
          const cells=all('td',table).filter(e=>e.closest('table')===table);
          const cellDay=e=>{const m=text(e).match(/^(\d{1,2})(?:일)?(?=\D|$)/);return m?+m[1]:0;};
          const days=new Set(cells.map(cellDay).filter(n=>n>0&&n<=31));
          const current=cells.filter(e=>cellDay(e)===day);
          const loaded=cells.some(e=>cellDay(e)>0&&cellDay(e)<day&&completed(semantic(e)));
          if(days.size>=7&&current.length===1&&loaded&&/^(?:공휴일|휴일|휴무|쉬는\s*날|미운영)?$/.test(semantic(current[0]).replace(new RegExp('^0?'+day+'(?:일)?\\s*'),'').trim()))intermdHolidaySchedule=true;
        }
      }
    }
  }
  if(quiz && request.site==='intermd' && todayCells.size>1){
    const rows=[...todayCells].map(semantic),done=rows.filter(completed).length;
    diagnostics.quizCount=rows.length;diagnostics.completedCount=done;
    if(done===rows.length)return result('complete','today_quiz_cards');
    if(rows.some(s=>/미참여|참여하기|퀴즈\s*풀기/.test(s)))return result('pending','today_quiz_cards');
    return result('unknown','mixed_quiz_status');
  }
  for (const cell of todayCells) {
    const s = semantic(cell);
    if (completed(s)) return result('complete','today_cell');
    if (quiz && /실패|오답/.test(s) && !(doctorvilleQuiz&&/불러오|로딩|접속|연결|오류/.test(s))) return result('failed','today_cell');
    // Doctorville's supplied attendance calendar shows the earned 100-point stamp.
    if (!quiz && request.site === 'doctorville' && all('span,strong,em,b,i,img[alt]',cell).some(e=>/^100(?:P|포인트)?$/.test(compact(e.tagName==='IMG'?e.getAttribute('alt'):text(e))))) return result('complete','today_point_stamp');
    if (quiz && !doctorvilleQuiz && !intermdQuiz && /퀴즈\s*(?:없음|없는 날)|미운영|쉬는 날/.test(s)) return result('none','explicit_empty_today');
  }
  // Status text must explicitly refer to today; historical success and marketing copy do not qualify.
  for (const root of scopes) {
    for (const node of [root,...all('p,span,strong,button,[role="alert"],img[alt]',root)]) {
      const s = node.tagName==='INPUT'?label(node):semantic(node);if(s.length>180||datedContext(node)===false)continue;
      // Do not join today's heading to a success stamp in another calendar cell
      // or to an older entry further down a dialog's monthly history.
      if(Array.from(node.children).filter(visible).some(child=>completion.test(semantic(child))||/퀴즈.*(?:없습니다|없어요|없음|미운영|(?:진행|운영|제공)(?:\s*(?:을|이))?\s*(?:하지|되지)\s*않)/.test(semantic(child))))continue;
      if ((isToday(s) || /오늘|금일|이미/.test(s)) && completed(s)) return result('complete','today_status');
      if (quiz && !doctorvilleQuiz && !intermdQuiz && /(?:오늘|금일).*(?:퀴즈).*(?:없습니다|없어요|없음|미운영|진행하지 않)/.test(s)) return result('none','explicit_empty_today');
    }
  }
  if(doctorvilleQuiz){
    // Absence needs a readable statement about today's quiz. Neither an empty
    // calendar nor an ordinary holiday label says whether a quiz was provided.
    const noQuiz=s=>{
      const v=compact(s).replace(/[.!！。]+$/,'').replace(/^(오늘|금일)(?:은|에는)?(?:공휴일|휴일)(?:이라|이므로|이어서|이기때문에)/,'$1');
      return v.length<120&&!/참여한|참여내역|참여현황|정답|오류|실패|불러오|로딩|권한|로그인|인증|회원|접속|연결|주말|공휴일/.test(v)&&/^(?:(?:오늘|금일)(?:은|의|에는)?)?(?:(?:진행하는|진행중인|등록된|제공되는))?퀴즈(?:가|는|를)?(?:없습니다|없어요|없음|없는날(?:입니다|이에요)?|미운영(?:입니다)?|쉬는날(?:입니다|이에요)?|(?:진행|운영|제공)(?:하지|되지)않(?:습니다|아요))$/.test(v);
    };
    const dateContext=node=>{
      for(let e=node;e&&e!==document.body;e=e.parentElement){
        const attr=e.getAttribute('data-date')||e.getAttribute('datetime')||'';
        if(fullDate(attr))return !!isToday(attr);
        if(e.matches('td,[role="gridcell"]')&&e.closest('table,[role="grid"]'))return todayCells.has(e);
        const s=text(e);if(s.length>6000)break;
        if(fullDate(s))return !!isToday(s);
      }
      return null;
    };
    const shown=node=>{
      for(let e=node;e;e=e.parentElement){const style=getComputedStyle(e);if(!visible(e)||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;}
      return true;
    };
    const insideTodayCell=e=>Array.from(todayCells).some(cell=>cell.contains(e));
    const notices=[...new Set([...evidenceNodes,...all('b,em,i,img[alt],[title],[aria-label]')])].filter(e=>{
      if(e.closest('header,nav,footer')||!shown(e))return false;
      const context=dateContext(e);if(context===false)return false;
      const cellLabel=todayCells.has(e)&&e.matches('td,[role="gridcell"]')?text(e).replace(new RegExp('^0?'+day+'(?:일)?\\s*'),''):text(e);
      const labels=[cellLabel,e.getAttribute('alt'),e.getAttribute('title'),e.getAttribute('aria-label')].filter(Boolean);
      const absent=labels.some(s=>noQuiz(s)&&(context===true||/^(?:오늘|금일)/.test(clean(s))))||insideTodayCell(e)&&labels.some(s=>/^(?:미운영|쉬는\s*날)$/.test(clean(s)));
      // textContent in some WebViews/test DOMs includes hidden descendants;
      // those labels cannot be borrowed by a visible parent calendar cell.
      return absent&&!Array.from(e.querySelectorAll('*')).some(n=>!shown(n)&&(text(n)||n.getAttribute('alt')||n.getAttribute('title')||n.getAttribute('aria-label')));
    });
    if(notices.length){
      const question=all('input[type="radio"],input[type="checkbox"]').some(e=>dateContext(e)===true&&Array.from(scopes).some(root=>root.contains(e)&&/퀴즈/.test(text(root))));
      const playable=controls.some(e=>/^(?:오늘의?\s*)?퀴즈\s*(?:풀기|참여하기)$/.test(label(e))&&dateContext(e)===true);
      const anotherQuiz=quizVisuals.some(x=>x.calendar&&!x.imageBadge&&!notices.some(e=>x.cell===e||x.cell.contains(e))&&semantic(x.cell).replace(new RegExp('^0?'+day+'(?:일)?'),'').trim()&&!/준비|예정|마감|종료|로딩|불러오/.test(semantic(x.cell)));
      if(question||playable||anotherQuiz)return result('pending',question?'today_quiz_question':playable?'today_quiz_available':'today_quiz_calendar');
      return result('none','doctorville_explicit_empty_today');
    }
  }
  const pathOf = e => {
    const parts=[];while(e && e!==document.documentElement){const tag=e.tagName.toLowerCase();const siblings=Array.from(e.parentElement.children).filter(n=>n.tagName===e.tagName);parts.unshift(tag+':nth-of-type('+(siblings.indexOf(e)+1)+')');e=e.parentElement;}return 'html > '+parts.join(' > ');
  };
  const proposal = (e,type) => ({type,selector:pathOf(e),label:label(e)});
  const inScope = e => Array.from(scopes).some(root=>root.contains(e));
  const todayContext = e => {
    const s=label(e);if(fullDate(s))return !!isToday(s);if(/오늘|금일/.test(s))return true;
    const md=s.match(/(\d{1,2})월\s*(\d{1,2})일/);if(md)return +md[1]===month&&+md[2]===day;
    return Array.from(todayCells).some(cell=>cell.contains(e)) || inScope(e) && todayCells.size>0;
  };
  const claims = names.filter(({e,l})=>{
    const s=compact(l).replace(/[✓✔☑!！]/g,'');
    const match=kind==='capsule'?/^(?:(?:오늘|금일)의?)?캡슐(?:받기|받아가기)$/.test(s):/^(?:(?:\d{1,2}월\d{1,2}일|오늘|금일)의?)?출석(?:체크)?하기$/.test(s);
    // Keymedi's claim is above the benefit calendar. Its +1 labels and blue
    // current-day circle are not earned attendance stamps.
    const keymediDaily=request.site==='keymedi'&&/^\/mypage\/attendance\/?$/.test(location.pathname)&&Array.from(scopes).some(root=>root.contains(e)&&monthCorrect(root));
    return match && (todayContext(e) || keymediDaily || kind==='capsule' && inScope(e) && /매일|오늘|출석/.test(text(e.parentElement)));
  });
  let next;
  // Keymedi's observed attendance popup is a second step: the first click only
  // opens it. This exact button calls the site's attendance handler and opens
  // its recommended content. Do not treat general mission/ad buttons as claims.
  if(keymediAttendance){
    const popups=all('.modal.modal_mission').filter(e=>all('h5',e).some(h=>compact(text(h))==='오늘의추천콘텐츠'));
    const confirmations=controls.filter(e=>popups.some(p=>p.contains(e)) && e.matches('.modal-body-button.btn_modal') && compact(label(e))==='광고보고출석하기');
    diagnostics.confirmationButtons=confirmations.length;
    if(popups.length){
      if(confirmations.length!==1)return result('unknown','attendance_popup_unrecognized');
      if(request.confirmationAttempted)return result('unknown','confirmation_unconfirmed');
      if(!request.attempted || !request.autoClaim)return result('pending','attendance_popup_available');
      next=result('action','attendance_popup_available',{action:proposal(confirmations[0],'claim_confirm')});
    }
  }
  if (!next && !quiz && claims.length===1) {
    if(keymediAttendance && request.confirmationAttempted)return result('unknown','confirmation_unconfirmed');
    // An enabled, dated claim button describes the current unclaimed state.
    // Reading that state is separate from the user's request to claim it.
    if(request.attempted||!request.autoClaim)return result('pending','claim_available',{claimAvailable:true});
    next=result('action','claim_available',{action:proposal(claims[0].e,'claim')});
  } else if (!next && !quiz && claims.length>1) return result('unknown','ambiguous_claim');
  if (quiz) {
    if(doctorvilleQuiz){
      // The promotional CTA stays visible after success. It is never proof of
      // non-participation; only a readable today calendar/question can be that.
      const calendar=quizVisuals.filter(x=>x.calendar);
      if(calendar.length && calendar.every(x=>!x.imageBadge)){
        const rows=calendar.map(x=>semantic(x.cell).replace(new RegExp('^0?'+day+'(?:일)?'),'').trim());
        if(rows.every(s=>s && !/준비|예정|마감|종료|로딩|불러오/.test(s)))return result('pending','today_quiz_calendar');
      }
      if(todayCells.size || names.some(x=>/퀴즈\s*풀고\s*포인트\s*적립/.test(x.l)))return result('unknown','quiz_status_unconfirmed');
    }
    const playable=controls.filter(e=>/^(?:(?:오늘의?|이달의)\s*)?퀴즈\s*(?:풀기|참여하기|참여|풀고\s*포인트\s*적립)$/.test(label(e)) && inScope(e) && (todayContext(e) || Array.from(scopes).some(root=>root.contains(e)&&isToday(text(root).slice(0,200)))));
    if(playable.length) return result('pending','today_quiz_available');
    if(request.site==='intermd'&&all('input[type="radio"],input[type="checkbox"]').some(e=>inScope(e)&&datedContext(e)===true&&Array.from(scopes).some(root=>root.contains(e)&&/오늘의?\s*퀴즈/.test(text(root)))))return result('pending','today_quiz_question');
    if(intermdHolidaySchedule){diagnostics.source='user_schedule';return result('offday','holiday_quiz_schedule');}
    if(intermdBeforeOpen&&!intermdCurrentResult){diagnostics.source='user_schedule';diagnostics.opensAt=request.date+'T08:00:00+09:00';return result('scheduled','intermd_quiz_before_open');}
    if(todayCells.size===1){const s=semantic([...todayCells][0]).replace(new RegExp('^0?'+day+'(?:일)?'),'').trim();if(s&&!/준비|예정|마감|종료/.test(s))return result('pending','today_quiz_calendar');}
  }
  if (!next) {
    // Literal links may lead through an event card or Brand Zone. Only the exact
    // quiz menu may invoke an in-page opener; answer/submit controls never qualify.
    const menuPattern=quiz ? /^(?:(?:이달의|오늘의|데일리)\s*)?퀴즈(?:\s*퀴즈에\s*도전해\s*보세요[.!]?)?$/ : kind==='capsule'?/^(?:(?:나의\s*)?캡슐(?:\s*(?:안내|내역|출석))?|(?:매일\s*){0,2}출석\s*체크(?:\s*이벤트)?)$/ : /^(?:매일\s*)?출석\s*체크(?:\s*이벤트)?$/;
    const pageKey=request.site+'|'+kind+'|'+request.date+'|'+location.pathname+location.search;
    const alreadyOpened=window.__doctorGleanDailyMenus&&window.__doctorGleanDailyMenus[pageKey];
    const links=[];
    if(!alreadyOpened)for(const e of controls){
      const l=label(e),shortLabels=[l,...all('h2,h3,h4,strong,p,img[alt]',e).map(n=>n.tagName==='IMG'?clean(n.getAttribute('alt')):text(n))];
      const direct=shortLabels.some(s=>s.length<80&&menuPattern.test(s));
      const fallback=e.tagName==='A'&&(request.site==='doctorville'&&quiz?l==='브랜드존':!quiz&&(request.site==='doctorville'||request.site==='hmp')&&l==='이벤트');
      if(!direct&&!fallback)continue;
      const href=e.getAttribute('href')||'';
      let target='';
      try{const u=new URL(href,location.href);if(e.tagName==='A'&&href&&!/^(#|javascript:)/i.test(href)&&u.protocol==='https:'&&(u.hostname===host||u.hostname.endsWith('.'+host))&&u.href!==location.href&&!/logout|signout|delete|withdraw|submit|add|checkin/i.test(u.pathname))target=u.href;}catch{}
      const opener=quiz&&menuPattern.test(l)&&!e.closest('form')&&e.tagName!=='INPUT'&&(!href||/^(#|javascript:)/i.test(href))&&/^(?:오늘의|이달의|데일리)\s*퀴즈$/.test(l);
      if(target||opener)links.push({e,rank:direct?0:1,target:target||pathOf(e)});
    }
    if(links.length){const rank=Math.min(...links.map(x=>x.rank));const unique=[...new Map(links.filter(x=>x.rank===rank).map(x=>[x.target,x])).values()];if(unique.length===1)next=result('action','menu_found',{action:proposal(unique[0].e,'navigate')});}
  }
  if(request.phase==='execute') {
    // WebView/native JSON serialization can reorder object keys. Compare the
    // actual identity fields, never their serialized property order.
    if(!next || !request.action || !['type','selector','label'].every(k=>next.action[k]===request.action[k]))return result('unknown','action_changed');
    if(['claim','claim_confirm'].includes(next.action.type) && (quiz || !request.allowClaim || !request.autoClaim))return result('unknown','claim_not_authorized');
    const target=document.querySelector(next.action.selector);
    if(!visible(target)||target.disabled)return result('unknown','action_changed');
    if(next.action.type==='navigate'){
      window.__doctorGleanDailyMenus=window.__doctorGleanDailyMenus||{};
      window.__doctorGleanDailyMenus[request.site+'|'+kind+'|'+request.date+'|'+location.pathname+location.search]=true;
    }
    target.click();return result('waiting',next.action.type==='claim'?'claim_clicked':next.action.type==='claim_confirm'?'confirmation_clicked':'menu_clicked',{executed:true});
  }
  return next || result('unknown',todayCells.size?'no_explicit_status':'task_page_not_found');
})