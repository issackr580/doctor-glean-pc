(function ckdStep(profile,targetDate,previous){
 const patience=ms=>Math.max(ms,Math.min(45000,Number(profile.networkPatienceMs)||0));
 const now=Date.now();
 const state=previous?.version===1&&previous.date===targetDate&&previous.site===profile.id?previous:
  {version:1,site:profile.id,date:targetDate,started:now,events:[]};
 const result=(status,message,done=false,extra={})=>({site:profile.id,crawler:profile.crawler,status,message,done,events:state.events,checkedAt:now,state,...extra});
 const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 try{
  const here=new URL(location.href),entry=new URL(profile.url);
  if(here.origin!==entry.origin||/login|sign.?in/i.test(here.pathname)||Array.from(document.querySelectorAll('input[type="password"]')).some(visible))return result('login','종근당 로그인을 확인해 주세요.',true);
  if(here.pathname!==entry.pathname)return result('review','종근당 웨비나 목록에 도착하지 못했어요.',true);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)||new Date(targetDate+'T00:00:00Z').toISOString().slice(0,10)!==targetDate)return result('review','날짜를 확인해 주세요.',true);
  const key=targetDate+'|'+state.started;
  let job=window.__webinarCkdRead;
  if(!job||job.key!==key){
   if(job?.abort)job.abort.abort();
   const abort=new AbortController();job={key,done:false,abort};window.__webinarCkdRead=job;
   const clean=row=>({id:String(row.WB_SEQ??''),title:String(row.WB_TITLE??''),start:String(row.WB_STARTDATE??''),type:row.WB_TYPE_CD,point:row.WB_POINT_YN,use:row.WB_USE_YN,deleted:row.DEL_YN});
   const get=async(path,field,value)=>{
    const response=await fetch(new URL(path,entry).href,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({[field]:value}).toString(),signal:abort.signal});
    if(!response.ok)throw Error('HTTP '+response.status);
    if(response.url&&/login|sign.?in/i.test(new URL(response.url).pathname))throw Error('LOGIN');
    return response.json();
   };
   Promise.all([get('./webinarCalAjax.do','r_month',targetDate.slice(0,7)),get('./webinarCalDtlAjax.do','r_date',targetDate)]).then(([month,day])=>{
    if(!Array.isArray(month?.wbList)||!Array.isArray(day))throw Error('SCHEMA');
    if(month.wbList.length>500||day.length>200)throw Error('SIZE');
    job.month=month.wbList.map(clean);job.day=day.map(clean);job.monthDate=String(month.ndate||'');job.done=true;
   }).catch(e=>{job.error=e.message==='LOGIN'?'login':'read';job.retryable=/^(?:Failed to fetch|NetworkError|Load failed|HTTP (?:408|500|502|503|504))/.test(e.message)||e.name==='TypeError';job.done=true;});
   return result('loading','종근당 선택일과 월 편성표를 조회하는 중');
  }
  if(!job.done){if(now-state.started>patience(25000)){job.abort.abort();return result('review','종근당 일정 응답 시간 초과 · 전체 수집 미확인',true,{retryable:true});}return result('loading','종근당 날짜별 목록 응답을 기다리는 중');}
  if(job.error)return result(job.error==='login'?'login':'review',job.error==='login'?'종근당에 다시 로그인해 주세요.':'종근당 날짜별 목록을 읽지 못했어요 · 전체 수집 미확인',true,{retryable:!!job.retryable});
  let unknown=0,excluded=0;const events=new Map();
  const monthRows=job.month.filter(r=>r.start.slice(0,10)===targetDate),dayRows=job.day.filter(r=>r.start.slice(0,10)===targetDate);
  const consistent=monthRows.every(r=>dayRows.some(d=>d.id===r.id))&&job.monthDate.slice(0,7)===targetDate.slice(0,7);
  for(const r of new Map([...monthRows,...dayRows].map(r=>[r.id,r])).values()){
   if(r.deleted==='Y'||r.use==='N'||r.type==='RP'||r.type==='DS'||r.point==='N'){excluded++;continue;}
   if(r.type!=='WB'||r.point!=='Y'||!r.id||!r.title.trim()||!/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d/.test(r.start)){unknown++;continue;}
   events.set(r.id,{site:profile.id,date:targetDate,time:r.start.slice(11,16),title:r.title.replace(/\s+/g,' ').trim(),id:r.id,url:profile.url,advanced:false});
  }
  state.events=[...events.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
  const diagnostics={site:profile.id,path:here.pathname,rows:job.day.length,totalRows:job.month.length,events:state.events.length,excluded,unknown,month:job.monthDate.slice(0,7),pages:0,calendarAgreement:consistent,samples:state.events.slice(0,4).map(e=>({tag:'API',classes:'WB_POINT_YN=Y',text:e.date+' '+e.time+' '+e.title,parts:[]}))};
  return result('review',`자동 조회로 Bell 지급 강의 ${state.events.length}개 수집 · `+(unknown?'지급 조건 또는 강의 정보 미확정 '+unknown+'개':!consistent?'월 편성표와 날짜별 목록 대조 필요':'실기기 전체 수집 검증 대기'),true,{coverage:consistent&&!unknown,diagnostics});
 }catch(e){return result('review','종근당 일정 형식을 확인하지 못했어요 · 전체 수집 미확인',true);}
})