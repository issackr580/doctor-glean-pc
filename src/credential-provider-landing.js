// Read-only classification of a provider's bare landing page. No account,
// cookie, URL value, handler invocation or authentication proof is returned.
export function credentialProviderLanding(input){
 if(!input||input.site!=='doctorville'||input.mode!=='verify'||window.top!==window.self||location.href!==input.expectedUrl||location.origin!=='https://mims-account.shop.co.kr'||!['/','/login'].includes(location.pathname)||location.search||location.hash)return {status:'blocked'};
 if(document.readyState!=='complete')return {status:'loading'};
 const visible=node=>{
  if(!node?.getClientRects().length||node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  for(let p=node;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.opacity==='0'||['hidden','collapse'].includes(s.visibility))return false;}return true;
 };
 const all=selector=>Array.from(document.querySelectorAll(selector)).filter(visible);
 const barrier=all('input[type="password"],iframe[src*="captcha"],[name="captcha"],[role="dialog"][aria-modal="true"]').length>0||/보안\s*확인|추가\s*인증|본인\s*인증|회원\s*정보.*(?:입력|수정|보완)|접근.*차단|Verify you are human|Checking your browser|captcha/i.test((document.body?.innerText||'').slice(0,200000));
 return {status:barrier?'manual':'ready',evidence:{observed:true,providerLanding:true,providerBarrier:barrier}};
}
