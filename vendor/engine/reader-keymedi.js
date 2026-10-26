(function crawlStep(profile, targetDate, previous) {
 const patience=ms=>Math.max(ms,Math.min(45000,Number(profile.networkPatienceMs)||0));
  const now = Date.now();
  const state = previous && previous.version === 1 && previous.date === targetDate
    ? previous : {version:1,date:targetDate,started:now,steps:0,events:[],seen:[],pending:null,quietSince:now,signature:'',loads:0,scrolled:false};
  state.steps++;
  const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const all = (selector, root=document) => Array.from(root.querySelectorAll(selector)).filter(visible);
  const text = e => (e?.innerText ?? e?.textContent ?? '').replace(/\s+/g,' ').trim();
  const out = (status,message,done=false,extra={}) => ({site:profile.id,status,message,done,events:state.events,matchedRows:state.seen.length,coverage:done&&status==='ok',checkedAt:now,loads:state.loads,state,...extra});
  try {
    if(profile.id !== 'keymedi' || profile.crawler !== 'keymedi-live-v1') return out('unsupported','이 사이트의 자동 조회는 아직 준비 중이에요.',true);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || new Date(targetDate+'T00:00:00Z').toISOString().slice(0,10)!==targetDate) return out('error','조회 날짜가 올바르지 않아요.',true);
    const url = new URL(location.href);
    if(url.protocol!=='https:' || !(url.hostname==='keymedi.com'||url.hostname.endsWith('.keymedi.com'))) return out('login','키메디 로그인을 완료해 주세요.',true);
    if(all('input[type="password"]').length) return out('login','키메디 로그인이 필요해요. 로그인 후 다시 조회해 주세요.',true);
    const pageText = text(document.body);
    if(/Verify you are human|Checking your browser|자동입력 방지|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(pageText)) return out('blocked','키메디의 접근 확인 화면을 직접 확인해 주세요.',true);
    if(state.steps>150 || now-state.started>Math.max(150000,patience(0)*4)) return out('review','전체 목록 조회 시간이 초과됐어요. 일부 결과일 수 있어요.',true);
    if(!/^\/meditv\/live\/?$/.test(url.pathname)) return out('login','LIVE 목록에 도착하지 못했어요. 키메디 로그인을 확인해 주세요.',true);
    // Canonical entry has no saved query. Refuse filtered results instead of reporting a false empty day.
    const search = document.querySelector('input[name="search_text"]');
    const pay = document.querySelector('input[name="pay_status"],select[name="pay_status"]');
    if(url.search || (search&&String(search.value||'').trim()) || (pay&&String(pay.value||'').trim())) return out('review','검색 조건이 남아 있어 전체 조회를 확인할 수 없어요. 다시 조회해 주세요.',true);
    const mobileTabs = all('[class~="eNzD-+J2J7zjzuZRC3XLmw=="] > div');
    if(mobileTabs.length && !mobileTabs.some(e=>text(e)==='전체'&&e.classList.contains('efGLuxhqVKu2W9u7Gkcbsw=='))) return out('review','LIVE 목록의 전체 조건을 확인하지 못했어요. 다시 조회해 주세요.',true);
    // The hashed React bundle name changes independently of the rendered LIVE-card contract.
    // Record the drift for diagnostics, but validate the actual card/date/reward DOM below.
    state.clientScriptChanged=!!profile.clientScript&&!Array.from(document.scripts||document.querySelectorAll('script[src]')).some(e=>{try{return new URL(e.src||e.getAttribute('src'),location.href).pathname.endsWith('/'+profile.clientScript);}catch{return false;}});
    const rows = all('[data-gtm-event-name="content_click"][data-gtm-content-category="메디 TV_메디TV Live"]');
    const errors = [];
    const signatures=[];
    for(const row of rows) {
      const title = (row.getAttribute('data-gtm-content-title')||'').replace(/\s+/g,' ').trim();
      // Desktop's dedicated date and mobile's date paragraph are rendered by the same formatter.
      const dateNode = row.querySelector('[class~="ae3n19j7xJwBxiBYWyr85w=="]') || Array.from(row.querySelectorAll('p')).find(e=>/^20\d{2}-\d{2}-\d{2}/.test(text(e)));
      const when = text(dateNode);
      const m = when.match(/^(20\d{2})-(\d{2})-(\d{2})\s*(?:\([^)]*\))?\s*([01]\d|2[0-3]):([0-5]\d)/);
      const rewardBox = row.querySelector('[class~="_3daYPVTCXASH39HyfXlu1A=="]') || row.querySelector('[class~="_888lH48oYljRsQVujiiEqA=="] > li:first-child');
      // A recognized reward container must exist even when it has no P/M icon.
      if(!m || !title || !rewardBox) {errors.push('날짜·제목·P/M 영역을 읽지 못한 카드가 있어요.');continue;}
      const date = `${m[1]}-${m[2]}-${m[3]}`, time = `${m[4]}:${m[5]}`;
      if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date){errors.push('날짜가 올바르지 않은 카드가 있어요.');continue;}
      const reward = Array.from(rewardBox.children).some(e=>e.tagName.toLowerCase()==='svg');
      const lecturer = text(dateNode.nextElementSibling);
      const key = [date,time,title,lecturer].join('|');
      const rowText = text(row);
      const cancelled = /(?:강의|방송|행사)\s*취소|취소된\s*(?:강의|행사)/.test(rowText);
      const advanced = /심화\s*(?:연계\s*)?설문/.test(rowText);
      signatures.push(key+'|'+reward+'|'+cancelled+'|'+advanced);
      if(!state.seen.includes(key))state.seen.push(key);
      // Replace in place so a loaded card's changed status cannot leave a cancelled lecture behind.
      state.events = state.events.filter(e=>e.id!==key);
      if(date===targetDate&&reward&&!cancelled)state.events.push({site:profile.id,date,time,title,advanced,id:key,url:''});
    }
    const signature = signatures.sort().join('\n');
    if(signature!==state.signature){state.signature=signature;state.quietSince=now;state.scrolled=false;}
    if(errors.length) {
      if(!state.errorSince)state.errorSince=now;
      if(now-state.errorSince>=patience(12000))return out('review',[...new Set(errors)].join(' ')+' 전체 수집을 확인하지 못했어요.',true);
      return out('loading','강의 카드가 완전히 표시되기를 기다리고 있어요.');
    }
    state.errorSince=0;
    if(state.pending) {
      const newCard = state.seen.some(key=>!state.pending.keys.includes(key));
      if(newCard){state.pending=null;state.loads++;state.quietSince=now;state.scrolled=false;}
      else if(now-state.pending.at>=patience(18000))return out('review','더보기 이후 새 강의가 표시되지 않았어요. 일부 결과일 수 있어요.',true);
      else return out('loading','더보기의 다음 강의를 기다리고 있어요.');
    }
    // Empty state is also rendered before the first response. Without an observed nonempty catalog,
    // DOM alone cannot prove the authenticated request succeeded, so never certify a zero-row page.
    if(!rows.length) {
      if(all('a,button').some(e=>text(e)==='로그인'))return out('login','키메디 로그인이 필요해요.',true);
      if(now-state.started>=patience(22000))return out('review','LIVE 강의 목록을 확인하지 못했어요. 강의 없음으로 처리하지 않았어요.',true);
      return out('loading','키메디 LIVE 목록을 불러오고 있어요.');
    }
    if(!state.scrolled){window.scrollTo(0,Math.max(document.documentElement.scrollHeight,document.body.scrollHeight));state.scrolled=true;state.quietSince=now;return out('loading',`강의 ${state.seen.length}개 확인 · 아래 목록을 불러오는 중`);}
    if(now-state.quietSince<2200)return out('loading',`강의 ${state.seen.length}개 확인 · 추가 목록을 기다리는 중`);
    const moreButtons = all('button').filter(e=>/^더보기\s*$/.test(text(e)));
    // Accept only the mobile list wrapper or a button within the nearest ancestor containing
    // all lecture cards. Ambiguous controls stop the crawl; no lecture/detail controls are clicked.
    let listRoot=rows[0].parentElement;
    while(listRoot&&(!rows.every(r=>listRoot.contains(r))||!moreButtons.some(b=>listRoot.contains(b))))listRoot=listRoot.parentElement;
    const candidates=moreButtons.filter(b=>b.closest('[class~="ZiibAfsUkTxWgZY6+zuIxw=="]') || (listRoot&&listRoot!==document.body&&listRoot!==document.documentElement&&listRoot.contains(b)));
    if(moreButtons.length>1 || moreButtons.length!==candidates.length)return out('review','더보기 버튼의 위치가 달라 전체 조회를 확인하지 못했어요.',true);
    if(candidates.length===1) {
      const more=candidates[0];
      if(more.disabled||more.getAttribute('aria-disabled')==='true') {
        if(!state.disabledSince)state.disabledSince=now;
        if(now-state.disabledSince>=patience(18000))return out('review','더보기가 계속 비활성 상태예요. 일부 결과일 수 있어요.',true);
        return out('loading','더보기 버튼이 준비되기를 기다리고 있어요.');
      }
      state.disabledSince=0;
      state.pending={at:now,keys:[...state.seen]};
      more.scrollIntoView({block:'center'});more.click();
      return out('loading',`강의 ${state.seen.length}개 확인 · 더보기 자동 조회 중`);
    }
    if(all('.pagination,.paging,.paginate,nav[aria-label*="페이지"]').some(e=>all('a,button',e).length>1))return out('review','예상하지 못한 페이지 나눔이 있어 전체 조회를 확인하지 못했어요.',true);
    // Require a second stable, bottom-of-list interval after the last asynchronous response.
    if(now-state.quietSince<5000)return out('loading','마지막 목록을 확인하고 있어요.');
    state.events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
    return out('ok',`현재 공개된 LIVE 목록 ${state.seen.length}개 조회 완료 · 선택일 P/M 강의 ${state.events.length}개`,true);
  } catch(error) {return out('error','자동 조회 중 화면을 읽지 못했어요. 일부 결과일 수 있어요.',true);}
})