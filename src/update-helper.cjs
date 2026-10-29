'use strict';
// Copied out of resources/app before quitting. No shell, downloaded helper,
// arbitrary command, account access, or dependency on the replaced app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const safe=value=>typeof value==='string'&&value.length<400&&!/[\\:\x00-\x1f\x7f]/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
function plain(file){const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||fs.realpathSync(file)!==path.resolve(file))throw Error('update_path');return stat;}
function inventory(root,prefix=''){
  if(!plain(root).isDirectory())throw Error('update_path');const result={};
  for(const item of fs.readdirSync(root,{withFileTypes:true})){
    const name=prefix+item.name,file=path.join(root,item.name);if(!safe(name))throw Error('update_path');const stat=plain(file);
    if(stat.isDirectory())Object.assign(result,inventory(file,name+'/'));else if(stat.isFile())result[name]=hash(fs.readFileSync(file));else throw Error('update_path');
  }return result;
}
const equal=(a,b)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
function readPlan(file){
  if(!plain(file).isFile()||fs.statSync(file).size>131072)throw Error('update_plan');const p=JSON.parse(fs.readFileSync(file,'utf8'));
  const executable=p.edition==='developer'?'DoctorGlean-Developer.exe':p.edition==='distribution'?'DoctorGlean.exe':'';
  if(p.schemaVersion!==1||!executable||!/^[a-f0-9]{32}$/.test(p.nonce)||!Number.isSafeInteger(p.parentPid)||p.parentPid<1||typeof p.root!=='string'||path.resolve(p.root)!==p.root||path.dirname(file)!==path.join(p.root,'resources','.doctor-glean-update-'+p.nonce)||path.basename(file)!=='plan.json'||p.executable!==executable||!p.appFiles||!p.oldAppFiles||!p.runtimeFingerprints)throw Error('update_plan');
  plain(p.root);plain(path.join(p.root,'resources'));plain(path.dirname(file));
  for(const map of [p.appFiles,p.oldAppFiles,p.runtimeFingerprints])if(!Object.keys(map).length||Object.keys(map).length>400||Object.entries(map).some(([name,digest])=>!safe(name)||!/^[a-f0-9]{64}$/.test(digest)))throw Error('update_plan');
  if(!p.runtimeFingerprints[executable])throw Error('update_plan');return p;
}
function savePlan(file,plan){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(plan)+'\n',{mode:0o600});fs.renameSync(temp,file);}
function verifyRuntime(p){
  for(const [name,digest] of Object.entries(p.runtimeFingerprints)){
    if(name.startsWith('resources/app'))throw Error('update_plan');let file=p.root;
    for(const part of name.split('/')){file=path.join(file,part);plain(file);}
    if(!plain(file).isFile()||hash(fs.readFileSync(file))!==digest)throw Error('update_runtime');
  }
}
function processEnvironment(source=process.env){
  const names=new Set(['SYSTEMROOT','WINDIR','PATH','PATHEXT','COMSPEC','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','HOMEDRIVE','HOMEPATH','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMDATA','USERNAME','USERDOMAIN','LANG','LC_ALL','DISPLAY','XAUTHORITY','XDG_RUNTIME_DIR']);
  return Object.fromEntries(Object.entries(source).filter(([key])=>names.has(key.toUpperCase())));
}
async function move(from,to){
  const until=Date.now()+5000;for(;;){try{fs.renameSync(from,to);return;}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||Date.now()>=until)throw error;await pause(100);}}
}
async function parentExited(pid){
  const until=Date.now()+30000;while(Date.now()<until){try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')return true;throw error;}await pause(100);}return false;
}
function launch(p){const child=spawn(path.join(p.root,p.executable),[],{cwd:p.root,env:processEnvironment(),stdio:'ignore',windowsHide:false});child.on('error',()=>{});return child;}
async function runUpdate(file,{waitParent=parentExited,start=launch,bootTimeout=45000}={}){
  const p=readPlan(file),directory=path.dirname(file),current=path.join(p.root,'resources','app'),staged=path.join(directory,'app'),backup=path.join(directory,'previous-app');let swapped=false,oldMoved=false,child;
  if(p.phase!=='prepared')throw Error('update_plan');
  verifyRuntime(p);if(!equal(inventory(current),p.oldAppFiles)||!equal(inventory(staged),p.appFiles))throw Error('update_hash');
  p.helperPid=process.pid;savePlan(file,p);process.send?.({ready:p.nonce});if(process.connected)process.disconnect();
  if(!await waitParent(p.parentPid)){p.phase='cancelled';savePlan(file,p);return {status:'cancelled'};}
  try{
    verifyRuntime(p);if(!equal(inventory(current),p.oldAppFiles)||!equal(inventory(staged),p.appFiles))throw Error('update_hash');
    await move(current,backup);oldMoved=true;p.phase='old_moved';savePlan(file,p);
    await move(staged,current);swapped=true;p.phase='booting';savePlan(file,p);
    child=start(p);p.childPid=child.pid;savePlan(file,p);
    const until=Date.now()+bootTimeout;
    while(Date.now()<until){
      try{
        const live=readPlan(file);if(live.phase==='committed')return {status:'committed'};
        const health=JSON.parse(fs.readFileSync(path.join(directory,'healthy.json'),'utf8'));
        let alive=false;try{if(Number.isSafeInteger(health.pid)&&health.pid>0){process.kill(health.pid,0);alive=true;}}catch{}
        if(health.nonce===p.nonce&&health.version===p.toVersion&&health.edition===p.edition&&alive){
          if(!equal(inventory(current),p.appFiles))throw Error('update_hash');
          p.phase='committed';savePlan(file,p);child.unref?.();return {status:'committed'};
        }
      }catch(error){if(!['ENOENT'].includes(error.code)&&error.message==='update_hash')throw error;}
      if(child.exitCode!==null&&child.exitCode!==undefined&&child.exitCode!==0||child.signalCode)throw Error('update_boot');await pause(100);
    }throw Error('update_boot');
  }catch(error){
    if(child&&child.exitCode===null){
      if(process.platform==='win32')spawnSync(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000});
      else child.kill();
      await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000).unref?.();});
    }
    if(swapped)await move(current,path.join(directory,'failed-app'));
    if(oldMoved)await move(backup,current);
    p.phase=oldMoved?'rolled_back':'failed';p.reason=error.message==='update_runtime'?'runtime':'install';savePlan(file,p);
    const restored=start({...p,toVersion:p.fromVersion});restored.unref?.();return {status:p.phase};
  }
}
module.exports={runUpdate,readPlan,savePlan,inventory,processEnvironment};
if(require.main===module)runUpdate(path.resolve(process.argv[2]??'')).catch(()=>{process.exitCode=1;});
