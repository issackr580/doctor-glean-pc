import {resourceCount,trackPage,onUsageChange} from './resource-use.js';
const profiles=new WeakMap();
const measured=new WeakSet();
export function blockHiddenMedia(request,role){
 if(role!=='hidden_read'||request.method!=='GET'||['mainFrame','subFrame','image','stylesheet','script','font'].includes(request.resourceType))return false;
 let url;try{url=new URL(request.url);}catch{return false;}
 if(!['https:','http:'].includes(url.protocol)||/\/(?:api|captcha)(?:\/|$)/i.test(url.pathname))return false;
 return request.resourceType==='media'||/\.(?:mp4|webm|m4v|mov|mp3|m4a|aac|ogg|oga|wav|flac|m4s|m3u8|mpd)$/i.test(url.pathname);
}
const sessionRules=new WeakMap();
const external=url=>/^(?:https?|wss?|ftp):/i.test(url);
export function guardSession(profile,policy){
 if(policy)sessionRules.set(profile,policy);
 let owners=profiles.get(profile);
 if(!owners){owners=new Map();profiles.set(profile,owners);profile.webRequest.onBeforeRequest((request,done)=>{
  const rule=sessionRules.get(profile);if(external(request.url)&&rule&&!rule.allowed(request))return done({cancel:true});
  const owner=owners.get(request.webContentsId);
  if(owner?.entryFrameAllowed&&external(request.url)&&['mainFrame','subFrame'].includes(request.resourceType)&&!owner.entryFrameAllowed(request.url))return done({cancel:true});
  if(owner?.redirects?.block(request)||owner?.traffic&&!owner.traffic.allowed())return done({cancel:true});
  const survey=owner?.survey;
  if(survey){
   if(!survey.current()||!['GET','HEAD'].includes(request.method)||request.resourceType==='subFrame')return done({cancel:true});
   if(request.resourceType==='mainFrame'){
    if(request.method!=='GET'||!survey.document(request.url)||survey.starts>=2)return done({cancel:true});
    survey.starts++;
   }
  }
  const cancel=!!owner&&blockHiddenMedia(request,owner.role);if(cancel)resourceCount('mediaGetBlocked');done({cancel});
 });
 profile.webRequest.onBeforeRedirect(details=>owners.get(details.webContentsId)?.redirects?.redirect(details));
 const finished=details=>owners.get(details.webContentsId)?.redirects?.finish(details.id);
 profile.webRequest.onCompleted(finished);profile.webRequest.onErrorOccurred(finished);
 profile.webRequest.onHeadersReceived((details,done)=>{
  const policy=owners.get(details.webContentsId)?.traffic;
  if(!policy){try{sessionRules.get(profile)?.response?.(details);done({});}catch{done({cancel:true});}return;}
  try{sessionRules.get(profile)?.response?.(details,true);policy.response(details);done({cancel:!policy.allowed()});}catch{done({cancel:true});}
 });
 }
 return owners;
}
export function hiddenResources(contents,traffic,redirects,survey){
 const id=contents.id,owners=guardSession(contents.session);
 if(owners.has(contents.id))return owners.get(contents.id).controller;
 const owner={role:'hidden_read',traffic,redirects,survey:survey?{...survey,starts:0}:undefined};owners.set(contents.id,owner);trackPage(contents,'hidden',survey?.phase);
 const close=()=>owners.delete(id);contents.once('destroyed',close);
 owner.controller={entry:allowFrame=>{owner.role='entry';owner.entryFrameAllowed=allowFrame;},close};return owner.controller;
}
export function observeResourceBytes(contents,phase){
 if(measured.has(contents))return;measured.add(contents);
 const debug=contents.debugger;
 // Uses existing debugger transport, without reading request headers or data.
 const receive=(_event,method,params)=>{
  if(method==='Network.requestWillBeSent')resourceCount('browserRequests',1,phase);
  else if(method==='Network.dataReceived'&&Number.isSafeInteger(params.encodedDataLength)&&params.encodedDataLength>=0){
   resourceCount('browserEncodedBytes',params.encodedDataLength,phase);
   if(phase)resourceCount('byteSamples',1,phase);
  }
 };
 let listening=false;
 const unsubscribe=onUsageChange(enabled=>{
  if(enabled===listening)return;listening=enabled;
  if(enabled){debug.on('message',receive);debug.sendCommand('Network.enable',{maxPostDataSize:0}).catch(()=>{});}
  else debug.removeListener('message',receive);
 });
 contents.once('destroyed',()=>{unsubscribe();debug.removeListener('message',receive);});
}
