(function keymediLoungePage(input) {
  const observerKey='__doctorGleanKeymediLoungeObservationV1';
  const own=(o,k)=>{try{const d=o&&Object.getOwnPropertyDescriptor(o,k);return d&&Object.prototype.hasOwnProperty.call(d,'value')?d.value:undefined;}catch{return undefined;}};
  const timestamp=v=>{
    if(typeof v!=='string')return '';
    const m=/^(20\d{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(v);if(!m)return '';
    const y=+m[1],month=+m[2],days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];return +m[3]<=days[month-1]?v:'';
  };
  const observation=()=>{
    const holder=own(document,observerKey),read=own(holder,'snapshot');if(own(holder,'schemaVersion')!==1||typeof read!=='function')return null;
    try{
      const raw=read(),status=own(raw,'status');if(!['not_seen','pending','observed','unsupported','invalid_response'].includes(status))return {schemaVersion:1,status:'unsupported'};
      const out={schemaVersion:1,status};for(const k of ['requestAt','responseAt']){const n=own(raw,k);if(Number.isInteger(n)&&n>0&&n<1e15)out[k]=n;}
      if(status==='observed')for(const k of ['providerUpdatedAt','providerPeriodAt']){const v=timestamp(own(raw,k));if(v)out[k]=v;}return out;
    }catch{return {schemaVersion:1,status:'unsupported'};}
  };
  if(input?.mode==='observe_start'){
    const onPage=()=>{try{return window.top===window&&location.href==='https://www.keymedi.com/drlounge';}catch{return false;}};
    if(!onPage())return {status:'blocked',reason:'outside_site'};
    if(observation())return {status:'observing',providerObservation:observation()};
    let state={schemaVersion:1,status:'not_seen'},sequence=0,installed=0;
    const doc=document,endpoint='https://api.keymedi.com/api/drlounge/getMainInfo',limit=262144;
    const at=()=>{try{const n=Date.now();return Number.isInteger(n)&&n>0&&n<1e15?n:undefined;}catch{return undefined;}};
    const current=id=>doc===document&&onPage()&&id===sequence;
    const begin=()=>{if(sequence>=8||doc!==document||!onPage())return 0;sequence++;state={schemaVersion:1,status:'pending'};const t=at();if(t!==undefined)state.requestAt=t;return sequence;};
    const finish=(id,status,responseAt,fields)=>{if(!current(id))return;state={schemaVersion:1,status,...(own(state,'requestAt')===undefined?{}:{requestAt:state.requestAt})};if(responseAt!==undefined)state.responseAt=responseAt;if(status==='observed')Object.assign(state,fields);};
    const parsed=(id,body,responseAt)=>{
      const data=own(body,'data'),mission=own(data,'mission');
      if(own(body,'code')!==0||!data||typeof data!=='object'||Array.isArray(data)||!mission||typeof mission!=='object'||Array.isArray(mission)){finish(id,'invalid_response',responseAt);return;}
      const updated=timestamp(own(mission,'updated_at')),rawPeriod=own(mission,'period_at'),period=timestamp(rawPeriod);
      if(!updated||rawPeriod!==undefined&&!period){finish(id,'invalid_response',responseAt);return;}
      finish(id,'observed',responseAt,{providerUpdatedAt:updated,...(period?{providerPeriodAt:period}:{})});
    };
    const url=v=>{if(typeof v!=='string')return false;try{return new URL(v).href===endpoint;}catch{return false;}};
    try{Object.defineProperty(doc,observerKey,{value:Object.freeze({schemaVersion:1,snapshot:()=>({...state})}),writable:false,configurable:false});}catch{return {status:'observing',providerObservation:{schemaVersion:1,status:'unsupported'}};}
    try{
    const fetchOriginal=own(window,'fetch'),responseProto=window.Response?.prototype;
    const clone=own(responseProto,'clone'),bodyGetter=Object.getOwnPropertyDescriptor(responseProto||{},'body')?.get,statusGetter=Object.getOwnPropertyDescriptor(responseProto||{},'status')?.get;
    const requestProto=window.Request?.prototype,requestUrl=Object.getOwnPropertyDescriptor(requestProto||{},'url')?.get,requestMethod=Object.getOwnPropertyDescriptor(requestProto||{},'method')?.get;
    const fetchMatch=args=>{
      let address=args[0],method='GET';
      if(typeof address!=='string'){if(!requestUrl||!requestMethod)return false;try{method=requestMethod.call(address);address=requestUrl.call(address);}catch{return false;}}
      if(args[1]!==undefined&&args[1]!==null){
        let owner=args[1],d;for(let depth=0;owner&&depth<8;depth++){d=Object.getOwnPropertyDescriptor(owner,'method');if(d)break;owner=Object.getPrototypeOf(owner);}
        if(!d&&owner)return false;
        if(d){if(!Object.prototype.hasOwnProperty.call(d,'value'))return false;if(d.value!==undefined){if(typeof d.value!=='string')return false;method=d.value;}}
      }
      return typeof method==='string'&&method.toUpperCase()==='POST'&&url(address);
    };
    const ignore=p=>{try{Promise.prototype.then.call(p,undefined,()=>{});}catch{}};
    const inspectResponse=async(id,response)=>{
      const responseAt=at();let reader,completed=false;
      try{
        if(!current(id))return;
        if(statusGetter.call(response)!==200){finish(id,'invalid_response',responseAt);return;}
        const copy=clone.call(response),stream=bodyGetter.call(copy);if(!stream||typeof stream.getReader!=='function'){finish(id,'unsupported',responseAt);return;}
        reader=stream.getReader();const chunks=[];let bytes=0;
        for(let reads=0;reads<512;reads++){
          const item=await reader.read();if(!current(id))return;
          if(item.done){completed=true;const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}try{parsed(id,JSON.parse(new TextDecoder().decode(all)),responseAt);}finally{all.fill(0);}return;}
          const chunk=item.value;if(!(chunk instanceof Uint8Array)||bytes+chunk.byteLength>limit){finish(id,'invalid_response',responseAt);return;}bytes+=chunk.byteLength;chunks.push(chunk);
        }
        finish(id,'invalid_response',responseAt);
      }catch{finish(id,'invalid_response',responseAt);}
      finally{if(reader){if(!completed)try{ignore(reader.cancel());}catch{}try{reader.releaseLock();}catch{}}}
    };
    if(typeof fetchOriginal==='function'&&typeof clone==='function'&&bodyGetter&&statusGetter){
      const wrapped=function(...args){const result=Reflect.apply(fetchOriginal,this,args);try{if(fetchMatch(args)){const id=begin();if(id)ignore(Promise.prototype.then.call(result,response=>{ignore(inspectResponse(id,response));},()=>finish(id,'invalid_response')));}}catch{}return result;};
      try{const descriptor=Object.getOwnPropertyDescriptor(window,'fetch');if(descriptor&&Object.prototype.hasOwnProperty.call(descriptor,'value')&&descriptor.writable){Object.defineProperty(window,'fetch',{...descriptor,value:wrapped});installed++;}}catch{}
    }
    const xhrProto=window.XMLHttpRequest?.prototype,open=own(xhrProto,'open'),send=own(xhrProto,'send');
    if(xhrProto&&typeof open==='function'&&typeof send==='function'){
      const add=xhrProto.addEventListener,remove=xhrProto.removeEventListener,requests=new WeakMap();
      const getters=Object.fromEntries(['responseType','responseText','response','status'].map(k=>[k,Object.getOwnPropertyDescriptor(xhrProto,k)?.get]));
      const bytesFit=s=>{if(typeof s!=='string'||s.length>limit)return false;let bytes=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);bytes+=c<128?1:c<2048?2:c>=0xD800&&c<=0xDBFF&&i+1<s.length&&s.charCodeAt(i+1)>=0xDC00&&s.charCodeAt(i+1)<=0xDFFF?(i++,4):3;if(bytes>limit)return false;}return true;};
      const openWrapped=function(...args){const result=Reflect.apply(open,this,args);try{requests.set(this,{match:typeof args[0]==='string'&&args[0].toUpperCase()==='POST'&&url(args[1]),sent:false});}catch{}return result;};
      const sendWrapped=function(...args){
        let id=0,listener;const request=requests.get(this);
        try{if(request?.match&&!request.sent&&typeof add==='function'){request.sent=true;id=begin();if(id){listener=()=>{
          if(requests.get(this)!==request||!current(id))return;const responseAt=at();
          try{if(getters.status?.call(this)!==200){finish(id,'invalid_response',responseAt);return;}const type=getters.responseType?.call(this);
            if(type===''||type==='text'){const text=getters.responseText?.call(this);if(bytesFit(text))parsed(id,JSON.parse(text),responseAt);else finish(id,'invalid_response',responseAt);}
            else if(type==='json')parsed(id,getters.response?.call(this),responseAt);else finish(id,'unsupported',responseAt);
          }catch{finish(id,'invalid_response',responseAt);}
        };Reflect.apply(add,this,['loadend',listener,{once:true}]);}}}catch{finish(id,'unsupported');}
        try{return Reflect.apply(send,this,args);}catch(error){if(listener)try{Reflect.apply(remove,this,['loadend',listener]);}catch{}finish(id,'invalid_response');throw error;}
      };
      try{const od=Object.getOwnPropertyDescriptor(xhrProto,'open'),sd=Object.getOwnPropertyDescriptor(xhrProto,'send');if(od?.writable&&sd?.writable&&typeof add==='function'){Object.defineProperty(xhrProto,'open',{...od,value:openWrapped});try{Object.defineProperty(xhrProto,'send',{...sd,value:sendWrapped});installed++;}catch{Object.defineProperty(xhrProto,'open',od);}}}catch{}
    }
    }catch{/* Incompatible hosts may still retain a successfully installed transport. */}
    if(!installed)state={schemaVersion:1,status:'unsupported'};
    return {status:'observing',providerObservation:observation()};
  }
  const result=(()=>{
  const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
  const visible=e=>{
    if(!e?.isConnected)return false;
    for(let p=e;p&&p.nodeType===1;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.opacity==='0')return false;}
    const r=e.getBoundingClientRect();return r.width>0&&r.height>0;
  };
  const mode=input?.mode;if(!['inspect','open','claim'].includes(mode))return {status:'blocked',reason:'invalid_request'};
  let url;try{url=new URL(location.href);}catch(e){return {status:'blocked',reason:'outside_site'};}
  if(url.origin!=='https://www.keymedi.com'||url.username||url.password)return {status:'blocked',reason:'outside_site'};
  if(url.pathname==='/login')return {status:'login',reason:'login_required'};
  if(url.href!=='https://www.keymedi.com/drlounge')return {status:'blocked',reason:'outside_site'};
  if([...document.querySelectorAll('input[type="password"]')].some(visible))return {status:'login',reason:'login_required'};
  if([...document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal,.modal-body,.modal-body-text,.modal-wrap')].some(visible))return {status:'blocked',reason:'manual_confirmation'};
  const headings=[...document.querySelectorAll('h3')].filter(e=>text(e)==='미션 보기'&&visible(e));
  const panels=[];
  for(const heading of headings){
    let p=heading.parentElement;
    for(let n=0;n<3&&p&&p!==document.body;n++,p=p.parentElement){
      if(p.querySelector('dl')){const r=p.getBoundingClientRect();if(visible(p)&&r.bottom>0&&r.top<(window.innerHeight||2000))panels.push(p);break;}
    }
  }
  if(panels.length!==1){
    if(panels.length>1)return {status:'blocked',reason:'ambiguous_panel'};
    if(mode==='open'){
      const links=[...document.querySelectorAll('a[href="#"]')].filter(e=>text(e)==='미션 보기'&&visible(e));
      if(links.length===1){
        // A slow panel must not re-run its original handler on every DOM poll.
        // Consume before clicking, even if the handler throws or navigates.
        const key='__doctorGleanKeymediLoungePanelV1';
        try{
          let descriptor=Object.getOwnPropertyDescriptor(document,key);
          if(!descriptor){
            const doc=document;let attempts=0,lastAt=0;
            const holder={};Object.defineProperties(holder,{schemaVersion:{value:1},tryOpen:{value:now=>{
              if(doc!==document||!Number.isInteger(now)||now<=0||attempts>=2||attempts>0&&(now<lastAt||now-lastAt<3000))return false;
              attempts++;lastAt=now;return true;
            }}});
            Object.defineProperty(doc,key,{value:Object.freeze(holder)});descriptor=Object.getOwnPropertyDescriptor(doc,key);
          }
          const holder=descriptor?.value,permit=own(holder,'tryOpen');
          if(!descriptor||descriptor.enumerable||descriptor.writable||descriptor.configurable||!holder||!Object.isFrozen(holder)||Object.getOwnPropertyNames(holder).length!==2||own(holder,'schemaVersion')!==1||typeof permit!=='function'||Object.getOwnPropertyNames(holder).some(name=>Object.getOwnPropertyDescriptor(holder,name)?.enumerable))return {status:'waiting',reason:'mission_unavailable'};
          if(!permit(Date.now()))return {status:'opening'};
        }catch{return {status:'waiting',reason:'mission_unavailable'};}
        links[0].click();return {status:'opening'};
      }
    }
    return {status:'waiting',reason:'mission_unavailable'};
  }
  const panel=panels[0],names=['개원·경영','마케팅','세무·법무','의료기기','금융','어벤져스 Pack','브랜드 스테이션'];
  const normalize=s=>s.replace(/\s+/g,'').replace(/[ㆍ・]/g,'·');
  const rows=[...panel.querySelectorAll('dl')];if(![6,7].includes(rows.length))return {status:'blocked',reason:'mission_changed'};
  const buttons=Array(7).fill(null);let found=0,eligibleMask=0,successMask=0;
  for(const row of rows){
    const title=row.querySelector('dt'),index=names.findIndex(name=>normalize(text(title))===normalize(name+' 체험하기'));
    if(index<0||(found&(1<<index)))return {status:'blocked',reason:'mission_changed'};found|=1<<index;
    const controls=[...row.querySelectorAll('dd button')].filter(visible);
    if(controls.length>1)return {status:'blocked',reason:'ambiguous_control'};
    if(controls.length===0){if(![...row.querySelectorAll('dd div')].some(e=>text(e)==='미달성'&&visible(e)))return {status:'waiting',reason:'mission_loading'};continue;}
    const button=controls[0],label=text(button);buttons[index]=button;
    if(label==='포인트 받기'&&!button.disabled&&button.getAttribute('aria-disabled')!=='true')eligibleMask|=1<<index;
    else if(label==='성공'&&button.disabled)successMask|=1<<index;
    else if(!['체험하기','처리중...','미달성','포인트 받기'].includes(label))return {status:'blocked',reason:'mission_changed'};
  }
  if(found!==(rows.length===7?127:95))return {status:'blocked',reason:'mission_changed'};
  const progress=[...panel.querySelectorAll('span,div')].filter(e=>visible(e)&&e.children.length===0&&new RegExp('^([0-'+rows.length+'])\\s*\\/\\s*'+rows.length+'$').test(text(e)));
  if(progress.length!==1)return {status:'waiting',reason:'progress_unavailable'};
  const current=Number(text(progress[0]).split('/')[0].trim());
  if(current===rows.length)successMask=found;
  if(successMask.toString(2).replace(/0/g,'').length>current)return {status:'blocked',reason:'progress_conflict'};
  const result={status:'ready',current,total:rows.length,missionMask:found,eligibleMask,successMask};
  if(mode!=='claim')return result;
  if(!Number.isInteger(input.mask)||input.mask<=0||input.mask>127||typeof input.lease!=='string'||!/^[a-zA-Z0-9:-]{1,120}$/.test(input.lease)||!Number.isFinite(input.opensAt)||!Number.isFinite(input.closesAt)||Date.now()<input.opensAt||Date.now()>=input.closesAt)return {status:'blocked',reason:'invalid_lease',sentMask:0};
  if(input.requireFreshDocument===true&&(!Number.isFinite(performance.timeOrigin)||performance.timeOrigin<input.opensAt))return {status:'blocked',reason:'stale_document',sentMask:0};
  // The native owner commits the per-day category mask before invoking this.
  // The document latch additionally rejects duplicate evaluate callbacks.
  let latch=document.__doctorGleanKeymediLoungeSent;
  if(!latch){latch={mask:0};Object.defineProperty(document,'__doctorGleanKeymediLoungeSent',{value:latch,configurable:false});}
  let sentMask=0;
  for(let i=0;i<7;i++){
    const bit=1<<i,button=buttons[i];
    if(!(input.mask&eligibleMask&bit)||(latch.mask&bit)||Date.now()>=input.closesAt)continue;
    // Revalidate immediately before each original click. Never dismiss dialogs
    // or click an experience/navigation button to manufacture eligibility.
    if(!button?.isConnected||!visible(button)||button.disabled||text(button)!=='포인트 받기')continue;
    latch.mask|=bit;sentMask|=bit;
    try{button.click();}catch(e){/* uncertain dispatch remains consumed */}
  }
  return {...result,sentMask};
  })();
  const providerObservation=observation();return providerObservation?{...result,providerObservation}:result;
})