export const SITES = [
  {id:'doctorville',name:'닥터빌',short:'닥빌',host:'doctorville.co.kr',url:'https://www.doctorville.co.kr/seminar/main',menu:'라이브세미나',rowSelector:'a.list_detail[href*="seminarDetail?"]',timeSelector:'.time .start',titleSelector:'.tit',advancedSelector:'.ic_survey',filter:'all',crawler:'catalog-v1',support:'trial'},
  {id:'keymedi',name:'키메디',short:'키메',host:'keymedi.com',url:'https://www.keymedi.com/meditv/live',menu:'메디TV · P 또는 M 표시',filter:'pm',crawler:'keymedi-live-v1',clientScript:'main.7fb34e30.chunk.js'},
  {id:'hmp',name:'한미 HMP',short:'한미',host:'hmp.co.kr',url:'https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm',menu:'LIVE 심포지엄',filter:'all',crawler:'catalog-v2',support:'trial',rowSelector:'a.head',dateSelector:'.top .date',timeSelector:'.top .time',titleSelector:'.subject',singleAtTime:false},
  {id:'intermd',name:'인터엠디',short:'인터엠디',host:'intermd.co.kr',url:'https://www.intermd.co.kr/webinar/list.do',alternateCatalogUrl:'https://moa.intermd.co.kr/mobile/webinar/list.do',menu:'웹 세미나',filter:'all',crawler:'additional-catalog-v1',support:'trial'},
  {id:'whodadoc',name:'후다닥의사',short:'후다닥',host:'whodadoc.com',url:'https://hcp.whodadoc.com/hcp/main',menu:'웨비나',filter:'all',crawler:'additional-catalog-v1',support:'trial',discoverMenu:true,menuLabels:['웨비나','웹 세미나','웨비나&학회','웨비나/학회']},
  {id:'medigate',name:'메디게이트',short:'메겟',host:'medigate.net',url:'https://new.medigate.net/symposium',menu:'웹심포지움',filter:'all',crawler:'catalog-v2',support:'trial'},
  {id:'ckd',name:'종근당',short:'종근당',host:'ckdmediview.com',url:'https://www.ckdmediview.com/hcpapp/webinar/webinar.do',menu:'웨비나 · Bell 지급',filter:'bell',crawler:'ckd-calendar-v1',support:'trial'},
  {id:'bluepharm',name:'블루팜',short:'블루팜',host:'bluepharmkorea.co.kr',url:'https://bluepharmkorea.co.kr/',menu:'웹심포지움 · 오프라인 전용 제외',filter:'all',crawler:'additional-catalog-v1',support:'trial',discoverMenu:true,menuLabels:['웹심포지움','웹심포지엄','웨비나','웹 세미나']},
  {id:'dtalks',name:'디톡스',short:'디톡스',host:'dtalks.kr',url:'https://www.dtalks.kr/websim/vodList.do',menu:'웹 심포지엄 · 편성표',filter:'all',crawler:'additional-catalog-v1',support:'trial'}
];
export const DAY=86400000, KST=9*3600000;
export function kstDate(ms=Date.now()){return new Date(ms+KST).toISOString().slice(0,10);}
export function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function addDays(s,n){if(!validDate(s))throw Error('올바른 날짜를 입력해 주세요.');return new Date(Date.parse(s+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
export function initialSettings(){return {autoEnabled:false,enabledAt:null,lastScheduledTarget:null,profiles:Object.fromEntries(SITES.map(s=>[s.id,{dateSelector:'',groupSelector:'',rewardSelector:'',emptySelector:'',readySelector:'',allowNoPagination:false,...s,validated:false,linked:false}]))};}
export function allowedUrl(url,site){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname===site.host||u.hostname.endsWith('.'+site.host))&&!u.username&&!u.password;}catch{return false;}}
export function publicSource(url){try{const u=new URL(url);for(const k of [...u.searchParams.keys()])if(/token|auth|session|password|email|code|ticket/i.test(k))u.searchParams.delete(k);u.hash='';return u.href;}catch{return '';}}
export function normalizeTitle(t=''){return String(t).replace(/\s+/g,' ').trim();}
export function dedupe(events){const seen=new Set();return events.filter(e=>{const key=[e.site,e.date,e.time,e.site==='hmp'?'':e.id||'',normalizeTitle(e.title)].join('|');if(seen.has(key))return false;seen.add(key);return true;});}
export function registrationStatus(event){return event?.site==='hmp'?(['registered','not_registered','closed'].includes(event.registrationStatus)?event.registrationStatus:'unknown'):'';}
export function lectureEnded(event){return event?.site==='hmp'&&event.lectureEnded===true;}
export function endedSlot(rows){return rows.length>0&&rows.every(lectureEnded);}
export function registrationLabel(event){if(lectureEnded(event))return '';return ({registered:'신청완료',not_registered:'미신청',closed:'신청마감',unknown:'신청 상태 미확인'})[registrationStatus(event)]||'';}
export function registrationSummary(events){const labels={registered:'신청완료',not_registered:'미신청',closed:'신청마감',unknown:'신청 상태 미확인'};return Object.entries(labels).map(([status,label])=>{const count=events.filter(e=>!lectureEnded(e)&&registrationStatus(e)===status).length;return count?label+count:'';}).filter(Boolean).join(', ');}
export function hmpSlotStatus(rows){if(rows.some(e=>registrationStatus(e)==='registered'))return 'registered';if(rows.some(e=>registrationStatus(e)==='not_registered'))return 'not_registered';return !rows.length||rows.some(e=>registrationStatus(e)==='unknown')?'unknown':'closed';}
export function hmpTime(group){const minutes=time=>+time.slice(0,2)*60+(+time.slice(3));return ['13:10','18:00'].find(anchor=>group.every(e=>Math.abs(minutes(e.time)-minutes(anchor))<=30))||group[0].time;}
export function timeGroups(events){const groups=[],minutes=time=>+time.slice(0,2)*60+(+time.slice(3));let remaining=[...events].sort((a,b)=>a.time.localeCompare(b.time));for(const anchor of ['13:10','18:00']){const group=remaining.filter(e=>Math.abs(minutes(e.time)-minutes(anchor))<=30);if(group.length){groups.push(group);remaining=remaining.filter(e=>!group.includes(e));}}let last;for(const event of remaining){if(!last||minutes(event.time)-minutes(last[0].time)>30){last=[];groups.push(last);}last.push(event);}return groups.sort((a,b)=>hmpTime(a).localeCompare(hmpTime(b)));}
export function formatSchedule(date,results){
  if(!validDate(date))throw Error('날짜가 올바르지 않습니다.');
  const d=new Date(date+'T00:00:00Z');const lines=[`$ ${d.getUTCMonth()+1}/${d.getUTCDate()} ${'일월화수목금토'[d.getUTCDay()]} $`,''];
  const events=dedupe(results.flatMap(r=>r.events||[])).filter(e=>e.date===date&&/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time));
  const buckets=new Map();const add=(time,rows)=>buckets.set(time,[...(buckets.get(time)||[]),...rows]);for(const e of events)if(e.site!=='hmp')add(e.time,[e]);for(const group of timeGroups(events.filter(e=>e.site==='hmp')))add(hmpTime(group),group);
  for(const [time,group] of [...buckets].sort(([a],[b])=>a.localeCompare(b))){const parts=[];for(const site of SITES){let rows=group.filter(e=>e.site===site.id);if(!rows.length)continue;const ended=site.id==='hmp'&&endedSlot(rows);const status=site.id==='hmp'&&!ended?hmpSlotStatus(rows):'';if(status==='registered')rows=rows.filter(e=>registrationStatus(e)==='registered');let label=site.short+(rows.length>1&&!site.singleAtTime&&site.id!=='hmp'?rows.length:'');const advanced=rows.filter(e=>e.advanced).map(e=>/BEYOND/i.test(e.title)?'비욘드':normalizeTitle(e.title).slice(0,28));if(advanced.length)label+='('+[...new Set(advanced)].map(t=>t+' 심화').join(', ')+')';if(status&&status!=='registered')label+='('+registrationLabel({site:'hmp',registrationStatus:status})+')';parts.push(label);}lines.push(time.replace(':','')+' '+parts.join(' '));}
  if(!events.length)lines.push(results.length===SITES.length&&results.every(r=>r.status==='ok')?'조건에 맞는 강의 없음':'확인된 강의 없음 — 아래 미확인 항목을 확인해 주세요.');
  const complete=results.filter(r=>r.status==='ok').length;
  lines.push('',`확인 완료 ${complete}/${SITES.length}`);
  if(complete<SITES.length)lines.push('※ 미확인 사이트가 포함된 잠정 일정표입니다.');
  for(const site of SITES){const r=results.find(x=>x.site===site.id);if(!r||r.status!=='ok')lines.push(`미확인: ${site.name} — ${r?.message||'아직 조회하지 않음'}`);else if(!r.events?.length)lines.push(`강의 없음: ${site.name}`);}
  return lines.join('\n');
}
