import {readFileSync,writeFileSync,lstatSync,realpathSync,mkdirSync,copyFileSync,existsSync,renameSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fetchUpdateFeed,downloadUpdate} from './update-download.js';
import {chooseSignedUpdate} from './update-trust.js';
import {validatePatch,validateInstallation,writeStagedApp,updateInventory} from './update-package.js';
import helper from './update-helper.cjs';

const failure=error=>['update_signature','update_hash','update_runtime','update_installation','update_path','update_package','update_size','update_private','update_cancelled','update_busy','update_boot','update_permission'].includes(error?.message)?error.message:'update_network';
export function pendingUpdate(appPath,version,edition){
  const resources=dirname(resolve(appPath)),pointer=join(resources,'.doctor-glean-update.json');
  try{
    if(lstatSync(pointer).isSymbolicLink()||realpathSync(pointer)!==pointer)return null;
    const reference=JSON.parse(readFileSync(pointer,'utf8'));
    if(reference.schemaVersion!==1||!/^[a-f0-9]{32}$/.test(reference.nonce))return null;
    const file=join(resources,'.doctor-glean-update-'+reference.nonce,'plan.json'),plan=helper.readPlan(file);
    if(plan.edition!==edition||resolve(appPath)!==join(plan.root,'resources','app'))return null;
    return {file,plan,pending:plan.phase==='booting'&&plan.toVersion===version};
  }catch{return null;}
}
export class PcUpdater{
  constructor({context,fetch,privateDownload,onChange=()=>{},isBusy=()=>false,quit=()=>{},launchHelper,now=Date.now,readFeed=fetchUpdateFeed,publicDownload}){
    Object.assign(this,{context,fetch,privateDownload,onChange,isBusy,quit,launchHelper,now,readFeed,publicDownload});this.state={status:'idle'};this.target=null;this.ready=null;this.operation=null;this.installing=false;
    this.boot=pendingUpdate(context.appPath,context.currentVersion,context.edition);this.bootPending=this.boot?.pending===true;
    const plan=this.boot?.plan;let helperAlive=false;try{if(Number.isSafeInteger(plan?.helperPid)&&plan.helperPid>0){process.kill(plan.helperPid,0);helperAlive=true;}}catch{}
    this.waitForHelper=helperAlive&&Number.isSafeInteger(plan.createdAt)&&now()-plan.createdAt>=0&&now()-plan.createdAt<120000&&plan.parentPid!==process.pid&&plan.fromVersion===context.currentVersion&&['prepared','old_moved','booting'].includes(plan.phase);
    this.installing=this.waitForHelper;
    if(this.bootPending)this.state={status:'starting',version:context.currentVersion};
    else if(this.waitForHelper)this.state={status:'installing'};
    else if(this.boot?.plan.phase==='rolled_back')this.state={status:'rolled_back'};
  }
  get guarded(){return this.installing||this.bootPending;}
  snapshot(){return {...this.state};}
  set(value){this.state=value;this.onChange();return this.snapshot();}
  supported(){const c=this.context;return c.platform==='win32'&&c.arch==='x64'&&resolve(c.appPath)===join(dirname(c.executable),'resources','app')&&dirname(c.executable)===resolve(dirname(c.executable));}
  check(){
    if(this.operation)return this.operation;
    this.operation=this.#check().finally(()=>{this.operation=null;});return this.operation;
  }
  async #check(){
    if(this.guarded)return this.snapshot();this.target=null;this.ready=null;
    if(!this.supported())return this.set({status:'unsupported'});
    this.set({status:'checking'});
    try{
      const payload=await this.readFeed(this.fetch,this.context.channel),result=chooseSignedUpdate(payload,this.context);
      this.target=result.target??null;const {target,...publicResult}=result;return this.set(publicResult);
    }catch(error){return this.set({status:'failed',reason:failure(error)});}
  }
  install(){
    if(this.operation)return this.operation;
    this.operation=this.#install().finally(()=>{this.operation=null;});return this.operation;
  }
  async #install(){
    if(this.guarded)return this.snapshot();
    if(!this.supported()||!this.target)return this.set({status:'failed',reason:'update_installation'});
    const target=this.target;
    try{
      if(!this.ready){
        this.set({status:target.edition==='developer'?'github_login':'downloading',version:target.version,received:0,total:target.patch.size});
        const progress=(received,total)=>this.set({status:'downloading',version:target.version,received,total});
        const bytes=target.edition==='developer'?await this.privateDownload(target,progress):await (this.publicDownload??((row,report)=>downloadUpdate(this.fetch,row,report)))(target,progress);
        this.set({status:'verifying',version:target.version});
        this.ready=validatePatch(bytes,target,this.context);
      }
      if(this.isBusy())return this.set({status:'ready_busy',version:target.version});
      // The guard closes the race with scheduler ticks before spawning a helper.
      this.installing=true;this.set({status:'installing',version:target.version});
      const c=this.context,{manifest,payload}=this.ready,root=validateInstallation(dirname(c.executable),c,manifest),nonce=randomBytes(16).toString('hex'),directory=join(root,'resources','.doctor-glean-update-'+nonce);
      try{mkdirSync(directory,{recursive:false,mode:0o700});}catch{throw Error('update_permission');}
      writeStagedApp(join(directory,'app'),payload);
      const plan={schemaVersion:1,nonce,root,executable:manifest.requiredExecutable,edition:c.edition,fromVersion:c.currentVersion,toVersion:target.version,parentPid:process.pid,createdAt:this.now(),phase:'prepared',appFiles:Object.fromEntries(Object.entries(manifest.appFiles).map(([path,digest])=>[path.slice('resources/app/'.length),digest])),oldAppFiles:updateInventory(c.appPath),runtimeFingerprints:manifest.runtimeFingerprints};
      const file=join(directory,'plan.json');writeFileSync(file,JSON.stringify(plan)+'\n',{flag:'wx',mode:0o600});
      const helperFile=join(directory,'helper.cjs');copyFileSync(new URL('./update-helper.cjs',import.meta.url),helperFile);
      const pointer=join(root,'resources','.doctor-glean-update.json'),temp=pointer+'.tmp';
      if(existsSync(pointer)&&lstatSync(pointer).isSymbolicLink()||existsSync(temp)&&lstatSync(temp).isSymbolicLink())throw Error('update_path');
      writeFileSync(temp,JSON.stringify({schemaVersion:1,nonce})+'\n',{mode:0o600});renameSync(temp,pointer);
      await (this.launchHelper??this.#launch.bind(this))(helperFile,file,nonce);
      this.quit();return this.snapshot();
    }catch(error){this.installing=false;return this.set({status:'failed',reason:failure(error),version:target.version});}
  }
  #launch(script,file,nonce){
    return new Promise((resolveReady,reject)=>{
      const env={...helper.processEnvironment(),ELECTRON_RUN_AS_NODE:'1'},child=spawn(this.context.executable,[script,file],{cwd:dirname(this.context.executable),env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});let done=false;
      const timer=setTimeout(()=>finish(Error('update_boot')),15000);
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);child.removeAllListeners('message');if(error){child.kill();reject(error);}else{if(child.connected)child.disconnect();child.unref();resolveReady();}};
      child.on('message',value=>{if(value?.ready===nonce)finish();});child.once('error',()=>finish(Error('update_boot')));child.once('exit',()=>{if(!done)finish(Error('update_boot'));});
    });
  }
  acknowledgeBoot(){
    if(!this.bootAcknowledgement)this.bootAcknowledgement=this.#acknowledgeBoot();return this.bootAcknowledgement;
  }
  async #acknowledgeBoot(){
    if(!this.bootPending)return;
    const {file,plan}=this.boot,directory=dirname(file);
    try{
      const live=helper.readPlan(file);if(live.phase!=='booting'||live.nonce!==plan.nonce)throw Error('update_boot');
      writeFileSync(join(directory,'healthy.json'),JSON.stringify({nonce:plan.nonce,version:this.context.currentVersion,edition:this.context.edition,pid:process.pid})+'\n',{mode:0o600});
      const until=this.now()+60000;
      while(this.now()<until){const current=helper.readPlan(file);if(current.phase==='committed'){this.bootPending=false;this.set({status:'updated',version:this.context.currentVersion});return;}await new Promise(resolve=>setTimeout(resolve,100));}
      // A healthy UI can finish a lost helper's commit, after hashing the app.
      const current=helper.readPlan(file),actual=updateInventory(this.context.appPath);
      if(current.phase!=='booting'||JSON.stringify(Object.entries(actual).sort())!==JSON.stringify(Object.entries(current.appFiles).sort()))throw Error('update_boot');
      current.phase='committed';helper.savePlan(file,current);this.bootPending=false;this.set({status:'updated',version:this.context.currentVersion});
    }catch{this.set({status:'failed',reason:'update_boot'});}
  }
}
