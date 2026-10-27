# 검증과 릴리스 절차

릴리스 담당 관리자가 수행한다. 공동작업자의 PR이 자동으로 실행파일을 공개하지 않게 한다. 소스와 distribution 검증판은 공개 PC 저장소 `issackr580/doctor-glean-pc`에서 함께 관리한다. 기존 `issackr580/-`의 Android·과거 PC 릴리스를 변경하지 않는다. developer 실행물은 같은 PC 저장소의 지정 collaborator 전용 Draft로 공유하며 공개 게시하지 않는다. [권한 기준](ACCESS.md)을 따른다.

## 변경 검토

1. `main`에 병합할 PR의 범위, 저장 호환, 기본 설정, 관련 문서를 검토한다.
2. `package.json`과 `package-lock.json`의 앱 버전을 함께 올린다. Electron 버전은 별도 변경으로 다룬다.
3. `npm ci`, `npm test`, `npm run check`, `npm run test:electron`을 실행한다. 각 검사에서 실제 항목 수를 확인한다.
4. 합성 DOM/Node, 실제 Electron·합성 HTTPS, 사용자 Windows 보고, 직접 Windows/계정 검증을 구분해 `docs/releases/버전.md`와 `docs/STATUS.md`에 기록한다.
5. 소스에 계정·개인 보고서·runtime 데이터·서명키가 없는지 확인한다. 별도 PC 저장소의 작업이 Android에 반영되지 않았음을 확인한다.

## Windows 묶음

Python 3과 공식 Electron 다운로드가 가능한 환경이 필요하다. 캐시는 저장소 밖에 둔다.

PowerShell 예시:

```powershell
$env:DOCTOR_GLEAN_ELECTRON_CACHE = "$env:LOCALAPPDATA/DoctorGleanPC-BuildCache"
npm run build:developer
npm run build:distribution
```

Linux/macOS 예시:

```sh
DOCTOR_GLEAN_ELECTRON_CACHE=/path/outside/repository/electron-cache npm run build:developer
DOCTOR_GLEAN_ELECTRON_CACHE=/path/outside/repository/electron-cache npm run build:distribution
```

`../output/pc/버전/에디션`에 전체 ZIP, 안내, SHA256SUMS, 파일별 BUILD_VERIFICATION을 만든다. 빌드된 `resources/app`로 관리 창 검사를 다시 수행하고 두 에디션을 같은 테스트 appData 상위 경로에서 실행해 저장소 분리를 확인한다. 배포용에 개발자 전용 기록기·추가 preload·API·화면이 들어가지 않았는지 확인한다.

작은 패치는 기존/대상 빌드 디렉터리를 지정한다.

```sh
node scripts/build-app-patch.mjs --from=/old/artifact/developer --to=/new/artifact/developer --edition=developer --output=/patch/output
```

정확한 버전·에디션·runtime 해시가 맞을 때만 생성된다. 임의로 버전 표시만 바꾸거나 이전 app에 파일을 섞어 넣지 않는다. 사용자에게 프로그램 완전 종료 → app 백업 → resources/app 전체 교체 → 버전 확인을 안내한다. Electron/runtime이 바뀌면 전체 묶음이다.

## 소스 기준점과 게시

- `npm run source:pack`으로 허용 목록의 소스·문서·합성 검사·vendor만 묶는다. 개인 보고서·verification·브라우저·계정 파일·실행파일·캐시는 제외한다. SOURCE_MANIFEST의 해시는 무결성 대조 자료이며 전자서명으로 표현하지 않는다.
- 기준 커밋과 `pc-source-v앱버전` 태그를 연결한다. 릴리스 노트에 소스 커밋/태그, 항목 수·검증 환경·남은 확인, 전체/패치 SHA를 기록한다.
- GitHub 자격증명은 운영자가 OS/CLI의 인증으로 제공한다. 토큰·서명키·기존 개인 인증 스크립트를 저장소나 소스 ZIP에 넣지 않는다.
- 새 자산의 크기·서버 SHA·다운로드를 대조한 뒤 distribution만 prerelease로 공개한다. PC 저장소의 target_commitish는 검증한 소스 커밋으로 지정한다. 기존 Android 저장소의 latest를 바꾸지 않는다. 이전 릴리스·자산은 교체하거나 삭제하지 않는다.
- developer 초안은 편집 후 release ID로 다시 조회해 현재 주소를 확인한다. 임시 untagged URL은 편집하면 바뀔 수 있다. 영구 안내는 관리자·쓰기 권한 collaborator가 GitHub 로그인 후 같은 PC 저장소의 Releases 목록이다. 일반 사용자의 404는 정상이다.
- 공개 이후 수정은 새 버전으로 배포한다. 기존 ZIP을 같은 이름으로 갈아 끼우지 않는다.

## preview.10 수동 Draft 업로드 작업

현재 실행 환경에서 GitHub API 조회는 가능하지만 업로드 주소가 401을 반환하여, 관리자의 게시 요청에 한해 `PC preview.10 manual Draft assets`를 수동 실행한다. 자동 push·PR·예약 실행이나 공개 게시 기능은 없다. `issackr580`만 실행하며 고정 소스 `2aef5b3`, 기존 preview.10 Draft ID, 기존 preview.9 패치 기준 자산을 사용한다. 이미 검증한 두 Windows 묶음과 소스의 파일별 해시 전체가 일치해야 업로드한다. 공식 GitHub runner의 일시적 `GITHUB_TOKEN`만 쓰며 별도 계정·서명 비밀을 추가하지 않는다.

이 작업은 developer와 distribution을 모두 Draft로 유지한다. 담당자는 업로드된 파일을 다운로드해 해시·에디션·소스·패치를 확인한 뒤 distribution만 별도로 prerelease로 공개한다. 개발자 바이너리를 공개 Actions artifact로 저장하지 않는다. 기존 자산 교체·삭제와 모바일 저장소 변경은 하지 않는다.

## Windows 확인

최소 확인은 시작·트레이 복원·명시적 종료, 업데이트 후 기존 데이터, 계정 저장/복호화, 로그인 만료 복구, 전체 중지, 재시작 중복 제출 방지다. 사이트별로 실제 입장·목적지·재생·적립을 따로 확인한다. Linux 검사 통과를 Windows·실계정 성공으로 확대하지 않는다.
