(function doctorvilleSurveyPage(expectedId='') {
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  let url;try{url=new URL(location.href);}catch{return null;}
  if(url.protocol!=='https:'||!['www.doctorville.co.kr','m.doctorville.co.kr'].includes(url.hostname))return null;
  const route=url.pathname;
  if(!['/seminar/broadcastSeminarPopup','/seminar/seminarVodReplayDetail'].includes(route)&&!/^\/cme\/vod\/\d+$/.test(route))return null;
  const id=url.searchParams.get('seminarId')||(/^\/cme\/vod\/(\d+)$/.exec(route)||[])[1]||'';
  if(!/^\d{1,10}$/.test(id)||expectedId&&String(expectedId)!==id)return null;
  const visible=e=>{if(!e||e.hidden)return false;for(let p=e;p&&p.nodeType===1;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;}return true;};
  if(Array.from(document.querySelectorAll('input[type="password"]')).some(visible))return {site:'doctorville',kind:'survey',seminarId:id,path:route,status:'unknown',reason:'survey_login_required'};
  const label=e=>clean(e.innerText||e.textContent).replace(/\s/g,'');
  const controls=Array.from(document.querySelectorAll('a,button')).filter(visible);
  const completed=controls.filter(e=>label(e)==='설문참여완료');
  const pending=controls.filter(e=>label(e)==='설문참여');
  const button=completed[0]||pending[0];
  const timerById=document.getElementById('survey-minutes-left');
  let timer=visible(timerById)?timerById:null;
  let timerContainer=document.getElementById('survey-txt');
  if(!visible(timerContainer))timerContainer=null;
  // Mobile structure is not asserted to match the desktop selectors.
  if(!timerContainer){const candidates=Array.from(document.querySelectorAll('strong,span,p,div')).filter(visible).filter(e=>/^설문\s*마감\s*\d{1,3}\s*분\s*전$/.test(clean(e.innerText||e.textContent)));const values=new Set(candidates.map(e=>clean(e.innerText||e.textContent)));if(values.size===1)timerContainer=candidates[0]||null;}
  const display=clean(timerContainer&&(timerContainer.innerText||timerContainer.textContent));
  const match=/^설문\s*마감\s*(\d{1,3})\s*분\s*전$/.exec(display);
  const minutes=match?Number(match[1]):null;
  const data=timer&&timer.getAttribute('data-minutes');
  const dataMinutes=data&&/^\d{1,3}$/.test(data)?Number(data):null;
  const disabled=!!button&&(button.disabled||button.getAttribute('aria-disabled')==='true'||button.hasAttribute('disabled'));
  // A displayed zero can be rounded. It is urgent, not verified expiry.
  const status=completed.length?'complete':pending.length===1&&!disabled&&minutes!==null&&minutes>=0&&minutes<=60?'open':'unknown';
  const markers=[];for(const e of [button,timerContainer,timer])if(e)markers.push({tag:e.tagName,classes:clean(e.className).slice(0,120),marker:e.id||'',label:e===button?(completed.length?'설문 참여 완료':'설문 참여'):e===timerContainer?display:clean(e.innerText||e.textContent)});
  return {site:'doctorville',kind:'survey',seminarId:id,path:route,status,reason:status==='complete'?'survey_completed_label':status==='open'?'survey_button_and_countdown':'survey_state_unconfirmed',minutesLeft:minutes,dataMinutes,minuteMismatch:minutes!==null&&dataMinutes!==null&&minutes!==dataMinutes,source:timerById?'desktop_ids':'visible_labels',buttonCount:completed.length+pending.length,disabled,samples:markers};
})