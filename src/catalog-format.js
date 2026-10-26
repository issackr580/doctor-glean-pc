import {SITES,validDate,dedupe,timeGroups,hmpTime,hmpSlotStatus,registrationStatus,registrationLabel,endedSlot} from '../vendor/engine/core.js';

export function formatPcSchedule(date,selected,results){
 if(!validDate(date)||!Array.isArray(selected)||selected.some(id=>!SITES.some(site=>site.id===id)))throw Error('invalid_schedule');
 const day=new Date(date+'T00:00:00Z'),lines=[`$ ${day.getUTCMonth()+1}/${day.getUTCDate()} ${'일월화수목금토'[day.getUTCDay()]} $`,''];
 const events=dedupe(selected.flatMap(id=>results[id]?.events??[])).filter(event=>event.date===date&&selected.includes(event.site));
 const buckets=new Map(),add=(time,rows)=>buckets.set(time,[...(buckets.get(time)??[]),...rows]);
 for(const event of events)if(event.site!=='hmp')add(event.time,[event]);
 for(const group of timeGroups(events.filter(event=>event.site==='hmp')))add(hmpTime(group),group);
 for(const [time,group] of [...buckets].sort(([a],[b])=>a.localeCompare(b))){
  const labels=[];
  for(const site of SITES.filter(site=>selected.includes(site.id))){
   let rows=group.filter(event=>event.site===site.id);if(!rows.length)continue;
   const status=site.id==='hmp'&&!endedSlot(rows)?hmpSlotStatus(rows):'';
   if(status==='registered')rows=rows.filter(event=>registrationStatus(event)==='registered');
   let label=site.short+(rows.length>1&&site.id!=='hmp'?rows.length:'');
   const advanced=rows.filter(event=>event.advanced).map(event=>/BEYOND/i.test(event.title)?'비욘드':event.title.slice(0,28));
   if(advanced.length)label+='('+[...new Set(advanced)].map(title=>title+' 심화').join(', ')+')';
   if(status&&status!=='registered')label+='('+registrationLabel({site:'hmp',registrationStatus:status})+')';
   labels.push(label);
  }
  lines.push(time.replace(':','')+' '+labels.join(' '));
 }
 const complete=selected.filter(id=>results[id]?.status==='ok'&&results[id].coverage&&!results[id].stale).length;
 if(!events.length)lines.push(complete===selected.length?'조건에 맞는 강의 없음':'확인된 강의 없음');
 lines.push('',`확인 완료 ${complete}/${selected.length}`);
 if(complete<selected.length)lines.push('※ 미확인 사이트가 포함된 잠정 일정표입니다.');
 for(const site of SITES.filter(site=>selected.includes(site.id))){
  const row=results[site.id];
  if(row?.stale)lines.push('저장된 목록: '+site.name+' — 최신 조회 미완료');
  else if(!row||row.status!=='ok'||!row.coverage)lines.push('미확인: '+site.name);
  else if(!row.events.length)lines.push('강의 없음: '+site.name);
 }
 return lines.join('\n');
}
