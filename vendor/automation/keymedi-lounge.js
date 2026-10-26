(function keymediLoungePage(input) {
  const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
  const visible=e=>{
    if(!e?.isConnected)return false;
    for(let p=e;p&&p.nodeType===1;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.opacity==='0')return false;}
    const r=e.getBoundingClientRect();return r.width>0&&r.height>0;
  };
  const mode=input?.mode;if(!['inspect','open','claim'].includes(mode))return {status:'blocked',reason:'invalid_request'};
  let url;try{url=new URL(location.href);}catch(e){return {status:'blocked',reason:'outside_site'};}
  if(url.origin!=='https://www.keymedi.com'||url.username||url.password)return {status:'blocked',reason:'outside_site'};
  if(url.pathname==='/login')return {status:'login',reason:'login_required'};
  if(url.href!=='https://www.keymedi.com/drlounge')return {status:'blocked',reason:'outside_site'};
  if([...document.querySelectorAll('input[type="password"]')].some(visible))return {status:'login',reason:'login_required'};
  if([...document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal,.modal-body,.modal-body-text,.modal-wrap')].some(visible))return {status:'blocked',reason:'manual_confirmation'};
  const headings=[...document.querySelectorAll('h3')].filter(e=>text(e)==='미션 보기'&&visible(e));
  const panels=[];
  for(const heading of headings){
    let p=heading.parentElement;
    for(let n=0;n<3&&p&&p!==document.body;n++,p=p.parentElement){
      if(p.querySelector('dl')){const r=p.getBoundingClientRect();if(visible(p)&&r.bottom>0&&r.top<(window.innerHeight||2000))panels.push(p);break;}
    }
  }
  if(panels.length!==1){
    if(panels.length>1)return {status:'blocked',reason:'ambiguous_panel'};
    if(mode==='open'){
      const links=[...document.querySelectorAll('a[href="#"]')].filter(e=>text(e)==='미션 보기'&&visible(e));
      if(links.length===1){links[0].click();return {status:'opening'};}
    }
    return {status:'waiting',reason:'mission_unavailable'};
  }
  const panel=panels[0],names=['개원·경영','마케팅','세무·법무','의료기기','금융','어벤져스 Pack','브랜드 스테이션'];
  const normalize=s=>s.replace(/\s+/g,'').replace(/[ㆍ・]/g,'·');
  const rows=[...panel.querySelectorAll('dl')];if(rows.length!==7)return {status:'blocked',reason:'mission_changed'};
  const buttons=Array(7).fill(null);let found=0,eligibleMask=0,successMask=0;
  for(const row of rows){
    const title=row.querySelector('dt'),index=names.findIndex(name=>normalize(text(title))===normalize(name+' 체험하기'));
    if(index<0||(found&(1<<index)))return {status:'blocked',reason:'mission_changed'};found|=1<<index;
    const controls=[...row.querySelectorAll('dd button')].filter(visible);
    if(controls.length>1)return {status:'blocked',reason:'ambiguous_control'};
    if(controls.length===0){if(![...row.querySelectorAll('dd div')].some(e=>text(e)==='미달성'&&visible(e)))return {status:'waiting',reason:'mission_loading'};continue;}
    const button=controls[0],label=text(button);buttons[index]=button;
    if(label==='포인트 받기'&&!button.disabled&&button.getAttribute('aria-disabled')!=='true')eligibleMask|=1<<index;
    else if(label==='성공'&&button.disabled)successMask|=1<<index;
    else if(!['체험하기','처리중...','미달성','포인트 받기'].includes(label))return {status:'blocked',reason:'mission_changed'};
  }
  const progress=[...panel.querySelectorAll('span,div')].filter(e=>visible(e)&&e.children.length===0&&/^([0-7])\s*\/\s*7$/.test(text(e)));
  if(progress.length!==1)return {status:'waiting',reason:'progress_unavailable'};
  const current=Number(text(progress[0]).split('/')[0].trim());
  if(current===7)successMask=127;
  if(successMask.toString(2).replace(/0/g,'').length>current)return {status:'blocked',reason:'progress_conflict'};
  const result={status:'ready',current,total:7,eligibleMask,successMask};
  if(mode!=='claim')return result;
  if(!Number.isInteger(input.mask)||input.mask<=0||input.mask>127||typeof input.lease!=='string'||!/^[a-zA-Z0-9:-]{1,120}$/.test(input.lease)||!Number.isFinite(input.opensAt)||!Number.isFinite(input.closesAt)||Date.now()<input.opensAt||Date.now()>=input.closesAt)return {status:'blocked',reason:'invalid_lease',sentMask:0};
  if(input.requireFreshDocument===true&&(!Number.isFinite(performance.timeOrigin)||performance.timeOrigin<input.opensAt))return {status:'blocked',reason:'stale_document',sentMask:0};
  // The native owner commits the per-day category mask before invoking this.
  // The document latch additionally rejects duplicate evaluate callbacks.
  let latch=document.__doctorGleanKeymediLoungeSent;
  if(!latch){latch={mask:0};Object.defineProperty(document,'__doctorGleanKeymediLoungeSent',{value:latch,configurable:false});}
  let sentMask=0;
  for(let i=0;i<7;i++){
    const bit=1<<i,button=buttons[i];
    if(!(input.mask&eligibleMask&bit)||(latch.mask&bit)||Date.now()>=input.closesAt)continue;
    // Revalidate immediately before each original click. Never dismiss dialogs
    // or click an experience/navigation button to manufacture eligibility.
    if(!button?.isConnected||!visible(button)||button.disabled||text(button)!=='포인트 받기')continue;
    latch.mask|=bit;sentMask|=bit;
    try{button.click();}catch(e){/* uncertain dispatch remains consumed */}
  }
  return {...result,sentMask};
})