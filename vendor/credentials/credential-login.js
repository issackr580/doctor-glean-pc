(function(input){return (function credentialLogin(input,registry=CREDENTIAL_SITES){
  let attempted=false;
  let evidence=null,barrierReason=null,routeAnnouncementIgnored=false;
  const reply=(status,submitted=false)=>evidence?{status,submitted,evidence:{...evidence,...(barrierReason&&barrierReason!=='none'?{barrierReason}:{}),...(routeAnnouncementIgnored?{routeAnnouncementIgnored:true}:{})}}:{status,submitted};
  try{
    if(!input||typeof input!=='object'||!['probe','fill','submit','verify','ckd_logout'].includes(input.mode))return reply('blocked');
    if(input.validation!==undefined&&typeof input.validation!=='boolean'||input.validationSubmitted!==undefined&&typeof input.validationSubmitted!=='boolean'||input.validationSubmitted===true&&input.validation!==true||input.diagnostics!==undefined&&typeof input.diagnostics!=='boolean')return reply('blocked');
    const validation=input.validation===true;
    const policy=registry.find(site=>site.id===input.site);
    if(!policy||typeof input.nonce!=='string'||!/^[A-Za-z0-9_-]{16,96}$/.test(input.nonce)||typeof input.pageTag!=='string'||!/^\d{1,10}:\d{1,10}$/.test(input.pageTag))return reply('blocked');
    const secureUrl=raw=>{
      if(typeof raw!=='string'||raw.length>4096||/[\x00-\x20\x7f\\]/.test(raw))return null;
      const value=new URL(raw);
      return value.protocol==='https:'&&!value.username&&!value.password&&(!value.port||value.port==='443')?value:null;
    };
    const expected=secureUrl(input.expectedUrl),current=secureUrl(location.href);
    if(window.top!==window.self||!expected||!current||!policy.origins.includes(current.origin)||expected.href!==current.href)return reply('blocked');
    if(input.diagnostics===true)evidence={observed:false};
    if(document.readyState!=='complete')return reply('loading');
    const liveUrl=()=>{
      const value=secureUrl(location.href);
      return window.top===window.self&&value&&value.href===expected.href&&document.readyState==='complete';
    };
    const visible=node=>{
      if(!node||!node.isConnected||!node.getClientRects().length||node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
      for(let at=node;at;at=at.parentElement){const style=getComputedStyle(at);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;}
      return true;
    };
    const shown=selector=>Array.from(document.querySelectorAll(selector)).filter(visible);
    const clean=value=>String(value||'').replace(/\s+/g,'').trim();
    // Button/input attributes are labels, never editable input values. Read
    // each accessible label independently so conflicting labels remain a
    // conflict instead of letting one of them hide another.
    const labels=node=>[
      node.tagName==='INPUT'?node.getAttribute('value'):node.innerText||node.textContent,
      node.getAttribute('aria-label'),node.getAttribute('title'),
      ...Array.from(node.querySelectorAll('img[alt]')).map(image=>image.getAttribute('alt'))
    ].map(clean).filter(Boolean);
    const label=node=>labels(node)[0]||'';
    // The current HMP server template supplies HM.config.MEM_ID, even when
    // its mobile logout menu is closed. Inspect only own data properties on
    // these two reviewed authenticated pages; never invoke a getter, expose
    // the member identifier, or read storage/cookies to manufacture evidence.
    const hmpMemberScope=input.site==='hmp'&&current.origin==='https://www.hmp.co.kr'&&['/main/main.hm','/symposium/schedulerequest/scheduleList.hm'].includes(current.pathname);
    const hmpMemberPresent=()=>{
      if(!hmpMemberScope||!liveUrl())return false;
      const own=(object,key)=>{
        if(object===null||!['object','function'].includes(typeof object))return undefined;
        return Object.getOwnPropertyDescriptor(object,key)?.value;
      };
      const member=own(own(own(window,'HM'),'config'),'MEM_ID');
      return typeof member==='string'&&member.length<=512&&!!member.trim()&&!/^(null|undefined|0)$/i.test(member.trim());
    };
    // The original InterMD sessionMgt.js assigns the server getSession reply's
    // memberInfo to an own property; a fresh anonymous session returns null.
    // Inspect only its own positive member serial on the two reviewed pages.
    // This helper never starts that request, invokes its getter, or exposes the
    // serial. It supplements a visible logout label for current-session checks;
    // isolated candidate validation additionally requires this operation to
    // have submitted the candidate credentials.
    const intermdMemberScope=input.site==='intermd'&&current.origin==='https://www.intermd.co.kr'&&['/home.do','/webinar/list.do'].includes(current.pathname);
    const intermdMemberPresent=()=>{
      if(!intermdMemberScope||!liveUrl())return false;
      const own=(object,key)=>{
        if(object===null||!['object','function'].includes(typeof object))return undefined;
        return Object.getOwnPropertyDescriptor(object,key)?.value;
      };
      const serial=own(own(own(window,'sessionMgt'),'memberInfo'),'intermdMemberPseq');
      return typeof serial==='number'?Number.isSafeInteger(serial)&&serial>0:typeof serial==='string'&&/^[1-9]\d{0,15}$/.test(serial)&&Number.isSafeInteger(Number(serial));
    };
    const sessionSignals=()=>{
      const controls=shown('a,button,[role="button"],input[type="button"],input[type="submit"]');
      const logoutAction=node=>{
        const result=(safe,reason)=>({safe,reason});
        const href=node.getAttribute('href');if(!href)return result(true,'local_control');
        const script=href.match(/^\s*javascript\s*:([\s\S]*)$/i);
        if(script){
          // Inert anchors and one zero-argument function reference are
          // read-only evidence. Never evaluate a href or click the control.
          if(/^\s*void\s*\(\s*0\s*\)\s*;?\s*$/.test(script[1])||/^\s*;\s*$/.test(script[1]))return result(true,'inert_script');
          const name=href.match(/^\s*javascript\s*:\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/i)?.[1];
          // InterMD's visible logout label is already present in the reported
          // home document. Permit legacy function spellings only there and on
          // its fixed webinar page, with an own non-accessor function value.
          // The reference's name and source are never returned or executed.
          const intermdPage=input.site==='intermd'&&current.origin==='https://www.intermd.co.kr'&&['/home.do','/webinar/list.do'].includes(current.pathname);
          if(!name||name!=='logout'&&!(intermdPage&&/logout$/i.test(name)))return result(false,'unrecognized_script');
          return typeof Object.getOwnPropertyDescriptor(window,name)?.value==='function'?result(true,'logout_function'):result(false,'function_unavailable');
        }
        try{
          // Resolve the actual link destination: an HTML base element can
          // make an apparently local relative link leave this document's site.
          const destination=new URL(href,document.baseURI||current.href);
          if(destination.protocol!=='https:')return result(false,'insecure');
          if(destination.username||destination.password)return result(false,'malformed');
          return destination.origin===current.origin&&(!destination.port||destination.port==='443')?result(true,href==='#'?'local_control':'same_origin'):result(false,'foreign_origin');
        }catch{return result(false,'malformed');}
      };
      const logout=controls.filter(node=>labels(node).some(value=>/^(로그아웃|logout|signout)$/i.test(value)));
      const actions=logout.map(logoutAction),action=actions.find(candidate=>candidate.safe)||actions[0];
      const result={logoutShown:logout.length>0,out:actions.some(candidate=>candidate.safe),into:controls.some(node=>labels(node).some(value=>/^(로그인|로그인하기|통합회원로그인|login|signin)$/i.test(value))),passwordShown:shown('input[type="password"]').length>0,member:hmpMemberPresent(),intermdMember:intermdMemberPresent()};
      if(evidence)evidence={observed:true,logoutShown:result.logoutShown,logoutSameOrigin:result.out,loginShown:result.into,passwordShown:result.passwordShown,logoutActionReason:action?.reason||'none',authEvidenceSource:'none',...(hmpMemberScope||intermdMemberScope?{providerMemberPresent:hmpMemberScope?result.member:result.intermdMember}:{})};
      return result;
    };
    // Observe only fixed booleans after the native-bound origin/document
    // checks. Challenges and errors still take precedence over these signals.
    sessionSignals();
    const text=()=>shown('p,span,label,h1,h2,h3,[role="alert"],[role="dialog"],.error,.error-message,.login-error,.invalid-feedback').map(node=>node.innerText||node.textContent||'').join(' ').slice(0,24000);
    // Next.js Pages Router announces the new title through a clipped one-pixel
    // alert. It is not a login error. Restrict this exception to the observed
    // Docple framework node, while still inspecting its security/error words.
    const routeAnnouncement=node=>{
      if(input.site!=='docple'||current.origin!=='https://docple-plus.com'||node.tagName!=='P'||node.id!=='__next-route-announcer__'||node.getAttribute('role')!=='alert'||node.getAttribute('aria-live')!=='assertive'||document.querySelectorAll('#__next-route-announcer__').length!==1)return false;
      const style=getComputedStyle(node),clip=String(style.clip||'').replace(/\s|,/g,'');
      return style.position==='absolute'&&style.overflow==='hidden'&&style.width==='1px'&&style.height==='1px'&&clip==='rect(0px0px0px0px)';
    };
    barrierReason='none';
    const barriers=()=>{
      if(shown('[aria-busy="true"],[role="progressbar"]').length){barrierReason='busy';return 'loading';}
      const words=text();
      // Read only visible challenge controls; a hidden CAPTCHA template alone
      // does not rule out the site's normal, challenge-free login form.
      const challengeInputs=shown('input,textarea').some(node=>/captcha|one.?time|otp|auth.?code|cert.?code|academyJoinAuthKey|calendarEventCode/i.test([node.id,node.getAttribute('name'),node.getAttribute('autocomplete'),node.getAttribute('placeholder')].join(' ')));
      const challengeFrames=shown('iframe').some(node=>/captcha|recaptcha|hcaptcha|turnstile/i.test([node.getAttribute('src'),node.getAttribute('title')].join(' ')));
      if(challengeInputs||challengeFrames||/보안\s*문자|자동\s*입력\s*방지|일회용\s*(?:비밀|인증)|2단계\s*인증|인증번호를?\s*입력|Verify you are human|Checking your browser|로봇이 아닙니다/i.test(words)){barrierReason='challenge';return 'challenge';}
      if(/비정상적인 접근|접근이 차단|계정.{0,20}잠[겼금]|로그인.{0,20}횟수.{0,20}초과/i.test(words)){barrierReason='access_blocked';return 'manual';}
      const errorNodes=shown('[role="alert"],[aria-live="assertive"],.error,.error-message,.login-error,.login_error,.invalid-feedback');
      const errors=errorNodes.map(node=>node.innerText||node.textContent||'').join(' ').trim();
      if(/(?:아이디|비밀번호|계정|password|user\s*name).{0,45}(?:일치하지|틀렸|잘못되|올바르지|incorrect|invalid)|(?:incorrect|invalid).{0,30}(?:password|credentials|user\s*name)/i.test(errors)){barrierReason='credential_rejected';return 'rejected';}
      const actionable=errorNodes.filter(node=>!routeAnnouncement(node)).map(node=>node.innerText||node.textContent||'').join(' ').trim();
      if(actionable){barrierReason='visible_notice';return 'manual';}
      if(errors&&evidence)routeAnnouncementIgnored=true;
      return '';
    };
    const barrier=barriers();if(barrier)return reply(barrier);
    // Explicit CKD collection renewal only. Invoke the reviewed site's own
    // zero-argument logout function; never construct a request or clear cookies.
    if(input.mode==='ckd_logout'){
      if(validation||input.site!=='ckd'||input.backgroundRecovery!==true||input.ckdFreshCollection!==true||input.backgroundSubmitted!==false||current.origin!=='https://www.ckdmediview.com'||current.search||current.hash||!['/hcpapp/base/index.do','/hcpapp/common/login.do','/hcpapp/webinar/webinar.do'].includes(current.pathname))return reply('blocked');
      const signals=sessionSignals(),original=Object.getOwnPropertyDescriptor(window,'logout');
      if(signals.into||signals.passwordShown||!original||typeof original.value!=='function'||!liveUrl())return reply('manual');
      const marker='__webinarCkdCollectionLogoutV1';if(Object.getOwnPropertyDescriptor(document,marker))return reply('already_submitted');
      Object.defineProperty(document,marker,{value:true,configurable:false});original.value.call(window);return reply('pending');
    }
    const route=policy.routes.find(candidate=>candidate.origin===current.origin&&candidate.path===current.pathname&&Object.entries(candidate.query||{}).every(([key,values])=>{
      const found=current.searchParams.getAll(key);return found.length<=1&&values.includes(found[0]||'');
    }));
    const marker='__webinarCredentialLoginV1';let state=document[marker];
    // Validation cannot reuse an existing session, including a provider session
    // beside the login form. Never log it out or clear its cookies here.
    if(validation&&input.mode!=='verify'&&(!route||sessionSignals().logoutShown))return reply('manual');
    if(validation&&input.mode==='verify'){
      if(input.validationSubmitted!==true)return reply('manual');
      // A SPA keeps the marker across its route change. A full navigation loses
      // it; only the native operation's submitted assertion bridges documents.
      if(state&&(state.validation!==true||state.site!==input.site||state.nonce!==input.nonce||state.submitted!==true))return reply('stale');
    }
    let visibleLogin=false;
    if(['probe','verify'].includes(input.mode)&&(policy.verifyOrigins||policy.origins).includes(current.origin)){
      const {passwordShown,out,into,member,intermdMember,logoutShown}=sessionSignals();
      visibleLogin=into;
      if((out||member)&&!into&&!passwordShown){if(evidence)evidence.authEvidenceSource=out?'visible_logout':'hmp_server_member';return reply('authenticated');}
      if(intermdMember&&logoutShown&&!into&&!passwordShown&&(!validation||input.mode==='verify'&&input.validationSubmitted===true)){if(evidence)evidence.authEvidenceSource='intermd_server_member';return reply('authenticated');}
      // sessionMgt can finish before the original page renders its logout menu.
      // Keep the existing native deadline while waiting for that independent
      // proof; do not submit credentials into an already identified session.
      if(!validation&&input.mode==='probe'&&intermdMember&&!logoutShown&&!into&&!passwordShown)return reply('loading');
      // The reviewed CKD template keeps its account menu closed on mobile.
      // Only a native one-shot after ACK may click the original menu button.
      // This is not authentication evidence: a later normal read still needs
      // the actual visible, safe logout control and no login/password conflict.
      const ckdSubmitted=validation&&input.validationSubmitted===true||!validation&&input.backgroundRecovery===true&&input.backgroundSubmitted===true;
      if(input.mode==='verify'&&input.revealCkdMenu===true&&ckdSubmitted&&input.site==='ckd'&&current.origin==='https://www.ckdmediview.com'&&['/hcpapp/base/index.do','/hcpapp/webinar/webinar.do'].includes(current.pathname)&&!current.search&&!current.hash&&!out&&!into&&!passwordShown&&!logoutShown){
        const marker='__webinarCkdMenuV1',previous=Object.getOwnPropertyDescriptor(document,marker);
        if(previous)return {...reply('unknown'),ckdMenuOutcome:'already_used'};
        Object.defineProperty(document,marker,{value:true,configurable:false});
        const buttons=shown('header button.btn-asidenav--js').filter(node=>node.type==='button'&&!node.disabled&&!node.hasAttribute('form')&&!node.closest('form')&&!node.hasAttribute('onclick')&&clean(node.textContent)==='메뉴');
        const asides=document.querySelectorAll('aside.asidenav--js');
        if(buttons.length!==1||asides.length!==1||!asides[0].querySelector('nav.asidenav-menu')||!liveUrl())return {...reply('unknown'),ckdMenuOutcome:'unavailable'};
        buttons[0].click();return {...reply('unknown'),ckdMenuOutcome:'requested'};
      }
      if(input.mode==='verify')return reply(passwordShown||into&&!out&&!member?'login_required':'unknown');
    }
    if(input.mode==='verify')return reply('unknown');
    // Native may open only CredentialSites.loginUrl(site), once, on this signal.
    // Never follow an arbitrary page-supplied URL or return it from the helper.
    if(!route){
      const doctorvilleEntry=input.site==='doctorville'&&input.mode==='probe'&&!validation&&current.origin==='https://www.doctorville.co.kr'&&current.pathname==='/seminar/main'&&!current.search&&!current.hash;
      return reply(visibleLogin||doctorvilleEntry?'login_required':'manual');
    }
    const normalizedHandler=value=>String(value||'').replace(/\s/g,'').replace(/;+$/,'');
    const hydratedSubmit=form=>{
      // Static Next/React HTML is not evidence that its submit handler loaded.
      // Inspect only function presence; never call/read arbitrary field values.
      const keys=Object.getOwnPropertyNames(form).filter(key=>/^__react(?:Props|EventHandlers)\$/.test(key));
      return keys.some(key=>{
        const props=Object.getOwnPropertyDescriptor(form,key)?.value;
        return props&&typeof Object.getOwnPropertyDescriptor(props,'onSubmit')?.value==='function';
      });
    };
    const editable=node=>visible(node)&&!node.disabled&&!node.readOnly&&!node.hasAttribute('disabled')&&!node.hasAttribute('readonly')&&!node.closest('fieldset[disabled]')&&!node.hasAttribute('form')&&node.getAttribute('autocomplete')!=='new-password';
    const inspect=()=>{
      if(!liveUrl()||validation&&sessionSignals().logoutShown)return null;
      const users=Array.from(document.querySelectorAll(route.user)),passwords=Array.from(document.querySelectorAll(route.password));
      if(users.length!==1||passwords.length!==1)return null;
      const user=users[0],password=passwords[0];
      if(user===password||user.tagName!=='INPUT'||password.tagName!=='INPUT'||!['','text','email','tel'].includes((user.getAttribute('type')||'').toLowerCase())||(password.getAttribute('type')||'').toLowerCase()!=='password'||!editable(user)||!editable(password)||shown('input[type="password"]').length!==1)return null;
      const containers=Array.from(document.querySelectorAll(route.container)).filter(node=>visible(node)&&node.contains(user)&&node.contains(password));
      if(containers.length!==1)return null;
      const form=containers[0];
      if(route.kind==='container'){
        if(form.closest('form')||user.closest('form')||password.closest('form'))return null;
      }else{
        if(form.tagName!=='FORM'||user.closest('form')!==form||password.closest('form')!==form||!['','_self'].includes(form.getAttribute('target')||''))return null;
        const method=(form.getAttribute('method')||'').toLowerCase(),rawAction=form.getAttribute('action')||'',action=new URL(rawAction,current.href);
        if(action.origin!==current.origin||action.username||action.password||action.hash)return null;
        if(route.kind==='spa'){
          if(method&&!['get','post'].includes(method)||rawAction&&(action.pathname!==current.pathname||action.search!==current.search)||!hydratedSubmit(form))return null;
        }else if(method!=='post'||!route.actions.includes(action.pathname)||rawAction&&action.search)return null;
      }
      const buttons=Array.from(form.querySelectorAll(route.submit)).filter(node=>visible(node)&&/^(로그인|로그인하기|통합회원로그인|login|signin)$/i.test(label(node)));
      if(buttons.length!==1)return null;
      const button=buttons[0];
      if(button.hasAttribute('form')||button.hasAttribute('formaction')||button.hasAttribute('formmethod')||button.hasAttribute('formtarget')||button.closest('fieldset[disabled]')||button.getAttribute('aria-disabled')==='true')return null;
      if((button.disabled||button.hasAttribute('disabled'))&&!route.enableAfterFill)return null;
      if(route.handlers&&!route.handlers.some(handler=>normalizedHandler(handler)===normalizedHandler(button.getAttribute('onclick'))))return null;
      if(route.handlers){const name=(button.getAttribute('onclick')||'').match(/^\s*([A-Za-z_$][\w$]*)\s*\(/)?.[1];if(!name||typeof window[name]!=='function')return null;}
      if((route.requiredFunctions||[]).some(name=>typeof window[name]!=='function'))return null;
      return {form,user,password,button};
    };
    const controls=inspect();if(!controls)return reply('manual');
    const same=live=>live&&state&&state.validation===validation&&state.site===input.site&&state.url===current.href&&state.nonce===input.nonce&&state.pageTag===input.pageTag&&['form','user','password','button'].every(key=>state[key]===live[key]);
    if(input.mode==='probe'){
      if(state)return same(controls)?reply(state.used?'already_submitted':'ready',!!state.submitted):reply('stale');
      state={...controls,site:input.site,url:current.href,nonce:input.nonce,pageTag:input.pageTag,validation,used:false,submitted:false,filled:false,submitReads:0,filledAt:0};
      Object.defineProperty(document,marker,{value:state,configurable:false});
      return reply('ready');
    }
    if(!same(controls))return reply('stale');
    if(input.mode==='fill'){
      if(state.used)return reply('already_submitted',!!state.submitted);
      if(typeof input.id!=='string'||!input.id||input.id.length>512||typeof input.password!=='string'||!input.password||input.password.length>4096||/[\x00\r\n]/.test(input.id+input.password))return reply('manual');
      const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;
      if(typeof setter!=='function')return reply('manual');
      // Consume once before page events; reentrancy cannot refill or resubmit.
      state.used=true;
      const set=(node,value)=>{setter.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));};
      set(controls.user,input.id);
      if(!same(inspect()))return reply('stale');
      let changedBarrier=barriers();if(changedBarrier)return reply(changedBarrier);
      set(controls.password,input.password);
      if(!same(inspect()))return reply('stale');
      changedBarrier=barriers();if(changedBarrier)return reply(changedBarrier);
      state.filled=true;state.filledAt=Date.now();
    }else{
      // Native retries this phase without credentials, at most three times.
      if(state.submitted)return reply('already_submitted',true);
      if(!state.filled||state.submitReads>=3||Date.now()<state.filledAt||Date.now()-state.filledAt>2500)return reply('manual');
      state.submitReads++;
    }
    if(controls.button.disabled||controls.button.hasAttribute('disabled')||controls.button.getAttribute('aria-disabled')==='true')return reply(route.enableAfterFill&&state.submitReads<3?'pending':'manual');
    state.submitted=true;attempted=true;
    // Reviewed SPA handlers own the POST. Block only the browser's default
    // form navigation, so failed hydration/handlers can never send a GET query
    // containing credentials. Propagation and the original handlers continue.
    const guard=event=>{if(event.target===controls.form)event.preventDefault();};
    if(route.kind==='spa')controls.form.addEventListener('submit',guard,true);
    try{controls.button.click();}finally{if(route.kind==='spa')controls.form.removeEventListener('submit',guard,true);}
    return reply('submitted',true);
  }catch{return reply(attempted?'submitted':'manual',attempted);}
})(input,[{"id":"doctorville","name":"닥터빌","entry":"https://www.doctorville.co.kr/seminar/main","url":"https://mims-account.shop.co.kr/login?cb=https://www.doctorville.co.kr/mims/directLogin","origins":["https://www.doctorville.co.kr","https://mims-account.shop.co.kr"],"verifyOrigins":["https://www.doctorville.co.kr"],"routes":[{"origin":"https://mims-account.shop.co.kr","path":"/login","query":{"cb":["https://www.doctorville.co.kr/mims/directLogin"]},"kind":"spa","container":"form","user":"input#identifier[name=\"identifier\"]","password":"input#password[name=\"password\"]","submit":"button[type=\"submit\"]"}]},{"id":"keymedi","name":"키메디","entry":"https://www.keymedi.com/meditv/live","url":"https://www.keymedi.com/login","origins":["https://www.keymedi.com"],"routes":[{"origin":"https://www.keymedi.com","path":"/login","kind":"spa","container":"form","user":"input[name=\"uid\"]","password":"input[name=\"password\"]","submit":"button[type=\"submit\"][data-gtm-event-name=\"login_click\"][data-gtm-login-channel=\"일반 로그인\"]","enableAfterFill":true}]},{"id":"hmp","name":"한미 HMP","entry":"https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm","url":"https://www.hmp.co.kr/login/loginForm.hm","origins":["https://www.hmp.co.kr"],"routes":[{"origin":"https://www.hmp.co.kr","path":"/login/loginForm.hm","kind":"script","container":"form#loginForm","user":"input#memId[name=\"memId\"]","password":"input#passwd[name=\"passwd\"]","submit":"button.btn_login[type=\"button\"]","handlers":["login()","loginProcess()"],"actions":["/login/loginForm.hm","/login/loginProcess.hm"]}]},{"id":"intermd","name":"인터엠디","entry":"https://www.intermd.co.kr/webinar/list.do","url":"https://www.intermd.co.kr/login/loginView.do","origins":["https://www.intermd.co.kr"],"routes":[{"origin":"https://www.intermd.co.kr","path":"/login/loginView.do","kind":"script","container":"form#form1","user":"input#memberId[name=\"memberId\"]","password":"input#memberPw[name=\"memberPw\"]","submit":"button[type=\"submit\"]","handlers":["login();return false;"],"requiredFunctions":["emloginCheck","md5","gfn_callAjax"],"actions":["/login/loginView.do","/login/login.do"]}]},{"id":"whodadoc","name":"후다닥의사","entry":"https://hcp.whodadoc.com/hcp/main","url":"https://hcp.whodadoc.com/auth/login","origins":["https://hcp.whodadoc.com"],"routes":[{"origin":"https://hcp.whodadoc.com","path":"/auth/login","kind":"script","container":"form[name=\"frm\"]","user":"input#userId[name=\"id\"]","password":"input[name=\"password\"]","submit":"input#login[type=\"button\"]","actions":["/auth/login"]}]},{"id":"medigate","name":"메디게이트","entry":"https://new.medigate.net/symposium","url":"https://www.medigate.net/auth/login","origins":["https://new.medigate.net","https://www.medigate.net","https://m.medigate.net"],"routes":[{"origin":"https://new.medigate.net","path":"/auth/login","kind":"spa","container":"form","user":"input[name=\"userId\"][aria-label=\"userId\"]","password":"input[name=\"password\"][aria-label=\"password\"]","submit":"button[type=\"submit\"]"},{"origin":"https://www.medigate.net","path":"/auth/login","kind":"spa","container":"form","user":"input[name=\"userId\"][aria-label=\"userId\"]","password":"input[name=\"password\"][aria-label=\"password\"]","submit":"button[type=\"submit\"]"}]},{"id":"ckd","name":"종근당","entry":"https://www.ckdmediview.com/hcpapp/webinar/webinar.do","url":"https://www.ckdmediview.com/hcpapp/common/login.do","origins":["https://www.ckdmediview.com"],"routes":[{"origin":"https://www.ckdmediview.com","path":"/hcpapp/common/login.do","kind":"container","container":".login-form","user":"input#r_mbloginid[name=\"r_mbloginid\"]","password":"input#r_mbpswd[name=\"r_mbpswd\"]","submit":"button[type=\"button\"]","handlers":["verifyRecaptcha()"]}]},{"id":"bluepharm","name":"블루팜","entry":"https://bluepharmkorea.co.kr/","url":"https://bluepharmkorea.co.kr/?pn=member.login.form","origins":["https://bluepharmkorea.co.kr"],"routes":[{"origin":"https://bluepharmkorea.co.kr","path":"/","query":{"pn":["","member.login.form"]},"kind":"post","container":"form.js_login_form","user":"input#login_id[name=\"login_id\"]","password":"input#login_password[name=\"login_password\"]","submit":"button[type=\"submit\"]","actions":["/svc/login/dologin"]}]},{"id":"dtalks","name":"디톡스","entry":"https://www.dtalks.kr/websim/vodList.do","url":"https://www.dtalks.kr/login.do","origins":["https://www.dtalks.kr"],"routes":[{"origin":"https://www.dtalks.kr","path":"/login.do","kind":"post","container":"form#loginForm","user":"input#USER_ID[name=\"USER_ID\"]","password":"input#USER_PWD[name=\"USER_PWD\"]","submit":"button[type=\"submit\"]","actions":["/member/loginConfirm.do"]}]},{"id":"docple","name":"닥플 플러스","entry":"https://docple-plus.com/offerwall/attendance","url":"https://docple-plus.com/auth/login","origins":["https://docple-plus.com"],"routes":[{"origin":"https://docple-plus.com","path":"/auth/login","kind":"spa","container":"form","user":"input[name=\"id\"]","password":"input[name=\"password\"]","submit":"button[type=\"submit\"]"}]}]);})