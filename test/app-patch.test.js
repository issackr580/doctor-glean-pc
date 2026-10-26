import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {planAppPatch} from '../scripts/build-app-patch.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'app-patch-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 function artifact(version,{edition='developer',runtime='same-runtime',extra={}}={}){
  const dev=edition==='developer',directory=join(root,version,edition),folder=join(directory,`doctor-glean-pc${dev?'-developer':''}-v${version}-windows-x64`);
  const executable=dev?'DoctorGlean-Developer.exe':'DoctorGlean.exe';
  const data={[executable]:runtime,'version':'45.0.0','resources/app/package.json':JSON.stringify({version,doctorGleanEdition:edition}),'resources/app/src/main.js':'export const value='+JSON.stringify(version),'실행안내.txt':version,...extra};
  for(const [path,value] of Object.entries(data)){mkdirSync(dirname(join(folder,path)),{recursive:true});writeFileSync(join(folder,path),value);}
  writeFileSync(join(directory,'BUILD_VERIFICATION.json'),JSON.stringify({version,edition,executable,applicationId:dev?'kr.webinar.planner.pc.developer':'kr.webinar.planner.pc.app',electronVersion:'45.0.0',files:Object.fromEntries(Object.entries(data).map(([path,value])=>[path,sha(value)]))}));
  return {directory,folder};
 }
 return {root,artifact};
}
test('app-only patches replace the entire application and omit removed old modules',t=>{
 const {artifact}=fixture(t),from=artifact('1.0.0',{extra:{'resources/app/src/obsolete.js':'old'}}),to=artifact('1.0.1');
 const p=planAppPatch(from.directory,to.directory,'developer');
 assert.equal(p.manifest.replaceDirectory,'resources/app');assert.equal(p.manifest.fromVersion,'1.0.0');
 assert.ok(p.manifest.appFiles['resources/app/src/main.js']);assert.equal(p.manifest.appFiles['resources/app/src/obsolete.js'],undefined);
 assert.equal(p.manifest.appFiles['DoctorGlean-Developer.exe'],undefined);
});
test('changed runtime requires the full installer even with the same Electron version',t=>{
 const {artifact}=fixture(t),from=artifact('1.0.0'),to=artifact('1.0.1',{runtime:'changed-runtime'});
 assert.throws(()=>planAppPatch(from.directory,to.directory,'developer'),/runtime_changed_full_download_required/);
});
test('developer and distribution editions cannot be mixed',t=>{
 const {artifact}=fixture(t),from=artifact('1.0.0'),to=artifact('1.0.1',{edition:'distribution'});
 assert.throws(()=>planAppPatch(from.directory,to.directory,'developer'),/invalid_patch_artifact/);
});
test('modified target files are rejected before they can enter the patch',t=>{
 const {artifact}=fixture(t),from=artifact('1.0.0'),to=artifact('1.0.1');
 writeFileSync(join(to.folder,'resources/app/src/main.js'),'unexpected');
 assert.throws(()=>planAppPatch(from.directory,to.directory,'developer'),/patch_artifact_changed/);
});
test('path traversal and symbolic links cannot supply patch content',t=>{
 const {root,artifact}=fixture(t),from=artifact('1.0.0'),to=artifact('1.0.1');
 const report=join(to.directory,'BUILD_VERIFICATION.json'),data=JSON.parse(readFileSync(report,'utf8'));
 data.files['../private.txt']=sha('private');writeFileSync(report,JSON.stringify(data));
 assert.throws(()=>planAppPatch(from.directory,to.directory,'developer'),/invalid_patch_inventory/);
 delete data.files['../private.txt'];writeFileSync(report,JSON.stringify(data));
 writeFileSync(join(root,'private.txt'),'private');rmSync(join(to.folder,'resources/app/src/main.js'));symlinkSync(join(root,'private.txt'),join(to.folder,'resources/app/src/main.js'));
 assert.throws(()=>planAppPatch(from.directory,to.directory,'developer'),/patch_symlink_rejected/);
});
