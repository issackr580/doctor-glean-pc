// Real Chromium GitHub-login/download boundaries; synthetic HTTPS only.
import {app,dialog,session,net} from 'electron';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {PcUpdater} from '../src/update-manager.js';
import {fetchUpdateFeed,downloadUpdate} from '../src/update-download.js';
import {validatePatch} from '../src/update-package.js';
import {electronPatchDownload} from '../src/update-electron-download.js';
import {downloadPrivateUpdate,githubUpdateNavigation,privateUpdateDownloadUrls,registerPrivateUpdateInstaller} from '../editions/developer/update-download.js';
import {syntheticUpdate,signedSyntheticFeed} from '../test/update-fixtures.js';
const root=mkdtempSync(join(tmpdir(),'pc-update-electron-')),roots=[root],checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);};
app.setPath('userData',root);app.setPath('sessionData',join(root,'browser'));app.on('window-all-closed',()=>{});
const fixture=edition=>{const s=syntheticUpdate(undefined,{edition});roots.push(s.root);return s;};
const html=body=>new Response('<!doctype html><meta charset="utf-8">'+body,{headers:{'content-type':'text/html; charset=utf-8'}});
async function run(){
  await app.whenReady();let current,signed,headers=[],badRedirect=false,foreignRequests=0;
  await session.defaultSession.protocol.handle('https',request=>{
    headers.push(request.headers.get('cookie')??'');
    const url=new URL(request.url);
    if(url.hostname==='raw.githubusercontent.com')return new Response(signed.bytes);
    if(url.hostname==='foreign.invalid'){foreignRequests++;return new Response('forbidden');}
    if(request.url===current.target.patch.url)return new Response(null,{status:302,headers:{location:badRedirect?'https://foreign.invalid/':'https://release-assets.githubusercontent.com/synthetic-update'}});
    if(url.hostname==='release-assets.githubusercontent.com')return new Response(current.bytes,{headers:{'content-length':String(current.bytes.length)}});
    return new Response('',{status:404});
  });
  current=fixture('distribution');signed=signedSyntheticFeed(current.feed);let launches=0,quits=0,planFile;
  const updater=new PcUpdater({context:current.context,fetch:(...args)=>net.fetch(...args),publicDownload:electronPatchDownload,readFeed:(fetch,channel)=>fetchUpdateFeed(fetch,channel,{publicKey:signed.publicKey}),launchHelper:async(_script,file)=>{launches++;planFile=file;},quit:()=>quits++});
  check('install has no URL or filesystem authority before a verified check',(await updater.install()).reason==='update_installation'&&launches===0);
  check('signed feed is read by real Electron fetch',(await updater.check()).status==='available');
  validatePatch(await electronPatchDownload(current.target),current.target,current.context);
  await updater.install();
  check('public signed redirect download stages one complete app before a single restart request',launches===1&&quits===1&&updater.guarded===true&&readFileSync(planFile,'utf8').includes('prepared'));
  check('download and staging do not touch the live app or account/attempt data',readFileSync(join(current.context.appPath,'src/main.js'),'utf8')==='old application'&&readFileSync(join(current.data,'state-v1.json'),'utf8')==='synthetic reservation and attempt sentinel');
  check('public update requests contain no account cookies',headers.every(value=>value===''));
  badRedirect=true;let redirectRejected=false;try{await electronPatchDownload(current.target);}catch(error){redirectRejected=error.message==='update_redirect';}
  check('native Electron download rejects an unexpected redirect before contacting that host',redirectRejected&&foreignRequests===0);badRedirect=false;

  // Run the installed helper under the real Electron run-as-Node runtime.
  const nonce=JSON.parse(readFileSync(planFile,'utf8')).nonce,script=join(dirname(planFile),'helper.cjs');
  const child=spawn(process.execPath,[script,planFile],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc']});
  const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('helper IPC timeout')),10000);child.once('error',reject);child.once('message',value=>{clearTimeout(timer);resolve(value.ready===nonce);});});
  check('real Electron run-as-Node helper validates the fixed plan and acknowledges over private IPC',ready);
  check('helper does not replace the app while its parent is alive',readFileSync(join(current.context.appPath,'src/main.js'),'utf8')==='old application');child.kill();
  await new Promise(resolve=>child.once('exit',resolve));

  for(const mode of ['warm','valid','cancel','size','no_permission','google_redirect','google_navigation','google_popup']){
    const s=fixture('developer'),profile=session.fromPartition('update-synthetic-'+randomUUID());
    const googleMode=mode.startsWith('google_'),google='https://accounts.google.com/o/oauth2/v2/auth?state=SYNTHETIC_STATE';
    let pageReads=0,loginReads=0,downloadReads=0,foreignReads=0,googleReads=0,created,bridgeSafe=false,prompts=0;
    await profile.protocol.handle('https',request=>{
      const url=new URL(request.url);
      if(url.hostname==='foreign.invalid'){foreignReads++;return html('blocked');}
      if(url.origin==='https://accounts.google.com'){googleReads++;return html('Google OAuth');}
      if(url.pathname==='/google-sign-in')return Response.redirect(google);
      if(url.pathname==='/login'){
        loginReads++;
        if(googleMode){
          const action=mode==='google_redirect'?'location.href="/google-sign-in"':mode==='google_navigation'?`location.href=${JSON.stringify(google)}`:`window.open(${JSON.stringify(google)})`;
          return html(`<h1>Synthetic GitHub login</h1><script>setTimeout(()=>${action},250)</script>`);
        }
        return html(`<h1>Synthetic GitHub login</h1><script>setTimeout(()=>location.href='https://foreign.invalid/',80);setTimeout(()=>location.href=${JSON.stringify(s.target.page)},250)</script>`);
      }
      if(request.url===s.target.page){
        pageReads++;
        if((mode!=='warm'&&!loginReads)||mode==='no_permission')return new Response('<title>Page not found · GitHub</title>',{status:404,headers:{'content-type':'text/html'}});
        return html('<h1>Synthetic private Draft</h1>');
      }
      if(request.url===s.target.patch.url){downloadReads++;return new Response(s.bytes,{headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="'+s.target.patch.name+'"','content-length':String(s.bytes.length+(mode==='size'?1:0))}});}
      return new Response('',{status:404});
    });
    const capture=(_event,window)=>{created=window;window.webContents.on('did-finish-load',async()=>{
      if(window.isDestroyed())return;
      const onLoginPage=new URL(window.webContents.getURL()).pathname==='/login';
      const p=window.webContents.getLastWebPreferences();bridgeSafe=p.nodeIntegration===false&&p.contextIsolation===true&&p.sandbox===true&&p.webSecurity===true&&!p.preload&&await window.webContents.executeJavaScript('typeof require+":"+typeof window.doctorGlean')==='undefined:undefined';
      if(mode==='cancel'&&onLoginPage&&!window.isDestroyed())window.close();
    });};app.once('browser-window-created',capture);
    let error,bytes;try{bytes=await downloadPrivateUpdate(s.target,()=>{},{profile,timeout:googleMode?1800:5000,onLogin:()=>prompts++});}catch(e){error=e;}
    check('private GitHub '+mode+' window has no Node, control preload or management bridge',bridgeSafe);
    check('private GitHub '+mode+' does not navigate to an unreviewed external origin',foreignReads===0);
    if(googleMode){
      check('private GitHub '+mode+' closes the blocked login window and offers a browser handoff',error?.message==='update_google_browser'&&created.isDestroyed()&&prompts===1);
      check('private GitHub '+mode+' contacts neither Google nor a private asset in the embedded window',googleReads===0&&downloadReads===0);
    }else if(mode==='valid'){
      check('private login reaches only the signed Draft then automatically downloads its exact asset',pageReads===2&&loginReads===1&&prompts===1&&downloadReads===1&&bytes?.equals(s.bytes));
      check('private download closes only its dedicated window after completion',created.isDestroyed());
    }else if(mode==='warm'){
      check('an already signed-in session downloads the official asset without showing a login window',pageReads===1&&loginReads===0&&prompts===0&&downloadReads===1&&bytes?.equals(s.bytes));
    }else check('private GitHub '+mode+' leaves installation to the verifier or reports cancellation',mode==='cancel'?error?.message==='update_cancelled'&&downloadReads===0:mode==='no_permission'?error?.message==='update_private'&&downloadReads===0:!!error&&bytes===undefined);
    profile.protocol.unhandle('https');
  }
  check('GitHub update navigation rejects userinfo, http and foreign hosts',['http://github.com/','https://foreign.invalid/','https://user:pass@github.com/'].every(url=>!githubUpdateNavigation(url)));
  const s=fixture('developer');
  check('private downloads reject other assets and unrelated redirect chains',!privateUpdateDownloadUrls([s.target.patch.url+'?different'],s.target)&&!privateUpdateDownloadUrls([s.target.patch.url,'https://foreign.invalid/'],s.target));
  const local=join(s.root,s.target.patch.name);writeFileSync(local,s.bytes);
  let choose,dialogs=0,approved=true,localLaunches=0;
  const localUpdater=new PcUpdater({context:s.context,readFeed:async()=>s.feed,privateDownload:async()=>assert.fail('selected ZIP triggered a draft download'),
    launchHelper:async()=>localLaunches++});
  const originalChooser=dialog.showOpenDialog;
  try{
    dialog.showOpenDialog=async (_window,options)=>{
      dialogs++;
      assert.equal(options.defaultPath.endsWith(s.target.patch.name),true);
      return {canceled:false,filePaths:[local]};
    };
    registerPrivateUpdateInstaller({register:(channel,handler)=>{assert.equal(channel,'pc-dev:install-update-zip');choose=handler;},updater:localUpdater,owner:()=>undefined,allowed:()=>approved});
    approved=false;check('app data rules block the installer before opening the native chooser',(await choose()).reason==='data_blocked'&&dialogs===0);
    approved=true;check('the developer chooser uses only the native dialog result and the signed patch target',
      (await choose('untrusted renderer path')).status==='installing'&&dialogs===1&&localLaunches===1);
  }finally{dialog.showOpenDialog=originalChooser;}
  const report={checks:checks.length,names:checks,runtime:{electron:process.versions.electron,platform:process.platform},windowsExecuted:false,authenticatedGitHubVerified:false};
  writeFileSync(new URL('../verification/electron-update.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log('ELECTRON_UPDATE_PASS:'+checks.length);
}
run().then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);}).finally(()=>{for(const path of roots)try{rmSync(path,{recursive:true,force:true});}catch{}});
