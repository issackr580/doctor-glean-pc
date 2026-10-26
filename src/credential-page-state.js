// PC-only, read-only supplement to the immutable site's original login helper.
// Return fixed booleans, never a field value or the page's notice text.
export function credentialPageState(input){
 try{
  if(!input||input.mode!=='verify'||window.top!==window.self||location.href!==input.expectedUrl)return {status:'unknown'};
  if(document.readyState!=='complete')return {status:'loading'};
  const visible=node=>{
   if(!node?.isConnected||!node.getClientRects().length||node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
   for(let at=node;at;at=at.parentElement){const s=getComputedStyle(at);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;}return true;
  };
  if(input.site==='dtalks'){
   if(location.origin!=='https://www.dtalks.kr'||!['/main.do','/websim/vodList.do'].includes(location.pathname)||location.search||location.hash)return {status:'unknown'};
   const clean=value=>String(value||'').replace(/\s+/g,'');
   // Reviewed Dtalks /assets/css/style.css keeps this server profile box closed.
   const links=[...document.querySelectorAll('#header .top_wrap .content_wrap .my_box .link_wrap a.logout')].filter(node=>!node.closest('template,script,noscript,inert'));
   const labeled=links.filter(node=>[node.textContent,node.getAttribute('aria-label'),node.getAttribute('title'),...[...node.querySelectorAll('img[alt]')].map(image=>image.getAttribute('alt'))].some(text=>/^(로그아웃|logout|signout)$/i.test(clean(text))));
   const safe=node=>{
    const href=node.getAttribute('href')??'',handler=node.getAttribute('onclick')??'';
    const fn=raw=>{const name=raw.match(/^\s*(?:javascript\s*:\s*)?(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/i)?.[1];return !!name&&/(?:log_?out|loginout|signout)$/i.test(name)&&typeof Object.getOwnPropertyDescriptor(window,name)?.value==='function';};
    if(handler&&!fn(handler)&&!/^\s*(?:return\s+false\s*;?|;)\s*$/.test(handler))return false;
    if(fn(href)||fn(handler))return true;
    if(/^\s*(?:#|javascript\s*:\s*(?:void\s*\(\s*0\s*\)\s*;?|;))\s*$/i.test(href))return true;
    try{const u=new URL(href,document.baseURI||location.href);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.origin===location.origin&&/^\/(?:member\/)?(?:log(?:in)?out|signout)(?:\.do)?\/?$/i.test(u.pathname);}catch{return false;}
   };
   const safeLinks=labeled.filter(safe),controls=[...document.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]')].filter(visible);
   const login=controls.some(node=>[node.textContent,node.getAttribute('aria-label'),node.getAttribute('title'),node.tagName==='INPUT'?node.getAttribute('value'):'',...[...node.querySelectorAll('img[alt]')].map(image=>image.getAttribute('alt'))].some(text=>/^(로그인|로그인하기|login|signin)$/i.test(clean(text))));
   const password=[...document.querySelectorAll('input[type="password"]')].some(visible);
   const evidence={dtalksLogoutPresent:labeled.length>0,dtalksLogoutVisible:labeled.some(visible),dtalksLogoutSafe:safeLinks.length>0,dtalksLoginConflict:login||password};
   // Hidden markup is never a standalone candidate-login proof. Require the
   // native operation's actual auth response and its protected catalog read.
   const authority=input.validation!==true||input.validationSubmitted===true&&input.dtalksAuthResponse===true&&input.dtalksProtectedRead===true&&location.pathname==='/websim/vodList.do';
   return authority&&safeLinks.length>0&&!login&&!password?{status:'authenticated',evidence:{...evidence,authEvidenceSource:'dtalks_server_logout'}}:{status:'unknown',evidence};
  }
  if(input.site!=='doctorville'||location.origin!=='https://mims-account.shop.co.kr'||location.pathname!=='/login')return {status:'unknown'};
  const forms=[...document.querySelectorAll('form')].filter(form=>form.querySelector('input#identifier[name="identifier"]')&&form.querySelector('input#password[name="password"]'));
  if(forms.length!==1)return {status:'unknown'};
  const form=forms[0],id=form.querySelectorAll('input#identifier[name="identifier"]'),password=form.querySelectorAll('input#password[name="password"]');
  if(id.length!==1||password.length!==1||!visible(id[0])||!visible(password[0]))return {status:'unknown'};
  const format=[...form.querySelectorAll('p,span,[role="alert"]')].filter(visible).some(node=>/8\s*~\s*20자\s*영문\s*,?\s*숫자\s*조합으로\s*입력/.test(node.innerText||node.textContent||''));
  return format?{status:'manual',detail:'input_format',evidence:{clientValidationError:true}}:{status:'unknown',evidence:{clientValidationError:false}};
 }catch{return {status:'unknown'};}
}
