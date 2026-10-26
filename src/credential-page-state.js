// PC-only, read-only supplement to the immutable site's original login helper.
// Return fixed booleans, never a field value or the page's notice text.
export function credentialPageState(input){
 try{
  if(input?.site!=='doctorville'||input.mode!=='verify'||window.top!==window.self||location.origin!=='https://mims-account.shop.co.kr'||location.pathname!=='/login'||location.href!==input.expectedUrl)return {status:'unknown'};
  if(document.readyState!=='complete')return {status:'loading'};
  const visible=node=>{
   if(!node?.isConnected||!node.getClientRects().length||node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
   for(let at=node;at;at=at.parentElement){const s=getComputedStyle(at);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;}return true;
  };
  const forms=[...document.querySelectorAll('form')].filter(form=>form.querySelector('input#identifier[name="identifier"]')&&form.querySelector('input#password[name="password"]'));
  if(forms.length!==1)return {status:'unknown'};
  const form=forms[0],id=form.querySelectorAll('input#identifier[name="identifier"]'),password=form.querySelectorAll('input#password[name="password"]');
  if(id.length!==1||password.length!==1||!visible(id[0])||!visible(password[0]))return {status:'unknown'};
  const format=[...form.querySelectorAll('p,span,[role="alert"]')].filter(visible).some(node=>/8\s*~\s*20자\s*영문\s*,?\s*숫자\s*조합으로\s*입력/.test(node.innerText||node.textContent||''));
  return format?{status:'manual',detail:'input_format',evidence:{clientValidationError:true}}:{status:'unknown',evidence:{clientValidationError:false}};
 }catch{return {status:'unknown'};}
}
