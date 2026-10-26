// This inspects control labels and visibility, never input values or cookies.
export function inspectLoginPage(){
 const visible=element=>{
  if(!element?.getClientRects().length||element.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  for(let parent=element;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||['hidden','collapse'].includes(style.visibility))return false;}
  return true;
 };
 if(document.readyState!=='complete')return 'loading';
 const controls=[...document.querySelectorAll('a,button,[role="button"],input[type="button"],input[type="submit"]')].filter(visible);
 const labels=element=>[element.tagName==='INPUT'?element.getAttribute('value'):element.innerText||element.textContent,element.getAttribute('aria-label'),element.getAttribute('title'),...[...element.querySelectorAll('img[alt]')].map(image=>image.getAttribute('alt'))].map(value=>String(value||'').replace(/\s+/g,''));
 const logout=controls.some(element=>labels(element).some(value=>/^(로그아웃|logout|signout)$/i.test(value)));
 const login=controls.some(element=>labels(element).some(value=>/^(로그인|로그인하기|login|signin)$/i.test(value)));
 if(logout&&login)return 'not_confirmed';
 if(logout)return 'authenticated';
 if([...document.querySelectorAll('input[type="password"]')].some(visible))return 'login_required';
 if(/\/(?:login(?:View|Page|Confirm|Form)?|sign-?in)(?:\.(?:do|jsp|html?|hm))?\/?$/i.test(location.pathname))return 'login_required';
 return 'not_confirmed';
}

export function safeLoginState(value){return ['authenticated','login_required','not_confirmed','loading'].includes(value)?value:'not_confirmed';}
export function loadFailure(code){
 if(code===-3)return 'navigation_cancelled';
 if(code===-105||code===-137)return 'dns_error';
 if(code===-106)return 'offline';
 if(code===-118||code===-7)return 'time_limit';
 if(code<=-200&&code>=-299)return 'certificate_error';
 return 'load_failed';
}

// A current daily receipt is authentication evidence; a later login failure
// takes precedence. This never treats a saved session or a cookie as proof.
export function sessionWithDailyEvidence(site,manual,catalog,daily,now=Date.now()){
 const tasks={doctorville:['doctorville:attendance','doctorville:quiz'],keymedi:['keymedi:attendance'],hmp:['hmp:capsule'],intermd:['intermd:quiz'],docple:['docple:attendance']}[site]??[];
 const receipts=tasks.map(key=>daily?.[key]).filter(row=>row?.status==='complete'&&Number.isSafeInteger(row.checkedAt)&&row.checkedAt<=now&&now-row.checkedAt<=1800000).sort((a,b)=>b.checkedAt-a.checkedAt);
 const receipt=receipts[0];if(!receipt||catalog?.status==='login'&&catalog.checkedAt>=receipt.checkedAt||manual.login==='login_required'&&manual.checkedAt>=receipt.checkedAt)return manual;
 if(manual.login==='authenticated'&&manual.checkedAt>=receipt.checkedAt)return manual;
 return {...manual,login:'authenticated',authSource:'daily_receipt',checkedAt:Math.max(manual.checkedAt??0,receipt.checkedAt)};
}
