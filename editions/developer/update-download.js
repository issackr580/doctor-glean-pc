import {BrowserWindow,session} from 'electron';
import {mkdtempSync,readFileSync,lstatSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

export function githubUpdateNavigation(raw){
  try{const url=new URL(raw);return url.origin==='https://github.com'&&!url.username&&!url.password&&!url.port;}catch{return false;}
}
export function privateUpdateDownloadUrls(urls,target){
  if(!Array.isArray(urls)||!urls.length||urls.length>5||urls[0]!==target.patch.url)return false;
  return urls.every((raw,i)=>{
    try{const url=new URL(raw);return i===0?raw===target.patch.url:url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname);}catch{return false;}
  });
}
let active=false;
export function downloadPrivateUpdate(target,onProgress,{parent,profile=session.fromPartition('persist:doctor-glean-pc-developer-updates-v1'),timeout=600000}={}){
  if(active||target.edition!=='developer')return Promise.reject(Error('update_private'));active=true;
  return new Promise((resolve,reject)=>{
    const directory=mkdtempSync(join(tmpdir(),'doctor-glean-private-update-')),file=join(directory,'patch.zip');let window,item,finished=false,requested=false;
    const timer=setTimeout(()=>finish(Error('update_cancelled')),timeout);
    const cleanup=()=>{clearTimeout(timer);profile.removeListener('will-download',download);if(window&&!window.isDestroyed())window.destroy();try{rmSync(directory,{recursive:true,force:true});}catch{}active=false;};
    const finish=(error,bytes)=>{if(finished)return;finished=true;if(error)item?.cancel();cleanup();error?reject(error):resolve(bytes);};
    const download=(event,candidate,contents)=>{
      if(contents!==window?.webContents||item){event.preventDefault();return;}
      if(candidate.getFilename()!==target.patch.name||!privateUpdateDownloadUrls(candidate.getURLChain(),target)){event.preventDefault();finish(Error('update_private'));return;}
      item=candidate;
      if(item.getTotalBytes()!==target.patch.size){item.cancel();finish(Error('update_size'));return;}
      item.setSavePath(file);
      item.on('updated',()=>{
        if(item.getReceivedBytes()>target.patch.size||!privateUpdateDownloadUrls(item.getURLChain(),target)){item.cancel();finish(Error('update_size'));return;}
        onProgress(item.getReceivedBytes(),target.patch.size);
      });
      item.once('done',(_event,status)=>{
        try{
          if(status!=='completed'||!privateUpdateDownloadUrls(item.getURLChain(),target))throw Error('update_network');
          if(lstatSync(file).isSymbolicLink()||lstatSync(file).size!==target.patch.size)throw Error('update_size');finish(null,readFileSync(file));
        }catch(error){finish(error);}
      });
    };
    try{
      profile.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));profile.setPermissionCheckHandler(()=>false);profile.on('will-download',download);
      window=new BrowserWindow({width:980,height:760,show:true,parent,title:'PC 개발자용 업데이트 · GitHub 로그인',autoHideMenuBar:true,webPreferences:{session:profile,nodeIntegration:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,navigateOnDragDrop:false}});
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      window.webContents.on('will-navigate',(event,url)=>{if(!githubUpdateNavigation(url))event.preventDefault();});
      window.webContents.on('will-redirect',(event,url)=>{if(!githubUpdateNavigation(url))event.preventDefault();});
      window.webContents.on('will-attach-webview',event=>event.preventDefault());
      window.webContents.on('certificate-error',(event,_url,_error,_certificate,callback)=>{event.preventDefault();callback(false);finish(Error('update_network'));});
      window.webContents.on('render-process-gone',()=>finish(Error('update_network')));
      window.on('closed',()=>finish(Error('update_cancelled')));
      window.webContents.on('did-finish-load',async()=>{
        // Only the exact signed private release page can trigger its one fixed
        // download. Login/password/2FA contents are never read or scripted.
        if(!requested&&window.webContents.getURL()===target.page){
          requested=true;
          try{
            // Inspect only the fixed release page's title, never a login form.
            const missing=await window.webContents.executeJavaScript('/page not found|404/i.test(document.title)',false);
            if(missing){finish(Error('update_private'));return;}
            if(!finished&&!window.isDestroyed()&&window.webContents.getURL()===target.page)window.webContents.downloadURL(target.patch.url);
          }catch{finish(Error('update_network'));}
        }
      });
      window.loadURL('https://github.com/login?return_to='+encodeURIComponent(new URL(target.page).pathname)).catch(()=>finish(Error('update_network')));
    }catch(error){finish(error);}
  });
}
