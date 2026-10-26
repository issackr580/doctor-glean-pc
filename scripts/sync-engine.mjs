import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(process.argv[2]??resolve(project,'../doctor-glean-handoff-v0.7.62/webinar-android'));
const engine=resolve(source,'engine');
const destination=resolve(project,'vendor/engine');
const seen=new Set();
function visit(name){
  const file=resolve(engine,name),local=relative(engine,file);
  if(local.startsWith('..'+sep)||local.startsWith('..')||!local.endsWith('.js'))throw Error('invalid_engine_source');
  if(seen.has(local))return;seen.add(local);
  const text=readFileSync(file,'utf8');
  for(const match of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)){
    if(!match[1].startsWith('./'))throw Error('unexpected_engine_dependency');
    visit(resolve(dirname(file),match[1]));
  }
}
for(const file of ['reader-bundles.js','core.js','collector.js','additional-collector.js'])visit(file);
const {readerBundles}=await import(pathToFileURL(resolve(engine,'reader-bundles.js')));
const {SITES}=await import(pathToFileURL(resolve(engine,'core.js')));
const {performCatalogAction}=await import(pathToFileURL(resolve(engine,'catalog.js')));
const {performAdditionalAction}=await import(pathToFileURL(resolve(engine,'additional-catalog.js')));
const {collectPage}=await import(pathToFileURL(resolve(engine,'collector.js')));
const {collectAdditionalPage}=await import(pathToFileURL(resolve(engine,'additional-collector.js')));
const notes=readFileSync(resolve(source,'app/src/main/java/kr/webinar/planner/ReleaseNotes.java'),'utf8');
const sourceVersion=notes.match(/new Entry\("([0-9.]+)"/)?.[1];
if(!sourceVersion)throw Error('source_version_unavailable');
const files={
  ...readerBundles(),
  'collect-catalog.js':'('+collectPage.toString()+')',
  'collect-additional.js':'('+collectAdditionalPage.toString()+')',
  'catalog-action.js':'('+performCatalogAction.toString()+')',
  'additional-action.js':'('+performAdditionalAction.toString()+')',
  'core.js':readFileSync(resolve(engine,'core.js'),'utf8'),
  'sites.json':JSON.stringify(SITES,null,2)+'\n',
};
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const manifest={schemaVersion:1,sourceVersion,sourceFiles:Object.fromEntries([...seen].sort().map(file=>[file,sha(readFileSync(resolve(engine,file)))])),
  outputs:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,sha(raw)]))};
mkdirSync(destination,{recursive:true});
for(const [name,raw] of Object.entries(files))writeFileSync(resolve(destination,name),raw);
writeFileSync(resolve(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Engine snapshot: Android ${sourceVersion}, ${seen.size} source files, ${Object.keys(files).length} outputs.`);
