(function credentialKeymediProof(input,domReply){
  const slot='__gleanKeymediCandidateProofV1';
  const api='https://api.keymedi.com/api/member/getMyInfo';
  const fallback=domReply&&typeof domReply==='object'?domReply:{status:'blocked',submitted:false};
  const own=(object,key)=>object!==null&&['object','function'].includes(typeof object)?Object.getOwnPropertyDescriptor(object,key)?.value:undefined;
  const secureUrl=raw=>{
    try{
      if(typeof raw!=='string'||raw.length>4096||/[\x00-\x20\x7f\\]/.test(raw))return null;
      const value=new URL(raw);
      return value.protocol==='https:'&&!value.username&&!value.password&&(!value.port||value.port==='443')?value:null;
    }catch{return null;}
  };
  const reply=(status,outcome,member=false)=>({status,submitted:false,evidence:{
    ...(fallback.evidence||{}),observed:true,providerMemberPresent:member,
    serverProbeOutcome:outcome,authEvidenceSource:member?'keymedi_server_member':'none'
  }});
  try{
    if(!input||typeof input!=='object'||input.site!=='keymedi'||typeof input.nonce!=='string'||!/^[A-Za-z0-9_-]{16,96}$/.test(input.nonce)||typeof input.pageTag!=='string'||!/^\d{1,10}:\d{1,10}$/.test(input.pageTag))return fallback;
    const expected=secureUrl(input.expectedUrl),current=secureUrl(location.href);
    if(window.top!==window.self||!expected||!current||expected.href!==current.href||expected.href!==input.expectedUrl||current.origin!=='https://www.keymedi.com')return fallback;
    let state=own(document,slot);
    if(input.mode==='cancel'){
      // Cancellation never inspects storage or changes another operation/page.
      if(state&&typeof own(state,'matchesOperation')==='function'&&state.matchesOperation(input.nonce,input.pageTag,current.href)&&typeof own(state,'cancel')==='function'){
        state.cancel('cancelled');delete document[slot];
      }
      return {status:'unknown',submitted:false};
    }
    if(state&&input.mode==='verify'&&input.validation===true&&typeof own(state,'matchesOperation')==='function'&&state.matchesOperation(input.nonce,input.pageTag,current.href)&&typeof own(state,'cancel')==='function'&&
      (input.validationSubmitted!==true||['login_required','manual','challenge','rejected','blocked','stale'].includes(fallback.status)||fallback.evidence&&(fallback.evidence.loginShown===true||fallback.evidence.passwordShown===true))){
      // A subsequent login/security contradiction invalidates this one read;
      // removing the form/challenge later cannot restore the old member proof.
      state.cancel('stale');
    }
    if(input.mode!=='verify'||input.validation!==true||input.validationSubmitted!==true||typeof input.serverProbeStart!=='boolean'||typeof input.serverProbeAvailable!=='boolean'||fallback.status!=='unknown'||fallback.submitted!==false||document.readyState!=='complete'||current.search||current.hash||!['/','/meditv/live'].includes(current.pathname))return fallback;
    // A same-document candidate must really have submitted. A full navigation
    // drops this marker; only the native operation's submitted assertion bridges it.
    const marker=own(document,'__webinarCredentialLoginV1');
    if(marker&&(own(marker,'validation')!==true||own(marker,'site')!=='keymedi'||own(marker,'nonce')!==input.nonce||own(marker,'submitted')!==true))return fallback;
    // Explicit current DOM booleans are required: unknown alone can also mean
    // conflicting login/logout controls. Native always requests these fixed
    // observations for Keymedi, even when persistent tracing is disabled.
    if(!fallback.evidence||fallback.evidence.observed!==true||fallback.evidence.loginShown!==false||fallback.evidence.passwordShown!==false)return fallback;
    const operationNonce=input.nonce,operationPage=input.pageTag,operationUrl=current.href;
    const live=()=>{
      const url=secureUrl(location.href);
      return window.top===window.self&&document.readyState==='complete'&&url&&url.href===operationUrl;
    };
    const tokenNow=()=>{
      try{
        const value=window.localStorage.getItem('access_token');
        return typeof value==='string'&&value.length>0&&value.length<=16384&&!/^(null|undefined|0)$/i.test(value)&&!/[\x00-\x20\x7f]/.test(value)?value:'';
      }catch{return null;}
    };
    if(state){
      if(typeof own(state,'matchesOperation')!=='function'||typeof own(state,'matchesToken')!=='function'||typeof own(state,'cancel')!=='function')return reply('unknown','unavailable');
      if(!state.matchesOperation(operationNonce,operationPage,operationUrl)){
        // Do not reuse another document/operation's evidence or network request.
        state.cancel('stale');delete document[slot];state=null;
      }else{
        const token=tokenNow();
        if(!live()||token===null||!state.matchesToken(token))state.cancel('stale');
        return reply(state.status,state.outcome,state.status==='authenticated'&&state.outcome==='verified');
      }
    }
    const token=tokenNow();
    if(token===null)return reply('unknown','unavailable');
    if(!token)return reply('unknown','missing_token');
    if(typeof window.fetch!=='function'||typeof AbortController!=='function')return reply('unknown','unavailable');
    if(input.serverProbeStart!==true)return reply('unknown',input.serverProbeAvailable?'ready':'request_used');
    // Native consumed its operation-wide lease before this start invocation.
    // Further pages/polls cannot request again, including after a token change.
    let credential=token,done=false,timer,probeStatus='loading',probeOutcome='pending';
    const abort=new AbortController();
    state={};
    const stateIsCurrent=()=>own(document,slot)===state&&live()&&state.matchesOperation(operationNonce,operationPage,operationUrl)&&state.matchesToken(tokenNow());
    const settle=(status,outcome)=>{
      if(done)return;done=true;clearTimeout(timer);
      probeStatus=status;probeOutcome=outcome;
    };
    Object.defineProperties(state,{
      // Read-only projections of closure-owned proof, never page-writable
      // authority. JSON serialization can see only these two fixed enums.
      status:{get:()=>probeStatus,enumerable:true},
      outcome:{get:()=>probeOutcome,enumerable:true},
      matchesOperation:{value:(nonce,page,url)=>nonce===operationNonce&&page===operationPage&&url===operationUrl},
      matchesToken:{value:value=>credential!==''&&value===credential},
      cancel:{value:outcome=>{
        // Invalidate even a completed proof before aborting an outstanding read.
        done=true;clearTimeout(timer);credential='';probeStatus='unknown';probeOutcome=outcome==='cancelled'?'cancelled':'stale';abort.abort();
      }}
    });
    Object.freeze(state);
    Object.defineProperty(document,slot,{value:state,configurable:true});
    timer=setTimeout(()=>{if(!done){settle('unknown','timeout');abort.abort();}},5000);
    Promise.resolve().then(()=>{
      if(done||!stateIsCurrent()){state.cancel('stale');return null;}
      return window.fetch(api,{method:'POST',body:'{}',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:abort.signal});
    }).then(async response=>{
      if(done||!response)return;
      if(!stateIsCurrent()){state.cancel('stale');return;}
      if(response.redirected!==false||response.url!==api){settle('unknown','invalid_response');return;}
      if(response.status===401){settle('unknown','unauthorized');return;}
      if(response.status===403){settle('unknown','forbidden');return;}
      if(response.ok!==true||response.status!==200||typeof response.text!=='function'){settle('unknown','invalid_response');return;}
      const raw=await response.text();
      if(done)return;
      if(!stateIsCurrent()){state.cancel('stale');return;}
      if(typeof raw!=='string'||raw.length>65536){settle('unknown','invalid_response');return;}
      let data;try{data=JSON.parse(raw);}catch{settle('unknown','invalid_response');return;}
      const envelope=own(data,'data'),info=own(envelope,'info');
      // The reviewed original client treats successful getMyInfo.info as the
      // member response. Its public source does not establish a mandatory ID
      // field/type, so do not invent one or accept a cached storage member.
      const member=own(data,'code')===0&&info!==null&&typeof info==='object'&&!Array.isArray(info)&&[Object.prototype,null].includes(Object.getPrototypeOf(info))&&Object.getOwnPropertyNames(info).length>0;
      data=null;
      settle(member?'authenticated':'unknown',member?'verified':'invalid_response');
    }).catch(()=>{if(!done)settle('unknown',stateIsCurrent()?'request_failed':'stale');});
    return reply('loading','pending');
  }catch{return reply('unknown','unavailable');}
})