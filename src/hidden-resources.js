import {resourceCount,trackPage} from './resource-use.js';
const profiles=new WeakMap();
const measured=new WeakSet();
export function blockHiddenMedia(request,role){
 if(role!=='hidden_read'||request.method!=='GET'||['mainFrame','subFrame','image','stylesheet','script','font'].includes(request.resourceType))return false;
 let url;try{url=new URL(request.url);}catch{return false;}
 if(!['https:','http:'].includes(url.protocol)||/\/(?:api|captcha)(?:\/|$)/i.test(url.pathname))return false;
 return request.resourceType==='media'||/\.(?:mp4|webm|m4v|mov|mp3|m4a|aac|ogg|oga|wav|flac|m4s|m3u8|mpd)$/i.test(url.pathname);
}
export function hiddenResources(contents){
 const profile=contents.session,id=contents.id;let owners=profiles.get(profile);
 if(!owners){owners=new Map();profiles.set(profile,owners);profile.webRequest.onBeforeRequest((request,done)=>{
  const owner=owners.get(request.webContentsId),cancel=!!owner&&blockHiddenMedia(request,owner.role);if(cancel)resourceCount('mediaGetBlocked');done({cancel});
 });}
 if(owners.has(contents.id))return owners.get(contents.id).controller;
 const owner={role:'hidden_read'};owners.set(contents.id,owner);trackPage(contents,'hidden');
 const close=()=>owners.delete(id);contents.once('destroyed',close);
 owner.controller={entry:()=>{owner.role='entry';},close};return owner.controller;
}
export function observeResourceBytes(contents){
 if(measured.has(contents))return;measured.add(contents);
 const debug=contents.debugger;
 // Uses existing debugger transport, without reading request headers or data.
 const receive=(_event,method,params)=>{if(method==='Network.requestWillBeSent')resourceCount('browserRequests');else if(method==='Network.dataReceived'&&Number.isSafeInteger(params.encodedDataLength)&&params.encodedDataLength>=0)resourceCount('browserEncodedBytes',params.encodedDataLength);};
 debug.on('message',receive);debug.sendCommand('Network.enable',{maxPostDataSize:0}).catch(()=>{});contents.once('destroyed',()=>debug.removeListener('message',receive));
}
