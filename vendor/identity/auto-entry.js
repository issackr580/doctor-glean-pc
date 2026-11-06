(function(job,mode,manualTarget){const bindEntryControl=(function bindEntryControl(job,mode,button){
 const known=job.lectureIdentity||readLectureIdentity(job.site,job.url);if(!known)return true;
 const selectors={doctorville:'a.list_detail',medigate:'article',keymedi:'[data-gtm-event-name="content_click"]',hmp:'.area',whodadoc:'.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item',docple:'[data-testid="webinar-card"],article'};
 const root=button.closest(selectors[job.site]||'article')||button.parentElement;
 const fingerprint=JSON.stringify([button,root].map(e=>['href','onclick','formaction','type','aria-label'].map(a=>e?.getAttribute(a))));
 const key=[job.site,job.key,job.slot].join('|'),map=window.__pcEntryControls??=new Map();
 if(mode!=='click'){map.set(key,{button,root,fingerprint});if(map.size>16)map.delete(map.keys().next().value);return true;}
 const prior=map.get(key);return !!prior&&prior.button===button&&prior.root===root&&button.isConnected&&prior.fingerprint===fingerprint;
});const readLectureIdentity=(function readLectureIdentity(site,input,base){
 const hosts={"doctorville":["www.doctorville.co.kr","doctorville.co.kr"],"keymedi":["www.keymedi.com","keymedi.com"],"hmp":["www.hmp.co.kr","hmp.co.kr"],"whodadoc":["hcp.whodadoc.com","www.whodadoc.com","whodadoc.com"],"medigate":["new.medigate.net","www.medigate.net","m.medigate.net","medigate.net"],"docple":["docple-plus.com"]};
 const host=hosts[site];if(!host)return null;
 const trusted=u=>u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&host.includes(u.hostname);
 const meta=(kind,id,source='detail_url')=>({schemaVersion:1,kind,id,source});
 const parse=raw=>{try{
  if(typeof raw!=='string'||raw.length>2048||/[\x00-\x20\x7f\\%]/.test(raw))return null;
  if(raw.includes('#')||/(?:^|\/)\.{1,2}(?:\/|$)/.test(raw.split('?')[0]))return null;
  if(raw.includes('?')&&!raw.slice(raw.indexOf('?')+1).split('&').every(p=>/^[^=&?#]+=[^=&?#]*$/.test(p)))return null;
  const u=new URL(raw,base);if(!trusted(u)||u.hash)return null;
  const path=u.pathname.replace(/\/$/,''),pairs=[...u.searchParams],keys=pairs.map(p=>p[0]);if(new Set(keys).size!==keys.length)return null;
  if(site==='doctorville'&&/^\/seminar\/(?:seminarDetail|seminarVodReplayDetail)$/.test(path)&&pairs.every(([k,v])=>k==='seminarId'?/^\d{1,10}$/.test(v):k==='viewType'&&/^[12]$/.test(v)))return /^\d{1,10}$/.test(u.searchParams.get('seminarId')||'')?meta('seminar',u.searchParams.get('seminarId')):null;
  if(site==='whodadoc'&&path==='/webinar/webi/view'&&pairs.every(([k,v])=>k==='id'?/^[1-9]\d{0,15}$/.test(v):k==='page'&&/^[1-9]\d{0,3}$/.test(v)))return /^[1-9]\d{0,15}$/.test(u.searchParams.get('id')||'')?meta('webi',u.searchParams.get('id')):null;
  const pattern=site==='keymedi'?/^\/meditv\/live\/([A-Za-z0-9_-]{1,80})$/:site==='medigate'?/^\/symposium\/([1-9]\d{0,15})$/:site==='docple'?/^\/webinar\/([1-9]\d{0,15})$/:null;
  const m=pattern&&path.match(pattern);if(!m)return null;
  if(site==='docple'){
   if(!pairs.every(([k,v])=>['category','categoryAll','mode','liveFilter','period','sort','searchType','keyword','page','view','layout','week','date'].includes(k)&&/^[A-Za-z0-9_-]{0,40}$/.test(v)))return null;
  }else if(pairs.length)return null;
  return meta(site==='keymedi'?'live':site==='medigate'?'symposium':'webinar',m[1]);
 }catch{return null;}};
 if(typeof input==='string')return parse(input);
 if(!input?.querySelectorAll)return null;
 const nodes=[input,...input.querySelectorAll('a[href],[onclick]')],ids=new Map();if(nodes.length>400)return null;let inspected=0;
 for(const node of nodes){
  if(node.closest?.('[hidden],[aria-hidden="true"]')||!node.getClientRects?.().length||typeof getComputedStyle==='function'&&(getComputedStyle(node).visibility==='hidden'||getComputedStyle(node).display==='none'))continue;
  if(++inspected>128)return null;
  let id=parse(node.getAttribute?.('href'));
  if(site==='hmp'){
   try{const here=new URL(base);if(trusted(here)&&here.pathname==='/symposium/schedulerequest/scheduleList.hm'){
    const raw=node.getAttribute?.('onclick')||node.getAttribute?.('href')||'';
    const m=raw.match(/^\s*(?:javascript:\s*)?goDetail\(\s*(?:'([1-9]\d{0,9})'|"([1-9]\d{0,9})"|([1-9]\d{0,9}))\s*\)\s*;?\s*(?:return false;?\s*)?$/);
    if(m)id=meta('schedule',m[1]||m[2]||m[3],'hmp_go_detail');
   }}catch{}
  }
  if(id)ids.set(id.kind+':'+id.id,id);
 }
 return ids.size===1?[...ids.values()][0]:null;
});const entryIdentityScope=(function entryIdentityScope(job,selector){
 let expected=readLectureIdentity(job.site,job.url),here;
 if(!expected&&job.site==='hmp'&&job.lectureIdentity?.schemaVersion===1&&job.lectureIdentity.kind==='schedule'&&job.lectureIdentity.source==='hmp_go_detail'&&/^[1-9]\d{0,9}$/.test(job.lectureIdentity.id))expected=job.lectureIdentity;
 if(!expected)return null;
 try{here=readLectureIdentity(job.site,location.href);}catch{}
 const same=id=>!!id&&id.kind===expected.kind&&id.id===expected.id;
 const root=r=>{
  if(here&&!same(here))return false;
  const id=readLectureIdentity(job.site,r,location.href);
  if(id)return same(id);
  // Do not let a detail page supply its identity to unrelated list cards.
  const declared=[r,...r.querySelectorAll('a[href]')].some(e=>readLectureIdentity(job.site,e.getAttribute?.('href'),location.href));
  return same(here)&&!declared&&!r.closest?.('a.list_detail,.anchor-view,[data-gtm-event-name="content_click"]')&&!r.querySelector?.(selector);
 };
 const heading=e=>{
  if(!e.matches('h1,h2,h3,h4,h5,h6,.tit,.title,.subject,.memo,.webinarItem__topic,.webinar__topic,.mWebinar__topic'))return false;
  const card=selector?e.closest(selector):null;
  const link=e.closest('a[href]');if(!card&&link&&readLectureIdentity(job.site,link,location.href))return root(link);
  if(card)return root(card);
  return same(here);
 };
 return {root,heading};
});const entryReceiptPage=(function entryReceiptPage(job) {
 const out=(status,extra={})=>({schemaVersion:1,site:job?.site,status,...extra});
 const sites={dtalks:{host:'dtalks.kr',path:'/member/newMypage.do'},medigate:{host:'medigate.net',path:'/event/20261103092020307'}};
 const site=sites[job?.site];let here;
 try{here=new URL(location.href);}catch{return out('blocked');}
 const allowed=site&&here.protocol==='https:'&&!here.username&&!here.password&&(!here.port||here.port==='443')&&(here.hostname===site.host||here.hostname==='www.'+site.host)&&!here.hash;
 if(!allowed)return out('blocked');
 const visible=e=>!!e&&e.getClientRects().length>0&&!e.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const all=(s,r=document)=>Array.from(r.querySelectorAll(s)).filter(visible);
 const text=e=>String(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
 if(/\/(?:auth\/)?login(?:\.do)?\/?$/i.test(here.pathname)||all('input[type="password"]').length)return out('login');
 if(here.pathname!==site.path||here.search)return out('blocked');
 if(!job?.key||!job?.title||!/^\d{4}-\d{2}-\d{2}$/.test(job.date))return out('invalid');
 if(document.readyState&&document.readyState!=='complete'||all('[aria-busy="true"],[role="progressbar"]').length)return out('pending');
 if(/Verify you are human|Checking your browser|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(text(document.body)))return out('blocked');
 const period=job.date.slice(0,7);
 if(job.site==='medigate'){
  const network=window.__doctorGleanReceiptNetwork;
  const observed=network?.token===job.receiptReadToken&&network?.completed===true;
  if(job.receiptRequireNetwork&&!observed)return out(network?.status===401||network?.status===403?'login':'pending');
  const elements=all('h1,h2,h3,h4,p,div,span,strong,b');
  const leaf=(e,re)=>re.test(text(e))&&!Array.from(e.children).some(c=>visible(c)&&re.test(text(c)));
  const counts=elements.filter(e=>leaf(e,/^(?:0|[1-9]\d{0,4})\s*회$/));
  const months=elements.filter(e=>leaf(e,/^20\d{2}년\s*(?:[1-9]|1[0-2])월\s*(?:\(\s*월간\s*집계\s*\))?$/));
  const candidates=[];
  for(const count of counts){let parent=count.parentElement;
   for(let depth=0;parent&&depth<8;depth++,parent=parent.parentElement){
    if(!/나의\s*웨비나\s*참여\s*현황/.test(text(parent))||!/월간\s*집계/.test(text(parent)))continue;
    const ownCounts=counts.filter(e=>parent.contains(e)),ownMonths=months.filter(e=>parent.contains(e));
    if(ownCounts.length!==1||ownMonths.length!==1)break;
    const m=text(ownMonths[0]).match(/^(20\d{2})년\s*(\d{1,2})월/),p=m[1]+'-'+m[2].padStart(2,'0');
    candidates.push({period:p,count:Number(text(count).match(/\d+/)[0])});break;
   }
  }
  const unique=[...new Map(candidates.map(c=>[c.period+'|'+c.count,c])).values()];
  if(unique.length!==1)return out(unique.length?'ambiguous':'unconfirmed',{counterCandidates:unique.length});
  if(unique[0].period!==period)return out('period_changed');
  const verified=observed&&Array.isArray(network.counts)&&network.counts.length===1&&network.counts[0]===unique[0].count;
  if(job.receiptRequireNetwork&&unique[0].count===0&&!verified)return out('pending');
  return out('observed',{kind:'monthly_counter',period,count:unique[0].count,networkObserved:observed,counterValueVerified:verified});
 }
 const tables=all('table'),found=[];
 for(const table of tables){
  const headers=all('thead th',table).map(e=>norm(text(e)));
  if(!headers.length){const first=table.querySelector('tr');if(first)headers.push(...all('th',first).map(e=>norm(text(e))));}
  const dateIndex=headers.indexOf('시청일자'),timeIndex=headers.indexOf('시청시간'),statusIndex=headers.indexOf('현황');
  if(dateIndex<0||timeIndex<0||statusIndex<0)continue;
  const titleIndex=headers.findIndex(h=>['강의명','강연명','강의제목','웨비나명','제목'].includes(h));
  found.push({table,dateIndex,timeIndex,statusIndex,titleIndex:titleIndex>=0?titleIndex:0});
 }
 if(found.length!==1)return out(found.length?'ambiguous':'unconfirmed',{historyTables:found.length});
 const t=found[0],rows=all('tbody tr',t.table).filter(r=>all('td',r).length);
 const matching=[],qualified=new Set();let parsedRows=0,undated=0;
 for(const row of rows.slice(0,500)){
  const cells=Array.from(row.children).filter(e=>e.tagName.toLowerCase()==='td');
  if(cells.length<=Math.max(t.dateIndex,t.timeIndex,t.statusIndex,t.titleIndex))continue;
  const date=text(cells[t.dateIndex]),clock=text(cells[t.timeIndex]),status=norm(text(cells[t.statusIndex]));
  const m=clock.match(/^(\d{2}):([0-5]\d):([0-5]\d)$/);
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!m){undated++;continue;}
  const seconds=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);
  if(seconds>86400)continue;
  const cell=cells[t.titleIndex],labels=[text(cell),...all('a,[title],[aria-label]',cell).flatMap(e=>[text(e),e.getAttribute('title')||'',e.getAttribute('aria-label')||''])].map(norm).filter(Boolean);
  const anchors=all('a',cell).map(e=>norm(e.getAttribute('title')||e.getAttribute('aria-label')||text(e))).filter(Boolean);
  const stripped=cell.cloneNode(true);for(const badge of stripped.querySelectorAll('button,[role="button"],.badge,.tag-label,.status,.state'))badge.remove();
  const title=anchors.length===1?anchors[0]:norm(text(stripped));parsedRows++;
  if(date.slice(0,7)===period&&date<=job.date&&status==='시청완료'&&seconds>=180&&title)qualified.add(title);
  if(date===job.date&&labels.includes(norm(job.title)))matching.push({watchDate:date,watchSeconds:seconds,completed:status==='시청완료'});
 }
 const common={kind:'lecture_history',period,matchingRows:matching.length,historyRows:Math.min(rows.length,500),parsedRows,undated,monthlyQualifiedAtLeast:qualified.size,monthlyTarget:3,monthlyGoalObserved:qualified.size>=3};
 if(matching.length!==1)return out(matching.length?'ambiguous':'not_found',common);
 const receipt=matching[0];
 return out('observed',{...common,...receipt,qualifies:receipt.completed&&receipt.watchSeconds>=180});
});const entryReceiptNetworkStart=(function entryReceiptNetworkStart(job) {
 let here;try{here=new URL(location.href);}catch{return {status:'blocked'};}
 if(job?.site!=='medigate'||!job.receiptReadToken||here.protocol!=='https:'||!['www.medigate.net','medigate.net'].includes(here.hostname)||here.pathname!=='/event/20261103092020307'||here.search||here.hash||here.username||here.password||here.port&&here.port!=='443')return {status:'blocked'};
 if(window.__doctorGleanReceiptNetwork?.token===job.receiptReadToken)return {status:'observing'};
 const state={token:job.receiptReadToken,completed:false,status:0,counts:[]};window.__doctorGleanReceiptNetwork=state;
 const original=window.fetch;if(typeof original!=='function')return {status:'unavailable'};
 const countKeys=['count','cnt','total','totalCount','total_count','total_cnt','startCount','start_count','webinarCount','webinar_count','webinarCnt','webinarStartCount','webinarStartCnt','viewCount','view_cnt'];
 const number=n=>Number.isInteger(n)&&n>=0&&n<=99999;
 const scan=(value,depth,primitive,found)=>{
  if(depth>3||found.size>4)return;
  if(primitive&&number(value)){found.add(value);return;}
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){if(value.length===1)scan(value[0],depth+1,primitive,found);return;}
  for(const key of countKeys)if(number(value[key]))found.add(value[key]);
  for(const key of ['data','resultData','result'])if(Object.hasOwn(value,key))scan(value[key],depth+1,key!=='result',found);
 };
 window.fetch=function(...args){
  let relevant=false;try{const input=args[0],u=new URL(typeof input==='string'?input:input.url,here),method=args[1]?.method||input?.method||'GET';relevant=method==='GET'&&u.protocol==='https:'&&u.hostname==='apis.medigate.net'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.pathname==='/w/event/webinar-start-count';}catch{}
  const pending=Reflect.apply(original,this,args);
  if(relevant)Promise.resolve(pending).then(async response=>{
   state.status=response.status;state.completed=false;state.counts=[];
   if(response.status!==200)return;
   try{const raw=await response.clone().text();if(raw.length>32768)return;const found=new Set();scan(JSON.parse(raw),0,true,found);state.counts=[...found].slice(0,5);}catch{}
   state.completed=true;
  },()=>{state.completed=false;state.counts=[];state.status=0;});
  return pending;
 };
 return {status:'observing'};
});const entryWatchPage=(function entryWatchPage(job,mode='watch_probe') {
 const out=(status,extra={})=>({schemaVersion:1,status,...extra});
 let here;try{here=new URL(location.href);}catch{return out('blocked');}
 if(job?.site!=='dtalks'||!job.key||!job.watchToken||!/^\d{4}-\d{2}-\d{2}$/.test(job.date)||here.protocol!=='https:'||here.username||here.password||here.port&&here.port!=='443'||!['www.dtalks.kr','dtalks.kr'].includes(here.hostname))return out('blocked');
 const visible=e=>!!e&&e.getClientRects().length>0&&!e.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const all=(s,r=document)=>Array.from(r.querySelectorAll(s)).filter(visible);
 const text=e=>String(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
 if(all('input[type="password"]').length||/\/login(?:\.do)?\/?$/i.test(here.pathname))return out('login');
 const titles=all('h1,h2,h3,h4,h5,h6,.tit,.title,.subject,.memo,[class*="title"]').filter(e=>norm(text(e))===norm(job.title));
 const unique=titles.filter(e=>!titles.some(c=>c!==e&&e.contains(c)));
 if(unique.length!==1)return out('target_unconfirmed');
 let videos=all('video');
 for(const frame of all('iframe')){try{const u=new URL(frame.contentWindow.location.href);if(u.origin===here.origin&&frame.contentDocument)videos.push(...all('video',frame.contentDocument));}catch{}}
 if(videos.length!==1)return out('media_unconfirmed');
 const video=videos[0];
 if(mode==='watch_start'){
  if(window.__doctorGleanReceiptPlay!==job.watchToken){
   window.__doctorGleanReceiptPlay=job.watchToken;video.muted=true;
   try{const play=video.play();if(play?.catch)play.catch(()=>{});}catch{}
  }
 }else if(mode!=='watch_probe')return out('invalid');
 return out('observed',{playing:!video.paused&&!video.ended&&video.readyState>=2,ended:!!video.ended,mediaSeconds:Number.isFinite(video.currentTime)&&video.currentTime>=0?video.currentTime:0,playbackRate:Number.isFinite(video.playbackRate)?video.playbackRate:1});
});const inspectDocpleDom=(function inspectDocpleDom(){
 const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
 const visible=e=>{if(!e||!e.isConnected||!e.getClientRects().length||e.closest('[hidden],[aria-hidden="true"],[inert]'))return false;for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||['hidden','collapse'].includes(s.visibility))return false;}return true;};
 const all=(s,r=document)=>[...r.querySelectorAll(s)].filter(visible),text=e=>norm(e?.innerText||e?.textContent),compact=s=>norm(s).replace(/\s/g,'');
 const date=s=>{const m=String(s||'').match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/);if(!m)return '';const v=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;try{return new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:'';}catch{return '';}};
 const time=s=>{const m=String(s||'').match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);return m?m[1].padStart(2,'0')+':'+m[2]:'';};
 const one=xs=>{const v=[...new Set(xs.filter(Boolean))];return v.length===1?v[0]:'';};
 const detailUrl=raw=>{try{const u=new URL(raw,location.href);if(u.origin!=='https://docple-plus.com'||u.username||u.password||u.hash||!/^\/webinar\/[1-9]\d{0,15}\/?$/.test(u.pathname))return '';for(const [k,v] of u.searchParams)if(!['category','categoryAll','mode','liveFilter','period','sort','searchType','keyword','page','view','layout','week','date'].includes(k)||!/^[A-Za-z0-9_\-]{0,40}$/.test(v))return '';return u.href;}catch{return '';}};
 const state=r=>{const values=all('span,p,strong,b',r).filter(e=>!all('span,p,strong,b',e).length).map(e=>compact(text(e)));const yes=values.includes('신청완료')||values.includes('신청이완료되었어요'),no=values.some(s=>['신청가능','신청하기','미신청','신청준비중'].includes(s)),closed=values.includes('신청마감');return yes&&(no||closed)?'unknown':yes?'registered':closed?'closed':no?'not_registered':'unknown';};
 const queryAllowed=u=>{const seen=new Set();for(const [k,v] of u.searchParams){if(seen.has(k)||!['category','categoryAll','mode','liveFilter','period','sort','searchType','keyword','page','view','layout','week','date'].includes(k)||!/^[A-Za-z0-9_\-]{0,40}$/.test(v))return false;seen.add(k);}return true;};
 const here=new URL(location.href),out={phase:'other',cards:[],detail:null,loading:document.readyState!=='complete'||all('[aria-busy="true"],[data-testid="webinar-card-skeleton"]').length>0,login:false,challenge:false,unknown:0};
 if(window.top!==window.self||here.origin!=='https://docple-plus.com'||here.username||here.password){out.phase='blocked';return out;}
 out.login=/^\/auth\/login\/?$/.test(here.pathname)||all('input[type="password"]').length>0;
 // A same-origin login redirect is a read-only signal; its opaque return query
 // is neither followed nor returned. Native still owns every recovery grant.
 if(out.login)return out;
 if(here.hash||!queryAllowed(here)){out.phase='blocked';return out;}
 const dialogs=all('[role="dialog"][aria-modal="true"]');out.login||=dialogs.some(e=>/로그인이필요|로그인후/.test(compact(text(e))));out.challenge=dialogs.some(e=>!out.login);
 if(/^\/webinar\/?$/.test(here.pathname)){
  out.phase='catalog';
  for(const e of all('a[class*="gtm-webinar-item-"][href]')){
   const token=[...e.classList].find(c=>/^gtm-webinar-item-[1-9]\d{0,15}$/.test(c)),url=detailUrl(e.getAttribute('href'));if(!token||!url){out.unknown++;continue;}
   const id=token.slice('gtm-webinar-item-'.length);if(new URL(url).pathname.replace(/\/$/,'').split('/').pop()!==id){out.unknown++;continue;}
   // Full year is supplied by the official accessible broadcast-date label.
   const dates=all('[role="group"][aria-label^="방송일 "]',e).map(n=>date(n.getAttribute('aria-label'))),times=all('[aria-label^="방송 일정:"]',e).map(n=>time(n.getAttribute('aria-label')));
   if(all('[aria-label^="다시보기"]',e).length)continue;
   const heading=all('[class*="cardStyles__CardHeading"]',e),title=one(heading.map(n=>n.getAttribute('title')||text(n))),ariaTitle=norm(e.getAttribute('aria-label')).replace(/\s*상세 보기$/,'');
   const d=one(dates),t=one(times);if(!title||title.length>500||ariaTitle!==title||!d||!t){out.unknown++;continue;}
   const ended=all('[class*="CardBroadcastBadge"]',e).some(n=>compact(text(n))==='종료');
   out.cards.push({element:e,id,url,title,date:d,time:t,registrationStatus:state(e),ended});
  }
  out.heading=all('h1,h2,[class*="listStyles__PageTitle"]').some(e=>text(e)==='웨비나');
  out.empty=all('[class*="listStyles__ResultsCountValue"]').some(e=>/^0(?:개)?$/.test(compact(text(e))));
  out.next=all('button[aria-label="다음 페이지"]').filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true');
  return out;
 }
 const match=here.pathname.match(/^\/webinar\/([1-9]\d{0,15})\/?$/);
 if(match){
  out.phase='detail';const summaries=all('[data-detail-anchor="summary"]'),information=all('[data-detail-anchor="information"]'),panels=all('[data-detail-anchor="action-panel"]');
  if(summaries.length!==1||information.length!==1||panels.length!==1){out.unknown++;return out;}
  const summary=summaries[0],rows=all('dt',information[0]).filter(e=>['일정','방송일정'].includes(compact(text(e))));
  const values=rows.filter(e=>e.nextElementSibling?.tagName==='DD').map(e=>text(e.nextElementSibling));
  const titles=all('h1,h2,h3,[class*="memberDetailStyles__Title"]',summary).filter(e=>!all('h1,h2,h3,[class*="memberDetailStyles__Title"]',e).length).map(text),title=one(titles);
  const d=one(values.map(date)),t=one(values.map(time)),summaryDates=all('[role="group"][aria-label]',summary).map(e=>date(e.getAttribute('aria-label'))).filter(Boolean);
  if(!title||!d||!t||summaryDates.some(v=>v!==d)){out.unknown++;return out;}
  const controls=all('[data-detail-anchor="participation-actions"] button.gtm-webinar-detail-primary',panels[0]);
  const ended=all('[data-detail-anchor="status-row"] span',summary).some(e=>compact(text(e))==='종료');
  out.detail={id:match[1],title,date:d,time:t,registrationStatus:state(summary),ended,controls,panel:panels[0]};
 }
 return out;
});const docpleEntryPage=(function docpleEntryPage(job,mode='inspect',manualTarget=null,read=inspectDocpleDom){
 const diag={candidateCards:0,titleMatches:0,scheduleMatches:0,matchedTargets:0,entryControls:0,targetMatched:false},out=(status,reason,extra={})=>({status,reason,...diag,...extra}),norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
 try{
  if(!job||job.site!=='docple'||!job.key||!job.title||!/^\d{4}-\d{2}-\d{2}$/.test(job.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time))return out('invalid','invalid_job');
  if(!Number.isFinite(job.due)||!Number.isFinite(job.deadline))return out('invalid','invalid_job');
  if(mode!=='manual_click'&&(Date.now()<job.due||Date.now()>job.deadline))return out('outside_window','outside_window');
  const page=read();if(page.phase==='blocked')return out('blocked','document_origin');if(page.login)return out('login','login_page');if(page.challenge)return out('blocked','unbound_dialog');if(page.loading)return out('not_open','page_loading');
  const expectedId=(()=>{try{const u=new URL(job.url);return u.origin==='https://docple-plus.com'&&!u.username&&!u.password&&!u.hash?u.pathname.match(/^\/webinar\/([1-9]\d{0,15})\/?$/)?.[1]||'':'';}catch{return '';}})();
  if(!expectedId)return out('invalid','invalid_job');
  const records=page.phase==='catalog'?page.cards:page.detail?[page.detail]:[];diag.candidateCards=records.length;
  const titles=records.filter(r=>norm(r.title)===norm(job.title));diag.titleMatches=titles.length;
  const matched=records.filter(r=>r.date===job.date&&r.id===expectedId);if(matched.length>1)return out('ambiguous','duplicate_target');
  if(matched.length!==1)return out('target_missing','title_unmatched');const row=matched[0];diag.matchedTargets=1;diag.targetMatched=true;
  const plans=job.schedulePlan,paired=job.schedulePairSchema===1&&[0,1].includes(job.scheduleSlot)&&Array.isArray(plans)&&plans.length===2&&plans[job.scheduleSlot]?.time===job.time&&plans.every(p=>/^([01]\d|2[0-3]):[0-5]\d$/.test(p?.time)&&Number.isFinite(p.start)&&Number.isFinite(p.due)&&Number.isFinite(p.deadline))&&plans[0].time!==plans[1].time;
  const times=paired?plans.map(p=>p.time):[job.time];if(!times.includes(row.time))return mode==='inspect'?out('schedule_changed','schedule_unmatched',{observedDate:row.date,observedTime:row.time}):out('button_missing','schedule_unmatched');diag.scheduleMatches=1;
  if(row.ended)return out('lecture_ended','provider_ended');if(row.registrationStatus!=='registered')return out(row.registrationStatus==='unknown'?'ambiguous':'not_registered',row.registrationStatus==='unknown'?'registration_conflict':'registration_required');
  if(page.phase==='catalog')return mode==='inspect'?out('navigate','target_detail',{url:row.url}):out('button_missing','detail_required');
  const controls=row.controls||[];diag.entryControls=controls.length;if(controls.length>1)return out('ambiguous','multiple_entry_controls');if(!controls.length)return out('button_missing','registered_button_missing');const button=controls[0];
  if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open','entry_disabled');
  if(/부터\s*입장할\s*수/.test(norm(button.innerText||button.textContent)))return out('not_open','entry_disabled');
  if(norm(button.innerText||button.textContent)!=='입장하기'||button.closest('form'))return out('blocked','unsafe_entry_action');
  if(mode==='manual_click'){const t=manualTarget?.nodeType===1?manualTarget:manualTarget?.parentElement;return out(t&&(t===button||button.contains(t)&&t.closest('button,a,[role="button"]')===button)?'manual_clicked':'ready',t&&(t===button||button.contains(t))?'entry_clicked':'entry_ready');}
  if(!bindEntryControl(job,mode,button))return out('blocked','page_changed');if(mode!=='click')return out('ready','entry_ready');if(window.__doctorGleanEntryAttempt===job.key)return out('already_attempted','click_already_sent');window.__doctorGleanEntryAttempt=job.key;button.click();return out('clicked','entry_clicked');
 }catch{return out('unknown','inspection_error');}
});const shortRepeatEntryPage=(function shortRepeatEntryPage(job,mode='inspect') {
 const hosts={whodadoc:'whodadoc.com',dtalks:'dtalks.kr'},host=hosts[job?.site];
 const diag={candidateCards:0,titleMatches:0,scheduleMatches:0,matchedTargets:0,entryControls:0,targetMatched:false};
 const out=(status,reason='unknown',extra={})=>({status,reason,...diag,...extra});
 let here;try{here=new URL(location.href);}catch{return out('blocked','document_origin');}
 const trusted=u=>u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname===host||u.hostname.endsWith('.'+host));
 if(!host||!trusted(here))return out('blocked','document_origin');
 if(job.repeatSchema!==1||!Number.isInteger(job.repeatSlot)||job.repeatSlot<0||job.repeatSlot>2||!job.key||!job.title||!/^\d{4}-\d{2}-\d{2}$/.test(job.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time))return out('invalid','invalid_job');
 if(Date.now()<job.due||Date.now()>job.deadline)return out('outside_window','outside_window');
 const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
 const visible=e=>!!e&&e.getClientRects().length>0&&!e.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector)).filter(visible);
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 const titleText=e=>{const c=e.cloneNode(true);c.querySelectorAll('.tag-label').forEach(n=>n.remove());return text(c);};
 const identityScope=entryIdentityScope(job,'a.anchor-view,.day_box');
 const titleMatches=e=>identityScope?identityScope.heading(e):norm(titleText(e))===norm(job.title)||(job.title.length===250&&norm(titleText(e).slice(0,250))===norm(job.title));
 const label=e=>norm(e.getAttribute('aria-label')||e.getAttribute('title')||e.value||text(e));
 const safe=raw=>{try{const u=new URL(raw,here);return trusted(u)&&!/(?:login|logout|apply|regist|enroll|payment|order|delete|withdraw|token|auth|session|password|ticket)/i.test(decodeURIComponent(u.pathname+u.search));}catch{return false;}};
 if(all('input[type="password"]').length||/\/(?:auth\/)?login(?:\.do)?\/?$/i.test(here.pathname))return out('login','login_page');
 if(/Verify you are human|Checking your browser|로봇이 아닙니다|비정상적인 접근|접근이 차단/i.test(text(document.body))||all('[role="dialog"][aria-modal="true"]').some(e=>!/편성표|월간/.test(text(e))))return out('blocked','security_check');
 if(document.readyState&&document.readyState!=='complete'||all('[aria-busy="true"],[role="progressbar"]').length)return out('not_open','page_loading');
 const headings=all('h1,h2,h3,h4,h5,h6,.tit,.title,.subject,.memo,[class*="title"]'),titles=headings.filter(titleMatches).filter(e=>!headings.some(x=>x!==e&&e.contains(x)&&titleMatches(x)));
 diag.titleMatches=identityScope?titles.filter(e=>norm(titleText(e))===norm(job.title)||(job.title.length===250&&norm(titleText(e).slice(0,250))===norm(job.title))).length:titles.length;
 const key=job.key+':'+job.repeatSlot;
 if(mode==='entry_probe'||mode==='playback_start'||mode==='playback_probe'){
   if(titles.length!==1)return out(titles.length?'ambiguous':'target_missing',titles.length?'duplicate_target':'title_unmatched');
   const players=all('video,iframe').filter(e=>e.tagName.toLowerCase()==='video'||!!e.getAttribute('src')&&safe(e.getAttribute('src'))&&/강의|라이브|심포지엄|웨비나|player|live/i.test([e.getAttribute('title'),e.getAttribute('id'),e.className].join(' ')));
   if(players.length!==1)return out('not_open','player_unconfirmed');
   let player=players[0],video=player.tagName.toLowerCase()==='video';
   if(!video){
     try{const doc=player.contentDocument,frameUrl=new URL(player.contentWindow.location.href);if(!trusted(frameUrl)||!doc||doc.readyState!=='complete'||doc.querySelector('input[type="password"]'))return out('not_open','player_unconfirmed');const nested=all('video',doc);if(nested.length!==1)return out('not_open','player_unconfirmed');player=nested[0];video=true;}catch{return out('not_open','player_unconfirmed');}
   }
   if(mode==='entry_probe')return video&&(!(player.readyState>=1)||player.ended)?out('not_open','player_unconfirmed'):out('player_observed','player_observed');
   if(!video)return {status:'inaccessible'};
   if(!window.__doctorGleanShortPlayback||window.__doctorGleanShortPlayback.key!==key)window.__doctorGleanShortPlayback={key,player,time:player.currentTime,at:Date.now(),started:false,status:'not_checked'};
   const state=window.__doctorGleanShortPlayback;if(state.player!==player)return {status:'not_ready'};
   if(mode==='playback_start'&&!state.started){state.started=true;state.status='requested';player.muted=true;try{const p=player.play();if(p?.catch)p.catch(e=>state.status=e?.name==='NotAllowedError'?'gesture_required':'play_failed');}catch(e){state.status=e?.name==='NotAllowedError'?'gesture_required':'play_failed';}}
   return {status:!player.paused&&!player.ended&&player.readyState>=2&&Number.isFinite(player.currentTime)&&player.currentTime>state.time+0.1&&Date.now()>state.at?'playing_observed':state.status};
 }
 if(!['inspect','click','open_target','open_catalog'].includes(mode))return out('invalid','invalid_job');
 const sameClock=s=>{const m=s.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);return !!m&&m[1].padStart(2,'0')+':'+m[2]===job.time;};
 const dateIn=s=>{const m=s.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/);return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';};
 let cards=[];
 if(job.site==='whodadoc')cards=all('a.anchor-view').filter(c=>(identityScope?identityScope.root(c):all('h3',c).some(titleMatches))&&dateIn(text(c))===job.date&&sameClock(text(c)));
 else cards=all('.calendar_box.active .day_box').filter(c=>{
   if(!all('.memo',c).some(titleMatches)||!sameClock(text(c.querySelector('.time'))))return false;
   const day=c.closest('.calendar_grid > .day');if(!day)return false;
   const explicit=day.getAttribute('data-date');if(explicit)return explicit===job.date;
   if(/last_month|next_month|outside|other|prev/i.test(day.className))return false;
   const wrap=day.closest('.calendar_wrap'),months=wrap?all('.btn_month_wrap.active .date_txt,.btn_month_wrap.active .date',wrap):[];
   const month=[...new Set(months.map(e=>{const m=text(e).match(/^(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*월?\s*\.?$/);return m?m[1]+'-'+m[2].padStart(2,'0'):'';}).filter(Boolean))];
   const number=text(day.querySelector(':scope > .day_txt')).match(/^([1-9]|[12]\d|3[01])(?:\s*일)?(?:\s*[（(][월화수목금토일](?:요일)?[)）])?$/);
   if(month.length!==1||!number)return false;
   const peers=all('.calendar_grid > .day',day.closest('.calendar_box')).filter(d=>! /last_month|next_month|outside|other|prev/i.test(d.className)&&text(d.querySelector(':scope > .day_txt'))===text(day.querySelector(':scope > .day_txt')));
   return peers.length===1&&month[0]+'-'+number[1].padStart(2,'0')===job.date;
 });
 diag.candidateCards=job.site==='whodadoc'?all('a.anchor-view').length:all('.day_box').length;
 if(cards.length>1)return out('ambiguous','duplicate_target');
 if(cards.length===1){
   const card=cards[0];diag.matchedTargets=1;diag.scheduleMatches=1;diag.targetMatched=true;
   if(all('.tag-label,.state,.status',card).some(e=>/^(?:종료|강의종료|방송종료|다시보기|vod)$/.test(label(e))))return out('lecture_ended','lecture_ended');
   const more=job.site==='whodadoc'?[card]:all('a,button,[role="button"]',card).filter(e=>/^(?:더보기|상세보기|자세히보기)$/.test(label(e)));
   if(more.length!==1)return out(more.length?'ambiguous':'button_missing','target_card_unconfirmed');
   const control=more[0],href=control.getAttribute('href');
   if(control.disabled||control.closest('[aria-disabled="true"],.disabled')||href&&!/^(#|javascript:)/i.test(href)&&!safe(href))return out('blocked','unsafe_entry_action');
   if(job.detailOpened||window.__doctorGleanShortDetail===key)return out('not_open','detail_already_opened');
   if(mode==='inspect')return out('open_target','target_card');
   if(mode!=='open_target')return out('not_open','target_card');
   window.__doctorGleanShortDetail=key;control.click();return out('detail_opened','target_card_opened');
 }
 // Open only a rendered Dtalks schedule menu. This never clicks a lecture.
 if(job.site==='dtalks'&&!all('.calendar_box.active .calendar_grid').length){
   const menu=all('a,button,[role="button"]').filter(e=>/^(?:월간)?편성표(?:보기)?$/.test(label(e)));
   if(menu.length===1&&!window.__doctorGleanShortCatalog){
     const href=menu[0].getAttribute('href');if(href&&!/^(#|javascript:)/i.test(href)&&!safe(href))return out('blocked','unsafe_entry_action');
     if(mode==='inspect')return out('open_catalog','catalog_link');
     if(mode==='open_catalog'){window.__doctorGleanShortCatalog=true;menu[0].click();return out('catalog_opened','catalog_link');}
   }
 }
 if(titles.length!==1)return out(titles.length?'ambiguous':'target_missing',titles.length?'duplicate_target':'title_unmatched');
 const title=titles[0];let root=title.parentElement,matched=null;
 for(let i=0;root&&root!==document.body&&i<6;i++,root=root.parentElement){
   if(all('h1,h2,h3,h4,h5,h6,.tit,.title,.subject,.memo,[class*="title"]',root).filter(titleMatches).filter(e=>!Array.from(e.children).some(titleMatches)).length!==1)continue;
   const fields=all('time,.date,.time,[class*="date"],[class*="time"]',root),schedule=fields.map(text).join(' ');
   if(dateIn(schedule)===job.date&&sameClock(schedule)){
     const other=all('h1,h2,h3,h4,h5,h6,.tit,.title,.subject,.memo',root).filter(e=>!titleMatches(e)&&text(e).length>=10);
     if(other.length)break;
     matched=root;if(all('a,button,[role="button"],input[type="button"],input[type="submit"]',root).length)break;
   }
 }
 if(!matched)return out('target_missing','schedule_unmatched');diag.matchedTargets=1;diag.scheduleMatches=1;diag.targetMatched=true;
 const stateLabels=all('button,a,.state,.status,.tag-label',matched).filter(e=>!e.contains(title)).map(label);
 if(stateLabels.some(s=>/^(?:종료|강의종료|방송종료|다시보기|vod)$/.test(s)))return out('lecture_ended','lecture_ended');
 if(stateLabels.some(s=>/^(?:신청하기|사전신청|미신청|등록하기)$/.test(s)))return out('not_registered','registration_required');
 const controls=all('a,button,[role="button"],input[type="button"],input[type="submit"]',matched).filter(e=>/^(?:(?:강의|실시간|라이브)?(?:입장|시청)(?:하기|하러가기)?|강의보기|라이브보기)$/.test(label(e)));
 diag.entryControls=controls.length;if(controls.length!==1)return out(controls.length?'ambiguous':'button_missing',controls.length?'multiple_entry_controls':'entry_control_missing');
 const control=controls[0];if(control.disabled||control.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open','entry_disabled');
 const href=control.getAttribute('href'),form=control.closest('form'),action=control.getAttribute('formaction')||form?.getAttribute('action');
 if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safe(href)||form&&action&&!safe(action))return out('blocked','unsafe_entry_action');
 if(!bindEntryControl(job,mode,control))return out('blocked','page_changed');if(mode==='inspect')return out('ready','entry_ready');
 if(mode!=='click')return out('invalid','invalid_job');
 if(window.__doctorGleanShortEntry===key)return out('already_attempted','click_already_sent');
 window.__doctorGleanShortEntry=key;control.click();return out('clicked','entry_clicked');
});const hmpAutoEntryPage=(function hmpAutoEntryPage(job, mode='inspect') {
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
 const identityScope=entryIdentityScope(job,'.area');
 const wanted=norm(job.title),matches=[];let inheritedDate='',matchedIdentities=0;
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
   if(identityScope?!identityScope.root(card):!titleMatch)continue;if(titleMatch)diag.titleMatches++;if(identityScope)matchedIdentities++;
   const clockField=card.querySelector('.time');const clock=(visible(clockField)?text(clockField):'').match(/(?:^|\s)([0-2]?\d):([0-5]\d)(?!\d)/);
   if(inheritedDate!==job.date||!clock||`${clock[1].padStart(2,'0')}:${clock[2]}`!==job.time)continue;
   diag.scheduleMatches++;matches.push(card);
 }
 diag.matchedTargets=matches.length;diag.targetMatched=matches.length===1;
 if(matches.length!==1)return out(matches.length?'ambiguous':'target_missing',matches.length?'hmp_duplicate_target':(diag.titleMatches||matchedIdentities)?'hmp_schedule_unmatched':identityScope?'identity_unmatched':'hmp_title_unmatched');
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
 if(!bindEntryControl(job,mode,button))return out('blocked','page_changed');if(mode==='inspect')return out('ready');
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
  const identityScope=entryIdentityScope(job,selector);
  const cards=all(selector);
  diag.candidateCards=cards.length;
  const titleSelector=job.site==='medigate'?'h1,h2,h3,h4,h5,h6,.tit,.title,[class*="title"],[class*="subject"]':'h1,h2,h3,h4,h5,h6,p,span,strong,a,div';
  const titleNodes=all(titleSelector).filter(e=>identityScope?(identityScope.heading(e)||job.site==='medigate'&&!e.closest(selector)&&sameTitle(text(e))):sameTitle(text(e)));
  const leaves=titleNodes.filter(e=>!titleNodes.some(x=>x!==e&&e.contains(x)));
  diag.titleMatches=identityScope?leaves.filter(e=>sameTitle(text(e))).length:leaves.length;
  const cardTitleMatches=r=>{
    if(identityScope)return identityScope.root(r);
    if(leaves.some(e=>r===e||r.contains(e)))return true;
    if(job.site==='keymedi')return sameTitle(r.getAttribute('data-gtm-content-title'));
    if(job.site==='intermd'){
      const topics=all('.webinarItem__topic,.webinar__topic,.mWebinar__topic',r);
      return topics.length>0&&sameTitle(topics.map(e=>text(e).replace(/\s+/g,' ').trim()).join(' '));
    }
    return false;
  };
  const label=e=>norm(e.getAttribute('aria-label')||text(e)||all('img[alt]',e).map(i=>i.getAttribute('alt')).join(' '));
  const pcOnly=s=>/^(?:(?:본|해당|이)(?:강의|세미나|웨비나)(?:는|은))?(?:pc전용(?:강의|세미나|웨비나)?(?:입니다)?|pc에서만(?:입장|시청|수강|접속)(?:이)?가능(?:합니다)?|pc로(?:입장|접속)(?:해)?(?:주세요|주시기바랍니다))[.!。]?$/.test(norm(s));
  const pcNotice=r=>job.site==='keymedi'&&all('p,span,strong,div',r).some(e=>!e.children.length&&!leaves.includes(e)&&pcOnly(text(e)));
  const controls=r=>[...(r.matches('a,button,[role="button"]')?[r]:[]),...all('a,button,[role="button"]',r)];
  const plans=job.schedulePlan;
  const paired=job.schedulePairSchema===1&&[0,1].includes(job.scheduleSlot)&&Array.isArray(plans)&&plans.length===2&&plans[job.scheduleSlot]?.time===job.time&&plans.every(p=>/^([01]\d|2[0-3]):[0-5]\d$/.test(p?.time)&&Number.isFinite(p.start)&&Number.isFinite(p.due)&&Number.isFinite(p.deadline))&&plans[0].time!==plans[1].time;
  const acceptedTimes=paired?plans.map(p=>p.time):[job.time],observedSchedules=new Map(),fallbackSchedules=new Map();
  // Generated presentation classes need not match the old date/time selectors.
  // For copy recognition, accept only complete calendar/clock labels outside
  // the matched title, with one independent date and one start time.
  const fallbackSchedule=r=>{
    if(job.site!=='medigate')return '';
    const nodes=all('span,time,div,p,dt,dd',r);if(nodes.length>128)return '';
    const clock=/^([01]?\d|2[0-3]):([0-5]\d)(?:\s*[~〜–—-]\s*([01]?\d|2[0-3]):([0-5]\d))?$/;
    const labels=[];
    for(const e of nodes){
      if(leaves.some(t=>e===t||e.contains(t)||t.contains(e)))continue;
      const value=text(e).replace(/\s+/g,' ').trim();if(value.length>96)continue;
      const d=value.match(/^(?:(20\d{2})\s*[.\/년-]\s*)?(\d{1,2})\s*[.\/월-]\s*(\d{1,2})(?!\d)(?:\s*[일.])?\s*(?:\(([가-힣A-Za-z]+)\))?\s*(.*)$/);
      if(d){
        const year=+(d[1]||job.date.slice(0,4)),month=+d[2],day=+d[3],date=new Date(Date.UTC(year,month-1,day));
        if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)continue;
        if(d[4]){const name=d[4].toLowerCase(),weekday=name.length===1&&'일월화수목금토'.includes(name)?'일월화수목금토'.indexOf(name):[['sun','sunday'],['mon','monday'],['tue','tuesday'],['wed','wednesday'],['thu','thursday'],['fri','friday'],['sat','saturday']].findIndex(names=>names.includes(name));if(weekday!==date.getUTCDay())continue;}
        const t=d[5]?d[5].match(clock):null;if(d[5]&&!t)continue;
        labels.push({e,date:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,start:t?`${t[1].padStart(2,'0')}:${t[2]}`:''});
      }else{const t=value.match(clock);if(t)labels.push({e,start:`${t[1].padStart(2,'0')}:${t[2]}`});}
    }
    const outer=labels.filter(x=>!labels.some(p=>p!==x&&p.e.contains(x.e))),dates=new Set(outer.map(x=>x.date).filter(Boolean)),starts=new Set(outer.map(x=>x.start).filter(Boolean));
    return dates.size===1&&dates.has(job.date)&&starts.size===1?[...starts][0]:'';
  };
  const sameSchedule=r=>{
    if(/(?:강의|방송|행사|세미나)\s*취소|취소된\s*(?:강의|행사)/.test(text(r)))return false;
    const fields=all('.detail_date,.detail_date_location,.sci_detail,.webinarItem__date,.webinar__info,.mWebinar__date,time,.date,.time',r);
    if(!fields.length){const start=fallbackSchedule(r);if(start){fallbackSchedules.set(r,start);return acceptedTimes.includes(start);}}
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
      const start=`${String(hour).padStart(2,'0')}:${time[3]}`;
      if(fields.length&&/\d{1,2}:[0-5]\d/.test(values.join(' '))&&!fields.some(e=>leaves.some(t=>e===t||e.contains(t)||t.contains(e))))observedSchedules.set(r,start);
      return acceptedTimes.includes(start);
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
      const pcContainer=p.matches('article,section')&&!all('article,section',p).length&&all('h1,h2,h3,h4,h5,h6',p).every(e=>sameTitle(text(e)));
      if(sameSchedule(p)&&(controls(p).length||pcContainer&&pcNotice(p))){roots.push(p);break;}
    }
  }
  const registration=r=>{
    const evidence=all('a,button,[role="button"],span,p,strong,dt,dd',r).filter(e=>!leaves.some(l=>e===l||e.contains(l)));
    const unregistered=evidence.some(e=>/^(?:(?:사전|강의|세미나|웨비나|수강|참가))?(?:미신청|미등록|신청하기|수강신청|사전신청|등록하기|신청후입장하기)$/.test(label(e))||/^(?:(?:사전)?(?:신청|등록)(?:을|이)?(?:하지않은|되지않은|필요한)강의(?:입니다)?[.!]?|미신청강의(?:입니다)?[.!]?)$/.test(label(e)));
    const registered=evidence.some(e=>/^(?:(?:사전|수강|강의|참가))?(?:신청완료|등록완료|신청취소|등록취소|신청내역)$/.test(label(e)));
    return {unregistered,registered};
  };
  const isEntry=e=>{
    const s=label(e);
    if(job.site==='keymedi'&&s==='바로가기')return ['www.keymedi.com','keymedi.com'].includes(here.hostname)&&/^\/meditv\/live\/[A-Za-z0-9_-]+\/?$/.test(here.pathname)&&!here.search&&!here.hash&&job.detailOpened===true&&e.matches('button,a,[role="button"]')&&e.getAttribute('data-gtm-event-name')==='engagement_click'&&e.getAttribute('data-gtm-content-category')==='메디 TV_메디TV Live'&&(identityScope?identityScope.root(e.closest('article,section')||e.parentElement):sameTitle(e.getAttribute('data-gtm-content-title')))&&norm(e.getAttribute('data-gtm-click-text'))==='바로가기';
    if(/^(?:(?:live|라이브|강의|세미나|웨비나|온라인|웹심포지움|웹심포지엄))?(?:입장|입장하기|바로입장|시청하기|시청)$/.test(s))return true;
    if(['medigate','keymedi','intermd'].includes(job.site)&&['강의보기','시청하러가기','바로시청하기','라이브보기'].includes(s))return true;
    return job.site==='bluepharm'&&s==='참여하기'&&all('.W_status.ongoing',root).length>0;
  };
  const schedules=new Map([...observedSchedules,...fallbackSchedules]);
  let observed=[...schedules.keys()].filter(r=>![...schedules.keys()].some(x=>x!==r&&r.contains(x)));
  // On the reviewed list route, one ARTICLE is the collector's stable list
  // target. A rotating presentation is a copy only with the same original
  // public detail identity, or when it has no entry/navigation action at all.
  // Two actual articles and conflicting schedules/identities remain ambiguous.
  const presentationCopies=new Set();
  const structural=[...new Set([...observed,...roots])].filter(r=>![...observed,...roots].some(x=>x!==r&&r.contains(x)));
  if(job.site==='medigate'){diag.articleTargets=structural.filter(r=>r.matches('article')).length;diag.presentationTargets=structural.length-diag.articleTargets;diag.presentationCopies=0;}
  if(job.site==='medigate'&&['www.medigate.net','new.medigate.net'].includes(here.hostname)&&/^\/symposium\/?$/.test(here.pathname)&&!here.search&&!here.hash){
    const articles=structural.filter(r=>r.matches('article'));
    if(articles.length===1){
      const article=articles[0];
      const detail=raw=>{try{const u=new URL(raw,here.href);return trusted(u)&&u.origin===here.origin&&/^\/symposium\/[1-9]\d*\/?$/.test(u.pathname)&&!u.search&&!u.hash?u.href:'';}catch{return '';}};
      const identity=r=>{
        const anchors=controls(r).filter(a=>a.matches('a[href]')&&(leaves.some(l=>a===l||a.contains(l))||['상세보기','강의상세','자세히보기'].includes(label(a))));
        const ids=anchors.map(a=>detail(a.getAttribute('href')));
        return ids.length&&ids.every(Boolean)&&new Set(ids).size===1?ids[0]:'';
      };
      const articleId=identity(article),savedId=job.url?detail(job.url):'';
      for(const copy of structural){
        // A presentation's date/title observation may be nested below its
        // actionable link. Validate that whole original root before excluding
        // its observations; an action-free child cannot hide a foreign link.
        const owners=[...new Set(roots.filter(r=>r!==article&&!r.closest('article')&&(r===copy||r.contains(copy))))];
        if(owners.length>1)continue;const scope=owners[0]||copy;
        if(copy===article||copy.closest('article')||!schedules.has(article)||!acceptedTimes.includes(schedules.get(article))||schedules.get(scope)!==schedules.get(article))continue;
        if(job.url&&(!savedId||articleId!==savedId))continue;
        const entry=controls(scope).filter(isEntry),links=controls(scope).filter(a=>a.matches('a[href]')&&!/^\s*(?:#|javascript:(?:void\(0\)|;))/i.test(a.getAttribute('href')||''));
        const copyId=identity(scope);
        if(!(articleId&&copyId===articleId)&&!(entry.length===0&&links.length===0))continue;
        if(registration(scope).unregistered)return out('ambiguous','registration_conflict');
        if(entry.length>1)continue;
        presentationCopies.add(scope);
      }
    }
  }
  if(job.site==='medigate')diag.presentationCopies=presentationCopies.size;
  const copied=r=>[...presentationCopies].some(scope=>scope===r||scope.contains(r));
  observed=observed.filter(r=>!copied(r));
  if(observed.length>1){diag.matchedTargets=observed.length;diag.scheduleMatches=observed.length;return out('ambiguous','duplicate_target');}
  if(mode==='inspect'&&observed.length===1&&(!identityScope||identityScope.root(observed[0]))&&!acceptedTimes.includes(schedules.get(observed[0])))return out('schedule_changed','schedule_unmatched',{targetMatched:true,matchedTargets:1,observedDate:job.date,observedTime:schedules.get(observed[0])});
  let unique=[...new Set(roots)].filter(r=>!copied(r)&&!roots.some(x=>x!==r&&!copied(x)&&r.contains(x)));
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
  if(identityScope&&!identityScope.root(root))return out('target_missing','identity_unmatched');
  if(pcNotice(root))return out('pc_required','pc_only');
  if(job.site==='keymedi'){
    const states=new Set(all('span',root).map(label).filter(s=>['신청완료','강의중'].includes(s)));
    diag.targetCardState=states.size===1?(states.has('신청완료')?'registered':'live'):'unknown';
  }
  const buttons=controls(root).filter(isEntry);diag.entryControls=buttons.length;
  const {unregistered,registered}=registration(root);
  // A DOM modal is accepted only as explicit evidence within the matched card.
  if(all('[role="dialog"][aria-modal="true"]').some(e=>!root.contains(e)))return out('blocked','unbound_dialog');
  if(unregistered)return out(buttons.length||registered?'ambiguous':'not_registered',buttons.length||registered?'registration_conflict':'registration_required');
  if(buttons.length>1)return out('ambiguous','multiple_entry_controls');
  if(!buttons.length){
    // The official LIVE list uses an onClick on the GTM div/li itself. Opening
    // that exact card is a separate one-shot step, never an entry success. The
    // site's handler owns detail routing (or its external-link click log); no
    // URL is guessed and nested bookmark/application controls are not clicked.
    const keymediCard=job.site==='keymedi'&&['www.keymedi.com','keymedi.com'].includes(here.hostname)&&/^\/meditv\/live\/?$/.test(here.pathname)&&root.matches(selector)&&root.matches('div,li')&&(identityScope?identityScope.root(root):sameTitle(root.getAttribute('data-gtm-content-title')));
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
    // Medigate's registered list article can route through its original title
    // handler without an anchor. Open only the one exact heading, once; the
    // resulting detail must independently prove its own schedule and button.
    const medigateCard=job.site==='medigate'&&['www.medigate.net','new.medigate.net'].includes(here.hostname)&&/^\/symposium\/?$/.test(here.pathname)&&!here.search&&!here.hash&&root.matches('article')&&registered&&!all('a[href]',root).length;
    if(medigateCard){
      const headings=all('h1,h2,h3,h4,h5,h6',root).filter(e=>sameTitle(text(e)));
      const heading=headings.length===1?headings[0]:null;
      const actionable=heading&&(getComputedStyle(heading).cursor==='pointer'||typeof heading.onclick==='function'||heading.getAttribute('role')==='link');
      if(actionable&&!heading.closest('[disabled],[aria-disabled="true"],.disabled')){
        if(job.detailOpened||window.__doctorGleanDetailAttempt===job.key)return out('button_missing','detail_already_opened');
        if(mode==='inspect')return out('open_target','target_card');
        if(mode==='open_target'){
          window.__doctorGleanDetailAttempt=job.key;
          try{heading.click();return out('detail_opened','target_card_opened');}catch{return out('unknown','target_card_unconfirmed');}
        }
      }
    }
    return out('button_missing',registered?'registered_button_missing':'entry_control_missing');
  }
  const button=buttons[0];
  if(job.site==='keymedi'&&label(button)==='바로가기')diag.keymediExternalEntry=true;
  if(job.keymediExternalEntryExpected===true&&diag.keymediExternalEntry!==true)return out('unknown','entry_changed');
  if(button.disabled||button.closest('[disabled],[aria-disabled="true"],.disabled'))return out('not_open','entry_disabled');
  const href=button.closest('a[href]')?.getAttribute('href');
  const configuredMedigateEntry=raw=>{
    if(job.site!=='medigate'||!['www.medigate.net','new.medigate.net'].includes(here.hostname)||!/^\/symposium(?:\/[1-9]\d*)?\/?$/.test(here.pathname)||here.search||here.hash||!Array.isArray(job.externalEntryHosts))return false;
    try{
      const u=new URL(raw,here.href);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||/[\x00-\x20\x7f\\]/.test(String(raw)))return false;
      let path=u.pathname;for(let i=0;i<4;i++){if(/\.(?:apk|aab|apks|xapk|exe|msi|sh|bat|cmd|com|ps1|vbs|jar)(?:\/.*)?$/i.test(path))return false;const next=decodeURIComponent(path);if(next===path)break;path=next;if(i===3)return false;}
      return job.externalEntryHosts.slice(0,16).some(row=>row&&typeof row.host==='string'&&typeof row.http==='boolean'&&row.host===u.hostname&&(u.protocol==='https:'||row.http));
    }catch{return false;}
  };
  const reviewedMedigateEntry=raw=>{
    if(job.site!=='medigate'||!['www.medigate.net','new.medigate.net'].includes(here.hostname)||!/^\/symposium(?:\/[1-9]\d*)?\/?$/.test(here.pathname)||here.search||here.hash)return false;
    try{const u=new URL(raw,here.href);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port&&u.hostname==='websympo2.live-on.kr'&&u.pathname==='/pws/onair.do';}catch{return false;}
  };
  if(href&&!/^\s*(?:#|javascript:)/i.test(href)&&!safeLink(href)&&!reviewedMedigateEntry(href)&&!configuredMedigateEntry(href))return out('blocked','unsafe_entry_action');
  const form=button.closest('form'),action=button.getAttribute('formaction')||form?.getAttribute('action');
  if(form&&action&&!safeLink(action)&&!configuredMedigateEntry(action))return out('blocked','unsafe_entry_action');
  if(mode==='manual_click'){
    let matched=false;try{
      const target=manualTarget?.nodeType===1?manualTarget:manualTarget?.parentElement;
      matched=manualTarget===button||!!target&&button.contains(target)&&target.closest('a,button,[role="button"]')===button;
    }catch{}
    return out(matched?'manual_clicked':'ready',matched?'entry_clicked':'entry_ready');
  }
  if(!bindEntryControl(job,mode,button))return out('blocked','page_changed');if(mode!=='click')return out('ready','entry_ready');
  if(window.__doctorGleanEntryAttempt===job.key)return out('already_attempted','click_already_sent');
  window.__doctorGleanEntryAttempt=job.key;button.click();return out('clicked','entry_clicked');
});return (function autoEntryPage(job, mode='inspect', manualTarget=null) {
  if(mode==='receipt')return entryReceiptPage(job);
  if(mode==='receipt_network_start')return entryReceiptNetworkStart(job);
  if(mode==='watch_start'||mode==='watch_probe')return entryWatchPage(job,mode);
  if(job?.site==='docple')return docpleEntryPage(job,mode,manualTarget);
  if(['whodadoc','dtalks'].includes(job?.site))return shortRepeatEntryPage(job,mode);
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
  const title=norm(job.title);
  const sensitive=/(?:login|logout|regist|apply|enroll|payment|order|cart|token|auth|session|password|email|ticket|delete|withdraw)/i;
  const safeLink=raw=>{try{const u=new URL(raw,location.href);return trusted(u)&&!sensitive.test(decodeURIComponent(u.pathname+u.search))?u.href:'';}catch{return '';}};
  const identityScope=entryIdentityScope(job,'a.list_detail');
  const titles=all('h1,h2,h3,h4,h5,h6,p,span,strong,a,div.tit').filter(e=>identityScope?identityScope.heading(e):norm(text(e))===title);
  if(job.site==='doctorville'&&!identityScope){
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
  const leaves=[...new Set(titles)].filter(e=>!titles.some(x=>x!==e&&e.contains(x)));diag.titleMatches=identityScope?leaves.filter(e=>norm(text(e))===title).length:leaves.length;
  if(!leaves.length){
    if(mode==='inspect'&&job.site==='bluepharm'){
      const links=[...new Set(all('header a[href],nav a[href],a[href*="webcast.main"]').filter(e=>['세미나','웹심포지움','웹심포지엄','웨비나','웹세미나'].includes(norm(text(e)))).map(e=>safeLink(e.getAttribute('href'))).filter(u=>u&&u!==here.href))];
      if(links.length===1)return out('navigate',{url:links[0]});
    }
    return out('target_missing');
  }
  const selectors={doctorville:'a.list_detail',intermd:'.webinarItem--live,.webinarItem--main,.webinarItem--brand,.webinarItem--home,.webinar__boxLink,.mWebinar__item',bluepharm:'.sem_info,.sem_cal_item',medigate:'article',keymedi:'[data-gtm-event-name="content_click"][data-gtm-content-category="메디 TV_메디TV Live"]'};
  const plans=job.schedulePlan;
  const paired=job.schedulePairSchema===1&&[0,1].includes(job.scheduleSlot)&&Array.isArray(plans)&&plans.length===2&&plans[job.scheduleSlot]?.time===job.time&&plans.every(p=>/^([01]\d|2[0-3]):[0-5]\d$/.test(p?.time)&&Number.isFinite(p.start)&&Number.isFinite(p.due)&&Number.isFinite(p.deadline))&&plans[0].time!==plans[1].time;
  const acceptedTimes=paired?plans.map(p=>p.time):[job.time],observedSchedules=new Map();
  const sameSchedule=root=>{
    if(identityScope&&!identityScope.root(root))return false;
    if(/(?:강의|방송|행사|세미나)\s*취소|취소된\s*(?:강의|행사)/.test(text(root)))return false;
    if(all('h1,h2,h3,h4,h5,h6,.tit',root).some(e=>!leaves.some(t=>e===t||e.contains(t)||t.contains(e))&&norm(text(e))))return false;
    // Independent visible fields bind the date and first clock to this lecture.
    // Titles, prose, hidden fields and neighbouring cards provide no schedule.
    const fields=all('.detail_date,.time,time,.date',root).filter(e=>!leaves.some(t=>e===t||e.contains(t)||t.contains(e)));
    const values=fields.filter(e=>!fields.some(x=>x!==e&&e.contains(x))).map(e=>{
      const copy=e.cloneNode(true),original=[...e.querySelectorAll('*')],cloned=[...copy.querySelectorAll('*')];for(let i=0;i<original.length;i++)if(!visible(original[i]))cloned[i].remove();for(const x of copy.querySelectorAll('[hidden],[aria-hidden="true"],.tit,h1,h2,h3,h4,h5,h6'))x.remove();return text(copy);
    });
    const dates=[],starts=[];
    for(const value of values){
      const full=[...value.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/g)];
      for(const m of full)dates.push(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
      if(!full.length){const m=value.match(/(?:^|\s)(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일|\s*\()/);if(m)dates.push(`${job.date.slice(0,4)}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`);}
      const m=value.match(/(?:(오전|오후)\s*)?(\d+):(\d+)/);
      if(!m)continue;
      if(!/^([01]?\d|2[0-3])$/.test(m[2])||!/^([0-5]\d)$/.test(m[3]))return false;
      let hour=+m[2];if(m[1]){if(hour<1||hour>12)return false;hour=hour%12+(m[1]==='오후'?12:0);}
      starts.push(`${String(hour).padStart(2,'0')}:${m[3]}`);
    }
    if(!dates.length||!dates.every(d=>d===job.date)||!starts.length||!starts.every(t=>t===starts[0]))return false;
    observedSchedules.set(root,starts[0]);return acceptedTimes.includes(starts[0]);
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
  const observed=[...observedSchedules.keys()].filter(r=>![...observedSchedules.keys()].some(x=>x!==r&&r.contains(x)));
  if(observed.length>1){diag.matchedTargets=observed.length;diag.scheduleMatches=observed.length;return out('ambiguous');}
  if(mode==='inspect'&&observed.length===1&&!acceptedTimes.includes(observedSchedules.get(observed[0])))return out('schedule_changed',{reason:'schedule_unmatched',targetMatched:true,matchedTargets:1,observedDate:job.date,observedTime:observedSchedules.get(observed[0])});
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
  if(!bindEntryControl(job,mode,button))return out('blocked','page_changed');if(mode!=='click')return out('ready');
  if(window.__doctorGleanEntryAttempt===job.key)return out('already_attempted');
  window.__doctorGleanEntryAttempt=job.key;
  // Never auto-accept a dialog, submit enrollment/payment, or synthesize viewing.
  button.click();
  return out('clicked');
})(job,mode,manualTarget);})