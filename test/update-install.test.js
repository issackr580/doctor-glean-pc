import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,symlinkSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {EventEmitter} from 'node:events';
import {verifyUpdateFeed,chooseSignedUpdate,validateUpdatePayload,UPDATE_FEED} from '../src/update-trust.js';
import {fetchUpdateFeed,downloadUpdate} from '../src/update-download.js';
import {validatePatch,patchZipFiles,updateHash,validateInstallation} from '../src/update-package.js';
import {PcUpdater,pendingUpdate} from '../src/update-manager.js';
import helper from '../src/update-helper.cjs';
import {AutomationController} from '../src/automation-controller.js';
import {LocalState} from '../src/local-state.js';
import {syntheticUpdate,syntheticZip,signedSyntheticFeed} from './update-fixtures.js';

const response=bytes=>new Response(bytes,{headers:{'content-length':String(bytes.length)}});
function manager(s,extra={}){return new PcUpdater({context:s.context,fetch:async()=>response(s.bytes),readFeed:async()=>s.feed,privateDownload:async()=>s.bytes,...extra});}
async function prepared(s,extra={}){let file,quits=0;const updater=manager(s,{launchHelper:async(_script,path)=>{file=path;},quit:()=>quits++,...extra});await updater.check();await updater.install();return {updater,file,quits};}
test('only the pinned signing key can authorize a PC update, and signed changes invalidate verification',t=>{
  const s=syntheticUpdate(t),signed=signedSyntheticFeed(s.feed);assert.deepEqual(verifyUpdateFeed(signed.bytes,{publicKey:signed.publicKey}),s.feed);assert.throws(()=>verifyUpdateFeed(signed.bytes),/update_signature/);
  const changed=JSON.parse(signed.bytes);changed.payload.targets[0].patch.sha256='e'.repeat(64);assert.throws(()=>verifyUpdateFeed(Buffer.from(JSON.stringify(changed)),{publicKey:signed.publicKey}),/update_signature/);
});
test('signed metadata still rejects foreign repositories, channels, editions, asset paths and malformed sizes',t=>{
  const s=syntheticUpdate(t);
  for(const mutate of [p=>p.repository='other/repo',p=>p.channel='mobile',p=>p.targets[0].edition='mobile',p=>p.targets[0].page='https://foreign.invalid/',p=>p.targets[0].patch.url+='?token=private',p=>p.targets[0].patch.size=20*1024*1024,p=>p.targets[0].compatibleVersions=['99.0.0'],p=>p.issuedAt=Date.now()+600000]){const p=structuredClone(s.feed);mutate(p);assert.throws(()=>validateUpdatePayload(p));}
});
test('updates cannot downgrade, cross channels, change runtime, or silently mix editions',t=>{
  const s=syntheticUpdate(t);assert.equal(chooseSignedUpdate(s.feed,s.context).status,'available');assert.equal(chooseSignedUpdate(s.feed,{...s.context,currentVersion:s.target.version}).status,'current');assert.equal(chooseSignedUpdate(s.feed,{...s.context,currentVersion:'9.0.0'}).status,'unknown');assert.equal(chooseSignedUpdate(s.feed,{...s.context,edition:'developer'}).status,'unknown');assert.equal(chooseSignedUpdate(s.feed,{...s.context,channel:'stable'}).status,'unknown');assert.equal(chooseSignedUpdate(s.feed,{...s.context,electronVersion:'46.0.0'}).status,'full_required');
});
test('a signed developer target retains its private untagged asset and never becomes a public distribution target',t=>{const s=syntheticUpdate(t,{edition:'developer'});validateUpdatePayload(s.feed);assert.equal(chooseSignedUpdate(s.feed,s.context).localFile,true);assert.match(s.target.patch.url,/untagged-synthetic/);});
test('feed lookup uses only the fixed channel path without account cookies and verifies the response',async t=>{
  const s=syntheticUpdate(t),signed=signedSyntheticFeed(s.feed);let calls=0;const feed=await fetchUpdateFeed(async(url,options)=>{calls++;assert.equal(url,UPDATE_FEED+'preview.json');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return response(signed.bytes);},'preview',{publicKey:signed.publicKey});assert.equal(calls,1);assert.deepEqual(feed,s.feed);
});
test('unsigned, oversized, redirected and unavailable feeds never report latest or permit installation',async t=>{
  const s=syntheticUpdate(t);
  for(const fetch of [async()=>response(Buffer.from('{}')),async()=>response(Buffer.alloc(131073)),async()=>new Response('',{status:404}),async()=>({ok:true,redirected:true})])await assert.rejects(fetchUpdateFeed(fetch,'preview'));
  const updater=new PcUpdater({context:s.context,fetch:async()=>response(Buffer.from('{}'))});assert.equal((await updater.check()).status,'failed');assert.equal((await updater.install()).reason,'update_installation');
});
test('public patch downloads accept only bounded GitHub asset redirects without credentials',async t=>{
  const s=syntheticUpdate(t);let n=0;const result=await downloadUpdate(async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');n++;return n===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/synthetic'}}):response(s.bytes);},s.target);assert.deepEqual(result,s.bytes);assert.equal(n,2);
});
test('unexpected download hosts, truncated bodies and developer unauthenticated downloads are rejected',async t=>{
  const s=syntheticUpdate(t);await assert.rejects(downloadUpdate(async()=>new Response(null,{status:302,headers:{location:'https://foreign.invalid/file'}}),s.target),/update_redirect/);await assert.rejects(downloadUpdate(async()=>response(s.bytes.subarray(1)),s.target),/update_size/);await assert.rejects(downloadUpdate(async()=>response(s.bytes),{...s.target,edition:'developer'}),/update_private/);
});
test('the patch archive must match its signed digest, complete app inventory, version, source and edition',t=>{
  const s=syntheticUpdate(t);assert.deepEqual(validatePatch(s.bytes,s.target,s.context).manifest,s.manifest);const corrupt=Buffer.from(s.bytes);corrupt[40]^=1;assert.throws(()=>validatePatch(corrupt,s.target,s.context),/update_hash/);
  for(const change of [m=>m.edition='developer',m=>m.toVersion='99.0.0',m=>m.appFiles['resources/app/private.txt']='e'.repeat(64),m=>m.runtimeFingerprints['../private']='a'.repeat(64)]){
    const files={...s.files},key=Object.keys(files).find(p=>p.endsWith('PATCH_MANIFEST.json')),manifest=structuredClone(s.manifest);change(manifest);files[key]=JSON.stringify(manifest);const bytes=syntheticZip(files);assert.throws(()=>validatePatch(bytes,{...s.target,patch:{...s.target.patch,size:bytes.length,sha256:updateHash(bytes)}},s.context));
  }
});
test('ZIP traversal, Windows aliases, symlinks, case collisions, encryption and broken central bounds are rejected',()=>{
  for(const files of [{'root/../escape':'x'},{'root/C:/escape':'x'},{'root/con.txt':'x'},{'root/name.':'x'},{'root/A':'x','root/a':'y'}])assert.throws(()=>patchZipFiles(syntheticZip(files)));
  assert.throws(()=>patchZipFiles(syntheticZip({'root/link':'x'},{attributes:0xa1ff0000})));assert.throws(()=>patchZipFiles(syntheticZip({'root/x':'x'},{flags:1})));
  const broken=syntheticZip({'root/x':'x'});broken.writeUInt32LE(0,broken.length-6);assert.throws(()=>patchZipFiles(broken));
});
test('a ZIP bomb is bounded before decompression and CRC corruption is rejected',()=>{
  const large=syntheticZip({'root/file':Buffer.alloc(8*1024*1024+1)});assert.throws(()=>patchZipFiles(large));const crc=syntheticZip({'root/x':'test'});let at=0;for(;at<crc.length-4;at++)if(crc.readUInt32LE(at)===0x02014b50)break;crc.writeUInt32LE(0,at+16);assert.throws(()=>patchZipFiles(crc));
});
test('installation validates the exact executable layout and all runtime hashes before modifying the app',t=>{
  const s=syntheticUpdate(t);assert.equal(validateInstallation(s.root,s.context,s.manifest),s.root);assert.throws(()=>validateInstallation(s.root,{...s.context,appPath:s.root},s.manifest));writeFileSync(s.context.executable,'changed');assert.throws(()=>validateInstallation(s.root,s.context,s.manifest),/update_runtime/);assert.equal(readFileSync(join(s.context.appPath,'src/main.js'),'utf8'),'old application');
});
test('runtime symbolic links are rejected without following them into another directory',t=>{
  const s=syntheticUpdate(t),file=join(s.root,'version');rmSync(file);symlinkSync(join(s.context.appPath,'package.json'),file);assert.throws(()=>validateInstallation(s.root,s.context,s.manifest),/update_path/);
});
test('an update check and install are single-flight and cannot dispatch without an authenticated target',async t=>{
  const s=syntheticUpdate(t);let finish,calls=0;const updater=manager(s,{readFeed:()=>{calls++;return new Promise(resolve=>{finish=()=>resolve(s.feed);});}});assert.equal((await updater.install()).reason,'update_installation');const first=updater.check(),second=updater.check();assert.equal(first,second);finish();await first;assert.equal(calls,1);
});
test('active lectures or accounts defer installation while keeping the downloaded patch ready',async t=>{
  const s=syntheticUpdate(t);let busy=true,downloads=0,launches=0,quits=0;const updater=manager(s,{fetch:async()=>{downloads++;return response(s.bytes);},isBusy:()=>busy,launchHelper:async()=>{launches++;},quit:()=>quits++});await updater.check();assert.equal((await updater.install()).status,'ready_busy');assert.equal(launches,0);assert.equal(updater.guarded,false);busy=false;await updater.install();assert.equal(downloads,1);assert.equal(launches,1);assert.equal(quits,1);assert.equal(updater.guarded,true);
});
test('failed helper launch leaves the old app and user records untouched and releases the execution guard',async t=>{
  const s=syntheticUpdate(t),updater=manager(s,{launchHelper:async()=>{throw Error('update_boot');},quit:()=>assert.fail('must not quit')});await updater.check();assert.equal((await updater.install()).reason,'update_boot');assert.equal(updater.guarded,false);assert.equal(readFileSync(join(s.context.appPath,'src/main.js'),'utf8'),'old application');assert.equal(readFileSync(join(s.data,'state-v1.json'),'utf8'),'synthetic reservation and attempt sentinel');
});
test('the helper replaces the entire app only after parent exit, retains a backup and commits a healthy boot',async t=>{
  const s=syntheticUpdate(t),preparedUpdate=await prepared(s);let starts=0;
  const result=await helper.runUpdate(preparedUpdate.file,{waitParent:async()=>true,start:p=>{
    starts++;const child=new EventEmitter();Object.assign(child,{pid:process.pid,exitCode:null,unref(){}});writeFileSync(join(dirname(preparedUpdate.file),'healthy.json'),JSON.stringify({nonce:p.nonce,version:p.toVersion,edition:p.edition,pid:child.pid}));return child;
  }});
  assert.equal(result.status,'committed');assert.equal(starts,1);assert.equal(existsSync(join(s.context.appPath,'src/obsolete.js')),false);assert.equal(readFileSync(join(s.context.appPath,'src/new-module.js'),'utf8'),'new module');assert.equal(readFileSync(join(dirname(preparedUpdate.file),'previous-app/src/obsolete.js'),'utf8'),'removed module');assert.equal(readFileSync(join(s.data,'credentials-v1.json'),'utf8'),'synthetic protected account sentinel');
});
test('a parent that has not exited prevents any folder replacement',async t=>{const s=syntheticUpdate(t),p=await prepared(s);assert.equal((await helper.runUpdate(p.file,{waitParent:async()=>false,start:()=>assert.fail('must not restart')})).status,'cancelled');assert.equal(readFileSync(join(s.context.appPath,'src/main.js'),'utf8'),'old application');});
test('a failed new boot restores the complete old app and restarts only that edition',async t=>{
  const s=syntheticUpdate(t,{edition:'developer'}),p=await prepared(s),starts=[];
  const result=await helper.runUpdate(p.file,{waitParent:async()=>true,start:plan=>{starts.push(plan.toVersion);return {pid:123456,exitCode:starts.length===1?1:null,unref(){}};}});
  assert.equal(result.status,'rolled_back');assert.deepEqual(starts,[s.target.version,s.context.currentVersion]);assert.equal(readFileSync(join(s.context.appPath,'src/main.js'),'utf8'),'old application');assert.equal(existsSync(join(s.context.appPath,'src/new-module.js')),false);assert.equal(pendingUpdate(s.context.appPath,s.context.currentVersion,'developer').pending,false);
});
test('staged app tampering after verification is rejected before replacing the old app',async t=>{const s=syntheticUpdate(t),p=await prepared(s);writeFileSync(join(dirname(p.file),'app/src/main.js'),'tampered');await assert.rejects(helper.runUpdate(p.file,{waitParent:async()=>true}),/update_hash/);assert.equal(readFileSync(join(s.context.appPath,'src/main.js'),'utf8'),'old application');});
test('the updater never propagates inherited token or Node execution environment into the next app',()=>{assert.deepEqual(helper.processEnvironment({PATH:'os-path',SystemRoot:'os-root',GH_TOKEN:'synthetic',NODE_OPTIONS:'--require=untrusted',ELECTRON_RUN_AS_NODE:'1',NODE_TLS_REJECT_UNAUTHORIZED:'0'}),{PATH:'os-path',SystemRoot:'os-root'});});
test('a verified healthy new UI stays guarded until the helper commits, without changing saved user settings',async t=>{
  const s=syntheticUpdate(t),p=await prepared(s);let next,ack;
  await helper.runUpdate(p.file,{waitParent:async()=>true,start:plan=>{
    next=manager(s,{context:{...s.context,currentVersion:s.target.version}});assert.equal(next.bootPending,true);ack=next.acknowledgeBoot();return {pid:process.pid,exitCode:null,unref(){}};
  }});await ack;assert.equal(next.guarded,false);assert.equal(next.snapshot().status,'updated');assert.equal(readFileSync(join(s.data,'state-v1.json'),'utf8'),'synthetic reservation and attempt sentinel');
});
test('the execution guard holds queued work until startup commits and preserves the users pause setting',async t=>{
  const s=syntheticUpdate(t),ledger=new LocalState(join(s.root,'execution.json'));ledger.setPaused(false);let guarded=true,runs=0;
  const controller=new AutomationController({file:join(s.root,'workflow.json'),ledger,executionAllowed:()=>!guarded,catalog:()=>({}),catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){}});clearInterval(controller.timer);t.after(()=>controller.close());controller.daily.run=async()=>{runs++;return {reason:'finished'};};
  controller.requestDaily({readOnly:true,keys:['doctorville:attendance']});assert.equal(runs,0);assert.equal(ledger.snapshot().paused,false);guarded=false;controller.tick();for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(runs,1);assert.equal(ledger.snapshot().paused,false);assert.equal(Object.keys(ledger.snapshot().jobs).length,0);
});
test('a manually reopened old app yields to a live installer, while an expired stale plan does not lock it out',async t=>{
  const s=syntheticUpdate(t),p=await prepared(s),plan=helper.readPlan(p.file);plan.helperPid=process.pid;plan.parentPid=process.pid+100000;helper.savePlan(p.file,plan);
  const reopened=manager(s);assert.equal(reopened.waitForHelper,true);assert.equal(reopened.guarded,true);
  plan.createdAt-=120001;helper.savePlan(p.file,plan);assert.equal(manager(s).waitForHelper,false);assert.equal(readFileSync(join(s.context.appPath,'src/main.js'),'utf8'),'old application');
});
