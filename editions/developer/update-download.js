import {app,BrowserWindow,dialog,session} from 'electron';
import {mkdtempSync,readFileSync,lstatSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

export function registerPrivateUpdateInstaller({register,updater,owner,allowed}){
  register('pc-dev:install-update-zip',()=>{
    if(!allowed())return {ok:false,reason:'data_blocked'};
    return updater.installSelectedPatch(async target=>{
      const choice=await dialog.showOpenDialog(owner(),{title:'PC 개발자용 업데이트 패치 선택',
        defaultPath:join(app.getPath('downloads'),target.patch.name),properties:['openFile'],filters:[{name:'업데이트 패치 ZIP',extensions:['zip']}]});
      if(choice.canceled)return;
      if(!allowed())throw Error('data_blocked');
      return choice.filePaths[0];
    });
  });
}

export function githubUpdateNavigation(raw){
  try{const url=new URL(raw);return url.origin==='https://github.com'&&!url.username&&!url.password&&!url.port;}catch{return false;}
}
function googleAccountNavigation(raw){
  try{const url=new URL(raw);return url.origin==='https://accounts.google.com'&&!url.username&&!url.password&&!url.port;}catch{return false;}
}
export function privateUpdateDownloadUrls(urls,target){
  if(!Array.isArray(urls)||!urls.length||urls.length>5||urls[0]!==target.patch.url)return false;
  return urls.every((raw,i)=>{
    try{const url=new URL(raw);return i===0?raw===target.patch.url:url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname);}catch{return false;}
  });
}
let active=false;
export function downloadPrivateUpdate(target,onProgress,{parent,profile=session.fromPartition('persist:doctor-glean-pc-developer-updates-v1'),timeout=600000,onLogin=()=>{},signal}={}){
  if(active||target.edition!=='developer')return Promise.reject(Error('update_private'));
  if(signal?.aborted)return Promise.reject(Error('data_blocked'));
  let directory;
  try{directory=mkdtempSync(join(tmpdir(),'doctor-glean-private-update-'));}catch{return Promise.reject(Error('update_permission'));}
  active=true;
  return new Promise((resolve,reject)=>{
    const file=join(directory,'patch.zip'),loginUrl='https://github.com/login?return_to='+encodeURIComponent(new URL(target.page).pathname);
    let window,item,finished=false,requested=false,prompted=false,returnedHome=false,checking=false;
    const timer=setTimeout(()=>finish(Error('update_cancelled')),timeout);
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);profile.removeListener('will-download',download);if(window&&!window.isDestroyed())window.destroy();try{rmSync(directory,{recursive:true,force:true});}catch{}active=false;};
    const finish=(error,bytes)=>{if(finished)return;finished=true;if(error)item?.cancel();cleanup();error?reject(error):resolve(bytes);};
    const abort=()=>finish(Error('data_blocked'));
    const googleHandoff=url=>{
      if(prompted&&!requested&&googleAccountNavigation(url))queueMicrotask(()=>finish(Error('update_google_browser')));
    };
    const guardNavigation=(event,url,isMainFrame)=>{
      if(githubUpdateNavigation(url))return;
      event.preventDefault();
      if(isMainFrame)googleHandoff(url);
    };
    const navigate=url=>window.loadURL(url).catch(error=>{if(!finished&&error?.errno!==-3&&error?.code!=='ERR_ABORTED')finish(Error('update_network'));});
    const prompt=()=>{
      if(prompted||finished){finish(Error('update_private'));return;}
      prompted=true;onLogin();window.show();
      if(new URL(window.webContents.getURL()).pathname!=='/login')void navigate(loginUrl);
    };
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
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}
      profile.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));profile.setPermissionCheckHandler(()=>false);profile.on('will-download',download);
      window=new BrowserWindow({width:980,height:760,show:false,parent,title:'PC 개발자용 업데이트 · GitHub 로그인',autoHideMenuBar:true,webPreferences:{session:profile,nodeIntegration:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,navigateOnDragDrop:false}});
      window.webContents.setWindowOpenHandler(({url})=>{googleHandoff(url);return {action:'deny'};});
      window.webContents.on('will-navigate',(event,url)=>guardNavigation(event,url,true));
      window.webContents.on('will-redirect',(event,url,_isInPlace,isMainFrame)=>guardNavigation(event,url,isMainFrame!==false));
      window.webContents.on('will-attach-webview',event=>event.preventDefault());
      window.webContents.on('certificate-error',(event,_url,_error,_certificate,callback)=>{event.preventDefault();callback(false);finish(Error('update_network'));});
      window.webContents.on('render-process-gone',()=>finish(Error('update_network')));
      window.on('closed',()=>finish(Error('update_cancelled')));
      window.webContents.on('did-finish-load',async()=>{
        if(finished||requested||checking)return;
        const contents=window.webContents,url=contents.getURL();
        if(url!==target.page){
          if(!prompted)prompt();
          else if(url==='https://github.com/'&&!returnedHome){returnedHome=true;void navigate(target.page);}
          return;
        }
        checking=true;
        try{
          // GitHub can return a generic 404 page for an unsigned-in session.
          // A live login page is never inspected or scripted.
          const missing=await contents.executeJavaScript(`location.href===${JSON.stringify(url)}&&/page not found|404/i.test(document.title)`,false);
          if(finished||window.isDestroyed()||contents.getURL()!==url)return;
          if(missing){prompt();return;}
          requested=true;
          window.hide();
          contents.downloadURL(target.patch.url);
        }catch{if(!finished&&contents.getURL()===url)finish(Error('update_network'));}
        finally{checking=false;}
      });
      void navigate(target.page);
    }catch(error){finish(error);}
  });
}
