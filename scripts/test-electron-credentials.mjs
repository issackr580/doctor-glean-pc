// Original login helpers in real isolated Electron pages. Synthetic accounts only.
import {app,session,BrowserWindow} from 'electron';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import assert from 'node:assert/strict';
import {AutomationPage} from '../src/automation-page.js';
import {CredentialRunner} from '../src/credential-runner.js';
import {CredentialAttempts} from '../src/credential-attempts.js';
import {CredentialManager} from '../src/credential-manager.js';
import {CREDENTIAL_SITES} from '../src/credential-policy.js';
import {remotePreferences} from '../src/security.js';
import {electronCatalogPage} from '../src/electron-catalog-page.js';
import {CatalogRunner} from '../src/catalog-runner.js';
import {initialSettings} from '../vendor/engine/core.js';
import {kstDate} from '../src/schedule.js';
app.on('window-all-closed',()=>{});
const root=mkdtempSync(join(tmpdir(),'pc-credential-electron-'));app.setPath('userData',root);app.setPath('sessionData',join(root,'browser'));
const checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);},attempts=new CredentialAttempts(join(root,'attempts.json')),posts=[];
const inputs={
 doctorville:'<form><input id="identifier" name="identifier"><input type="password" id="password" name="password"><button type="submit">로그인</button></form>',
 keymedi:'<form><input name="uid"><input type="password" name="password"><button type="submit" data-gtm-event-name="login_click" data-gtm-login-channel="일반 로그인" disabled>로그인</button></form>',
 hmp:'<form id="loginForm" method="post" action="/login/loginProcess.hm"><input id="memId" name="memId"><input type="password" id="passwd" name="passwd"><button type="button" class="btn_login" onclick="login()">로그인</button></form>',
 intermd:'<form id="form1" method="post"><input id="memberId" name="memberId"><input type="password" id="memberPw" name="memberPw"><button type="submit" onclick="login();return false;">로그인</button></form>',
 whodadoc:'<form name="frm" method="post"><input id="userId" name="id"><input type="password" name="password"><input type="button" id="login" value="로그인"></form>',
 medigate:'<form><input name="userId" aria-label="userId"><input type="password" name="password" aria-label="password"><button type="submit">로그인하기</button></form>',
 ckd:'<div class="login-form"><input id="r_mbloginid" name="r_mbloginid"><input type="password" id="r_mbpswd" name="r_mbpswd"><button type="button" onclick="verifyRecaptcha()">로그인</button></div>',
 bluepharm:'<form class="js_login_form" method="post" action="/svc/login/dologin"><input id="login_id" name="login_id"><input type="password" id="login_password" name="login_password"><input type="hidden" name="csrf" value="SYNTHETIC_CSRF"><button type="submit">로그인</button></form>',
 dtalks:'<form id="loginForm" method="post" action="/member/loginConfirm.do"><input id="USER_ID" name="USER_ID"><input type="password" id="USER_PWD" name="USER_PWD"><button type="submit">로그인</button></form>',
 docple:'<form><input name="id"><input type="password" name="password"><button type="submit">통합회원 로그인</button></form>'
};
const shell=body=>'<!doctype html><html><meta charset="utf-8"><body>'+body+'</body></html>';
async function run(){
 await app.whenReady();
 for(const policy of CREDENTIAL_SITES){
  const partition='credential-validation-'+randomUUID(),prefs={...remotePreferences(policy.id),partition},profile=session.fromPartition(partition);let accepted=false;
  await profile.protocol.handle('https',async request=>{
   const u=new URL(request.url);
   if(policy.id==='docple'&&u.pathname==='/api/season2/mission/attendance/calendar')return new Response(JSON.stringify({data:{yearMonth:kstDate().slice(0,7).replace('-',''),attendedDates:[]}}),{status:accepted?200:401,headers:{'content-type':'application/json'}});
   if(request.method!=='GET'){
    const record=JSON.parse(readFileSync(join(root,'attempts.json'))).sites[policy.id];assert.equal(record.status,'submitted');
    const body=await request.text();assert.match(body,/SYNTHETIC_USER/);assert.match(body,/SYNTHETIC_PASSWORD/);posts.push(policy.id);accepted=true;return new Response('{}',{headers:{'content-type':'application/json'}});
   }
   assert.doesNotMatch(request.url,/SYNTHETIC_USER|SYNTHETIC_PASSWORD/);
   if(accepted)return new Response(shell('<main><a href="/logout">로그아웃</a></main>'),{headers:{'content-type':'text/html'}});
   const route=policy.routes[0],script=`const form=document.querySelector(${JSON.stringify(route.container)});const button=form.querySelector(${JSON.stringify(route.submit)});const send=async()=>{const body=new URLSearchParams();body.set('id',document.querySelector(${JSON.stringify(route.user)}).value);body.set('password',document.querySelector(${JSON.stringify(route.password)}).value);await fetch('/synthetic-login',{method:'POST',body});${policy.id==='docple'?"document.cookie='accessToken=SYNTHETIC_ACCESS_TOKEN;path=/;Secure;SameSite=Lax';":''}location.href=${JSON.stringify(policy.entry)};};window.login=send;window.verifyRecaptcha=send;window.emloginCheck=()=>{};window.md5=()=>{};window.gfn_callAjax=()=>{};Object.defineProperty(form,'__reactProps$synthetic',{value:{onSubmit(){}}});if(form.tagName==='FORM')form.addEventListener('submit',event=>{event.preventDefault();if(!['hmp','intermd'].includes(${JSON.stringify(policy.id)}))send();});if(['whodadoc'].includes(${JSON.stringify(policy.id)}))button.onclick=send;if(${JSON.stringify(policy.id)}==='keymedi')form.addEventListener('input',()=>queueMicrotask(()=>button.disabled=false));`;
   return new Response(shell(inputs[policy.id]+'<script>'+script+'</script>'),{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  const controller=new AbortController(),page=new AutomationPage(policy.id,controller.signal,prefs),candidate={id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'};
  try{
   const result=await new CredentialRunner({attempts}).run(policy.id,page,{candidate,validation:true,signal:controller.signal});
   check(policy.id+' original login validates only after one durable POST and post-submit authentication',result.status==='authenticated'&&result.submitted&&posts.filter(id=>id===policy.id).length===1);
   const power=await page.root.webContents.executeJavaScript('({node:typeof require,bridge:typeof doctorGlean})');check(policy.id+' validation page cannot reach Node or control IPC',power.node==='undefined'&&power.bridge==='undefined');
  }finally{candidate.id='';candidate.password='';page.close();}
 }


 // The real Keymedi helper must receive background-only options from the
 // native runner. A visible logout link would conceal a rejected proof call.
 for(const scenario of ['spa','navigation','unauthorized']){
  const partition='keymedi-recovery-'+randomUUID(),profile=session.fromPartition(partition),file=join(root,'keymedi-'+scenario+'.json');
  const recoveryAttempts=new CredentialAttempts(file);let loginPosts=0,memberReads=0,accepted=false;
  await profile.protocol.handle('https',async request=>{
   const u=new URL(request.url),headers={'content-type':'text/html; charset=utf-8'};
   if(u.origin==='https://api.keymedi.com'){
    assert.equal(request.url,'https://api.keymedi.com/api/member/getMyInfo');
    if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'https://www.keymedi.com','access-control-allow-methods':'POST','access-control-allow-headers':'authorization,content-type'}});
    memberReads++;assert.equal(JSON.parse(readFileSync(file)).sites.keymedi.status,'submitted');
    return new Response(JSON.stringify({code:0,data:{info:{name:'SYNTHETIC_MEMBER'}}}),{status:scenario==='unauthorized'?401:200,headers:{'content-type':'application/json','access-control-allow-origin':'https://www.keymedi.com'}});
   }
   if(request.method==='POST'){
    loginPosts++;assert.equal(u.pathname,'/synthetic-login');assert.equal(JSON.parse(readFileSync(file)).sites.keymedi.status,'submitted');accepted=true;
    return new Response('{}',{headers:{'content-type':'application/json'}});
   }
   if(accepted)return new Response(shell('<main>합성 로그인 후 화면</main>'),{headers});
   const script=`const form=document.querySelector('form'),button=form.querySelector('button');Object.defineProperty(form,'__reactProps$synthetic',{value:{onSubmit(){}}});form.addEventListener('input',()=>queueMicrotask(()=>button.disabled=false));form.addEventListener('submit',async event=>{event.preventDefault();await fetch('/synthetic-login',{method:'POST'});localStorage.setItem('access_token','SYNTHETIC_ACCESS_TOKEN');${scenario==='navigation'?"location.href='/meditv/live';":"history.pushState({},'','/');document.body.innerHTML='<main>합성 로그인 후 화면</main>';"}});`;
   return new Response(shell(inputs.keymedi+'<script>'+script+'</script>'),{headers});
  });
  const page=new AutomationPage('keymedi',new AbortController().signal,{...remotePreferences('keymedi'),partition});let decryptions=0;
  try{
   const result=await new CredentialRunner({attempts:recoveryAttempts}).run('keymedi',page,{automatic:true,signal:page.signal,readCredentials:()=>{decryptions++;return {id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'};}});
   check('Keymedi '+scenario+' recovery uses one durable login and one server member read',loginPosts===1&&memberReads===1&&decryptions===1);
   check('Keymedi '+scenario+' authenticates only a verified server member',result.status===(scenario==='unauthorized'?'time_limit':'authenticated')&&(scenario==='unauthorized'||result.trace.some(row=>row.authEvidenceSource==='keymedi_background_member')));
   check('Keymedi '+scenario+' diagnostics exclude account and token values',!/SYNTHETIC_|Bearer|https:/.test(JSON.stringify(result)));
   if(scenario==='unauthorized')check('Keymedi uncertain recovery remains disabled for automatic resubmission',recoveryAttempts.decision('keymedi',Date.now()+60001,false,true)==='disabled');
  }finally{page.close();}
 }

 for(const scenario of ['authenticated','anonymous','challenge']){
  const partition='whodadoc-blocked-'+randomUUID(),profile=session.fromPartition(partition),file=join(root,'whodadoc-'+scenario+'.json');let sent=0,entries=0;
  await profile.protocol.handle('https',request=>{
   const u=new URL(request.url),headers={'content-type':'text/html; charset=utf-8'};
   if(request.method==='POST'){
    assert.equal(u.pathname,'/auth/login');assert.equal(JSON.parse(readFileSync(file)).sites.whodadoc.status,'submitted');sent++;
    return new Response('{}',{headers:{'content-type':'application/json'}});
   }
   if(u.pathname==='/hcp/main'){entries++;if(scenario==='authenticated'&&sent)return new Response(shell('<a href="/auth/logout">로그아웃</a>'),{headers});}
   const script=`document.querySelector('#login').onclick=async()=>{await fetch('/auth/login',{method:'POST'});${scenario==='challenge'?"document.body.innerHTML='<p>인증번호를 입력해 주세요</p><input name=otp>';":"location.href='https://blocked-login.example.invalid/';"}};`;
   return new Response(shell(inputs.whodadoc+'<script>'+script+'</script>'),{headers});
  });
  const page=new AutomationPage('whodadoc',new AbortController().signal,{...remotePreferences('whodadoc'),partition});
  try{
   const result=await new CredentialRunner({attempts:new CredentialAttempts(file)}).run('whodadoc',page,{signal:page.signal,readCredentials:()=>({id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'})});
   check('Whodadoc '+scenario+' submits once and preserves navigation isolation',sent===1&&(scenario==='challenge'||page.diagnostics().navigationBlocked===1));
   check('Whodadoc '+scenario+' requires the protected PC session after the real auth response',result.status===(scenario==='authenticated'?'authenticated':scenario==='challenge'?'challenge':'login_required')&&entries===(scenario==='challenge'?0:1));
   check('Whodadoc '+scenario+' exports counters without a blocked URL or account value',!/SYNTHETIC_|https:|blocked-login/.test(JSON.stringify(result)));
  }finally{page.close();}
 }

 for(const authenticated of [true,false]){
  const partition='post-result-'+randomUUID(),profile=session.fromPartition(partition);let sent=0,catalogReads=0;
  await profile.protocol.handle('https',request=>{
   const path=new URL(request.url).pathname;
   if(request.method==='POST'){sent++;return new Response(shell('처리 결과'),{headers:{'content-type':'text/html; charset=utf-8'}});}
   if(path==='/websim/vodList.do'){catalogReads++;return new Response(shell(authenticated?'<a href="/logout">로그아웃</a>':inputs.dtalks),{headers:{'content-type':'text/html; charset=utf-8'}});}
   return new Response(shell(inputs.dtalks),{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  const page=new AutomationPage('dtalks',new AbortController().signal,{...remotePreferences('dtalks'),partition});
  const result=await new CredentialRunner({attempts:new CredentialAttempts(join(root,'post-result-'+authenticated+'.json'))}).run('dtalks',page,{candidate:{id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'},validation:true,signal:page.signal});
  check(authenticated?'a blank POST result verifies the session with one protected catalog GET and one POST':'a blank result and anonymous catalog do not prove candidate authentication',result.status===(authenticated?'authenticated':'login_required')&&sent===1&&catalogReads===1&&result.trace.some(row=>row.phase==='refresh'));page.close();
 }

 // The reviewed Dtalks header keeps its server logout in a closed profile box.
 const dtalksHeader=(href='/member/logout.do')=>'<header id="header"><div class="top_wrap"><div class="content_wrap"><div class="my_box" style="display:none"><div class="link_wrap"><a class="logout" href="'+href+'">로그아웃</a></div></div></div></div></header>';
 const menuPartition='dtalks-menu-'+randomUUID(),menuSession=session.fromPartition(menuPartition);let menuAccepted=false,menuPosts=0,menuCatalogs=0;
 await menuSession.protocol.handle('https',request=>{
  const path=new URL(request.url).pathname;
  if(request.method==='POST'){menuPosts++;menuAccepted=true;return Response.redirect('https://www.dtalks.kr/main.do',302);}
  if(path==='/login.do'&&menuAccepted)return Response.redirect('https://www.dtalks.kr/main.do',302);
  if(path==='/websim/vodList.do')menuCatalogs++;
  return new Response(shell(menuAccepted?dtalksHeader():inputs.dtalks),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const menuPage=new AutomationPage('dtalks',new AbortController().signal,{...remotePreferences('dtalks'),partition:menuPartition});
 const menuResult=await new CredentialRunner({attempts:new CredentialAttempts(join(root,'menu-attempts.json'))}).run('dtalks',menuPage,{candidate:{id:'SYNTHETIC_MENU_USER',password:'SYNTHETIC_MENU_PASSWORD'},validation:true,signal:menuPage.signal});
 check('a closed Dtalks profile menu validates only after the real POST response and one protected catalog read',menuResult.status==='authenticated'&&menuPosts===1&&menuCatalogs===1&&menuResult.trace.some(row=>row.authEvidenceSource==='dtalks_server_logout'&&row.dtalksLogoutVisible===false&&row.credentialHttpStatus===302));
 check('hidden-menu proof returns fixed booleans without changing visibility or exposing page values',!await menuPage.current.webContents.executeJavaScript('getComputedStyle(document.querySelector(".my_box")).display!=="none"')&&!/SYNTHETIC_MENU_|https:|link_wrap|my_box/.test(JSON.stringify(menuResult)));menuPage.close();
 const existingMenu=new AutomationPage('dtalks',new AbortController().signal,{...remotePreferences('dtalks'),partition:menuPartition});let menuDecrypts=0;
 const existingResult=await new CredentialRunner({attempts:new CredentialAttempts(join(root,'menu-existing.json'))}).run('dtalks',existingMenu,{readCredentials:()=>{menuDecrypts++;return {id:'SYNTHETIC_MENU_USER',password:'SYNTHETIC_MENU_PASSWORD'};},signal:existingMenu.signal});
 check('an already authenticated closed menu requires no decryption or additional login submission',existingResult.status==='authenticated'&&!existingResult.submitted&&menuDecrypts===0&&menuPosts===1);existingMenu.close();
 const inspectMenu=async(body,path='/websim/vodList.do',overrides={})=>{
  const partition='menu-proof-'+randomUUID();await session.fromPartition(partition).protocol.handle('https',()=>new Response(shell(body),{headers:{'content-type':'text/html; charset=utf-8'}}));
  const page=new AutomationPage('dtalks',new AbortController().signal,{...remotePreferences('dtalks'),partition});await page.load('https://www.dtalks.kr'+path);
  const input={site:'dtalks',mode:'verify',nonce:'synthetic_menu_nonce_1234',pageTag:'1:'+page.version,expectedUrl:page.url,validation:true,validationSubmitted:true,dtalksAuthResponse:true,dtalksProtectedRead:true,...overrides};
  try{const reply=await page.call('credential-page-state.js',[input]);return {...reply,fixtureCalls:await page.current.webContents.executeJavaScript('window.syntheticLogoutReads??0')};}finally{page.close();}
 };
 const missing=[];for(const flag of ['validationSubmitted','dtalksAuthResponse','dtalksProtectedRead'])missing.push(await inspectMenu(dtalksHeader(),undefined,{[flag]:false}));
 check('a hidden logout alone cannot validate an unsubmitted candidate or replace native response evidence',missing.every(row=>row.status==='unknown'));
 const foreign=await inspectMenu(dtalksHeader('https://outside.example.invalid/member/logout.do')),foreignBase=await inspectMenu('<base href="https://outside.example.invalid/">'+dtalksHeader());
 check('hidden menu authentication rejects both foreign logout links and foreign HTML base destinations',foreign.status==='unknown'&&foreignBase.status==='unknown');
 const conflict=await inspectMenu(dtalksHeader()+inputs.dtalks);
 check('a visible login form conflicts with hidden logout markup and prevents authentication',conflict.status==='unknown'&&conflict.evidence.dtalksLoginConflict);
 const callable=await inspectMenu(dtalksHeader('javascript:logout()')+'<script>window.syntheticLogoutReads=0;window.logout=function(){window.syntheticLogoutReads++;};</script>');
 check('a reviewed zero-argument logout reference is read as evidence without being invoked',callable.status==='authenticated'&&callable.fixtureCalls===0);
 const getter=await inspectMenu(dtalksHeader('javascript:logout()')+'<script>window.syntheticLogoutReads=0;Object.defineProperty(window,"logout",{get(){window.syntheticLogoutReads++;return function(){};}});</script>');
 check('a logout getter is never invoked or accepted as a server logout function',getter.status==='unknown'&&getter.fixtureCalls===0);
 const wrongPage=await inspectMenu(dtalksHeader(),'/login.do');check('the login route cannot authenticate merely by containing a hidden logout template',wrongPage.status==='unknown');

 const formatPartition='provider-format-'+randomUUID(),formatSession=session.fromPartition(formatPartition);let formatPosts=0;
 await formatSession.protocol.handle('https',request=>{
  if(request.method==='POST'){formatPosts++;return new Response('{}',{headers:{'content-type':'application/json'}});}
  return new Response(shell(inputs.doctorville+`<script>const form=document.querySelector('form');Object.defineProperty(form,'__reactProps$synthetic',{value:{onSubmit(){}}});form.onsubmit=event=>{event.preventDefault();const notice=document.createElement('p');notice.textContent='8~20자 영문, 숫자 조합으로 입력해주세요';form.append(notice);};</script>`),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const formatPage=new AutomationPage('doctorville',new AbortController().signal,{...remotePreferences('doctorville'),partition:formatPartition});
 const formatResult=await new CredentialRunner({attempts:new CredentialAttempts(join(root,'format-attempts.json'))}).run('doctorville',formatPage,{candidate:{id:'SYNTHETIC_FORMAT_USER',password:'xxxx'},validation:true,signal:formatPage.signal});
 check('a provider client-format error is reported without waiting for a nonexistent auth request',formatResult.status==='manual'&&formatResult.detail==='input_format'&&formatPosts===0&&formatResult.elapsedMs<5000&&formatResult.trace.some(row=>row.clientValidationError));
 check('client-format telemetry contains no auth request, field value or page text',formatPage.diagnostics().credentialNetworkEnabled&&formatPage.diagnostics().credentialRequests===0&&!/SYNTHETIC_FORMAT_USER|xxxx|8~20/.test(JSON.stringify(formatResult)));formatPage.close();
 const failedPartition='provider-http-'+randomUUID(),failedSession=session.fromPartition(failedPartition);let failedPosts=0;
 await failedSession.protocol.handle('https',request=>{
  if(request.method==='POST'){failedPosts++;return new Response('{}',{status:503,headers:{'content-type':'application/json'}});}
  return new Response(shell(inputs.doctorville+`<script>const form=document.querySelector('form');Object.defineProperty(form,'__reactProps$synthetic',{value:{onSubmit(){}}});form.onsubmit=event=>{event.preventDefault();fetch('/apis/auth/login',{method:'POST',body:new URLSearchParams(new FormData(form))});};</script>`),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const failedController=new AbortController(),failedPage=new AutomationPage('doctorville',failedController.signal,{...remotePreferences('doctorville'),partition:failedPartition}),cancelFailed=setTimeout(()=>failedController.abort(),2200);
 const failedResult=await new CredentialRunner({attempts:new CredentialAttempts(join(root,'http-attempts.json'))}).run('doctorville',failedPage,{candidate:{id:'SYNTHETIC_HTTP_USER',password:'SYNTHETIC_HTTP_PASSWORD'},validation:true,signal:failedController.signal});clearTimeout(cancelFailed);
 const httpTrace=failedResult.trace.find(row=>row.credentialHttpStatus===503);
 check('the fixed auth endpoint records HTTP failure without treating a POST or HTTP response as authentication',failedResult.status==='network_error'&&failedPosts===1&&httpTrace?.credentialRequests===1&&httpTrace?.credentialResponses===1&&!/SYNTHETIC_HTTP_|https:/.test(JSON.stringify(failedResult)));failedPage.close();

 const legacyPartition='legacy-post-'+randomUUID(),legacySession=session.fromPartition(legacyPartition);let legacySent=0;
 await legacySession.protocol.handle('https',async request=>{
  const path=new URL(request.url).pathname;
  if(request.method==='POST'){legacySent++;await new Promise(resolve=>setTimeout(resolve,1400));return Response.redirect('https://www.dtalks.kr/websim/vodList.do',302);}
  if(path==='/websim/vodList.do')return new Response(shell('<a href="/logout">로그아웃</a>'),{headers:{'content-type':'text/html; charset=utf-8'}});
  return new Response(shell(inputs.dtalks),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const legacyPage=new AutomationPage('dtalks',new AbortController().signal,{...remotePreferences('dtalks'),partition:legacyPartition});
 const legacyResult=await new CredentialRunner({attempts:new CredentialAttempts(join(root,'legacy-attempts.json'))}).run('dtalks',legacyPage,{candidate:{id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'},validation:true,signal:legacyPage.signal});
 console.log('ELECTRON_CREDENTIALS_LEGACY:'+JSON.stringify({status:legacyResult.status,submitted:legacyResult.submitted,reads:legacyResult.reads,posts:legacySent}));
 check('delayed original POST navigation keeps post-submit verification bound to the new document',legacyResult.status==='authenticated'&&legacyResult.submitted&&legacySent===1);legacyPage.close();

 const providerPartition='provider-popup-'+randomUUID(),providerSession=session.fromPartition(providerPartition);let providerPosts=0;
 await providerSession.protocol.handle('https',async request=>{
  if(request.method==='POST'){providerPosts++;return new Response('{}',{headers:{'content-type':'application/json'}});}
  if(new URL(request.url).hostname==='www.doctorville.co.kr'){
   await new Promise(resolve=>setTimeout(resolve,1200));return new Response(shell('<a href="/logout">로그아웃</a>'),{headers:{'content-type':'text/html; charset=utf-8'}});
  }
  return new Response(shell(inputs.doctorville+`<script>const form=document.querySelector('form');Object.defineProperty(form,'__reactProps$synthetic',{value:{onSubmit(){}}});form.onsubmit=async event=>{event.preventDefault();await fetch('/synthetic-login',{method:'POST',body:new URLSearchParams(new FormData(form))});window.open('https://www.doctorville.co.kr/seminar/main','login-result');};</script>`),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const providerPage=new AutomationPage('doctorville',new AbortController().signal,{...remotePreferences('doctorville'),partition:providerPartition});
 const providerResult=await new CredentialRunner({attempts:new CredentialAttempts(join(root,'provider-attempts.json'))}).run('doctorville',providerPage,{candidate:{id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'},validation:true,signal:providerPage.signal});
 check('the approved provider popup carries the isolated submitted operation to its authenticated destination',providerResult.status==='authenticated'&&providerResult.submitted&&providerPosts===1&&providerPage.windows.length===2);
 await providerPage.current.webContents.executeJavaScript('window.open("https://outside.example.invalid/","unapproved-auth");void 0');
 check('authenticated login popups still reject unapproved destinations',providerPage.windows.length===2&&providerPage.diagnostics().popupDenied===1);
 const providerPowers=await providerPage.current.webContents.executeJavaScript('({node:typeof require,bridge:typeof doctorGlean})');check('the login popup retains the no-Node and no-control-bridge boundary',providerPowers.node==='undefined'&&providerPowers.bridge==='undefined');
 check('credential traces contain only fixed statuses, counters and booleans',!JSON.stringify(providerResult.trace).match(/https:|SYNTHETIC_|answerNum|identifier|nonce|pageTag/));providerPage.close();

 const stalePartition='stale-credential-'+randomUUID(),staleSession=session.fromPartition(stalePartition);
 await staleSession.protocol.handle('https',()=>new Response(shell(inputs.dtalks),{headers:{'content-type':'text/html; charset=utf-8'}}));
 const stalePage=new AutomationPage('dtalks',new AbortController().signal,{...remotePreferences('dtalks'),partition:stalePartition});await stalePage.load('https://www.dtalks.kr/login.do');const oldVersion=stalePage.version;
 await stalePage.load('https://www.dtalks.kr/login.do');const oldExecute=stalePage.current.webContents.executeJavaScript.bind(stalePage.current.webContents);let credentialEvaluations=0;stalePage.current.webContents.executeJavaScript=(...args)=>{credentialEvaluations++;return oldExecute(...args);};
 const staleSecret=await stalePage.call('credential-login.js',[{site:'dtalks',mode:'fill',nonce:'synthetic_stale_nonce_1234',pageTag:'1:'+oldVersion,expectedUrl:stalePage.url,id:'SYNTHETIC_STALE_USER',password:'SYNTHETIC_STALE_PASSWORD'}],{navigation:true});
 check('secrets are never evaluated in a replacement login document',staleSecret.status==='stale'&&credentialEvaluations===0);
 const staleRead=await stalePage.call('credential-login.js',[{site:'dtalks',mode:'verify',nonce:'synthetic_stale_nonce_1234',pageTag:'1:'+oldVersion,expectedUrl:stalePage.url}]);check('stale credential reads request a fresh observation instead of reporting rejected credentials',staleRead.status==='loading'&&staleRead.documentChanged&&credentialEvaluations===0);stalePage.close();
 // Full save -> isolated validation -> encrypted test adapter -> active-profile
 // automatic restoration. The adapter is test-only and is not Windows DPAPI.
 const key=randomBytes(32),protect={available:()=>true,encrypt:text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);},decrypt:bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString();}};
 const partitions=new Set(),activePartition='synthetic-active-'+randomUUID(),managerDirectory=join(root,'manager');let activeAuthenticated=false,managerPosts=0;
 const make=async(signal,validation,partition)=>{
  const prefs={...remotePreferences('dtalks'),partition:validation?partition:activePartition};
  if(!partitions.has(prefs.partition)){
   partitions.add(prefs.partition);let accepted=false;
   await session.fromPartition(prefs.partition).protocol.handle('https',async request=>{
    if(request.method==='POST'){
     assert.equal(JSON.parse(readFileSync(join(managerDirectory,'credential-attempts-v1.json'))).sites.dtalks.status,'submitted');
     managerPosts++;accepted=true;if(!validation)activeAuthenticated=true;return new Response('{}',{headers:{'content-type':'application/json'}});
    }
    const authenticated=validation?accepted:activeAuthenticated;
    const body=authenticated?'<a href="/logout">로그아웃</a>':inputs.dtalks+'<script>document.querySelector("form").onsubmit=async event=>{event.preventDefault();await fetch("/synthetic-login",{method:"POST",body:new URLSearchParams(new FormData(event.target))});location.href="/websim/vodList.do";};</script>';
    return new Response(shell(body),{headers:{'content-type':'text/html; charset=utf-8'}});
   });
  }
  return new AutomationPage('dtalks',signal,prefs);
 };
 const manager=new CredentialManager({directory:managerDirectory,applicationId:'native-test',protect,automaticAllowed:()=>true,isManualOpen:()=>false,createPage:(_site,signal,{validation,partition}={})=>make(signal,validation,partition)});
 const saved=await manager.save('dtalks','SYNTHETIC_USER','SYNTHETIC_PASSWORD',true);
 check('manager saves only after an isolated candidate login is verified',saved.status==='saved'&&managerPosts===1&&!activeAuthenticated);
 check('encrypted account file contains neither username nor password',!/SYNTHETIC_USER|SYNTHETIC_PASSWORD/.test(readFileSync(join(managerDirectory,'credentials-v1.json'),'utf8')));
 const autoController=new AbortController(),autoPage=manager.wrapPage('dtalks',await make(autoController.signal,false));await autoPage.load('https://www.dtalks.kr/websim/vodList.do');
 check('an expired task profile is automatically restored with explicit saved-account consent',managerPosts===2&&activeAuthenticated&&(await manager.verifyPage('dtalks',autoPage))==='authenticated');
 await autoPage.load('https://www.dtalks.kr/websim/vodList.do');check('an already authenticated task does not submit another login',managerPosts===2);
 manager.setAutomatic('dtalks',false);activeAuthenticated=false;await autoPage.load('https://www.dtalks.kr/websim/vodList.do');check('revoking automatic recovery prevents a new login submission',managerPosts===2&&!activeAuthenticated);autoPage.close();
 for(const authorized of [true,false]){
  const partition='docple-profile-'+randomUUID(),profile=session.fromPartition(partition),directory=join(root,'docple-'+authorized);let sent=0,calendarReads=0;
  await profile.protocol.handle('https',request=>{
   const u=new URL(request.url),headers={'content-type':'text/html; charset=utf-8'};
   if(u.pathname==='/api/season2/mission/attendance/calendar'){
    calendarReads++;
    return new Response(JSON.stringify({data:{yearMonth:kstDate().slice(0,7).replace('-',''),attendedDates:[]}}),{status:authorized?200:401,headers:{'content-type':'application/json'}});
   }
   if(request.method==='POST'){
    sent++;assert.equal(JSON.parse(readFileSync(join(directory,'credential-attempts-v1.json'))).sites.docple.status,'submitted');
    return new Response('{}',{headers:{'content-type':'application/json'}});
   }
   if(sent)return new Response(shell('<main>출석 페이지</main><a href="/auth/login">로그인</a>'),{headers});
   const script="const form=document.querySelector('form');Object.defineProperty(form,'__reactProps$synthetic',{value:{onSubmit(){}}});form.onsubmit=async event=>{event.preventDefault();await fetch('/synthetic-login',{method:'POST'});document.cookie='accessToken=SYNTHETIC_DOC_TOKEN;path=/;Secure;SameSite=Lax';history.pushState({},'','/');document.body.innerHTML='<a href=/logout>로그아웃</a>';};";
   return new Response(shell(inputs.docple+'<script>'+script+'</script>'),{headers});
  });
  const create=async(_site,signal)=>new AutomationPage('docple',signal,{...remotePreferences('docple'),partition});
  const docpleManager=new CredentialManager({directory,applicationId:'docple-test',protect,automaticAllowed:()=>true,isManualOpen:()=>false,createPage:create});
  docpleManager.vault.save('docple',{id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'},true);
  const result=await docpleManager.recover('docple',{automatic:true});
  check('Docple '+authorized+' requires the protected calendar rather than a transient logout label',result.status===(authorized?'authenticated':'login_required')&&sent===1&&calendarReads>=1);
  if(authorized){
   const task=docpleManager.wrapPage('docple',await create('docple',new AbortController().signal));
   try{
    await task.load('https://docple-plus.com/offerwall/attendance');
    check('Docple cooldown does not reopen login when the task calendar is still authenticated',sent===1&&docpleManager.snapshot().results[0].status==='authenticated');
    check('Docple recovered session survives closing the login worker',await task.current.webContents.executeJavaScript('document.cookie.includes("accessToken=")'));
    await assert.rejects(task.call('credential-docple-session.js',[{site:'docple',mode:'verify',kind:'attendance',autoClaim:true,attempted:false,expectedUrl:task.url,pageTag:'1:'+task.version}]));
    check('Docple session alias rejects claim-enabled requests',sent===1);
    const bound={site:'docple',mode:'verify',nonce:'synthetic_docple_binding_123456',kind:'attendance',date:kstDate(),autoClaim:false,attempted:false,expectedUrl:task.url,pageTag:'1:'+task.version};
    await task.call('credential-docple-session.js',[bound]);
    await task.current.webContents.executeJavaScript('document.cookie="accessToken=SYNTHETIC_CHANGED_TOKEN;path=/;Secure;SameSite=Lax"');
    check('Docple token replacement invalidates even a completed or in-flight server proof',(await task.call('credential-docple-session.js',[bound])).status==='stale');
    await task.current.webContents.executeJavaScript('document.cookie="accessToken=SYNTHETIC_DOC_TOKEN;path=/;Secure;SameSite=Lax"');
    check('restoring an old Docple token cannot revive an invalidated proof',(await task.call('credential-docple-session.js',[bound])).status==='stale');
   }finally{task.close();}
  }else check('Docple failed protected session does not permit another automatic submission',(await docpleManager.recover('docple',{automatic:true})).status==='disabled'&&sent===1);
  check('Docple diagnostic results exclude cookies and account values',!/SYNTHETIC_|https:/.test(JSON.stringify(docpleManager.snapshot())));
 }
 // Same-origin automatic redirects must settle before catalog reading; a true
 // network failure remains a typed failure. This never retries a login POST.
 const partition='synthetic-catalog-redirect-'+randomUUID(),prefs={...remotePreferences('doctorville'),partition};
 await session.fromPartition(partition).protocol.handle('https',request=>new Response(shell(new URL(request.url).search?'로그인<input type="password">':'<script>location.replace("/seminar/main?redirected=1")</script>'),{headers:{'content-type':'text/html'}}));
 const controller=new AbortController(),reader=electronCatalogPage(initialSettings().profiles.doctorville,controller.signal,prefs);await reader.open();let row;const until=Date.now()+4000;do{row=await reader.read('2026-10-26',null);if(row.status==='loading')await new Promise(resolve=>setTimeout(resolve,60));}while(row.status==='loading'&&Date.now()<until);check('same-site client redirect is read as a login destination instead of connection failure',row.status==='login');reader.close();
 const worker=new AutomationPage('doctorville',new AbortController().signal,prefs);await worker.load('https://www.doctorville.co.kr/seminar/main');let destination;const readyUntil=Date.now()+4000;do{destination=worker.url;if(!new URL(destination).search)await new Promise(resolve=>setTimeout(resolve,60));}while(!new URL(destination).search&&Date.now()<readyUntil);check('automatic task workers also retain the approved client redirect destination',new URL(destination).search==='?redirected=1');worker.close();
 const fallbackPartition='whodadoc-catalog-'+randomUUID(),fallbackPrefs={...remotePreferences('whodadoc'),partition:fallbackPartition};let fallbackLogins=0;
 await session.fromPartition(fallbackPartition).protocol.handle('https',request=>{
  if(new URL(request.url).pathname==='/hcp/main')return Response.error();
  if(new URL(request.url).pathname==='/auth/login')fallbackLogins++;
  return new Response(shell(inputs.whodadoc),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const fallbackReader=electronCatalogPage(initialSettings().profiles.whodadoc,new AbortController().signal,fallbackPrefs);
 try{
  await fallbackReader.open();let result;const until=Date.now()+3000;
  do{result=await fallbackReader.read(kstDate(),null);if(result.status==='loading')await new Promise(resolve=>setTimeout(resolve,60));}while(result.status==='loading'&&Date.now()<until);
  assert.equal(result.status,'login');assert.equal(fallbackLogins,1);
  check('Whodadoc catalog load failure reads the fixed original login form once',true);
 }finally{fallbackReader.close();}
 // Reproduce the Windows failure before any credential recovery: the fixed
 // unauthenticated Dtalks catalog fails, while its original login still loads.
 for(const scenario of ['recover','consent-off','challenge','login-failed','entry-still-failed']){
  const partition='dtalks-catalog-'+randomUUID(),prefs={...remotePreferences('dtalks'),partition},directory=join(root,'dtalks-catalog-'+scenario);
  const requests=[],rows=[];let authenticated=false,sent=0,recoveries=0;
  await session.fromPartition(partition).protocol.handle('https',request=>{
   const path=new URL(request.url).pathname;requests.push([request.method,path]);
   if(request.method==='POST'){
    assert.equal(path,'/member/loginConfirm.do');
    assert.equal(JSON.parse(readFileSync(join(directory,'credential-attempts-v1.json'))).sites.dtalks.status,'submitted');
    sent++;authenticated=true;return Response.redirect('https://www.dtalks.kr/main.do',302);
   }
   if(path==='/websim/vodList.do'&&(!authenticated||scenario==='entry-still-failed'))return Response.error();
   if(path==='/login.do'&&scenario==='login-failed')return Response.error();
   const body=authenticated?'<a href="/logout">로그아웃</a><nav><a href="/schedule-a.do">편성표</a><a href="/schedule-b.do">편성표</a></nav>':inputs.dtalks+(scenario==='challenge'?'<label>보안문자<input name="captcha"></label>':'');
   return new Response(shell(body),{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  const credentialManager=new CredentialManager({directory,applicationId:'dtalks-catalog-test',protect,automaticAllowed:()=>true,isManualOpen:()=>false,createPage:async(_site,signal)=>new AutomationPage('dtalks',signal,prefs)});
  credentialManager.vault.save('dtalks',{id:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'},scenario!=='consent-off');
  const runner=new CatalogRunner({store:{record:(_site,_date,row)=>rows.push(row)},createPage:(profile,signal)=>electronCatalogPage(profile,signal,prefs),recoverLogin:async(site,signal)=>{recoveries++;return (await credentialManager.recover(site,{automatic:true,signal})).status==='authenticated';},sleep:async()=>new Promise(resolve=>setTimeout(resolve,60))});
  await runner.start(kstDate(),['dtalks']);
  console.log('ELECTRON_DTALKS_CATALOG:'+JSON.stringify({scenario,sent,recoveries,rows:rows.map(row=>({status:row.status,reason:row.reason,diagnostics:row.diagnostics})),credentials:credentialManager.snapshot().results.map(row=>({status:row.status,submitted:row.submitted,reads:row.reads}))}));
  if(scenario==='recover')check('Dtalks failed catalog reaches consented recovery once and resumes the real catalog reader',recoveries===1&&sent===1&&rows.length===1&&rows[0].status==='review'&&rows[0].diagnostics?.stage==='schedule_menu'&&!rows[0].diagnostics.failure);
  if(scenario==='consent-off')check('Dtalks fallback never submits a saved account without automatic consent',recoveries===1&&sent===0&&rows[0].status==='login');
  if(scenario==='challenge')check('Dtalks recovered entry preserves a visible security challenge with zero credential submissions',recoveries===1&&sent===0&&rows[0].status==='login'&&credentialManager.snapshot().results[0].status==='challenge');
  if(scenario==='login-failed')check('Dtalks two failed GETs stop without an account attempt or repeated navigation',recoveries===0&&sent===0&&rows[0].reason==='network_error'&&requests.filter(([method,path])=>method==='GET'&&path==='/login.do').length===1);
  if(scenario==='entry-still-failed')check('Dtalks persistent entry failure after authentication never loops or repeats the login POST',recoveries===1&&sent===1&&rows[0].status==='login');
  check('Dtalks '+scenario+' catalog diagnostics exclude account values and request paths',!/SYNTHETIC_|https:|member\/login/.test(JSON.stringify({rows,state:credentialManager.snapshot()})));
 }
 check('no account values enter native diagnostics',!/SYNTHETIC_|https:|password|csrf/i.test(JSON.stringify(attempts.snapshot())));
 check('temporary validation windows are released',BrowserWindow.getAllWindows().length===0);
 mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});writeFileSync(new URL('../verification/electron-credentials.json',import.meta.url),JSON.stringify({environment:'Linux Electron 45; synthetic HTTPS; immutable Android login assets',checks:checks.length,passed:checks,windowsDpapiVerified:false,actualAccountsVerified:false,posts:posts.length},null,2)+'\n');console.log('ELECTRON_CREDENTIALS_PASS:'+checks.length);app.quit();
}
run().catch(error=>{console.error('ELECTRON_CREDENTIALS_FAIL:'+error.stack);for(const w of BrowserWindow.getAllWindows())w.destroy();app.exit(1);});
app.on('quit',()=>{try{rmSync(root,{recursive:true,force:true});}catch{}});
