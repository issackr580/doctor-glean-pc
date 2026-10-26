(function performCatalogAction(action){
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
 const text=e=>(e?.innerText??e?.textContent??'').replace(/\s+/g,' ').trim();
 if(action.kind==='scroll'){window.scrollTo(0,Math.max(document.body.scrollHeight,document.documentElement.scrollHeight));return true;}
 const e=document.querySelector(action.selector);if(!visible(e)||e.disabled)return false;
 if(action.kind==='date'&&e.matches('input[type="date"]')&&/^\d{4}-\d{2}-\d{2}$/.test(action.value)){
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!setter)return false;
  setter.call(e,action.value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;
 }
 if(action.kind!=='click')return false;
 const signature=[text(e),e.getAttribute('aria-label'),e.getAttribute('title'),...(e.matches('input[type="button"]')?[e.getAttribute('value')]:[]),...Array.from(e.querySelectorAll('img[alt]')).map(x=>x.getAttribute('alt'))].filter(Boolean).join(' ').trim();
 if(signature!==action.signature||/신청|예약|참여|설문|재생|시청|입장|북마크|로그인|로그아웃|다운로드/.test(signature))return false;
 if(e.closest('form')&&e.matches('button:not([type]),button[type="submit"],input[type="submit"]'))return false;
 e.scrollIntoView({block:'center'});e.click();return true;
})