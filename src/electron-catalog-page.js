import {hiddenResources,observeResourceBytes} from './hidden-resources.js';
import {loginNoticeStatus} from './entry-dialog.js';
import {CatalogRedirects} from './catalog-redirects.js';
import {BrowserWindow} from 'electron';
import {CatalogPage} from './catalog-page.js';
import {allowedNavigation,siteById} from './security.js';
import {loadFailure} from './login-status.js';
import {waitFor,boundedWork} from './async-work.js';

const bounded=(promise,signal,ms)=>boundedWork(promise,signal,ms,(code,error)=>Object.assign(Error(),{
 code:code==='network_error'&&error?.code==='cancelled'?'cancelled':code,
 ...(code==='network_error'?{failure:loadFailure(error?.errno)}:{}),
}));

export function electronCatalogPage(profile,signal,preferences,traffic){
 const window=new BrowserWindow({show:false,width:1100,height:1800,autoHideMenuBar:true,webPreferences:{...preferences,backgroundThrottling:false,disableDialogs:true}});
 const contents=window.webContents;const redirects=new CatalogRedirects(url=>allowedNavigation(profile.id,url));
 const checkRedirect=()=>{if(redirects.stopped)throw Object.assign(Error('redirect_limit'),{code:'redirect_limit'});};
 const resources=hiddenResources(contents,traffic,redirects);
 window.once('closed',resources.close);
 let version=0,lastFailure='',topFrame='',notice=null;
 const debug=contents.debugger;
 debug.on('message',(_event,method,params)=>{
  if(method==='Page.frameNavigated'&&!params.frame.parentId)topFrame=params.frame.id;
  if(method!=='Page.javascriptDialogOpening')return;
  if(!signal.aborted&&(!traffic||traffic.allowed())&&['alert','confirm'].includes(params.type)&&params.frameId===topFrame&&params.url===contents.getURL()&&allowedNavigation(profile.id,params.url)){
   const status=loginNoticeStatus(params.message);
   if(status&&!(notice?.version===version&&notice.status==='blocked'))notice={version,status,url:params.url};
  }
  void debug.sendCommand('Page.handleJavaScriptDialog',{accept:false}).catch(()=>{});
 });
 // Enable observation before provider scripts can run. disableDialogs also
 // protects the user if a renderer or debugger stops delivering events.
 try{debug.attach('1.3');observeResourceBytes(contents);}catch{}
 const observing=debug.isAttached()?window.loadURL('about:blank').then(()=>debug.sendCommand('Page.enable')).catch(()=>{}):Promise.resolve();
 contents.on('did-fail-load',(_event,code,_description,_url,main)=>{if(main!==false&&code!==-3)lastFailure=loadFailure(code);});
 contents.on('did-start-navigation',(event,_url,isInPlace,isMainFrame)=>{if((isMainFrame??event.isMainFrame)&&!(isInPlace??event.isInPlace)){version++;lastFailure='';}});
 const navigation=(event,url)=>{if(!allowedNavigation(profile.id,typeof url==='string'?url:event.url))event.preventDefault();};
 contents.on('will-navigate',navigation);
 contents.on('will-redirect',(event,url,_inPlace,isMainFrame)=>{if((typeof isMainFrame==='boolean'?isMainFrame:event.isMainFrame)!==false)navigation(event,url);});
 let loginPopupVersion=-1;
 contents.setWindowOpenHandler(({url,referrer})=>{
  const site=siteById(profile.id);
  let sameOrigin=!referrer?.url;
  if(referrer?.url)try{sameOrigin=new URL(referrer.url).origin===new URL(contents.getURL()).origin;}catch{}
  if(['doctorville','intermd'].includes(profile.id)&&sameOrigin&&allowedNavigation(profile.id,contents.getURL())&&url===site.loginUrl)loginPopupVersion=version;
  return {action:'deny'};
 });
 contents.on('will-attach-webview',event=>event.preventDefault());
 const close=()=>{if(!window.isDestroyed())window.destroy();signal.removeEventListener('abort',close);};
 signal.addEventListener('abort',close,{once:true});
 return new CatalogPage(profile,{
  snapshot:()=>{checkRedirect();return {notice:!contents.isDestroyed()&&notice?.version===version&&notice.url===contents.getURL()?notice.status:undefined,loginPopup:loginPopupVersion===version,url:contents.isDestroyed()?'':contents.getURL(),version,loading:!contents.isDestroyed()&&contents.isLoadingMainFrame(),failure:lastFailure,crashed:contents.isDestroyed()||contents.isCrashed()};},
  load:async url=>{
   await bounded(observing,signal,5000);
   if(traffic&&!traffic.allowed())throw Error('site_wait');
   if(!allowedNavigation(profile.id,url))throw Object.assign(Error(),{code:'navigation_changed'});
   lastFailure='';
   // A site's client redirect may abort the initial navigation. Wait for its
   // destination instead of reporting ERR_ABORTED as a connection failure.
   const load=window.loadURL(url).catch(async error=>{
    checkRedirect();if(error.errno!==-3||signal.aborted)throw error;
    const until=Date.now()+15000;let stableAt=Date.now(),lastVersion=version;
    while(!signal.aborted&&!contents.isDestroyed()&&Date.now()<until){
     if(lastFailure)throw error;
     if(version!==lastVersion){lastVersion=version;stableAt=Date.now();}
     if(!contents.isLoadingMainFrame()&&allowedNavigation(profile.id,contents.getURL())&&Date.now()-stableAt>=400)return;
     await waitFor(80,signal);
    }
    throw error;
   });
   try{await bounded(load,signal,45_000);}finally{checkRedirect();}
  },
  evaluate:script=>{if(traffic&&!traffic.allowed())throw Error('site_wait');return bounded(contents.executeJavaScript(script,false),signal,10_000);},
  close,
 },signal);
}
