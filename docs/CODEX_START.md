# PC판 Codex 작업 시작

이 작업은 의사 이삭 줍기 **Windows PC판만** 다룬다. 모바일판은 별도 Codex 작업이다. 사용자 지시가 이 문서보다 우선한다.

1. 이 저장소를 작업 루트로 연다. 현재 환경에서는 `/workspace/doctor-glean-pc`다. 새 환경에서는 `https://github.com/issackr580/doctor-glean-pc`를 clone하거나 PC 시작 묶음의 `project` 폴더를 연다.
2. `AGENTS.md` → 이 문서 → [현재 인계](CODEX_HANDOFF.md) → `CONTRIBUTING.md` → `DEVELOPMENT_POLICY.md` → `STATUS.md` → `ARCHITECTURE.md` 순서로 읽는다.
3. Git 상태·현재 commit·앱 버전을 확인한다. 기존 사용자 변경은 보존한다. 현재 실행판은 **0.1.0-preview.25**이며 다음 제품 변경은 새 버전으로 만든다.
4. Node24/npm11, lockfile, Electron45.0.0을 사용한다. `npm ci`, `npm test`, `npm run check`가 기본이다. 관련 동작 변경은 `npm run test:electron`도 실행한다. 처음 받은 묶음의 manifest 대조만을 위해 제품 회귀 전체를 반복할 필요는 없다.
5. 이슈별 브랜치·PR로 작업하고 STATUS에 근거와 남은 확인을 갱신한다. 빌드·게시 시 `RELEASE_PROCESS.md`와 `ACCESS.md`를 따른다.

## 작업 경계

- 모바일 소스·APK·서명·릴리스를 변경하지 않는다. Android 원본이 없어도 `vendor` 스냅샷으로 개발·검사할 수 있다.
- 모바일 수정이 필요하면 이식 제안과 관련 근거를 남긴다. PC vendor 자동 동기화·다른 작업 폴더의 직접 수정은 하지 않는다.
- 서버·운영비·기기 연동·iPhone 조작·WOL·절전 해제는 추가하지 않는다.
- 소스와 배포용은 공개 PC 저장소, 개발자용 실행물은 같은 저장소의 지정 collaborator 전용 Draft다. GitHub 초대는 사용자가 관리한다.
- 계정·원문 로그·키·토큰은 소스나 작업 시작 묶음에 넣지 않는다. 기존 환경의 인증은 외부 비밀 저장소에서만 사용한다.

## 작업을 마칠 때

변경·실행한 검사·실기기 미확인·다음 작업을 STATUS와 관련 릴리스 기록에 남긴다. 새 자료 묶음은 새 날짜/이름으로 만들며 과거 공개 ZIP·태그·실행물은 덮어쓰지 않는다. PC 실행 코드가 바뀌지 않은 문서 정리로 새 제품 버전을 발행하지 않는다.
