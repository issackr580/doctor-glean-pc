// PC-only session proof using the same reviewed calendar GET as attendance.
// The token stays in this page's closure and is never returned or logged.
export function credentialDocpleSession(input){
 const unknown=()=>({status:'unknown'}),slot='__doctorGleanDocpleSessionV1',api='https://docple-plus.com/api/season2/mission/attendance/calendar';
 try{
  if(!input||input.site!=='docple'||input.mode!=='verify'||input.kind!=='attendance'||input.autoClaim!==false||input.attempted!==false||input.phase!==undefined||input.action!==undefined||typeof input.nonce!=='string'||!/^[A-Za-z0-9_-]{16,96}$/.test(input.nonce)||!/^\d{1,10}:\d{1,10}$/.test(input.pageTag))return unknown();
  const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;};
  const url='https://docple-plus.com/offerwall/attendance',date=input.date,nonce=input.nonce,tag=input.pageTag;
  const live=()=>window.top===window.self&&location.href===url&&input.expectedUrl===url&&document.readyState==='complete'&&today()===date;
  if(!live())return unknown();
  const tokenNow=()=>{
   const cookies=String(document.cookie||'').split(';').map(s=>s.trim());
   const cookie=name=>{const item=cookies.find(s=>s.startsWith(name+'='));return item?decodeURIComponent(item.slice(name.length+1)):'';};
   const token=cookie('accessToken')||cookie('check-accessToken');
   return token&&token.length<=16384&&!/[\x00-\x20\x7f]/.test(token)?token:'';
  };
  let state=Object.getOwnPropertyDescriptor(document,slot)?.value;
  if(state){
   if(typeof Object.getOwnPropertyDescriptor(state,'matches')?.value!=='function'||typeof Object.getOwnPropertyDescriptor(state,'read')?.value!=='function'||typeof Object.getOwnPropertyDescriptor(state,'cancel')?.value!=='function')return unknown();
   if(state.matches(nonce,tag,url,date))return state.read(tokenNow());
   state.cancel();delete document[slot];
  }
  const token=tokenNow();if(!token||typeof window.fetch!=='function'||typeof AbortController!=='function')return unknown();
  let credential=token,status='loading',done=false,invalid=false,timer;const controller=new AbortController();
  const cancel=()=>{invalid=true;done=true;status='stale';credential='';clearTimeout(timer);controller.abort();};
  const current=()=>Object.getOwnPropertyDescriptor(document,slot)?.value===state&&live()&&credential!==''&&credential===tokenNow();
  const settle=value=>{if(done)return;done=true;status=value;clearTimeout(timer);};
  state={};Object.defineProperties(state,{
   matches:{value:(n,t,u,d)=>n===nonce&&t===tag&&u===url&&d===date},
   read:{value:token=>{if(!invalid&&(!live()||token!==credential))cancel();return status==='authenticated'?{status,evidence:{observed:true,authEvidenceSource:'docple_server_calendar'}}:{status};}},
   cancel:{value:cancel}
  });Object.freeze(state);Object.defineProperty(document,slot,{value:state,configurable:true});
  timer=setTimeout(()=>{settle('unknown');controller.abort();},8000);
  Promise.resolve().then(()=>{
   if(done||!current()){cancel();return null;}
   return window.fetch(api,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},signal:controller.signal});
  }).then(async response=>{
   if(done||!response)return;if(!current()){cancel();return;}
   if(response.redirected!==false||response.url!==api){settle('unknown');return;}
   if(response.status===401){settle('login_required');return;}
   if(response.status!==200||response.ok!==true||typeof response.text!=='function'){settle('unknown');return;}
   const raw=await response.text();if(done)return;if(!current()){cancel();return;}
   if(typeof raw!=='string'||raw.length>65536){settle('unknown');return;}
   let data;try{data=JSON.parse(raw)?.data;}catch{settle('unknown');return;}
   const month=date.slice(0,7),days=data?.attendedDates;
   const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d.slice(0,7)===month&&d<=date&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
   const verified=data?.yearMonth===month.replace('-','')&&Array.isArray(days)&&days.length<=31&&days.every(validDay)&&new Set(days).size===days.length;
   data=null;settle(verified?'authenticated':'unknown');
  }).catch(()=>{if(!done){if(!current())cancel();else settle('unknown');}});
  return {status:'loading'};
 }catch{return unknown();}
}
