import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=resolve(process.argv[2]??resolve(root,'../doctor-glean-handoff-v0.7.62/webinar-android'));
const names=['daily.js','auto-entry.js','keymedi-lounge.js','doctorville-quiz-pilot.js','doctorville-quiz-journey.js','doctorville-survey.js'];
const destination=resolve(root,'vendor/automation'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const version=readFileSync(resolve(source,'app/src/main/java/kr/webinar/planner/ReleaseNotes.java'),'utf8').match(/new Entry\("([0-9.]+)"/)?.[1];
if(!version)throw Error('automation_source_version_missing');
mkdirSync(destination,{recursive:true});const inputs={},outputs={},reasons=new Set();
for(const name of names){
 const bytes=readFileSync(resolve(source,'app/src/main/assets',name)),text=bytes.toString();
 if(typeof new vm.Script(text).runInNewContext()!=='function')throw Error('automation_asset_not_standalone');
 inputs['app/src/main/assets/'+name]=hash(bytes);outputs[name]=hash(bytes);
 for(const match of text.matchAll(/['"]([a-z][a-z0-9]*(?:_[a-z0-9]+)+)['"]/g))if(match[1].length<=80)reasons.add(match[1]);
 writeFileSync(resolve(destination,name),bytes);
}
writeFileSync(resolve(destination,'manifest.json'),JSON.stringify({schemaVersion:1,sourceVersion:version,sourceFiles:inputs,outputs,reasons:[...reasons].sort()},null,2)+'\n');
console.log(`Automation snapshot: Android ${version}, ${names.length} standalone assets.`);
