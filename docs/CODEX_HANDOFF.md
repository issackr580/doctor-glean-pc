# PC판 인계 — 2026-10-27

## 기준점

| 항목 | 값 |
|---|---|
| 제품 | Windows 독립 상주 앱, Electron45.0.0 |
| 실행판 | 0.1.0-preview.15 |
| 실행 소스 commit | c3396bb69be92da43277099b3b8a1bde57a63399 |
| 실행 소스 태그 | pc-source-v0.1.0-preview.15 |
| 소스 저장소 | https://github.com/issackr580/doctor-glean-pc |
| 배포용 | https://github.com/issackr580/doctor-glean-pc/releases/tag/pc-v0.1.0-preview.15 |
| 개발자용 | 같은 저장소 Releases의 preview.15 협업자 전용 Draft, release ID425187995 |

이 문서는 실행 소스 태그 이후의 게시 확인이다. 이미 게시한 ZIP·태그·이전 자산은 교체하지 않는다. 과거 시작 묶음은 v9 기준이므로 최신 GitHub 인계와 구분한다.

## 마지막 수정과 검증

한미 기존 조회기는 제목 앞 클래스 없는 시각을 지원했지만 v14 PC 입장 보완은 `.top .time`만 읽었다. 블루팜은 최소 일시 필드 대신 연자·포인트가 섞인 전체 메타데이터를 읽어 일정을 거부했다. 같은 실제 Electron 합성 DOM에서 원래 조회 성공·PC 입장 실패를 재현했고 v15에서 두 판독의 일치를 확인했다. 날짜·요일·인접성·충돌·다시보기·복수 일정·기한·원래 버튼·한미5슬롯·제출 전 영속 기록은 유지한다.

닥터빌 자동 로그인은 정상 수동 창과 같은 인코딩된 고정 URL로 통일했다. 제출 전 policy_rejected는 blocked로 구분하며 trace에는 providerPath/callbackState의 고정 enum만 추가한다. 주소·callback 값·계정은 남기지 않는다. 허용 경로·callback·인증 근거·복호화 시점·불확실 재전송 금지는 유지한다. 이전 URL의 익명 Linux GET은 정상이라 실제 Windows 주소 정책 불일치 원인은 미확정이다.

Node176·구문, 실제 Linux Electron45/Xvfb 합성 HTTPS 관리 창71·자동 작업28·계정91·PC 입장43을 확인했다. 최종 Windows 묶음 관리 창 개발자71/배포65·같은 appData 상위 경로의 에디션 분리, 깨끗한 소스147파일 재현·14→15 동일 runtime 패치를 확인했다. [수동 업로드](https://github.com/issackr580/doctor-glean-pc/actions/runs/40473417663)에서 고정 소스·검증본 전체 파일 해시·기존 v14 SHA를 대조해 기존 두 Draft에만 업로드했다. 모든 자산을 다시 다운로드해 서버 SHA·체크섬·ZIP 내부 파일 전체를 검증한 뒤 배포용만 공개했다. 개발자용은 Draft이고 독립 웹 조회로 공개/404 경계를 확인했다. 완료한 임시 workflow는 제거했으며 자동 게시·예약 실행·공개 개발자 artifact는 없다. 과거 릴리스·자산은 변경하지 않았다.

## Windows 보고와 다음 작업

1. 추가 v14 보고는16:36 시작·16:54 내보내기다. 사전 검사10건은 로그인5·시작 전 대기2·미확정3이다. 키메디/인터엠디는 대상 확인·시작 전 대기, 닥터빌5건은 로그인, 한미/블루팜은 제목1·일정0, 메디게이트는 대상2개다. 새 정시 입장 기록은 없고 과거 한미5회 클릭·이동·영상 inaccessible를 이번 성공으로 소급하지 않는다.
2. 닥터빌 복구는 제출 전 약185ms·판독0의 policy_rejected이며 originAllowed=true/navigationAllowed=false/loginRoute=false였다. 사용자는 수동 로그인 창이 정상이라고 확인했다. v15의 고정 진입점과 providerPath/callbackState를 Windows에서 재확인한다. 기존 강의5건은 stale다. 후다닥 이전 실패 뒤 자동 재시도 제한은 유지한다. 메디게이트의 entryControls0은 모호성 조기 중단 결과이므로 버튼 부재로 단정하지 않는다.
3. 디톡스·블루팜 선택일 달력 checked는 v14 실제 Windows 보고에서 보존된 것을 확인했다. 사이트 전체 범위로 확대하지 않는다. [PC 검증 방법](ENTRY_VALIDATION.md)으로 사전 검사→실제 실행 시각/버전→클릭·이동·영상·사이트 완료를 나눠 확인한다. 실제 사용자 DOM과 v15 로그인·정시 입장·영상·적립·미참여일 퀴즈는 재확인이 필요하다. 기존 시도 파일을 지우거나 불확실한 제출을 반복하지 않는다.
4. 모바일 v0.7.114 닥터라운지6/7·20초 분산은 PC에 미이식이며 vendor는 v113이다. mission_changed·제출0을 유지한다. 종근당 하루1회 새 로그인·닥터빌 설문·지속 재생도 해결 완료로 표시하지 않는다.

모바일 소스·APK·서명·릴리스는 수정하지 않는다. 앱 ID·프로필·Windows DPAPI·시도 기록·원래 버튼·제출 전 영속 기록·불확실 재전송 금지와 원격 창 격리를 유지한다. 패치는 같은 에디션 preview.14에만 적용하며 트레이 완전 종료→app 백업→resources/app 전체 교체→하단 버전 확인 순서다. X는 숨기기다.
