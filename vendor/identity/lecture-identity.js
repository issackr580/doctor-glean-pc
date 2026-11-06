// Official lecture identity only. This never evaluates a handler, reads account
// state, calls an API, or manufactures a detail/player URL from an identifier.
export function readLectureIdentity(site,input,base){
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
}

// Replaces title eligibility only when an actual official identity is available.
// A known ID never falls back to a same-title card with missing/different ID.
export function entryIdentityScope(job,selector){
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
}

export function observedLectureUrl(site,row,base){
 const identity=readLectureIdentity(site,row,base);if(!identity)return '';
 const links=[row,...row.querySelectorAll('a[href]')];
 for(const link of links){
  if(!link.getClientRects?.().length||link.closest?.('[hidden],[aria-hidden="true"]'))continue;
  const raw=link.getAttribute?.('href'),id=readLectureIdentity(site,raw,base);
  if(id&&id.kind===identity.kind&&id.id===identity.id)return new URL(raw,base).href;
 }
 return '';
}
