import {SITES} from './sites.js';

export function siteById(id){
  return typeof id==='string'?SITES.find(site=>site.id===id)??null:null;
}

export function allowedNavigation(id,raw){
  const site=siteById(id);
  if(!site||typeof raw!=='string'||raw.length>8192)return false;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
    if(site.hosts.includes(url.hostname))return true;
    // Existing Doctorville account provider; only its reviewed callback entry.
    return !!site.login&&url.origin===site.login.origin&&url.pathname===site.login.path&&
      url.searchParams.getAll('cb').length===1&&url.searchParams.get('cb')===site.login.callback;
  }catch{return false;}
}

export function remotePreferences(id,edition='developer'){
  if(!siteById(id))throw Error('unknown_site');
  if(!['developer','distribution'].includes(edition))throw Error('invalid_edition');
  return {
    partition:`persist:doctor-glean-pc-${edition}-v1-${id}`,
    nodeIntegration:false,nodeIntegrationInSubFrames:false,contextIsolation:true,
    sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,
    navigateOnDragDrop:false,
  };
}

// Some login controls open a blank named window, then post the login form to it.
// Only an already reviewed parent may create it; its later navigation is guarded.
export function allowedPopup(id,url,parentUrl){
 return allowedNavigation(id,url)||url==='about:blank'&&allowedNavigation(id,parentUrl);
}

export function trustedControl(event,window,controlUrl){
  if(!window||window.isDestroyed()||!event?.senderFrame)return false;
  return event.sender===window.webContents&&
    event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===controlUrl;
}
