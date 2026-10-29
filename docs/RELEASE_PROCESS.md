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

## preview.10 수동 Draft 업로드 기록

현재 실행 환경에서 API 조회는 가능하지만 업로드 주소가 401을 반환하여, 관리자의 게시 요청에 따라 [수동 GitHub runner 작업](https://github.com/issackr580/doctor-glean-pc/actions/runs/40433499579)으로 고정 소스 `2aef5b3`을 빌드하고 기존 preview.10 Draft에 업로드했다. 검증한 두 Windows 묶음과 소스의 파일별 해시 전체가 일치했고 기존 preview.9 자산의 SHA와 runtime으로 패치를 확인했다. 공식 runner의 일시적 `GITHUB_TOKEN`만 사용했다.

작업은 두 에디션을 Draft로 유지했다. 담당자가 모든 파일을 다시 다운로드해 해시·에디션·소스·패치를 대조한 후 distribution만 별도 API 동작으로 공개했다. developer는 Draft이며 바이너리를 공개 Actions artifact에 저장하지 않았다. 기존 자산·모바일 저장소는 변경하지 않았다. 완료한 일회성 workflow와 보조 스크립트는 제거했으며 자동 게시·예약·push/PR 실행 기능은 남기지 않는다.

## Windows 확인

최소 확인은 시작·트레이 복원·명시적 종료, 업데이트 후 기존 데이터, 계정 저장/복호화, 로그인 만료 복구, 전체 중지, 재시작 중복 제출 방지다. 사이트별로 실제 입장·목적지·재생·적립을 따로 확인한다. Linux 검사 통과를 Windows·실계정 성공으로 확대하지 않는다.

## preview.11 게시 확인

디톡스 수정판도 같은 인증401 조건에서 관리자가 요청한 [수동 runner 작업](https://github.com/issackr580/doctor-glean-pc/actions/runs/40446297112)으로 고정 소스 `aaa022d`과 검증본 해시를 대조해 기존 Draft에만 업로드했다. 전체/10→11 패치/소스 ZIP을 다시 다운로드해 서버 SHA·체크섬·모든 내부 파일을 확인한 후 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft다. 완료한 일회성 workflow와 보조 스크립트는 제거했으며 자동 게시·예약 실행·개발자 바이너리 공개 Actions artifact는 없다.

## preview.12 게시 확인

[관리자의 수동 runner 실행](https://github.com/issackr580/doctor-glean-pc/actions/runs/40458040865)은 고정 소스 `7e7d224`와 로컬 검증본의 전체 파일 해시·기존 v11 자산 SHA를 대조한 뒤 기존 Draft에만 업로드했다. 임시 도구는 workflow 안에만 포함해 별도 소스 허용 목록을 확장하지 않았다. 전체/11→12 패치/소스 ZIP을 다시 내려받아 서버 SHA·체크섬·모든 내부 파일을 검증한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft다. 독립 웹 조회로 공개/404 접근 경계를 확인했다. 완료한 일회성 workflow는 제거했으며 자동 게시·예약 실행·공개 개발자 artifact는 없다. 과거 릴리스·자산·모바일 저장소는 변경하지 않았다.

## preview.13 게시 확인

[수동 runner 실행](https://github.com/issackr580/doctor-glean-pc/actions/runs/40462379382)은 고정 소스 `dda21f8`과 검증본 전체 파일 해시·기존 v12 자산 SHA를 확인해 기존 두 Draft에만 업로드했다. 모든 자산을 다시 다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이며 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 일회성 workflow를 제거했고 자동 게시·예약 실행·공개 개발자 artifact는 없다. 이전 릴리스·자산·모바일은 변경하지 않았다.

## preview.14 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40467527545)은 고정 소스 `4c70dfc`와 검증본 전체 파일 해시·기존 v13 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. 전체/13→14 패치/소스를 다시 다운로드해 서버 SHA·체크섬·내부 파일 전체를 검증한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이고 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 임시 workflow를 제거했으며 자동 게시·예약 실행·공개 개발자 artifact는 없다. 이전 릴리스·자산·모바일은 변경하지 않았다.

## preview.15 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40473417663)는 고정 소스 `c3396bb`와 검증본 전체 파일 해시·기존 v14 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. 전체/14→15 패치/소스를 다시 다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 검증한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이며 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 일회성 workflow는 제거했고 자동 게시·예약 실행·공개 개발자 artifact는 없다. 이전 릴리스·자산·모바일은 변경하지 않았다.

## preview.17 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40511855754)는 고정 소스 `38e10e9`와 검증본 전체 파일 해시·기존 v16 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. 전체/16→17 패치/소스를 다시 다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 검증한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이며 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 일회성 workflow는 제거했고 자동 게시·예약 실행·공개 개발자 artifact는 없다. 이전 릴리스·자산·모바일은 변경하지 않았다.

## preview.18 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40520597729)는 고정 소스 `39e21a1`와 검증본 전체 파일 해시·기존 v17 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. 전체/17→18 패치/소스를 다시 다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 검증한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이며 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 일회성 workflow는 제거했고 자동 게시·예약 실행·공개 개발자 artifact는 없다. 이전 릴리스·자산·모바일은 변경하지 않았다.

## preview.19 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40644682408)는 고정 소스 `75372e0`와 검증본 전체 파일 해시·기존 v18 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. 전체/18→19 패치/소스를 다시 다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 검증한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이며 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 일회성 workflow는 제거했고 자동 게시·예약 실행·공개 개발자 artifact는 없다. 이전 릴리스·자산·모바일은 변경하지 않았다.

## preview.20 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40670979779)는 고정 소스 `ec2056e`와 검증본 전체 파일 해시·기존 v19 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. 전체/19→20 패치/소스를 재다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 검증한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이며 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 일회성 workflow를 제거하고 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 이전 릴리스·자산·모바일은 변경하지 않았다.

## preview.21 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40794729941)는 고정 소스 `3687d014c5f6482c322d9b7ab502ef58c73a8d61`와 검증본 전체 파일 해시·기존 v20 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. Node223·Linux Electron447·최종 Windows 묶음의 Linux Electron 관리 창 개발자94/배포80·에디션 분리·깨끗한 소스166파일·20→21 동일 runtime 패치를 확인했다.12개 자산을 재다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이고 독립 웹 공개/404 경계를 확인했다. 완료한 임시 workflow를 제거하며 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 실제 Windows/실계정은 별도 확인이며 과거 릴리스/자산·모바일은 변경하지 않았다.

## preview.22 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40800093777)는 고정 소스 `e456938bc4fb82a4405ae76864b0453ebb147e05`와 검증본 전체 파일 해시·기존 v21 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. Node233·Linux Electron651·최종 Windows 묶음의 Linux Electron 관리 창 개발자105/배포91·에디션 분리·깨끗한 소스170파일·21→22 동일 runtime 패치를 확인했다.12개 자산을 재다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이고 독립 웹 공개/404 경계를 확인했다. 완료한 임시 workflow를 제거하며 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 실제 Windows/실계정은 별도 확인이며 과거 릴리스/자산·모바일은 변경하지 않았다.

## preview.23 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40823807440)는 고정 소스 `d8f4e707ad65233e0d75ffc2c95aab3165176796`와 검증본 전체 파일 해시·기존 v22 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. Node233·Linux Electron672·최종 Windows 묶음의 Linux Electron 관리 창 개발자105/배포91·에디션 분리·깨끗한 소스171파일·22→23 동일 runtime 패치를 확인했다.12개 자산을 재다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 별도 API 동작으로 공개했다. 개발자용은 Draft이고 독립 웹 공개/404 경계를 확인했다. 완료한 임시 workflow를 제거하며 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 실제 Windows/실계정은 별도 확인이며 과거 릴리스/자산·모바일은 변경하지 않았다.

## preview.24 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40842971586)는 고정 소스 `7c670f8d28c50b7f3e0cc2d43823631f3f2e4673`와 로컬 검증본 전체 파일 해시·기존 v23 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. Node234·구문·Linux Electron45/Xvfb 합성 HTTPS 관리105·자동30·계정121·입장110·replay136·신청193, Electron 전체695개·최종 Windows resources/app의 Linux Electron 관리 창 개발자105/배포91·같은 상위 appData의 에디션 분리·깨끗한 소스172파일·의존성·Node234·구문 재현·23→24 패치와 같은 에디션20/21/22/23 직접 교체8경우를 확인했다.12개 자산을 재다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 공개했다. 개발자 Draft·독립 웹 공개/404 경계를 확인했고 완료한 임시 workflow를 제거한다. 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 실제 Windows/인증 사이트는 별도 확인이며 과거 릴리스/자산·모바일은 변경하지 않았다.

## preview.25 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40849753664)는 고정 소스 `484f839e265408bec749c1d5dd2dd92b7f681fce`·검증본 전체 파일 해시·기존 v24 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. Node245·구문·Linux Electron45/Xvfb 합성 HTTPS 관리106·자동30·계정121·입장142·replay136·신청193, Electron 전체728개·최종 Windows resources/app의 Linux Electron 개발자106/배포92·같은 상위 appData의 분리·깨끗한 소스175파일·의존성·Node245·구문 재현·24→25 패치와 같은 에디션20/21/22/23/24의 직접 교체10경우를 확인했다.12개 자산 재다운로드·서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 공개했다. 개발자 Draft·독립 웹 공개/404 경계를 확인했고 완료한 임시 workflow를 제거한다. 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 실제 Windows/인증 사이트는 별도 확인이며 과거 릴리스/자산·모바일은 변경하지 않았다.

## preview.26 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40860461062)는 고정 소스 `5f1c2c26da5028f022b9ab1f63643204e9111692`·검증본 전체 파일 해시·기존 v25 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. Node247·구문·Linux Electron45/Xvfb 합성 HTTPS 관리106·자동30·계정121·입장157·replay136·신청193, Electron 전체743개·최종 Windows resources/app의 Linux Electron 개발자106/배포92·같은 상위 appData의 분리·깨끗한 소스176파일·의존성·Node247·구문 재현·같은 에디션20/21/22/23/24/25의 실제 runtime·작은 패치 전체 app 교체가 목표 전체 ZIP과 같은12경우를 확인했다.12개 자산 재다운로드·서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 공개했다. 개발자 Draft·독립 웹 공개/404 경계를 확인했고 완료한 임시 workflow를 제거한다. 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 실제 Windows/인증 사이트는 별도 확인이며 과거 릴리스/자산·모바일은 변경하지 않았다.

## preview.27 게시 확인

[수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40871660909)는 고정 소스 `c1b6637d04484064f3f347f7982350f79f325bab`·검증본 전체 파일 해시·기존 v26 자산 SHA를 대조해 기존 두 Draft에만 업로드했다. Node276·구문·Linux Electron45/Xvfb 합성 HTTPS 관리107·자동30·계정121·입장218·replay136·신청193, Electron 전체805개·최종 Windows resources/app의 Linux Electron 개발자107/배포93·같은 상위 appData의 분리·깨끗한 소스179파일·의존성·Node276·구문 재현·같은 에디션20/21/22/23/24/25/26의 실제 runtime·작은 패치 전체 app 교체가 목표 전체 ZIP과 같은14경우를 확인했다.12개 자산 재다운로드·서버 SHA·체크섬·ZIP 내부 파일 전체를 대조한 뒤 배포용만 공개했다. 개발자 Draft·독립 웹 공개/404 경계를 확인했고 완료한 임시 workflow를 제거한다. 자동 게시·예약 실행·공개 개발자 artifact는 남기지 않는다. 실제 Windows/인증 사이트는 별도 확인이며 과거 릴리스/자산·모바일은 변경하지 않았다.

## preview.28 게시와 버튼 업데이트 피드

고정 소스 `36bd10d100bdbdc4ac4273b4125e16138d9c189f`에 Node300·구문·Linux Electron45/Xvfb 합성 HTTPS 관리109·자동30·계정121·입장218·replay136·신청193·업데이트23, Electron 전체830개·최종 Windows resources/app의 Linux Electron 개발자109/배포95·에디션 데이터 분리·깨끗한 소스195파일·의존성·Node300·구문 재현·같은 에디션20/21/22/23/24/25/26/27의 실제 ZIP runtime·전체 app 패치 교체가 목표 전체 ZIP과 같은16경우를 확인했다. [수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/40897446074) 뒤12개 자산 재다운로드·서버 SHA·체크섬·ZIP 내부 전체를 대조하고 배포용만 공개했다. 개발자 Draft·독립 웹 공개/404 경계를 확인했다. 실제 서버 패치의 이름/원래 URL/SHA/크기·소스·호환 버전만 외부 개인키로 서명한 피드를 PR로 기록하고 공개키로 검증한다. [D27 유지보수 절차](UPDATES.md)를 따른다. 완료한 임시 workflow를 제거하며 원래 실행 소스·태그·기존 자산·모바일은 변경하지 않는다. 실제 Windows·실제 GitHub 인증은 별도 확인이다.
