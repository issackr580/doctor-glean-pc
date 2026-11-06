# PC판 현재 인계 — preview.30

후속 구현: preview.31 공식 ID 연결을 별도 작업본에서 검증 중이다. [사전 조사/지원 화면/저장 호환](PORTING_ID_V148.md)·[수용표](PORTING_ID_V148_ACCEPTANCE.json)·PC-020을 읽는다. 아래 표는 직전 공개본이다. 실행 소스와 게시 결과는 확정 뒤 별도 기록한다.

| 항목 | 기준 |
|---|---|
| 제품 | Windows PC 전용, Electron45.0.0 / Node24/npm11 개발 |
| 실행판 | 0.1.0-preview.30 |
| 실행 소스 | 8848de5fa086d235778fac3a6d5d05b9cf49c454 / pc-source-v0.1.0-preview.30 |
| 배포용 | https://github.com/issackr580/doctor-glean-pc/releases/tag/pc-v0.1.0-preview.30 |
| 개발자용 | Releases의 preview.30 협업자 전용 Draft, ID436459401 |
| 서명 피드 | updates/preview.json, 실제 서버 패치 메타데이터로 외부 관리자 키 서명 |

[PC-019](STATUS.md)·D29·[v30 기록](releases/0.1.0-preview.30.md)을 읽는다. preview.29 위의 별도 fix/nov06-entry-reliability 작업본에서 수정했다. 기존 v139 [기능별 조사](PORTING_V139.json)·[PC 적용 차이](PORTING_V139.md)·[수용 항목](PORTING_V139_ACCEPTANCE.json)은 v29 이식의 역사적 기준이며 Windows 성공 증거가 아니다.

닥터빌 상세의 제목 미발견 때 현재 목록 GET과 관측 단일 상세를 한 번 재확인한다. 전체 제목·날짜·첫 시작·기존 검증 identity·원래 버튼·필수 소비를 요구한다. 부분 제목/이미지/표기 차이는 진단일 뿐이다. 디톡스 고정 목록 GET의 HTTP 로그인 이동은 차단하고 query 없는 고정 HTTPS 로그인 GET으로 기존 복구 wrapper를 이어 원래 목록에 복귀한다. 자격/입장 전송 뒤·다른 목적지·취소에는 대체하지 않는다. 키메디 라운지는 개장 후 시작한 새 GET으로 당일 완료를 확인한다. 9사이트 개발자 입장 진단의 enum/개수를 보강한다.

Node326·구문·Linux Electron45/Xvfb 합성 HTTPS 조회115·일일30·계정121·입장314·replay136·신청193·업데이트23, Electron 전체932개와 최종 Windows resources/app의 Linux 관리 창 개발자115/배포101·에디션 데이터 분리·깨끗한 소스212파일·의존성/Node326/구문 재현, 같은 에디션20~29의 실제 ZIP runtime·전체 app 패치 교체20경우를 확인했다. 고정 입력 시작/종료 SHA는 84b4255e009bf4fbe6cd199e54408f5bb72aa849ffbd3162c5f7398d5126836f로 같다. [소유자 수동 업로드](https://github.com/issackr580/doctor-glean-pc/actions/runs/42216002313) 뒤12개 자산 재다운로드·서버 SHA/체크섬·ZIP 내부 전체·독립 웹 공개/404 경계를 확인했다. 배포용만 공개하고 개발자용은 Draft다. 완료한 임시 workflow를 제거한다.

실제 Windows/DPAPI·회원 DOM/로그인·입장/재생/출석/보상·알림/절전/복귀/재부팅·GitHub 로그인/버튼 설치는 별도 미확인이다. 실사용 제목 미발견의 정확한 DOM 원인은 미확정이다. 클릭/이동을 재생·적립으로 표시하지 않는다. 사용자 계정·선택·예약·취소/시도·quiz pending/daily lease·에디션 분리·updater/helper·vendor/모바일을 유지한다. 진단 삭제/목록 갱신/업데이트로 소비를 초기화하지 않는다.

서명 개인키·개인 ZIP/로그·계정/쿠키/토큰·Android APK/키를 소스/배포에 넣지 않는다. 다음 제품 변경은 새 버전으로 하고 [배포](RELEASE_PROCESS.md)·[업데이트](UPDATES.md) 절차를 따른다. Windows Authenticode와 PC 업데이트 서명은 다르다.
