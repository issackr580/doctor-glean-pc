import {atomicJson,readJson} from './atomic-json.js';
import {boundedWork,waitFor} from './async-work.js';

export const MEDIGATE_COUNTER_ORIGIN='https://apis.medigate.net';
export const MEDIGATE_COUNTER_PATH='/w/event/webinar-start-count';
const november='https://www.medigate.net/event/20261103092020307';

export function medigateCountUrl(raw){
 try{
  if(typeof raw!=='string'||raw.length>120||!/^https:\/\/(?:www\.)?medigate\.net\/event\/\d{17}$/.test(raw))return '';
  return new URL(raw).href;
 }catch{return '';}
}
export const initialMedigatePage=month=>month==='2026-11'?november:'';

const validMonth=month=>typeof month==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month);
export class MedigateCountPages{
 constructor(file){
  this.file=file;
  try{this.rows=readJson(file,{},value=>value&&typeof value==='object'&&!Array.isArray(value)&&
   Object.keys(value).length<=12&&Object.entries(value).every(([month,url])=>validMonth(month)&&medigateCountUrl(url)),8192);}
  catch{this.rows={};}
 }
 get(month){return this.rows[month]??'';}
 set(month,raw){
  const url=medigateCountUrl(raw);
  if(!validMonth(month)||raw!==''&&!url)throw Error('invalid_setting');
  const next={...this.rows};if(url)next[month]=url;else delete next[month];
  for(const key of Object.keys(next).sort().slice(0,-12))delete next[key];
  atomicJson(this.file,next);this.rows=next;
 }
}

function officialMedigateLinks(month){
 const [year,num]=month.split('-'),date=new RegExp(year+'\\s*(?:년|[.\\/-])\\s*0?'+Number(num)+'(?:\\s*월|(?=\\D|$))');
 return [...document.querySelectorAll('a[href]')].filter(anchor=>{
  if(!anchor.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;
  const text=[anchor.innerText,anchor.getAttribute('aria-label'),anchor.getAttribute('title'),...Array.from(anchor.querySelectorAll('img[alt]'),image=>image.alt)].join(' ');
  return date.test(text)&&/웨비나|webinar/i.test(text)&&/월간|참여|수강/.test(text);
 }).map(anchor=>anchor.href).slice(0,30);
}

export async function discoverMedigatePage(page,month,signal){
 const url=page.url,version=page.version,contents=page.current?.webContents;
 if(!contents||!/^https:\/\/(?:www\.|new\.|m\.)?medigate\.net\//.test(url))return '';
 const links=await boundedWork(contents.executeJavaScriptInIsolatedWorld(1003,[{code:'('+officialMedigateLinks+')('+JSON.stringify(month)+')'}]),signal,1200);
 if(page.url!==url||page.version!==version||!Array.isArray(links))return '';
 const exact=[...new Set(links.map(medigateCountUrl).filter(Boolean))];
 return exact.length===1?exact[0]:'';
}

function monthlyPanel(month){
 if(window!==window.top||document.readyState!=='complete'||document.querySelector('input[type="password"],iframe[src*="captcha"],[aria-modal="true"]'))return null;
 const visible=e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 const text=e=>e.innerText.replace(/\s+/g,' ').trim();
 const leaves=re=>[...document.querySelectorAll('h1,h2,h3,h4,p,div,span,strong,b')].filter(e=>visible(e)&&re.test(text(e))&&![...e.children].some(c=>visible(c)&&re.test(text(c))));
 const counts=leaves(/^(?:0|[1-9]\d{0,4})\s*회$/);
 const months=leaves(/^20\d{2}년\s*(?:[1-9]|1[0-2])월\s*(?:\(\s*월간\s*집계\s*\))?$/);
 const matches=new Map();
 for(const count of counts){
  let container=count.parentElement;
  for(let i=0;container&&container!==document.body&&i<8;i++,container=container.parentElement){
   const label=text(container);
   if(!/나의\s*웨비나\s*참여\s*현황/.test(label)||!/월간\s*집계/.test(label))continue;
   const localMonths=months.filter(e=>container.contains(e));
   if(localMonths.length!==1||counts.filter(e=>container.contains(e)).length!==1)break;
   const [,year,num]=text(localMonths[0]).match(/^(20\d{2})년\s*(\d{1,2})월/);
   matches.set(count,{month:year+'-'+num.padStart(2,'0'),count:Number(text(count).match(/^\d+/)[0])});break;
  }
 }
 if(matches.size!==1)return null;
 const result=matches.values().next().value;
 return result.month===month?result.count:null;
}

function reportedCount(payload){
 const counts=new Set(),fields=['count','cnt','total','totalCount','total_count','total_cnt','startCount','start_count','webinarCount','webinar_count','webinarCnt','webinarStartCount','webinarStartCnt','viewCount','view_cnt'];
 const take=value=>{if(Number.isInteger(value)&&value>=0&&value<=99999)counts.add(value);};
 const scan=(value,depth,scalar)=>{
  if(depth>3||counts.size>1)return;
  if(scalar)take(value);
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){if(value.length===1)scan(value[0],depth+1,scalar);return;}
  for(const field of fields)take(value[field]);
  for(const name of ['data','resultData','result'])scan(value[name],depth+1,name!=='result');
 };
 if(payload?.success===false)return null;
 scan(payload,0,true);
 return counts.size===1?counts.values().next().value:null;
}

// Only observe the event page's own fresh GET. Never replay its authentication
// or return its URL query, request headers, or response body to the caller.
export async function readMedigateCounter(page,url,month,signal,allowed,limitMs=6000){
 if(!medigateCountUrl(url)||!validMonth(month)||!allowed()||limitMs<=0)return null;
 const contents=page.current.webContents,debug=contents.debugger,until=Date.now()+limitMs;
 const live=()=>!signal.aborted&&!contents.isDestroyed()&&allowed()&&Date.now()<until;
 const command=(method,params)=>boundedWork(debug.sendCommand(method,params),signal,Math.max(1,until-Date.now()));
 const requests=new Map();let observed=null,frame='',documentEpoch=0,committed=false,conflict=false;
 const onMessage=(_event,method,p)=>{
  if(!live())return;
  if(method==='Page.frameNavigated'&&!p.frame.parentId){frame=p.frame.id;documentEpoch++;committed=p.frame.url===url;observed=null;requests.clear();conflict=false;}
  if(method==='Network.requestWillBeSent'){
   const target=p.request.url.split('?')[0];
   if(p.redirectResponse)requests.delete(p.requestId);
   if(!p.redirectResponse&&committed&&p.frameId===frame&&p.documentURL===url&&target===MEDIGATE_COUNTER_ORIGIN+MEDIGATE_COUNTER_PATH&&p.request.method==='GET'){
    if(requests.size>=4){conflict=true;return;}
    requests.set(p.requestId,{url:p.request.url,accepted:false,documentEpoch});
   }
  }
  if(method==='Network.requestServedFromCache')requests.delete(p.requestId);
  const request=requests.get(p.requestId);if(!request)return;
  if(method==='Network.responseReceived'){
   const r=p.response;
   request.accepted=r.status===200&&r.url===request.url&&!r.fromDiskCache&&!r.fromServiceWorker&&!r.fromPrefetchCache&&/^(?:application\/json|text\/json)$/.test(r.mimeType);
   if(!request.accepted)requests.delete(p.requestId);
  }
  if(method==='Network.loadingFailed')requests.delete(p.requestId);
  if(method==='Network.loadingFinished'&&request.accepted){
   requests.delete(p.requestId);
   if(p.encodedDataLength>32768)return;
   void command('Network.getResponseBody',{requestId:p.requestId}).then(reply=>{
    if(!live()||page.url!==url||request.documentEpoch!==documentEpoch||reply.base64Encoded||typeof reply.body!=='string'||Buffer.byteLength(reply.body)>32768)return;
    try{const count=reportedCount(JSON.parse(reply.body));if(count!==null){if(observed!==null&&observed!==count)conflict=true;observed=count;}}catch{}
   }).catch(()=>{});
  }
 };
 debug.on('message',onMessage);
 try{
  if(!page.url)await boundedWork(contents.loadURL('about:blank'),signal,Math.max(1,until-Date.now()));
  await command('Page.enable');await command('Network.enable',{maxPostDataSize:0});await command('Network.setCacheDisabled',{cacheDisabled:true});
  if(!live())return null;
  await boundedWork(page.load(url),signal,Math.max(1,until-Date.now()));
  const version=page.version;
  while(live()&&page.url===url&&page.version===version&&!conflict){
   if(observed!==null){
    const value=await boundedWork(contents.executeJavaScriptInIsolatedWorld(1003,[{code:'('+monthlyPanel+')('+JSON.stringify(month)+')'}]),signal,Math.max(1,until-Date.now()));
    if(live()&&page.url===url&&page.version===version&&!conflict&&value===observed)return value;
   }
   await waitFor(Math.min(180,Math.max(1,until-Date.now())),signal);
  }
 }finally{debug.removeListener('message',onMessage);}
 return null;
}
