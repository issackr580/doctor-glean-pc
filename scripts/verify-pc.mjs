import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,renameSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {release} from 'node:os';
import {verificationInputs,verificationComplete,digest} from './verification-contract.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'verification'),stamp=new Date().toISOString().replaceAll(/[:.]/g,'-');
const directory=join(out,'runs',stamp);mkdirSync(directory,{recursive:true});
const electronBinary=createRequire(import.meta.url)('electron');
const environment=()=>({platform:process.platform,arch:process.arch,osRelease:release(),node:process.versions.node,nodeBinarySha256:digest(readFileSync(process.execPath)),electron:JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8')).packages['node_modules/electron'].version,electronBinarySha256:digest(readFileSync(electronBinary)),containerNoSandbox:process.argv.includes('--container-no-sandbox')});
const env=environment(),before=verificationInputs(root,env),report={schemaVersion:1,scope:'pc_source_synthetic',startedAt:Date.now(),before,environment:env,stages:[],windowsExecuted:false,authenticatedProvidersVerified:false};
writeFileSync(join(out,'pc-verification.json'),JSON.stringify({...report,complete:false,releaseReady:false},null,2)+'\n');
function run(name,script,marker){
 const result=spawnSync(process.execPath,script,{cwd:root,encoding:'utf8',timeout:1000000,maxBuffer:16*1024*1024});
 const log=(result.stdout??'')+(result.stderr??'');writeFileSync(join(directory,name+'.log'),log);
 const matches=[...log.matchAll(marker)],checks=name==='syntax'?matches.length:matches.reduce((n,m)=>n+Number(m[1]),0),passed=result.status===0&&checks>0;
 report.stages.push({name,status:passed?'passed':'failed',checks,exitCode:result.status,logSha256:digest(log)});
 if(!passed)throw Error(name+' failed; see '+directory);
 console.log('PASS '+name+' '+checks);return log;
}
try{
 const node=run('node',['--test','--test-reporter=tap',...readdirSync(join(root,'test')).filter(n=>n.endsWith('.test.js')).sort().map(n=>'test/'+n)],/^# pass (\d+)$/gm);
 if(!/^# fail 0$/m.test(node)||!/^# cancelled 0$/m.test(node)||!/^# skipped 0$/m.test(node)||!/^# todo 0$/m.test(node))throw Error('node partial or ignored checks');
 run('syntax',['scripts/check.mjs'],/JavaScript syntax checks passed\.()/gm);
 // Syntax has no numbered cases; its fixed successful marker is one stage.
}catch(error){report.error=error.message;}
// Keep this run's original results; old reports never satisfy a fresh run.
if(!report.error){
 try{
  for(const name of ['catalog','automation','credentials','entry','replay']){
   const args=['scripts/run-electron-tests.mjs','--suite='+name,...(env.containerNoSandbox?['--container-no-sandbox']:[])];
   const path=join(out,name==='catalog'?'electron-edition-developer.json':'electron-'+name+'.json');if(existsSync(path))renameSync(path,join(directory,'previous-'+name+'.json'));
   run(name,args,new RegExp('^PASS Electron '+name+' ([1-9][0-9]*) ','gm'));
   const bytes=readFileSync(path),result=JSON.parse(bytes);if(result.runtime?.electron!==env.electron||result.runtime?.platform!==env.platform||result.checks!==report.stages.at(-1).checks)throw Error(name+' mismatched runtime/result');
   report.stages.at(-1).resultSha256=digest(bytes);writeFileSync(join(directory,name+'.json'),bytes);
  }
 }catch(error){report.error=error.message;}
}
report.finishedAt=Date.now();report.after=verificationInputs(root,environment());if(report.before.sourceSha256!==report.after.sourceSha256||report.before.environmentSha256!==report.after.environmentSha256)report.error='inputs_changed_during_verification';report.complete=!report.error&&verificationComplete(report);
report.releaseReady=false; // Windows/device, packaging and published-asset gates are separate.
writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');writeFileSync(join(out,'pc-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({complete:report.complete,scope:report.scope,sourceSha256:before.sourceSha256,report:resolve(directory,'report.json'),error:report.error}));if(!report.complete)process.exitCode=1;
