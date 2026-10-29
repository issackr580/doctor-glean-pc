import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync,openSync,closeSync,readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const option=name=>args.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const suite=option('suite')??'all',known={catalog:'test-electron-catalog.mjs',automation:'test-electron-automation.mjs',credentials:'test-electron-credentials.mjs',entry:'test-electron-entry.mjs',replay:'test-electron-replay.mjs',registration:'test-electron-registration.mjs',update:'test-electron-update.mjs'};
if(suite!=='all'&&!Object.hasOwn(known,suite))throw Error('Use --suite=all|catalog|automation|credentials|entry|replay|registration|update');
const noSandbox=args.includes('--container-no-sandbox');if(noSandbox&&process.platform!=='linux')throw Error('The container test flag is Linux-only');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
if(option('application'))env.DOCTOR_GLEAN_PC_TEST_ROOT=resolve(option('application'));
if(option('data-root'))env.DOCTOR_GLEAN_PC_TEST_APP_DATA=resolve(option('data-root'));
const electron=createRequire(import.meta.url)('electron');mkdirSync(join(root,'verification'),{recursive:true});let display;
async function xvfb(){
 const binary=env.DOCTOR_GLEAN_XVFB_PATH??'Xvfb',log=openSync(join(root,'verification/xvfb.log'),'w');
 const child=spawn(binary,['-displayfd','1','-screen','0','1280x1800x24','-nolisten','tcp'],{stdio:['ignore','pipe',log]});closeSync(log);display=child;
 const number=await new Promise((done,fail)=>{
  let buffer='';const timer=setTimeout(()=>fail(Error('Xvfb startup timed out')),10000);
  child.once('error',()=>{clearTimeout(timer);fail(Error('Install Xvfb or set DOCTOR_GLEAN_XVFB_PATH'));});
  child.once('exit',code=>{clearTimeout(timer);fail(Error('Xvfb exited: '+code));});
  child.stdout.on('data',chunk=>{buffer+=chunk.toString();const value=buffer.split('\n')[0];if(/^\d+$/.test(value)&&buffer.includes('\n')){clearTimeout(timer);done(value);}});
 });env.DISPLAY=':'+number;
}
async function run(name){
 const script=known[name],flags=['--disable-gpu',...(noSandbox?['--no-sandbox']:[]),join(root,'scripts',script)];
 const logfile=join(root,'verification',script.replace('test-','').replace('.mjs','.log')),file=openSync(logfile,'w');
 const child=spawn(electron,flags,{cwd:root,env,stdio:['ignore',file,file],detached:process.platform!=='win32'});closeSync(file);
 const result=await new Promise((done,fail)=>{
  const timer=setTimeout(()=>{
   if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});
   else try{process.kill(-child.pid,'SIGKILL');}catch{}
   fail(Error(name+' timed out; inspect verification logs'));
  },180000);
  child.once('error',error=>{clearTimeout(timer);fail(error);});child.once('exit',code=>{clearTimeout(timer);done(code);});
 });if(result!==0)throw Error(name+' failed with exit '+result+'; inspect verification/'+script.replace('test-','').replace('.mjs','.log'));
 const marker=readFileSync(logfile,'utf8').match(new RegExp('^ELECTRON_'+name.toUpperCase()+'_PASS:([1-9][0-9]*)$','m'));
 if(!marker)throw Error(name+' exited without a completed verification result; inspect '+logfile);
 console.log('PASS Electron '+name+' '+marker[1]+' (synthetic HTTPS; no live accounts)');
}
try{
 if(process.platform==='linux'&&!env.DISPLAY)await xvfb();
 for(const name of suite==='all'?Object.keys(known):[suite])await run(name);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(display&&!display.killed)display.kill('SIGTERM');}
