# PC판 현재 인계 — preview.29

| 항목 | 기준 |
|---|---|
| 제품 | Windows PC 전용, Electron45.0.0 / Node24/npm11 개발 |
| 실행판 | 0.1.0-preview.29 |
| 실행 소스 | 331f7632c8537d20a8ccc680fc2dedf5d1097250 / pc-source-v0.1.0-preview.29 |
| 배포용 | https://github.com/issackr580/doctor-glean-pc/releases/tag/pc-v0.1.0-preview.29 |
| 개발자용 | Releases의 preview.29 협업자 전용 Draft, ID434327358 |
| 서명 피드 | updates/preview.json, 실제 서버 패치 메타데이터로 외부 관리자 키 서명 |

먼저 [기능별 조사](PORTING_V139.json)·[구현과 PC 정책 차이](PORTING_V139.md)·[수용 항목](PORTING_V139_ACCEPTANCE.json)을 읽는다. v28을 기준으로 별도 작업본에서 구현했고 모바일 참고 코드/과거 문서를 Windows 성공 증거로 사용하지 않았다.

닥플 C01/LIVE 조회·공개 ID별 신청 완료 강의 입장, 기존 출석 계정 공유와 독립 opt-in, 후다닥/디톡스3회형·한미5회형, 일반 일정 두 checkpoint와 닥터빌 D26 최신 상세 복구를 구분한다. 퀴즈별 pending fuse·종근당 daily lease·6/7 라운지·설문 읽기/알림/제외·일일 선택·메모·보고 미리보기·정확 외부 host 설정을 연결했다. 기존 PC 로그인 quota·DPAPI·프로필·계정/동의·예약/취소/시도·에디션 분리와 Ed25519 updater/helper는 유지한다. 새 닥플 조회/입장은 기존 설정에 자동 추가하지 않는다.

Node321·구문·Linux Electron45/Xvfb 합성 HTTPS 관리115·자동30·계정121·입장272·replay136·신청193·업데이트23, Electron 전체890개와 최종 Windows resources/app의 Linux 관리 창 개발자115/배포101·에디션 데이터 분리·깨끗한 소스210파일·의존성/Node321/구문 재현, 같은 에디션20~28의 실제 ZIP runtime·전체 app 패치 교체18경우를 확인했다. 시작/종료 입력 SHA는 0c8c9ebfb5d35005c77d5ad16d03d969b1e6fa35c118fbf67b068f95b501b1c5다. [수동 업로드](https://github.com/issackr580/doctor-glean-pc/actions/runs/41893646993) 뒤12개 자산 재다운로드·서버 SHA/체크섬·ZIP 내부 전체·독립 웹 공개/404 경계를 확인했다. 배포용만 공개하고 개발자용은 Draft다. 완료한 임시 workflow는 제거한다.

실제 Windows DPAPI·회원 로그인/원래 DOM·입장/재생/출석/보상·알림·절전/복귀/재부팅·실제 GitHub 로그인/버튼 설치는 별도 미확인이다. 클릭/허용 이동/watch 문서 로드를 재생·적립으로 표시하지 않는다. 진단/조회/업데이트로 필수 소비·quiz pending·daily lease를 초기화하지 않는다. 서명 개인키·개인 ZIP/로그·계정/쿠키/토큰·Android APK/키를 소스/배포에 넣지 않는다. 모바일 제품/릴리스와 과거 PC 자산은 변경하지 않았다.

다음 제품 변경은 새 버전으로 만든다. 사용자 설정과 필수 시도는 보존하고 [배포](RELEASE_PROCESS.md)·[업데이트](UPDATES.md) 절차를 따른다. Windows 코드서명과 피드 서명을 혼동하지 않는다.
