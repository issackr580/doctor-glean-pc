(function doctorvilleQuizPilot(input){
 const key='__doctorGleanQuizPilotV1';
 const integer=(n,min,max)=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=max;
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const one=(selector,root=document)=>{const nodes=root.querySelectorAll(selector);return nodes.length===1?nodes[0]:null;};
 let domInspection=null;
 const reply=(status,reason,extra={})=>({status,reason,...(domInspection?{quizDomInspection:domInspection}:{}),...extra});
 const day=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;};
 if(!input||!/^[-a-zA-Z0-9]{16,64}$/.test(input.nonce||''))return reply('stopped','invalid_request');
 const samePage=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length<=4096&&b.length<=4096&&a.split('#',1)[0]===b.split('#',1)[0];
 let url;try{url=new URL(location.href);}catch{return reply('stopped','outside_page');}
 if(window.top!==window.self||url.origin!=='https://www.doctorville.co.kr'||url.pathname!=='/product/productView'||url.username||url.password||url.searchParams.getAll('pId').length!==1||!/^\d{1,10}$/.test(url.searchParams.get('pId'))||typeof input.expectedUrl!=='string'||input.expectedUrl.length>4096||!samePage(input.expectedUrl,url.href))return reply('stopped','outside_page');
 let s=document[key];
 // Only a complete, unchecked copy under a genuinely hidden ancestor can be
 // isolated. An individually styled radio is not evidence of a hidden copy.
 const hiddenOwner=node=>{for(let p=node.parentElement;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){const style=getComputedStyle(p);if(p.hidden||style.display==='none'||style.visibility==='hidden')return p;}return null;};
 const release=operation=>{
  const isolated=operation?.isolation;if(!isolated)return;
  operation.isolation=null;
  // Do not overwrite a subtree the site replaced while the request was running.
  for(const row of [...isolated.rows].reverse())if(row.node.parentNode===isolated.fragment&&row.parent.isConnected&&(!row.next||row.next.parentNode===row.parent))row.parent.insertBefore(row.node,row.next);
 };
 const checkIsolation=()=>{
  const isolated=s?.isolation;if(!isolated)return;
  if(isolated.rows.some(row=>row.node.parentNode!==isolated.fragment||!row.active.isConnected||document.getElementById(row.id)!==row.active||!row.parent.isConnected||hiddenOwner({parentElement:row.parent})!==row.owner||row.node.checked||row.node.id!==row.id||row.node.name!==row.name||row.node.value!==row.value||row.node.disabled||!row.node.matches('input[type=radio]')||row.active.form!=null))throw 'page_changed';
 };
 const isolate=mirrors=>{
  if(!mirrors.length)return;
  const fragment=document.createDocumentFragment(),rows=mirrors.map(node=>({node,parent:node.parentNode,next:node.nextSibling,owner:hiddenOwner(node),id:node.id,name:node.name,value:node.value,active:document.querySelector('#quizLayerPop [id="'+node.id+'"]')}));
  s.isolation={fragment,rows};
  for(const row of rows)fragment.appendChild(row.node);
  checkIsolation();
 };
 if(input.mode==='cancel'){
  if(s?.nonce===input.nonce){s.cancelled=true;s.abort?.abort();s.answers=null;release(s);if(s.hide)window.removeEventListener?.('pagehide',s.hide);if(!['success','wrong'].includes(s.status)){s.status='unknown';s.reason='cancelled';}}
  return reply('stopped','cancelled');
 }
 if(input.openQuiz===true&&input.date!==day())return reply('stopped','day_changed');
 const current=()=>s&&document[key]===s&&!s.cancelled&&samePage(location.href,s.url)&&document.visibilityState==='visible'&&document.readyState==='complete'&&(!s.date||s.date===day());
 const modal=()=>{const node=one('#modalType2');return visible(node)?clean(node.innerText||node.textContent):'';};
 const identity=()=>{
  if(document.readyState!=='complete'||document.visibilityState!=='visible')throw 'page_not_ready';
  if([...document.querySelectorAll('input[type=password]')].some(visible))throw 'login_required';
  if([...document.querySelectorAll('iframe,input')].some(e=>visible(e)&&/captcha|turnstile|one.?time|verification/i.test([e.id,e.name,e.getAttribute('src')].join(' '))))throw 'challenge';
  const id=one('[id="quizId"]');
  if(!id||id.tagName!=='INPUT'||!/^\d{1,10}$/.test(id.value||'')||!integer(Number(id.value),1,2147483647))throw 'quiz_id_missing';
  return Number(id.value);
 };
 const inspect=()=>{
  checkIsolation();
  const quizId=identity(),root=one('#quizLayerPop');
  if(!visible(root))throw 'open_quiz_first';
  const buttons=[...root.querySelectorAll('.btn_answer')].filter(visible);
  if(buttons.length!==1||!['BUTTON','A','INPUT'].includes(buttons[0].tagName))throw 'submit_missing';
  if(buttons[0].disabled||buttons[0].getAttribute('aria-disabled')==='true')throw 'submit_disabled';
  if(clean(buttons[0].innerText||buttons[0].textContent||buttons[0].value).replace(/\s/g,'')!=='정답도전')throw 'submit_label';
  const radios=[...root.querySelectorAll('input[type=radio]')];
  if(!radios.length||radios.length>200)throw 'questions_missing';
  if(root.querySelector('input[type=checkbox],textarea,input[type=text],input[type=number]'))throw 'unsupported_questions';
  const groups=new Map(),names=new Set(),labels=[...root.querySelectorAll('label')],allRadios=[...document.querySelectorAll('input[type=radio]')];
  domInspection={schemaVersion:1,radios:radios.length,duplicateIds:0,duplicateControls:0,insideDuplicates:0,outsideDuplicates:0,shadowed:0,labelMismatches:0,externalGroup:0};
  for(const radio of radios){
   if(!/^answer([1-9]\d?)-([1-9]\d?)$/.test(radio.id||''))continue;
   const matches=[...document.querySelectorAll('[id="'+radio.id+'"]')],controls=matches.filter(e=>e!==radio&&e.matches('input,button,select,textarea'));
   if(matches.length>1)domInspection.duplicateIds++;
   if(controls.length)domInspection.duplicateControls++;
   if(controls.some(e=>root.contains(e)))domInspection.insideDuplicates++;
   if(controls.some(e=>!root.contains(e)))domInspection.outsideDuplicates++;
   if(document.getElementById(radio.id)!==radio)domInspection.shadowed++;
   if(labels.some(e=>e.getAttribute('for')===radio.id&&visible(e)&&e.control!==radio))domInspection.labelMismatches++;
  }
  domInspection.externalGroup=Math.min(200,allRadios.filter(e=>!root.contains(e)&&radios.some(r=>r.name&&r.name===e.name)).length);
  const external=[...new Set(radios.filter(r=>/^answer([1-9]\d?)-([1-9]\d?)$/.test(r.id||'')).flatMap(r=>[...document.querySelectorAll('[id="'+r.id+'"]')].filter(e=>!root.contains(e)&&e.matches('input,button,select,textarea'))))];
  const count=predicate=>Math.min(200,external.filter(predicate).length);
  const corresponding=e=>radios.find(r=>r.id===e.id);
  Object.assign(domInspection,{
   externalVisible:count(visible),externalHidden:count(e=>!visible(e)),externalDisabled:count(e=>e.disabled===true),
   externalSameForm:count(e=>e.form!=null&&e.form===corresponding(e)?.form),
   externalDifferentForm:count(e=>e.form!=null&&corresponding(e)?.form!=null&&e.form!==corresponding(e).form),
   externalNoForm:count(e=>e.form==null||corresponding(e)?.form==null),
   externalChecked:count(e=>e.checked===true),activeChecked:radios.filter(e=>e.checked===true).length,
   canonicalChecked:radios.filter(e=>document.getElementById(e.id)?.checked===true).length,
   externalTypeMismatch:count(e=>!e.matches('input[type=radio]')),
   externalValueMismatch:count(e=>e.value!==corresponding(e)?.value),isolatedHidden:s?.isolation?.rows.length||0
  });
  if(s)s.domInspection=domInspection;
  const owner=external.length?hiddenOwner(external[0]):null;
  const mirrors=external.length===radios.length&&owner&&external.every(e=>{
   const active=corresponding(e);
   return e.matches('input[type=radio]')&&!visible(e)&&!e.disabled&&!e.checked&&e.form==null&&active.form==null&&e.name===active.name&&e.value===active.value&&hiddenOwner(e)===owner&&
    document.querySelectorAll('[id="'+e.id+'"]').length===2&&
    ![...document.querySelectorAll('label[for="'+e.id+'"]')].some(label=>!root.contains(label)&&visible(label));
  })?external:[];
  for(const radio of radios){
   const match=/^answer([1-9]\d?)-([1-9]\d?)$/.exec(radio.id||'');
   // Inputs may be visually hidden for styled radios; their own label must be visible.
   const ownLabels=labels.filter(e=>e.getAttribute('for')===radio.id),label=ownLabels.find(visible);
   if(!match)throw 'radio_id';
   if(!radio.name)throw 'radio_name';
   if(radio.disabled)throw 'radio_disabled';
   const matches=[...document.querySelectorAll('[id="'+radio.id+'"]')];
   if(matches.some(e=>e!==radio&&root.contains(e)&&e.matches('input,button,select,textarea')))throw 'radio_duplicate';
   if(matches.some(e=>e!==radio&&!root.contains(e)&&e.matches('input,button,select,textarea')&&!mirrors.includes(e)))throw 'radio_duplicate_external';
   // A verified hidden counterpart is tolerated only during inspection. Before
   // any answer click it is detached, so original ID/name readers and labels
   // must all resolve the active controls; no reader implementation is guessed.
   const bound=e=>e===radio||mirrors.includes(e)&&e.id===radio.id;
   if(!bound(document.getElementById(radio.id))||ownLabels.some(e=>visible(e)&&!bound(e.control)))throw 'radio_binding';
   if(!visible(radio)&&!visible(label))throw 'radio_hidden';
   const q=Number(match[1]),option=Number(match[2]);if(q>20||option>10)throw 'radio_range';
   let group=groups.get(q);if(!group){if(names.has(radio.name))throw 'radio_group';names.add(radio.name);groups.set(q,group={name:radio.name,options:new Map()});}
   if(group.name!==radio.name||group.options.has(option))throw 'radio_group';group.options.set(option,radio);
  }
  if(allRadios.some(r=>!root.contains(r)&&names.has(r.name)&&!mirrors.includes(r)))throw 'radio_group_external';
  for(let q=1;q<=groups.size;q++){const g=groups.get(q);if(!g||g.options.size<2)throw 'radio_sequence';for(let i=1;i<=g.options.size;i++)if(!g.options.has(i))throw 'radio_sequence';}
  const shape=JSON.stringify([quizId,[...groups].map(([q,g])=>[q,g.name,[...g.options].map(([i,r])=>[i,r.id,r.value])]),clean(root.innerText||root.textContent).slice(0,30000)]);
  return {quizId,root,button:buttons[0],groups,shape,mirrors};
 };
 const decode=data=>{
  const own=(o,k)=>!!o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k);
  const number=(v,min,max)=>{if(integer(v,min,max))return v;if(typeof v==='string'&&/^\d{1,7}$/.test(v.trim())){const n=Number(v.trim());if(integer(n,min,max))return n;}return null;};
  const kind=(v,present,min=0,max=100000)=>!present?'missing':v===null?'null':typeof v==='number'?(integer(v,min,max)?'integer':'number_invalid'):typeof v==='string'?(number(v,min,max)!==null?'digits':'string_other'):Array.isArray(v)?'array':typeof v==='object'?'object':typeof v==='boolean'?'boolean':'other';
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const inspection={schemaVersion:1,rootType:kind(data,true),selection:'none',candidateCount:0,serverRejected:false,containers:[]};
  const fail=reason=>({reason,inspection});
  if(!object(data))return fail('api_object');
  const queue=[{value:data,path:'root',depth:0}],candidates=[];
  for(let at=0;at<queue.length&&at<21;at++){
   const {value:o,path,depth}=queue[at],row={path,type:kind(o,true)};
   inspection.containers.push(row);if(!object(o))continue;
   row.apply=kind(o.applyCnt,own(o,'applyCnt'));row.attempt=kind(o.attemptCount,own(o,'attemptCount'));row.point=kind(o.point,own(o,'point'),1,1000000);row.questions=kind(o.questionList,own(o,'questionList'));
   if(own(o,'questionList')&&Array.isArray(o.questionList)){
    row.questions=o.questionList.length===0?'array_empty':o.questionList.length>20?'array_large':'array';
    if(o.questionList.length<=20)row.questionCount=o.questionList.length;
    const types=o.questionList.slice(0,20).map(q=>kind(q?.answerNum,own(q,'answerNum'),1,10));
    row.answers=!types.length?'none':types.every(t=>t==='integer')?'integer':types.every(t=>t==='digits')?'digits':types.every(t=>t==='integer'||t==='digits')?'mixed':types.every(t=>t==='missing')?'missing':'invalid';
   }
   const error=own(o,'error')&&o.error!==null&&o.error!==false&&o.error!==0&&o.error!==''&&(!Array.isArray(o.error)||o.error.length>0)&&(!object(o.error)||Object.keys(o.error).length>0);
   if(['success','ok'].some(k=>own(o,k)&&([false,0].includes(o[k])||typeof o[k]==='string'&&/^(?:false|0)$/i.test(o[k].trim())))||['status','code'].some(k=>own(o,k)&&typeof o[k]==='string'&&/^(?:error|fail(?:ed|ure)?|unauthorized|forbidden)$/i.test(o[k].trim()))||['status','code','statusCode','httpStatus'].some(k=>own(o,k)&&number(o[k],400,599)!==null)||error||own(o,'errors')&&Array.isArray(o.errors)&&o.errors.length>0)inspection.serverRejected=true;
   if(own(o,'applyCnt')||own(o,'attemptCount')||own(o,'questionList'))candidates.push({value:o,path});
   if(depth<2)for(const key of ['data','result','response','body'])if(own(o,key))queue.push({value:o[key],path:path==='root'?key:path+'.'+key,depth:depth+1});
  }
  inspection.candidateCount=candidates.length;
  if(inspection.serverRejected)return fail('api_server_rejected');
  if(!candidates.length)return fail('api_apply_count');
  if(candidates.length!==1){inspection.selection='ambiguous';return fail('api_payload_ambiguous');}
  const {value:o,path}=candidates[0];inspection.selection=path;
  const applyCnt=own(o,'applyCnt')?number(o.applyCnt,0,100000):null;if(applyCnt===null)return fail('api_apply_count');
  // A known participation already prevents submission, so missing optional
  // answer/counter fields in that completed response cannot authorize a retry.
  if(applyCnt>0)return {value:{applyCnt,attemptCount:own(o,'attemptCount')?number(o.attemptCount,0,100000):null},inspection};
  const attemptCount=own(o,'attemptCount')?number(o.attemptCount,0,100000):null;if(attemptCount===null)return fail('api_attempt_count');
  if(attemptCount>=2)return {value:{applyCnt,attemptCount},inspection};
  const point=own(o,'point')?number(o.point,1,1000000):null;if(point===null)return fail('api_point');
  if(!own(o,'questionList')||!Array.isArray(o.questionList)||!o.questionList.length||o.questionList.length>20)return fail('api_questions');
  const answers=o.questionList.map(q=>own(q,'answerNum')?number(q.answerNum,1,10):null);if(answers.some(n=>n===null))return fail('api_answer_num');
  return {value:{applyCnt,attemptCount,point,answers},inspection};
 };
 const readApi=async id=>{
  const endpoint='https://api.doctorville.co.kr/api/product-quiz/'+id;
  const abort=new AbortController();s.abort=abort;const timer=setTimeout(()=>abort.abort(),5000);
  try{
   const response=await fetch(endpoint,{method:'GET',credentials:'include',mode:'cors',cache:'no-store',redirect:'error',signal:abort.signal});
   if(!response.ok||response.redirected||response.url!==endpoint)throw response.status===401||response.status===403?'login_required':'api_unavailable';
   if(!/^\s*application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')||''))throw 'api_content_type';
   const raw=await response.text();if(raw.length>262144)throw 'api_body_limit';
   const decoded=decode(JSON.parse(raw));s.apiInspection=decoded.inspection;
   if(!decoded.value)throw decoded.reason;
   return decoded.value;
  }catch(error){throw typeof error==='string'?error:error?.name==='AbortError'?'api_timeout':error?.name==='SyntaxError'?'api_json':'api_connection';}
  finally{clearTimeout(timer);if(s?.abort===abort)s.abort=null;}
 };
 const stop=reason=>{if(current()){s.status='stopped';s.reason=typeof reason==='string'&&/^[a-z_]{1,40}$/.test(reason)?reason:'api_unavailable';s.answers=null;}};
 const openQuiz=async(full=true)=>{
  if(!visible(one('#quizLayerPop'))){
   const candidates=[...document.querySelectorAll('a,button,[role=button],input[type=button]')].filter(e=>{
    if(!visible(e)||e.disabled||e.getAttribute('aria-disabled')==='true'||e.closest('#quizLayerPop,header,nav,footer')||e.matches('.btn_answer'))return false;
    const target=e.getAttribute('aria-controls')||e.getAttribute('data-target')||e.getAttribute('href')||'';
    const label=clean(e.innerText||e.textContent||e.getAttribute('aria-label')||e.value).replace(/\s/g,'');
    return /^(?:#)?quizLayerPop$/.test(target)||/^(?:(?:오늘의?|제품)?)퀴즈(?:풀기|참여하기|참여|도전하기|도전|시작하기|풀고포인트적립)?$/.test(label);
   });
   if(candidates.length!==1)throw candidates.length?'quiz_open_ambiguous':'quiz_open_missing';
   s.reason='opening_quiz';candidates[0].click();
  }
  const until=Date.now()+5000;let last='open_quiz_first';
  while(current()){
   try{if(!visible(one('#quizLayerPop')))throw 'open_quiz_first';return full?inspect():{quizId:identity()};}catch(reason){last=reason;if(!['open_quiz_first','quiz_id_missing','submit_missing','questions_missing'].includes(reason)||Date.now()>=until)throw reason;}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw last;
 };
 if(input.mode==='prepare'){
  if(s?.sent&&!['success','wrong'].includes(s.status))return reply('stopped','unresolved_submission');
  if(s&&!s.sent){s.cancelled=true;s.abort?.abort();release(s);}if(s?.hide)window.removeEventListener?.('pagehide',s.hide);
  let page;try{if(input.openQuiz===true||input.inspectOnly===true){try{page={quizId:identity()};}catch(reason){if(reason!=='quiz_id_missing'||input.openQuiz!==true)throw reason;page={quizId:0};}}else page=inspect();if(modal())throw 'close_previous_notice';}catch(reason){return reply('stopped',typeof reason==='string'?reason:'options_unconfirmed');}
  s={nonce:input.nonce,url:url.href,quizId:page.quizId,shape:page.shape,date:input.openQuiz===true?input.date:null,status:'loading',reason:'reading_api',sent:false,cancelled:false};document[key]=s;
  // Fragment-only layer links preserve this exact document/nonce. A real
  // navigation (including a bfcache visit) cancels its asynchronous work.
  const operation=s;s.hide=()=>{operation.cancelled=true;operation.abort?.abort();operation.answers=null;release(operation);if(!['success','wrong'].includes(operation.status)){operation.status='unknown';operation.reason='document_changed';}};
  window.addEventListener?.('pagehide',s.hide,{once:true});
  (async()=>{try{
   // Some products create the hidden ID only when their original quiz control
   // opens the layer. This step still cannot select or submit an answer.
   if(!s.quizId){const opened=await openQuiz(false);if(!current())return;s.quizId=opened.quizId;}
   const data=await readApi(s.quizId);if(!current())return;
   if(data.applyCnt>0){stop('already_participated');return;}if(data.attemptCount>=2){stop('attempt_limit');return;}
   if(input.inspectOnly===true){if(visible(one('#quizLayerPop')))inspect();stop('api_read_only_ready');return;}
   const again=input.openQuiz===true?await openQuiz():inspect();if(!current())return;
   if(again.quizId!==s.quizId||s.shape&&again.shape!==s.shape)throw 'page_changed';
   s.shape=again.shape;s.mirrors=again.mirrors;
   if(data.answers.length!==again.groups.size||data.answers.some((n,i)=>!again.groups.get(i+1)?.options.has(n)))throw 'answer_mapping';
   Object.assign(s,{answers:data.answers,attemptCount:data.attemptCount,point:data.point,preparedAt:Date.now(),status:'ready',reason:'ready'});
  }catch(reason){stop(reason);}})();
 }else if(!s||s.nonce!==input.nonce||!current())return reply('stopped','stale_operation');
 else if(input.mode==='submit'){
  if(input.authorized!==true||s.status!=='ready'||s.sent||input.attemptCount!==s.attemptCount||Date.now()-s.preparedAt>5000)return reply('stopped','not_authorized');
  s.status='loading';s.reason='rechecking_api';
  (async()=>{try{
   const data=await readApi(s.quizId);if(!current())return;
   const page=inspect();if(page.quizId!==s.quizId||page.shape!==s.shape||page.mirrors.length!==s.mirrors.length||page.mirrors.some((node,i)=>node!==s.mirrors[i])||modal())throw 'page_changed';
   if(data.applyCnt!==0||data.attemptCount!==s.attemptCount||data.attemptCount>=2||JSON.stringify(data.answers)!==JSON.stringify(s.answers)||data.point!==s.point)throw 'api_changed';
   // Native has already committed an uncertain submission record. Mark before
   // any answer click, so exceptions/cancellation cannot cause an automatic replay.
   s.sent=true;s.status='loading';s.reason='submitted';
   isolate(page.mirrors);
   // Let site mutation observers run before selecting or clicking its button.
   if(page.mirrors.length)await new Promise(resolve=>setTimeout(resolve,0));
   if(!current())throw 'page_changed';
   const boundPage=inspect();if(boundPage.shape!==s.shape||boundPage.mirrors.length)throw 'page_changed';
   for(let i=0;i<s.answers.length;i++){const radio=boundPage.groups.get(i+1).options.get(s.answers[i]);radio.click();if(!radio.checked)throw 'selection_failed';}
   if(!current())throw 'page_changed';
   const finalPage=inspect();
   if(finalPage.shape!==s.shape||s.answers.some((n,i)=>!finalPage.groups.get(i+1).options.get(n).checked))throw 'page_changed';
   s.status='waiting';finalPage.button.click();s.answers=null;
  }catch(reason){if(s?.sent){s.status='unknown';s.reason=['selection_failed','page_changed'].includes(reason)?reason:'submission_uncertain';s.answers=null;release(s);}else stop(reason);}})();
 }else if(input.mode!=='read')return reply('stopped','invalid_request');
 if(s.status==='waiting'){
  const message=modal();
  if(message){
   const compact=message.replace(/[\s,]/g,'');
   const negative=/오답|정답이\s*아닙|틀렸|미지급|지급되지|받을\s*수\s*없/.test(message);
   if(!negative&&/정답입니다/.test(compact)&&new RegExp('(?:^|[^0-9])'+s.point+'(?:포인트|[pP])').test(compact)){s.status='success';s.reason='success_receipt';}
   else if(/오답|정답이\s*아닙|틀렸/.test(message)&&!/정답입니다/.test(compact)){s.status='wrong';s.reason='wrong_receipt';}
   else{s.status='unknown';s.reason='result_unconfirmed';}
   release(s);
  }
 }
 return reply(s.status,s.reason,{quizId:s.quizId,...(integer(s.attemptCount,0,1)?{attemptCount:s.attemptCount}:{}),...(s.answers?{questionCount:s.answers.length}:{}),...(s.apiInspection?{apiInspection:s.apiInspection}:{}),...(s.domInspection?{quizDomInspection:s.domInspection}:{})});
})