import {inflateRawSync,crc32} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,lstatSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname,sep,basename} from 'node:path';
import {resolveEdition} from './edition.js';
const fail=()=>{throw Error('update_package');};
export const updateHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const safeUpdatePath=value=>typeof value==='string'&&value.length<400&&!/[\\:\x00-\x1f\x7f]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
export function patchZipFiles(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>16*1024*1024)fail();
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))fail();
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
  if(count!==bytes.readUInt16LE(end+8)||!count||count>400||offset+size!==end)fail();
  const files=new Map(),names=new Set(),ranges=[];let at=offset,total=0,root;
  for(let i=0;i<count;i++){
    if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)fail();
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16),compressed=bytes.readUInt32LE(at+20),length=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),local=bytes.readUInt32LE(at+42),attributes=bytes.readUInt32LE(at+38);
    if(flags&~0x0808||![0,8].includes(method)||bytes.readUInt16LE(at+34)||at+46+nameLength+extra+comment>end||(attributes>>>16&0xf000)===0xa000)fail();
    const name=bytes.subarray(at+46,at+46+nameLength).toString('utf8');if(!Buffer.from(name).equals(bytes.subarray(at+46,at+46+nameLength))||!safeUpdatePath(name)||names.has(name.toLowerCase()))fail();names.add(name.toLowerCase());
    const parts=name.split('/');if(parts.length<2||root&&root!==parts[0])fail();root=parts[0];
    if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)fail();
    const localNameLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),start=local+30+localNameLength+localExtra,finish=start+compressed;
    if(finish>offset||!bytes.subarray(local+30,local+30+localNameLength).equals(Buffer.from(name))||ranges.some(([a,b])=>local<b&&finish>a))fail();ranges.push([local,finish]);
    total+=length;if(length>8*1024*1024||total>64*1024*1024)fail();
    const data=method===0?bytes.subarray(start,finish):inflateRawSync(bytes.subarray(start,finish),{maxOutputLength:Math.max(1,length)});
    if(data.length!==length||crc32(data)!==crc)fail();files.set(parts.slice(1).join('/'),Buffer.from(data));at+=46+nameLength+extra+comment;
  }if(at!==end)fail();return files;
}
export function updateInventory(directory,prefix=''){
  if(lstatSync(directory).isSymbolicLink()||realpathSync(directory)!==resolve(directory))throw Error('update_path');
  const files={};
  for(const item of readdirSync(directory,{withFileTypes:true})){
    const path=prefix+item.name;if(!safeUpdatePath(path))throw Error('update_path');const file=join(directory,item.name),stat=lstatSync(file);
    if(stat.isSymbolicLink())throw Error('update_path');
    if(stat.isDirectory())Object.assign(files,updateInventory(file,path+'/'));else if(stat.isFile())files[path]=updateHash(readFileSync(file));else throw Error('update_path');
  }return files;
}
export function validatePatch(bytes,target,{currentVersion,electronVersion}){
  if(bytes.length!==target.patch.size||updateHash(bytes)!==target.patch.sha256)throw Error('update_hash');
  const files=patchZipFiles(bytes),manifest=JSON.parse(files.get('PATCH_MANIFEST.json')?.toString('utf8')??'null'),edition=resolveEdition(target.edition);
  if(!manifest||manifest.schemaVersion!==1||manifest.kind!=='manual_whole_app_folder_replacement'||manifest.edition!==edition.id||manifest.applicationId!==edition.appId||manifest.requiredExecutable!==edition.executable||manifest.toVersion!==target.version||manifest.electronVersion!==electronVersion||manifest.replaceDirectory!=='resources/app'||!target.compatibleVersions.includes(currentVersion)||!manifest.appFiles||!manifest.runtimeFingerprints)fail();
  const payload={};
  for(const [path,digest] of Object.entries(manifest.appFiles)){
    if(!safeUpdatePath(path)||!path.startsWith('resources/app/')||!/^[a-f0-9]{64}$/.test(digest)||!files.has(path)||updateHash(files.get(path))!==digest)fail();payload[path.slice('resources/app/'.length)]=files.get(path);
  }
  if(!Object.keys(payload).length||Object.keys(payload).length>300||[...files.keys()].some(path=>!Object.hasOwn(manifest.appFiles,path)&&!['PATCH_MANIFEST.json','실행안내.txt','패치안내.txt'].includes(path)))fail();
  const pkg=JSON.parse(payload['package.json']?.toString('utf8')??'null');
  if(pkg?.version!==target.version||pkg.doctorGleanEdition!==target.edition||pkg.sourceCommit!==target.sourceCommit||pkg.main!=='src/main.js'||!payload['src/main.js'])fail();
  for(const [path,digest] of Object.entries(manifest.runtimeFingerprints))if(!safeUpdatePath(path)||path.startsWith('resources/app')||path==='실행안내.txt'||!/^[a-f0-9]{64}$/.test(digest))fail();
  if(!manifest.runtimeFingerprints[edition.executable]||Object.keys(manifest.runtimeFingerprints).length>100)fail();
  return {manifest,payload};
}
export function validateInstallation(root,{appPath,executable,edition,electronVersion},manifest){
  const selected=resolveEdition(edition),install=resolve(root);
  if(resolve(appPath)!==join(install,'resources','app')||resolve(executable)!==join(install,selected.executable)||manifest.electronVersion!==electronVersion)throw Error('update_installation');
  // Check every pinned runtime file and reject links in its entire ancestry.
  for(const [path,digest] of Object.entries(manifest.runtimeFingerprints)){
    let parent=install;for(const part of path.split('/')){parent=join(parent,part);const stat=lstatSync(parent);if(stat.isSymbolicLink()||realpathSync(parent)!==parent)throw Error('update_path');}
    const file=join(install,path);if(!lstatSync(file).isFile()||updateHash(readFileSync(file))!==digest)throw Error('update_runtime');
  }
  if(realpathSync(install)!==install||lstatSync(appPath).isSymbolicLink()||realpathSync(appPath)!==resolve(appPath)||basename(executable)!==selected.executable)throw Error('update_installation');return install;
}
export function writeStagedApp(directory,payload){
  mkdirSync(directory,{recursive:false,mode:0o700});
  for(const [path,bytes] of Object.entries(payload)){if(!safeUpdatePath(path))throw Error('update_path');const target=resolve(directory,path);if(!target.startsWith(resolve(directory)+sep))throw Error('update_path');mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,bytes,{flag:'wx',mode:0o600});}
}
