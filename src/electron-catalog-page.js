import {BrowserWindow} from 'electron';
import {CatalogPage} from './catalog-page.js';
import {allowedNavigation} from './security.js';
import {loadFailure} from './login-status.js';
import {waitFor,boundedWork} from './async-work.js';

const bounded=(promise,signal,ms)=>boundedWork(promise,signal,ms,(code,error)=>Object.assign(Error(),{
 code:code==='network_error'&&error?.code==='cancelled'?'cancelled':code,
 ...(code==='network_error'?{failure:loadFailure(error?.errno)}:{}),
}));

export function electronCatalogPage(profile,signal,preferences){
 const window=new BrowserWindow({show:false,width:1100,height:1800,autoHideMenuBar:true,webPreferences:{...preferences,backgroundThrottling:false}});
 const contents=window.webContents;let version=0,lastFailure='';
 contents.on('did-fail-load',(_event,code,_description,_url,main)=>{if(main!==false&&code!==-3)lastFailure=loadFailure(code);});
 contents.on('did-start-navigation',(event,_url,isInPlace,isMainFrame)=>{if((isMainFrame??event.isMainFrame)&&!(isInPlace??event.isInPlace))version++;});
 const navigation=(event,url)=>{if(!allowedNavigation(profile.id,typeof url==='string'?url:event.url))event.preventDefault();};
 contents.on('will-navigate',navigation);
 contents.on('will-redirect',(event,url,_inPlace,isMainFrame)=>{if((typeof isMainFrame==='boolean'?isMainFrame:event.isMainFrame)!==false)navigation(event,url);});
 contents.setWindowOpenHandler(()=>({action:'deny'}));
 contents.on('will-attach-webview',event=>event.preventDefault());
 const close=()=>{if(!window.isDestroyed())window.destroy();signal.removeEventListener('abort',close);};
 signal.addEventListener('abort',close,{once:true});
 return new CatalogPage(profile,{
  snapshot:()=>({url:contents.isDestroyed()?'':contents.getURL(),version,loading:!contents.isDestroyed()&&contents.isLoadingMainFrame(),failure:lastFailure}),
  load:async url=>{
   if(!allowedNavigation(profile.id,url))throw Object.assign(Error(),{code:'navigation_changed'});
   lastFailure='';
   // A site's client redirect may abort the initial navigation. Wait for its
   // destination instead of reporting ERR_ABORTED as a connection failure.
   const load=window.loadURL(url).catch(async error=>{
    if(error.errno!==-3||signal.aborted)throw error;
    const until=Date.now()+15000;let stableAt=Date.now(),lastVersion=version;
    while(!signal.aborted&&!contents.isDestroyed()&&Date.now()<until){
     if(lastFailure)throw error;
     if(version!==lastVersion){lastVersion=version;stableAt=Date.now();}
     if(!contents.isLoadingMainFrame()&&allowedNavigation(profile.id,contents.getURL())&&Date.now()-stableAt>=400)return;
     await waitFor(80,signal);
    }
    throw error;
   });
   await bounded(load,signal,45_000);
  },
  evaluate:script=>bounded(contents.executeJavaScript(script,false),signal,10_000),
  close,
 },signal);
}
