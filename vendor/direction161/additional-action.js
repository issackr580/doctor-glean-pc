(function(){const inspectBluepharmPageControls=(function inspectBluepharmPageControls(context=null){
 const out=(status,reason,extra={})=>({status,reason,...extra});
 const visible=e=>{if(!e||!e.getClientRects().length)return false;for(let p=e;p&&p!==document;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||p.matches('script,style,template,noscript')||s.display==='none'||s.visibility==='hidden')return false;}return true;};
 const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector)).filter(visible);
 const text=e=>(e?.innerText??e?.textContent??'').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
 const names=e=>[text(e),e.getAttribute('aria-label'),e.getAttribute('title'),...all('img[alt]',e).map(x=>x.getAttribute('alt'))].filter(Boolean);
 let here;try{here=new URL(location.href);}catch{return out('unavailable','catalog_route_unconfirmed');}
 if(here.protocol!=='https:'||!['bluepharmkorea.co.kr','www.bluepharmkorea.co.kr'].includes(here.hostname)||here.port||here.username||here.password||here.hash||here.pathname!=='/'||here.searchParams.getAll('pn').length!==1||here.searchParams.get('pn')!=='webcast.main')return out('unavailable','catalog_route_unconfirmed');
 const pageKey=k=>/^(?:page|page_no|pageno|pageindex|currentpage|currentpageno)$/i.test(k);
 const ordinary=u=>{
  const keys=[...u.searchParams.keys()];return new Set(keys).size===keys.length&&keys.every(k=>k==='pn'&&u.searchParams.get(k)==='webcast.main'||pageKey(k)&&/^[1-9]\d{0,3}$/.test(u.searchParams.get(k))||/^(?:search|keyword|searchType|searchKeyword)$/i.test(k)&&u.searchParams.get(k)==='');
 };
 if(!ordinary(here))return out('unconfirmed','page_parameters_unconfirmed');
 const roots=all('.all_sem_pagination_wrap').filter(e=>!e.closest('form,header,footer,aside,[role="dialog"],.wc_calendar,.seminar_calendar_wrap,.ui-datepicker'));
 if(!roots.length)return out('unavailable','numbered_pager_not_found');
 if(roots.length!==1)return out('unconfirmed','numbered_pager_ambiguous');
 const root=roots[0];
 if(root.getAttribute('aria-busy')==='true'||all('[aria-busy="true"],.loading,.is-loading,.spinner',root).length)return out('unconfirmed','pager_loading');
 const mask=s=>s.replace(/\d/g,'#').replace(/[^# .:/()~～∼–—+,：|\-]/g,'?').slice(0,120);
 const token=e=>names(e).find(s=>/^(?:[1-9]\d{0,3}|다음(?:\s*페이지)?|이전(?:\s*페이지)?|처음|마지막|next|previous|prev|first|last|[›»>‹«<])$/i.test(s))||'';
 const nodes=all('*',root).filter(e=>e.namespaceURI==='http://www.w3.org/1999/xhtml'&&!e.matches('form,input,textarea,select,option,img,iframe,video,audio')&&token(e)&&!Array.from(e.children).some(c=>visible(c)&&token(c)===token(e)));
 const disabled=e=>{for(let p=e;p&&p!==root;p=p.parentElement)if(p.disabled||p.getAttribute('aria-disabled')==='true'||p.matches('.disabled,.disable,.is-disabled')||getComputedStyle(p).pointerEvents==='none')return true;return false;};
 const current=e=>{for(let p=e;p&&p!==root;p=p.parentElement)if(p.matches('[aria-current="page"],[aria-current="true"],.active,.current,.selected,.on,.hit'))return true;return e.matches('strong,em')&&!e.closest('a,button');};
 const numbers=nodes.filter(e=>/^[1-9]\d{0,3}$/.test(token(e)));
 const selected=[...new Set(numbers.filter(current).map(e=>+token(e)))];
 const details={classes:root.getAttribute('class')||'',count:selected.length===1?selected[0]:0,parts:nodes.slice(0,6).map(e=>({tag:e.tagName,classes:e.getAttribute('class')||'',shape:mask(token(e)),enabled:!disabled(e)}))};
 if(selected.length!==1)return out('unconfirmed','current_page_unconfirmed',{details});
 const page=selected[0],declared=[...here.searchParams].filter(([k])=>pageKey(k));
 if(declared.length>1||declared.length===1&&+declared[0][1]!==page)return out('unconfirmed','page_url_mismatch',{details});
 const titles=context?.titles||all('.sem_tit').filter(e=>!e.closest('header,footer,nav,.wc_calendar,.seminar_calendar_wrap,.ui-datepicker'));
 if(!titles.length||titles.length>80||titles.some(e=>!text(e)||text(e).length>250))return out('unconfirmed','page_cards_unconfirmed',{details});
 const signature=titles.map(e=>{
  let field=null;for(let p=e.parentElement,n=0;p&&p!==document.body&&n<5;p=p.parentElement,n++){
   if(p.querySelectorAll('.sem_tit').length!==1)break;
   const candidates=all('.sem_detail,.sem_detail_action',p);if(candidates.length){field=candidates.map(text).join('|');break;}
  }
  return text(e)+'|'+(field||'');
 }).join('\n');
 if(signature.length>65536)return out('unconfirmed','page_cards_unconfirmed',{details});
 const direct=numbers.filter(e=>+token(e)===page+1&&!disabled(e));
 const forward=nodes.filter(e=>/^(?:다음(?:\s*페이지)?|next|[›»>])$/i.test(token(e))&&!disabled(e));
 if(direct.length>1||!direct.length&&forward.length>1)return out('unconfirmed','next_page_ambiguous',{details});
 const next=direct[0]||forward[0]||null;
 if(next){
  if(next.closest('form')||names(next).some(s=>/신청|예약|참여|시청|재생|입장|로그인|로그아웃|설문|다운로드/.test(s)))return out('unconfirmed','unsafe_page_control',{details});
  const a=next.closest('a[href]');const href=a?.getAttribute('href')||'';
  if(href&&!/^(#|javascript:)/i.test(href)){
   let u;try{u=new URL(href,here.href);}catch{return out('unconfirmed','unsafe_page_link',{details});}
   if(u.origin!==here.origin||u.pathname!==here.pathname||u.username||u.password||u.hash||!ordinary(u))return out('unconfirmed','unsafe_page_link',{details});
   const pn=[...u.searchParams].filter(([k])=>pageKey(k));if(pn.length!==1||+pn[0][1]!==page+1)return out('unconfirmed','page_link_number_mismatch',{details});
  }
  return out('next','numbered_next',{root,element:next,page,next:page+1,signature,details});
 }
 if(numbers.some(e=>+token(e)>page))return out('unconfirmed','next_page_unconfirmed',{details});
 const disabledForward=nodes.some(e=>/^(?:다음(?:\s*페이지)?|next|[›»>])$/i.test(token(e))&&disabled(e));
 const values=[...new Set(numbers.map(e=>+token(e)))].sort((a,b)=>a-b);
 const allNumbers=values.length===page&&values.every((v,i)=>v===i+1);
 if(!disabledForward&&!allNumbers)return out('unconfirmed','page_end_unconfirmed',{details});
 return out('last','numbered_last',{root,page,signature,details});
});const inspectBluepharmStatus=(function inspectBluepharmStatus(){
 const out=(status,reason,extra={})=>({status,reason,...extra});
 const visible=e=>{for(let p=e;p&&p!==document;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||!p.getClientRects().length||s.display==='none'||s.visibility==='hidden')return false;}return !!e;};
 const all=(s,r=document)=>Array.from(r.querySelectorAll(s)).filter(visible),text=e=>(e?.innerText??e?.textContent??'').normalize('NFKC').replace(/\s+/g,' ').trim();
 let u;try{u=new URL(location.href);}catch{return out('unavailable','catalog_route_unconfirmed');}
 if(u.protocol!=='https:'||!['bluepharmkorea.co.kr','www.bluepharmkorea.co.kr'].includes(u.hostname)||u.port||u.username||u.password||u.hash||u.pathname!=='/'||u.searchParams.getAll('pn').length!==1||u.searchParams.get('pn')!=='webcast.main')return out('unavailable','catalog_route_unconfirmed');
 if([...u.searchParams].some(([k,v])=>k!=='pn'&&!(/^(?:page|page_no|pageno|pageindex|currentpage|currentpageno)$/i.test(k)&&/^[1-9]\d{0,3}$/.test(v))&&!(/^(?:search|keyword|searchType|searchKeyword)$/i.test(k)&&v==='')))return out('unavailable','catalog_parameters_unconfirmed');
 if(all('.wc_calendar,.seminar_calendar_wrap,.ui-datepicker').length)return out('unavailable','legacy_calendar_present');
 const names={전체:'all',진행중:'ongoing',모집중:'recruiting',종료:'ended'};
 const excluded='header,footer,nav,aside,form,[role="dialog"],.sem_info,.sem_tit,.sem_badges,.W_status,.all_sem_pagination_wrap,.sem_cal_filter,.sem_cal_list_wrap,.seminar_calendar_wrap,.wc_calendar,.ui-datepicker';
 const leaves=all('a,button,span,li,div,label').filter(e=>names[text(e)]&&!e.closest(excluded)&&!Array.from(e.children).some(c=>visible(c)&&text(c)===text(e)));
 const groups=[];
 for(const seed of leaves.filter(e=>names[text(e)]==='ongoing'))for(let p=seed.parentElement,n=0;p&&p!==document.body&&n<5;p=p.parentElement,n++){
  const controls=leaves.filter(e=>p.contains(e));
  if(['all','ongoing','recruiting'].every(k=>controls.filter(e=>names[text(e)]===k).length===1)&&controls.length<=4){groups.push({root:p,controls});break;}
 }
 if(!groups.length)return out('unavailable','status_filters_not_found');
 const distinct=[...new Map(groups.map(g=>[g.root,g])).values()];if(distinct.length!==1)return out('unconfirmed','status_filters_ambiguous');
 const {root,controls}=distinct[0],current=e=>{for(let p=e;p&&p!==root;p=p.parentElement)if(p.matches('.on,.active,.selected,.current,.is-active,[aria-selected="true"],[aria-pressed="true"],[aria-current="true"]'))return true;return false;};
 const chosen=controls.filter(current),details={type:'status_filters',count:controls.length,parts:controls.map(e=>({tag:e.tagName,classes:e.getAttribute('class')||''}))};
 if(chosen.length!==1)return out('unconfirmed','status_selection_unconfirmed',{details});
 // A filtered single page has no pager element on the current site. Its two
 // visible section headings bound the primary list; the repeated cards below
 // 진행중인 세미나 cannot supply rows, dates, empty evidence or page controls.
 const headings=all('h1,h2,h3,h4,h5,h6,div,p,span,strong,b,a').filter(e=>!e.closest(excluded)&&!Array.from(e.children).some(c=>visible(c)&&text(c)===text(e)));
 const following=headings.filter(e=>text(e)==='진행중인 세미나'&&(root.compareDocumentPosition(e)&4));
 const pagers=Array.from(document.querySelectorAll('.all_sem_pagination_wrap')).filter(e=>!e.closest('header,footer,aside,form,[role="dialog"],.wc_calendar,.ui-datepicker')&&(root.compareDocumentPosition(e)&4)&&following.every(end=>e.compareDocumentPosition(end)&4));
 if(pagers.length>1)return out('unconfirmed','status_list_pager_ambiguous',{details});
 const pager=pagers[0]||null;
 const starts=headings.filter(e=>text(e)==='세미나 전체 목록'&&(e.compareDocumentPosition(root)&4));
 if(!pager&&(following.length!==1||starts.length!==1))return out('unconfirmed','status_list_sections_unconfirmed',{details});
 const boundary=pager||following[0];let container=root.parentElement;
 while(container&&container!==document.body&&!container.contains(boundary))container=container.parentElement;
 if(!container||container===document.body)return out('unconfirmed','status_list_parent_unconfirmed',{details});
 const order=new Map(Array.from(container.querySelectorAll('*')).map((e,i)=>[e,i]));
 const between=e=>order.get(e)>order.get(root)&&order.get(e)<order.get(boundary)&&!root.contains(e)&&!boundary.contains(e);
 if(!pager&&(all('.pagination,.paging,.paginate,nav,[role="navigation"]',container).some(between)||all('a,button',container).some(e=>between(e)&&/^(?:더\s*보기|다음(?:\s*페이지)?|next|[›»>])$/i.test(text(e)))))return out('unconfirmed','status_list_navigation_unconfirmed',{details});
 const titles=all('.sem_tit',container).filter(between);
 if(titles.length>32)return out('unconfirmed','status_card_limit',{details});
 const cards=[];
 for(const title of titles){let card=null;for(let p=title.parentElement,n=0;p&&p!==container&&n<5;p=p.parentElement,n++){
   if(p.querySelectorAll('.sem_tit').length!==1)break;
   if(p.querySelector('.sem_detail,.sem_detail_action,.ico_date')){card=p;break;}
  }if(!card||cards.includes(card))return out('unconfirmed','status_card_boundary_unconfirmed',{details});cards.push(card);
 }
 const signature=cards.map(e=>text(e.querySelector('.sem_tit'))+'|'+all('.sem_detail,.sem_detail_action',e).map(text).join('|')).join('\n');
 if(signature.length>65536)return out('unconfirmed','status_card_limit',{details});
 const empty=all('p,div,span,li',container).filter(between).some(e=>!/\S/.test(Array.from(e.children).map(text).join(''))&&/^(?:(?:검색된|조회된|등록된|해당|진행중인|모집중인)\s*)?(?:세미나|강의|검색\s*결과)(?:가|는|이)?\s*(?:없습니다|없어요|없음)[.!]?$/.test(text(e)));
 const loading=all('[aria-busy="true"],.loading,.is-loading,.spinner,.skeleton',container).filter(between).length>0;
 const selected=names[text(chosen[0])];
 return out('ready','status_filters_read',{root,container,pager,titles,cards,signature,empty,loading,selected,controls:Object.fromEntries(controls.map(e=>[names[text(e)],e])),details});
});return (function performAdditionalAction(action,readBlueControls=inspectBluepharmPageControls,readBlueStatus=inspectBluepharmStatus){
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 if(action.kind==='scroll'){window.scrollTo(0,Math.max(document.body.scrollHeight,document.documentElement.scrollHeight));return true;}
 const e=document.querySelector(action.selector);if(!visible(e)||e.disabled)return false;
 if(action.kind==='date'&&e.matches('input[type="date"]')&&/^\d{4}-\d{2}-\d{2}$/.test(action.value)){
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!setter)return false;
  setter.call(e,action.value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;
 }
 if(action.kind==='month'&&e.matches('select')&&/^20\d{2}[.\/-]\d{1,2}$/.test(action.value)&&Array.from(e.options).some(o=>o.value===action.value)){
  e.value=action.value;e.dispatchEvent(new Event('change',{bubbles:true}));return true;
 }
 if(action.kind!=='click')return false;
 const statusDom=readBlueStatus();
 if(action.bluepharmStatus||statusDom.status==='ready'&&Object.values(statusDom.controls).includes(e)){
  const proof=action.bluepharmStatus;
  if(!proof||statusDom.status!=='ready'||!['ongoing','recruiting'].includes(proof.target)||statusDom.controls[proof.target]!==e||statusDom.selected!==proof.selected||statusDom.signature!==proof.signature)return false;
  const href=e.closest('a[href]')?.getAttribute('href');if(href&&!/^(#|javascript:)/i.test(href))return false;
  if(e.getAttribute('aria-disabled')==='true'||e.closest('.disabled,.disable,[aria-disabled="true"]'))return false;
 }else if(action.bluepharmStatusPage){
  const proof=action.bluepharmStatusPage,actual=statusDom.status==='ready'?readBlueControls({titles:statusDom.titles}):null;
  if(!actual||statusDom.selected!==proof.scope||!['ongoing','recruiting'].includes(proof.scope)||proof.next!==proof.current+1||actual.status!=='next'||actual.element!==e||actual.page!==proof.current||actual.next!==proof.next||actual.signature!==proof.signature)return false;
 }else if(action.bluepharmPage||e.closest('.all_sem_pagination_wrap')&&(()=>{try{const u=new URL(location.href);return ['bluepharmkorea.co.kr','www.bluepharmkorea.co.kr'].includes(u.hostname)&&u.searchParams.get('pn')==='webcast.main';}catch{return false;}})()){
  const proof=action.bluepharmPage,actual=readBlueControls();
  if(!proof||!Number.isInteger(proof.current)||!Number.isInteger(proof.next)||proof.next!==proof.current+1||typeof proof.signature!=='string'||proof.signature.length>65536||actual.status!=='next'||actual.element!==e||actual.page!==proof.current||actual.next!==proof.next||actual.signature!==proof.signature)return false;
 }
 const signature=[text(e),e.getAttribute('aria-label'),e.getAttribute('title'),...(e.matches('input[type="button"]')?[e.getAttribute('value')]:[]),...Array.from(e.querySelectorAll('img[alt]')).map(x=>x.getAttribute('alt'))].filter(Boolean).join(' ').trim();
 if(signature!==action.signature||/신청|예약|참여|설문|재생|시청|입장|북마크|로그인|로그아웃|다운로드/.test(signature))return false;
 if(e.closest('form')&&e.matches('button:not([type]),button[type="submit"],input[type="submit"]'))return false;
 e.scrollIntoView({block:'center'});e.click();return true;
});})()