import {readFileSync,lstatSync,realpathSync,mkdirSync,writeFileSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolveEdition} from '../src/edition.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const validVersion=value=>typeof value==='string'&&/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)?$/.test(value);
const safePath=value=>typeof value==='string'&&value.length<500&&!/[\\:\x00-\x1f]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');

function artifact(directory,edition){
 const report=JSON.parse(readFileSync(join(directory,'BUILD_VERIFICATION.json'),'utf8'));
 if(report.edition!==edition.id||report.applicationId!==edition.appId||report.executable!==edition.executable||!validVersion(report.version)||!/^\d+\.\d+\.\d+$/.test(report.electronVersion)||!report.files||typeof report.files!=='object')throw Error('invalid_patch_artifact');
 const name=`doctor-glean-pc${edition.developer?'-developer':''}-v${report.version}-windows-x64`,folder=resolve(directory,name);
 if(lstatSync(folder).isSymbolicLink()||realpathSync(folder)!==folder)throw Error('patch_symlink_rejected');
 for(const [path,digest] of Object.entries(report.files)){
  if(!safePath(path)||!/^[a-f0-9]{64}$/.test(digest))throw Error('invalid_patch_inventory');
  const file=resolve(folder,path);
  if(!file.startsWith(folder+sep)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()||realpathSync(file)!==file)throw Error('patch_symlink_rejected');
  if(hash(readFileSync(file))!==digest)throw Error('patch_artifact_changed');
 }
 const metadata=JSON.parse(readFileSync(join(folder,'resources/app/package.json'),'utf8'));
 if(metadata.doctorGleanEdition!==edition.id||metadata.version!==report.version||!report.files[edition.executable]||!report.files['resources/app/package.json']||!report.files['실행안내.txt'])throw Error('invalid_patch_artifact');
 return {report,folder};
}

export function planAppPatch(fromDirectory,toDirectory,editionId){
 const edition=resolveEdition(editionId),from=artifact(resolve(fromDirectory),edition),to=artifact(resolve(toDirectory),edition);
 if(from.report.version===to.report.version)throw Error('same_patch_version');
 const runtime=files=>Object.fromEntries(Object.entries(files).filter(([path])=>!path.startsWith('resources/app/')&&path!=='실행안내.txt').sort(([a],[b])=>a.localeCompare(b)));
 const fingerprints=runtime(from.report.files);
 if(from.report.electronVersion!==to.report.electronVersion||JSON.stringify(fingerprints)!==JSON.stringify(runtime(to.report.files)))throw Error('runtime_changed_full_download_required');
 const appFiles=Object.fromEntries(Object.entries(to.report.files).filter(([path])=>path.startsWith('resources/app/')));
 if(!Object.keys(appFiles).length)throw Error('missing_patch_application');
 return {edition,fromFolder:from.folder,toFolder:to.folder,manifest:{schemaVersion:1,kind:'manual_whole_app_folder_replacement',edition:edition.id,applicationId:edition.appId,
  fromVersion:from.report.version,toVersion:to.report.version,electronVersion:to.report.electronVersion,requiredExecutable:edition.executable,
  replaceDirectory:'resources/app',guideSha256:to.report.files['실행안내.txt'],runtimeFingerprints:fingerprints,appFiles}};
}

export function buildAppPatch(fromDirectory,toDirectory,editionId,outputDirectory){
 const plan=planAppPatch(fromDirectory,toDirectory,editionId),{manifest,edition}=plan;
 const name=`doctor-glean-pc${edition.developer?'-developer':''}-patch-v${manifest.fromVersion}-to-v${manifest.toVersion}-windows-x64`;
 const work=mkdtempSync(join(tmpdir(),'doctor-glean-app-patch-')),folder=join(work,name),out=resolve(outputDirectory),zip=join(out,name+'.zip');
 try{
  mkdirSync(folder,{recursive:true});mkdirSync(out,{recursive:true});
  for(const path of Object.keys(manifest.appFiles)){const target=join(folder,path);mkdirSync(dirname(target),{recursive:true});cpSync(join(plan.toFolder,path),target);}
  if(lstatSync(join(plan.toFolder,'실행안내.txt')).isFile())cpSync(join(plan.toFolder,'실행안내.txt'),join(folder,'실행안내.txt'));
  writeFileSync(join(folder,'PATCH_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  const guide=`${edition.name} 작은 패치: ${manifest.fromVersion} → ${manifest.toVersion}\n\n이 패치의 비교 기준은 같은 에디션의 ${manifest.fromVersion}이에요.\n배포 페이지에 추가로 호환 검증된 이전 버전이 안내되어 있으면 그 버전에서도 중간 패치 없이 바로 적용할 수 있어요.\n같은 에디션과 실행 환경 파일 해시가 모두 일치해야 해요. 호환 확인이 없는 버전이나 다른 에디션은 전체 묶음을 사용해 주세요.\n이미 ${manifest.toVersion}이면 적용할 필요가 없어요.\n\n1. 기존 앱의 트레이 메뉴에서 프로그램 종료를 눌러 완전히 끝내 주세요.\n2. 이 패치 ZIP 전체를 임시 폴더에 풀어 주세요.\n3. 기존 ${edition.executable}가 있는 폴더의 resources 안으로 들어가 주세요.\n4. 기존 app 폴더 이름을 app-backup-${manifest.fromVersion}로 바꿔 주세요. 같은 이름의 백업이 있으면 다른 이름을 사용해 주세요.\n5. 패치 안의 resources/app 폴더 전체를 기존 resources 폴더에 복사해 주세요. 기존 app과 파일을 섞지 말고 새 app 폴더로 교체해 주세요.\n6. 기존 실행파일 ${edition.executable}를 실행하고 하단 버전이 ${manifest.toVersion}인지 확인해 주세요. 패치 안에는 실행파일이 없는 것이 정상이에요.\n\n실행안내.txt는 기존 실행파일 옆에 복사할 수 있어요. PATCH_MANIFEST.json은 적용 대상과 파일 해시를 확인하는 자료예요.\n문제가 생기면 앱을 완전히 종료하고 새 app 폴더를 다른 이름으로 옮긴 뒤, 백업 폴더 이름을 app으로 되돌려 주세요.\n\n이 패치는 resources/app만 교체해요. 로그인·설정·조회 기록은 같은 에디션의 별도 앱 데이터 폴더를 계속 사용해요. 로그인 유지 기간은 사이트 정책을 따라요.\nElectron ${manifest.electronVersion} 실행 환경은 그대로 사용해요. Electron 또는 실행 환경 파일이 바뀌는 업데이트에는 전체 묶음이 필요해요.\nWindows에서 직접 적용하는 절차는 아직 실기기 검증 전이에요.\n`;
  writeFileSync(join(folder,'패치안내.txt'),guide);
  const script="import sys,zipfile\nfrom pathlib import Path\nroot=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for p in sorted(root.rglob('*')):\n  if p.is_file():z.write(p,str(p.relative_to(root.parent)))\n";
  const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',script,folder,zip],{stdio:'inherit'});
  if(result.status!==0)throw Error('patch_zip_failed');
  const bytes=readFileSync(zip),verification={...manifest,zip:name+'.zip',bytes:bytes.length,sha256:hash(bytes),windowsApplied:false};
  writeFileSync(join(out,'PATCH_SHA256SUMS.txt'),verification.sha256+'  '+verification.zip+'\n');
  writeFileSync(join(out,'PATCH_VERIFICATION.json'),JSON.stringify(verification,null,2)+'\n');
  return verification;
 }finally{rmSync(work,{recursive:true,force:true});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return [value.slice(2,at),value.slice(at+1)];}));
 if(!['from','to','edition','output'].every(key=>options[key]))throw Error('use_--from=artifact_directory_--to=artifact_directory_--edition=developer_or_distribution_--output=directory');
 const result=buildAppPatch(options.from,options.to,options.edition,options.output);
 console.log(JSON.stringify({edition:result.edition,fromVersion:result.fromVersion,toVersion:result.toVersion,zip:result.zip,bytes:result.bytes,sha256:result.sha256,windowsApplied:false}));
}
