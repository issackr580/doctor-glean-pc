import {readdirSync,lstatSync,readFileSync,mkdirSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {resolve,dirname,join,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ROOT_FILES=['package.json','package-lock.json','README.md','CONTRIBUTING.md','AGENTS.md','SECURITY.md','.gitignore','.gitattributes','.editorconfig','.nvmrc'];
const AREAS=['src','ui','editions','vendor','test','scripts','docs','.github'];
const extensions=new Set(['.js','.mjs','.cjs','.json','.md','.html','.css','.png','.yml','.yaml']);
const prohibited=/(?:^|\/)(?:node_modules|verification|attachments|browser|private|user-data|\.git)(?:\/|$)|(?:^|\/)(?:credentials-v1|credential-attempts-v1|state-v1|workflows-v1|catalog-v1|developer-diagnostics-v1)\.json$|(?:^|\/)(?:\.env(?:\..*)?|credential\.json)$|\.(?:exe|dll|zip|pem|key|jks|keystore|p12|pfx|dmp|log)$/i;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sourceInventory(root=repository){
 root=resolve(root);const files={};
 const add=path=>{
  const stat=lstatSync(path),name=relative(root,path).split('\\').join('/');
  if(stat.isSymbolicLink()||prohibited.test(name))throw Error('unsafe_source_path');
  if(stat.isDirectory()){for(const entry of readdirSync(path).sort())add(join(path,entry));return;}
  if(!stat.isFile()||!ROOT_FILES.includes(name)&&!extensions.has(extname(name)))throw Error('unexpected_source_file');
  const bytes=readFileSync(path);if(bytes.length>2_000_000)throw Error('source_file_too_large');
  if(!name.endsWith('.png')){
   const text=bytes.toString('utf8');
   if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/.test(text))throw Error('potential_secret_in_source');
  }files[name]=hash(bytes);
 };
 for(const name of ROOT_FILES)add(join(root,name));for(const area of AREAS)add(join(root,area));return files;
}
export function exportSource(root=repository,out=resolve(repository,'../output/pc-source')){
 root=resolve(root);out=resolve(out);const files=sourceInventory(root),pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
 const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),status=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
 const sourceCommit=commit.status===0&&/^[a-f0-9]{40,64}$/.test(commit.stdout.trim())?commit.stdout.trim():null;
 const manifest={schemaVersion:1,version:pkg.version,sourceCommit,workingTreeClean:sourceCommit!==null&&status.status===0&&!status.stdout.trim(),privacy:'allowlisted_source_only_no_user_data',files};
 const stage=mkdtempSync(join(tmpdir(),'doctor-glean-source-')),name='doctor-glean-pc-source-v'+pkg.version,folder=join(stage,name);mkdirSync(folder);mkdirSync(out,{recursive:true});
 try{
  for(const file of Object.keys(files)){mkdirSync(dirname(join(folder,file)),{recursive:true});cpSync(join(root,file),join(folder,file));}
  writeFileSync(join(folder,'SOURCE_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  const zip=join(out,name+'.zip'),python=process.env.DOCTOR_GLEAN_PYTHON??(process.platform==='win32'?'python':'python3');
  const program="import sys,zipfile\nfrom pathlib import Path\nr=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for p in sorted(r.rglob('*')):\n  if p.is_file():z.write(p,str(p.relative_to(r.parent)))\n";
  const result=spawnSync(python,['-c',program,folder,zip],{stdio:'inherit'});if(result.status!==0)throw Error('source_zip_failed');
  const bytes=readFileSync(zip),report={...manifest,zip:name+'.zip',bytes:bytes.length,sha256:hash(bytes)};
  writeFileSync(join(out,'SOURCE_SHA256SUMS.txt'),report.sha256+'  '+report.zip+'\n');writeFileSync(join(out,'SOURCE_VERIFICATION.json'),JSON.stringify(report,null,2)+'\n');return report;
 }finally{rmSync(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv.slice(2).find(value=>value.startsWith('--output='))?.slice(9);const r=exportSource(repository,output??resolve(repository,'../output/pc-source'));console.log(JSON.stringify({version:r.version,zip:r.zip,bytes:r.bytes,sha256:r.sha256,files:Object.keys(r.files).length,sourceCommit:r.sourceCommit}));
}
