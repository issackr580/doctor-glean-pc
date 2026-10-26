import {downloadArtifact} from '@electron/get';
import {extract} from '@electron-internal/extract-zip';
import {readFileSync,mkdirSync,cpSync,rmSync,renameSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveEdition} from '../src/edition.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),gitStatus=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
const sourceCommit=commit.status===0&&/^[a-f0-9]{40,64}$/.test(commit.stdout.trim())?commit.stdout.trim():null;
const workingTreeClean=sourceCommit!==null&&gitStatus.status===0&&!gitStatus.stdout.trim();
const args=process.argv.slice(2),edition=resolveEdition(args.find(value=>value.startsWith('--edition='))?.slice(10));
const electronVersion=pkg.devDependencies.electron;
if(!/^\d+\.\d+\.\d+$/.test(electronVersion))throw Error('electron_version_must_be_pinned');
const checksums=JSON.parse(readFileSync(join(root,'node_modules/electron/checksums.json'),'utf8'));
const cacheRoot=process.env.DOCTOR_GLEAN_ELECTRON_CACHE;
if(!cacheRoot)throw Error('set_DOCTOR_GLEAN_ELECTRON_CACHE_to_a_private_build_cache');
const archive=await downloadArtifact({version:electronVersion,artifactName:'electron',platform:'win32',arch:'x64',checksums,cacheRoot});
const name=`doctor-glean-pc${edition.developer?'-developer':''}-v${pkg.version}-windows-x64`;
const base=resolve(args.find(value=>!value.startsWith('--'))??resolve(root,'../output/pc',pkg.version));
const out=join(base,edition.id);
const folder=join(out,name);
mkdirSync(out,{recursive:true});
// Only this version's staging folder is recreated. Published files are untouched.
rmSync(folder,{recursive:true,force:true});mkdirSync(folder);
await extract(archive,{dir:folder});
renameSync(join(folder,'electron.exe'),join(folder,edition.executable));
rmSync(join(folder,'resources/default_app.asar'),{force:true});
const application=join(folder,'resources/app');mkdirSync(application,{recursive:true});
mkdirSync(join(application,'src'));mkdirSync(join(application,'ui'));
for(const name of readdirSync(join(root,'src')))if(!['developer-tools.js','preload-developer.cjs'].includes(name))cpSync(join(root,'src',name),join(application,'src',name));
for(const name of readdirSync(join(root,'ui')))if(name!=='edition-ui.js')cpSync(join(root,'ui',name),join(application,'ui',name));
cpSync(join(root,'vendor'),join(application,'vendor'),{recursive:true});
cpSync(join(root,'editions',edition.id,'developer-tools.js'),join(application,'src/developer-tools.js'));
cpSync(join(root,'editions',edition.id,'edition-ui.js'),join(application,'ui/edition-ui.js'));
if(edition.developer){
 cpSync(join(root,'editions/developer/developer-journal.js'),join(application,'src/developer-journal.js'));
 writeFileSync(join(application,'src/preload-developer.cjs'),readFileSync(join(root,'src/preload.cjs'),'utf8')+'\n'+readFileSync(join(root,'editions/developer/preload-extra.cjs'),'utf8'));
}
writeFileSync(join(application,'package.json'),JSON.stringify({name:pkg.name,productName:edition.name,doctorGleanEdition:edition.id,version:pkg.version,type:'module',main:'src/main.js'},null,2)+'\n');
if(!edition.developer){
 for(const area of ['src','ui'])for(const name of readdirSync(join(application,area)))if(/\.(?:c?js|html)$/.test(name)){
  const text=readFileSync(join(application,area,name),'utf8');
  if(/pc-dev:|class DeveloperJournal|7일 진단 켜기/.test(text))throw Error('developer_implementation_in_distribution');
 }
}
const guide=`${edition.name} ${pkg.version} — Windows x64 검증판

첫 설치: 전체 ZIP을 새 폴더에 풀고 ${edition.executable}를 실행해 주세요.
preview.6.1 업데이트: 같은 에디션의 6.1→7 작은 패치로 resources/app 전체를 교체할 수 있어요.
패치 전에는 관리 창 또는 트레이의 프로그램 종료를 눌러 완전히 끝내 주세요. X는 숨기기예요.

계정 저장·복구
1. 사이트 카드의 계정 저장·복구를 누르고 아이디·비밀번호를 입력해 주세요.
2. 로그인 검증 후 저장을 누르면 별도의 임시 프로필에서 실제 로그인을 확인하고 Windows 계정 보호(DPAPI)로 암호화해 저장해요. 검증 실패·추가 인증은 저장하지 않아요.
3. 저장 후 로그인 만료 시 자동 복구 허용을 체크하면 해당 사이트의 자동 복구를 켤 수 있어요. 기본은 꺼짐이에요. 기존 계정도 저장 계정 자동 복구 허용으로 바꿀 수 있어요.
4. 저장 계정으로 로그인은 이 앱의 원래 사이트 프로필에서 수동 복구해요. 사이트 창을 열어 직접 사용 중이면 그 창을 마친 뒤 눌러 주세요.
5. 새 저장에서 자동 복구를 허용하면 작업 프로필을 확인하고 해당 사이트 강의 목록도 갱신해요. 기존 저장 계정은 다시 입력할 필요 없이 저장 계정으로 로그인을 누르면 돼요. 자동 복구는 전체 자동 실행이 허용된 경우, 실제 로그인 필요를 확인한 강의 조회·출석·입장·자정 작업에서 한 번 수행해요. 비밀번호 오류·불확실 응답은 자동 재제출하지 않아요.
6. 계정 수정·삭제와 복구 중지는 같은 창에서 할 수 있어요. 닫기를 누르면 입력값을 비우고 진행 중인 계정 작업을 중지해요. 이미 보낸 요청은 되돌리지 않아요.

아이디·비밀번호를 일반 설정이나 진단에 넣지 않아요. 저장된 비밀번호를 다시 표시하지 않아요. 보호 저장소를 쓸 수 없으면 평문으로 대체하지 않아요.
이 앱의 개발자용/배포용·Windows 사용자별로 계정과 세션을 분리해요. 평소 Chrome·Edge·모바일의 계정이나 쿠키를 가져오지 않아요.
로그인 시도는 실행 전 기록하고 재시작에도 유지해요. 최근 시도 간격·15분 3회·당일 10회 제한을 적용하고 다음 가능 시각을 표시해요. 계정 교체로 이 기록을 초기화하지 않아요. 한국 날짜가 바뀌어도 최근 15분 시도는 유지해요.
검증 성공 직후에는 저장한 계정으로 원래 작업 프로필을 한 번 복구할 수 있어요. 이후 빠른 재제출은 제한해요.

기존 사용법
- 사이트 열기에서 직접 로그인한 경우 상단의 로그인 마침 · 이 사이트 조회를 누르면 돼요. 이 기능은 계정 저장과 별개인 브라우저 세션 보관이에요.
- 자동 실행에서 필요한 기능을 선택하고 자동 실행 허용을 눌러 주세요. 처음에는 전체·기능 모두 꺼져 있어요.
- 오늘 한 번에 실행은 출석·퀴즈 확인 후 오늘 강의를 조회해요. 상태만 확인은 제출 없이 읽어요.
- 닥터빌·키메디·닥플 출석, 한미 캡슐, 닥터빌 퀴즈 하루 1회, 인터엠디 퀴즈 상태 확인, 키메디 브랜드관 최대 2회를 제공해요.
- 닥터빌·메디게이트·인터엠디·블루팜·키메디·한미 자동 입장. 한미는 신청된 강의 시작 10분 전 준비 확인, 시작부터 10분 간격 최대 5회이며 종료 확인 시 중단해요.
- 예약 취소·직접 입장 기록·미실행 예약의 원래 기한 내 다시 예약을 제공해요.
- 오전08:10 실행과 평일00:01:02 닥터라운지는 켠 뒤 다음 준비 시각부터 적용돼요. 자정 60초 전 준비하고 기한 내 실제 포인트 버튼만 실행해요.
- 클릭·강의창 이동·영상 진행 관찰·사이트 완료를 구분해요. 불확실 응답을 완료로 바꾸지 않아요.

이번 계정 저장 진단과 수정
- 사용자 Windows에서 키메디·인터엠디·메디게이트·종근당·닥플 계정 검증/암호화 저장을 확인했어요. 실제 작업 프로필 복구는 별도 확인해요.
- 일부 실패는 로그인 제출 후3번째 읽기에서 blocked였어요. 지연 POST/이동을 재현해 로딩 대기 전의 주소를 쓰던 바인딩 오류를 수정했어요. 실제 요청은 다시 제출하지 않고 새 화면의 결과를 확인해요.
- 후보 확인은 제출 뒤45초 안에서 기다리고 허용된 인증 팝업을 같은 프로필로 확인해요. 다른 사이트 목적지는 계속 차단해요.
- 닥터빌·한미 재시도 제한은 지우지 않아요. 다음 시도 가능 시각을 표시하고 원래 단계 진단은 계정값 없이 남겨요.
- 전체 범위 미확인·이전 저장 목록·작업용 로그인·계정 저장을 구분해요. 남은 사이트의 실제 성공은 업데이트 후 확인이 필요해요.

공동 개발 기준
- PC 전용 공개 저장소의 CONTRIBUTING·STATUS·ARCHITECTURE·DECISIONS·RELEASE_PROCESS, PR/이슈 양식과 소스 묶음을 준비했어요.
- 소스 Git 기준점·파일 해시·검증 환경을 기록하고 개인 보고서·브라우저·계정·키·캐시를 공유 소스에서 제외해요. 공개 실행파일은 배포용만 대상이에요.
- PC 전용 공개 저장소 https://github.com/issackr580/doctor-glean-pc 에 소스 기준점과 배포용 릴리스를 연결해요. 공동작업자는 CONTRIBUTING과 STATUS를 먼저 읽고 브랜치·PR로 변경해요.

오류는 오류보고 저장으로 TXT를 만들고 발생 시각·사이트·증상을 함께 알려 주세요. 계정·비밀번호·쿠키·토큰·전체 URL·원문·정답은 포함하지 않아요. 자동 전송은 없어요.
${edition.developer?'개발자용은 지정 collaborator 전용 Draft로 공유하며 선택적인 7일 로컬 진단·JSON 내보내기·연결 정책 점검을 제공해요.':'배포용에는 개발자 전용 기록기·추가 API·화면이 없고 일반 오류보고를 제공해요.'}

PC가 켜져 있고 절전 상태가 아니며 프로그램이 실행 중이어야 해요. 기한을 놓친 작업은 몰아서 실행하지 않아요. 휴대폰과 연동하지 않으므로 자동 실행할 장비는 사용자가 정해 주세요.
지속 영상 재생은 추가하지 않았어요. 종근당 매일 강제 재로그인·닥터빌 설문 자동 수행은 별도 검증 대상으로 남겨 두었어요.

Node·Linux Electron 합성 HTTPS로 원래 로그인 처리기와 전체 저장/복구 흐름을 검사했어요. Windows DPAPI 실기기·실제 계정의 무인 로그인/입장/적립 검증은 남아 있어요. 선착순 성공을 보장하지 않아요.
자체 Windows 코드 서명은 없어요. 별도 서버·유료 API·원격 제어·절전 해제·자동 업데이트는 사용하지 않아요.
`;
writeFileSync(join(folder,'실행안내.txt'),guide,'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(path,prefix=''){
 return Object.fromEntries(readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?Object.entries(inventory(join(path,entry.name),prefix+entry.name+'/')):[[prefix+entry.name,sha(readFileSync(join(path,entry.name)))]]));
}
const files=inventory(folder);
const zip=join(out,name+'.zip');
const script="import sys,zipfile\nfrom pathlib import Path\nroot=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for p in sorted(root.rglob('*')):\n  if p.is_file():z.write(p,str(p.relative_to(root.parent)))\n";
const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',script,folder,zip],{stdio:'inherit'});
if(result.status!==0)throw Error('zip_build_failed');
writeFileSync(join(out,'SHA256SUMS.txt'),sha(readFileSync(zip))+'  '+name+'.zip\n');
writeFileSync(join(out,'RELEASE_NOTES.txt'),guide,'utf8');
writeFileSync(join(out,'BUILD_VERIFICATION.json'),JSON.stringify({schemaVersion:1,version:pkg.version,sourceCommit,workingTreeClean,edition:edition.id,applicationId:edition.appId,dataDirectory:edition.directory,executable:edition.executable,developerImplementationIncluded:edition.developer,kind:'Windows x64 preview',electronVersion,electronArchive:sha(readFileSync(archive)),zip:sha(readFileSync(zip)),windowsExecuted:false,authenticatedSitesVerified:false,windowsDpapiVerified:false,accountRecoveryConnected:true,automaticSubmissionConnected:true,published:false,files},null,2)+'\n');
console.log(JSON.stringify({output:zip,version:pkg.version,edition:edition.id,files:Object.keys(files).length,windowsExecuted:false}));
