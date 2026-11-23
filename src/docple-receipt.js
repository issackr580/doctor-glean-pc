// Runs in an isolated Chromium world. Reads only the already displayed document.
export function docpleTodayReceipt(date){
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^https:\/\/docple-plus\.com\/offerwall\/attendance\/?$/.test(location.href)||window.top!==window||document.readyState!=='complete')return false;
 const visible=e=>e.getClientRects().length>0&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 const text=e=>e.innerText.trim().replace(/\s+/g,' ');
 const body=document.body;if(!body||/보안 확인|접근 제한|요청이 너무 많|본인 인증|로그인이?\s*필요|로봇이 아닙니다|사람인지 확인|verify you are human|checking your browser|access denied|too many requests|captcha/i.test(body.innerText)||[...document.querySelectorAll('input[type=password],iframe[src*="captcha"]')].some(visible))return false;
 const buttons=[...body.querySelectorAll('button,[role=button]')].filter(visible);
 if([...buttons,...body.querySelectorAll('a')].some(e=>visible(e)&&/^(로그인(?:하기)?|log in|sign in)$/i.test(text(e))))return false;
 const completed=buttons.filter(e=>/^오늘\s*출석\s*완료\s*[✓✔✅]?$/.test(text(e)));
 if(completed.length!==1||!(completed[0].disabled||completed[0].getAttribute('aria-disabled')==='true')||buttons.some(e=>/출석하고\s*캐시\s*받기/.test(text(e))))return false;
 const [year,month,day]=date.split('-').map(Number);
 const titles=[...body.querySelectorAll('h1,h2,h3,h4,[role=heading]')].filter(visible).map(e=>({e,m:text(e).match(/^(?:(\d{4})년\s*)?(\d{1,2})월\s*출석\s*달력$/)})).filter(t=>t.m);
 if(titles.length!==1)return false;
 const {e,m}=titles[0];if(Number(m[2])!==month||m[1]&&Number(m[1])!==year)return false;
 const days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const scope=e.closest('section')??e.parentElement;
 const grids=[...scope.querySelectorAll('div,ul,ol,[role=grid]')].map(grid=>[...grid.children].filter(visible)).filter(cells=>cells.length===days&&cells.every((cell,i)=>text(cell)===(i+1).toString()||i<day&&text(cell)==='출석'));
 return grids.length===1&&text(grids[0][day-1])==='출석';
}
