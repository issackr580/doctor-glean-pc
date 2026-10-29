# PC판 공동 개발 기준

이 저장소는 Windows용 의사 이삭 줍기 PC판의 소스다. Android와 독립적으로 개발하며, 같은 기능 이름이 있어도 PC에서 확인한 근거를 별도로 남긴다.

## 처음 합류할 때

1. [개발 방침](docs/DEVELOPMENT_POLICY.md), [현재 상태](docs/STATUS.md), [구조](docs/ARCHITECTURE.md)를 순서대로 읽는다.
2. Node.js 24.19.x와 npm 11.x를 설치한다. `.nvmrc`와 `package-lock.json`을 기준으로 `npm ci`를 실행한다.
3. `npm test`, `npm run check`를 실행한다. `npm start`는 로컬 개발자용 관리 창을 연다.
4. 테스트용 본인 계정만 앱 화면에서 입력한다. 아이디·비밀번호·쿠키·토큰을 이슈, 채팅, 코드, 테스트 fixture에 쓰지 않는다.
5. Android 원본이 없어도 `vendor/` 스냅샷으로 개발·검사한다. 원본 갱신이 필요한 경우에만 [엔진 동기화 절차](docs/ARCHITECTURE.md#엔진-스냅샷)를 따른다.

Windows 빌드·소스 ZIP 생성에는 PATH에서 실행되는 Python 3도 필요하다. 최종 앱 사용자에게 Node나 Python 설치를 요구하지 않는다.

## 작업과 리뷰

- 이슈 또는 `docs/STATUS.md`의 작업 ID로 범위를 정한다. 한 PR은 한 문제 또는 한 기능을 다룬다.
- `fix/문제명`, `feat/기능명`, `docs/문서명` 브랜치에서 작업한다. `main`에 직접 밀어 넣지 않는다. 최초 기준 커밋만 예외다.
- PR 설명은 발생 조건, 변경 후 동작, 검증 근거, 남은 확인으로 작성한다. [PR 양식](.github/pull_request_template.md)을 사용한다.
- 관리자가 검토한 뒤 squash merge한다. 저장소 보호 규칙 사용 여부와 관계없이 이 절차를 지킨다. 유료 요금제 가입을 전제로 하지 않는다.
- 제품 범위·기본 설정·저장 형식·사이트 허용 범위·배포 공개 범위 변경은 코드 변경과 구분해 PR에 명시한다.
- 기능·검증·남은 문제가 바뀌면 `docs/STATUS.md`를 같은 PR에서 갱신한다. 결정 사항은 `docs/DECISIONS.md`에 남긴다.

## 구현 규칙

ES modules와 기존 코드의 작은 모듈 구성을 유지한다. UTF-8/LF, 공백 2칸을 사용하되 관련 없는 파일 전체의 스타일을 바꾸지 않는다. 새 프레임워크·서비스·의존성은 필요성과 비용을 설명한 뒤 별도 결정한다.

- 사이트 페이지에는 Node·관리 IPC를 노출하지 않는다. sandbox·contextIsolation·TLS 검증을 유지한다.
- 원래 사이트의 버튼·처리기를 사용한다. 보안 확인, 시청시간, 적립 조건을 조작하지 않는다.
- 외부 제출 전에 실행 기록을 저장한다. 실패한 저장, 다른 문서로의 이동, 결과 불확실 상황에서 같은 작업을 다시 제출하지 않는다.
- 로그인 결과 읽기는 로딩 완료 후의 URL·문서 버전에 연결한다. 비밀번호 전달은 준비 상태를 확인한 같은 문서에만 허용한다.
- 계정은 Windows DPAPI로만 보관한다. 보호 저장소가 없으면 중지한다. 평문 대체나 Chrome/Edge/휴대폰 프로필 가져오기를 추가하지 않는다.
- 수동 창을 보호하고 날짜·제목·시각이 맞는 강의만 대상으로 삼는다. 클릭·이동·재생·완료를 각각 기록한다.
- 실제 사용자의 설정·세션·시도 파일을 삭제하거나 덮어써서 문제를 해결하지 않는다. 저장 형식 변경은 기존 자료를 보존하는 이관·실패 처리와 함께 검토한다.
- `src/preload-developer.cjs`, `ui/edition-ui.js`는 `npm start` 전 준비 스크립트가 생성한다. 원본은 공통 preload와 `editions/`에서 수정한다.

## 검사

```sh
npm ci
npm test
npm run check
npm run test:electron
```

Electron 검사는 합성 HTTPS와 합성 계정만 사용한다. Windows에서는 가상 화면이 필요 없다. Linux에서는 DISPLAY 또는 Xvfb가 필요하며 실행기가 가상 화면을 준비한다. Linux 컨테이너 제약으로 OS sandbox 실행이 불가능한 경우에만 `npm run test:electron -- --container-no-sandbox`를 명시한다. 이 옵션은 검사 프로세스에만 적용되며 제품 설정으로 옮기지 않는다.

단일 검사: `npm run test:electron -- --suite=credentials`. 빌드된 앱의 관리 창 검사: `npm run test:electron -- --suite=catalog --application=빌드폴더/resources/app`. 자동 작업·계정 검사는 현재 소스의 원래 엔진을 사용한다. 제품 빌드와 소스 일치 여부는 [배포 절차](docs/RELEASE_PROCESS.md)에서 별도로 확인한다.

코드의 결과를 그대로 따라 쓰는 테스트 대신 오류가 발생한 조건을 재현한다. 제출 수, 제출 전 저장, 문서 교체, 취소·재시작, 실제 완료 근거 등 관찰 가능한 결과를 검증한다. 낮은 영향의 문구 변경에 불필요한 테스트를 추가하지 않는다.

## 개발자 진단

재현 전에 개발자용의 **7일 진단 켜기**를 사용하고 실패 직후 JSON을 내보낸다. [수집 절차·스키마·보관·개인정보 기준](docs/DIAGNOSTICS.md)을 따른다. 실행 빌드·Git commit·발생 시각과 최근 작업 경로를 함께 남기며 실제 사용자 원본은 커밋하지 않는다.

## 자료와 공개 범위

`verification/`에는 로컬 검사 산출물만 둔다. 이 폴더는 Git·소스 ZIP에서 제외한다. 사용자가 보내준 보고서·캡처는 커밋하지 않는다. 공유할 근거는 계정·원문을 제거한 요약, 합성 재현, 고정 코드·개수로 문서화한다.

사용자의 2026-10-26 결정에 따라 소스와 distribution 실행파일을 같은 공개 PC 저장소에서 관리한다. 관리자가 정한 개발자만 collaborator로 초대한다. 선정 전에는 원본 쓰기 권한 없이 fork 후 PR로 작업할 수 있다. 공개 실행파일은 distribution만 대상이고 developer ZIP은 같은 PC 저장소의 협업자 전용 Draft로 공유한다. Draft 열람에는 쓰기 권한이 필요하며 코드·릴리스 편집 권한도 함께 생긴다. [권한 운영 기준](docs/ACCESS.md)을 따른다. 공개 라이선스·저작권 정책은 별도 결정 전 임의로 추가하지 않는다.

CI 예시는 `docs/ci/manual-check.yml`에 있으며 자동 설치하지 않는다. 관리자가 무료 실행 한도와 권한을 확인한 뒤 원하면 `.github/workflows/`로 옮긴다. 자동 릴리스·정기 실행·계정 비밀정보는 연결하지 않는다.

입력 SHA와 실제 검사 개수를 연결한 전체 소스·합성 검사는 `npm run verify:pc`다. 기존 개별 명령도 유지한다. [회차 진단·재현·검증 흐름](docs/QUALITY_WORKFLOW.md)에 선택 보고, 실패/부분 검사, Windows 검증과 배포의 구분을 설명한다.
