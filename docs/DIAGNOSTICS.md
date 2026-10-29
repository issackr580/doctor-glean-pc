# 공동 개발용 진단 수집

preview.25는 개발자용의 일반 TXT 오류보고에도 진단을 켠 동안 기존 entryJournal을 포함한다. 동일한 최근64회차/48event/compact256KiB·7일 동의/한도·명시적 내보내기만 사용한다. 꺼짐·사용 불가·배포용에는 추가하지 않는다. inspect의 targetSource=catalog와 catalogReference=missing/matched/ambiguous/unsafe는 고정 분류이며 실제 URL/ID/제목 값은 내보내지 않는다. matched는 읽을 단일 링크가 있다는 뜻이며 실제 일정 대조·클릭·영상/적립 성공의 증거가 아니다. 새로운 필수 저장 형식·동작 권한·IPC·자동 전송은 없다.

preview.24의 개발자 입장 회차 inspect는 닥터빌 목록의 제목 후보별 `dateMissingCards`(날짜 근거 없음), `dateInvalidCards`(잘못된 날짜/요일), `dateConflictCards`(복수/묶음과 충돌), `dateMismatchCards`(예약일과 다름), `startInvalidCards`(전용 시작 필드 누락/복수/형식 오류), `startMismatchCards`(시작시각 불일치), `sharedDateCards`(같은 묶음의 날짜 대조 통과)를0~1000의 고정 개수로 남긴다. 한 후보는 처음 실패한 단계까지만 집계하며 시작 필드 개수 오류는 날짜 검사보다 먼저 기록할 수 있다. 공유 날짜 대조 통과는 시각/대상/입장 성공이 아니다. 여러 제목 후보는 서로 다른 이유로 실패할 수 있다. 원문 날짜·제목·HTML은 없고 기존 일반 receipt/inspection에는 새 필드를 저장하지 않는다. 따라서 과거 진단에서 이 원인을 소급 복원하지 않는다.

preview.21은 기존 동의와 보관 한도를 공유하는 PC 회차 경과·선택 보고를 추가한다. 개발자용의 입장 회차별 경과에서 미리본 고정 내용을 그대로 저장/복사한다. 필수 시도 저장과 독립적이며 진단 실패·삭제·철회로 제출 권한을 되살리지 않는다. 배포용에는 추가되지 않는다. [검증 흐름과 PC 관찰 계약](QUALITY_WORKFLOW.md)을 따른다.

preview.20은 한미의 공개 로그인 처리기가 쓰는 정확한 `/login/loginProcess.hm` POST에도 기존 Network 개수·HTTP 상태 관찰을 적용한다. URL·본문·쿠키·계정값은 기록하지 않는다. trace의 `route=login_result`, `hmpLoginResult`, `hmpAdditionalStep`는 고정 분류와 boolean이며 인증 근거가 아니다. 실제 제출 ACK·정상 인증 응답 뒤 허용 조건에서만 고정 보호 목록을1회 읽고 기존 인증 판독을 다시 한다. 비밀번호 변경·추가 인증·실패 응답은 통과시키지 않는다.

닥터빌의 상세 재확인은 읽기 단계다. 기존 단일 제목 카드의 관찰된 고정 링크 외에 preview.25는 날짜 누락일 때 기존 조회의 동일 일정에 연결된 단일 고정 링크도1회 GET한다. 새 상세 문서의 실제 제목·날짜·첫 시작시각과 버튼을 대조한다. 사전 검사도 이 한정된 읽기를 허용하며 계정 제출·입장/신청 클릭·팝업/재생·필수 시도 소비는 하지 않는다. `open_detail`·`read_only`·관찰 단계는 클릭/입장/적립 성공이 아니다. 안정된 receipt/inspection·시도 형식은 유지하며 원문 링크/제목을 내보내지 않는다.

preview.19의 일반 보고에는 `runtimeFaults`가 추가된다. 주 프로세스의 미처리 예외/미처리 Promise가 예외로 승격된 경우와 호스트가 처리한 자동 작업·관리·시작 오류를 현재 프로세스에서 최근10개까지 메모리로만 보관한다. 오류 시 새 자동 제출을 중지하고 기존 시도·계정·수동 창은 유지한다. `uncaughtExceptionMonitor`만 사용하므로 Electron/Node의 원래 예외 처리·팝업·종료를 대체하지 않는다. 원시 메시지·stack·절대 경로·URL은 남기지 않고 origin/code와 알려진 PC src 파일·행/열만 기록하며 해당 위치가 없으면 unknown이다. 파일/행은 그 실행판의 build.sourceCommit에 맞춰 읽는다. 사이트 자체의 모든 alert·console 오류·Windows 오류를 포괄하는 기록이 아니며 기존 v18 팝업 원문은 복원할 수 없다.

개발자용에서 기존7일 기록기를 켠 동안에는 `area=process, phase=fault`로 같은 고정 필드와 실행 appVersion/sourceCommit을 보존한다. 기존 날짜당2000개·4MiB·로컬 보관·명시적 내보내기 기준을 유지한다. 기록기가 꺼져 있거나 쓰기에 실패했으면 재시작 전 일반 보고를 저장해야 한다. 배포용에는 메모리의 일반 오류 근거만 있고 추가 기록기·전용 preload/IPC는 없다. 원문을 보내거나 계정/시도 파일을 지우도록 안내하지 않는다.

preview.14의 계정 trace는 정확한 허용 이동 판정 `navigationAllowed`와 whitelist `failure`를 포함한다. originAllowed와 구분해 읽으며 실패 코드·주소 판정만으로 실제 원인을 확정하지 않는다. 사전 검사 receipt의 reads는 실제 PC 판독 횟수다. 일괄 결과는 처리 수와 ready/waiting/login/unresolved를 구분하고 10건 처리를 10건 준비 완료로 해석하지 않는다. URL·callback 값·계정·원문은 추가하지 않는다.

preview.13은 `sites[].inspection`에 달력 확인/상태·선택 날짜/월, 현재 목록 판독, 카드 형식 enum, 추가 목록/페이지 수와 모호성 boolean을 보존한다. 원문 samples·회원·URL·달력 셀 내용은 제외한다. 예전 보고서에 빠진 사실은 소급 복원하지 않으며 새 조회가 필요하다. `automation.preflight`는 이번 일괄 사전 검사의 처리·건너뜀 수와 중단 상태이고, 예약별 실제 결과는 각 `preflight`다. `processStartedAt`과 영속 클릭 시각으로 이전 실행 기록을 구분한다.

preview.12의 예약 검증은 [PC 검증 방법](ENTRY_VALIDATION.md)을 따른다. 개발자 이력에는 `area=automation`의 scheduled/start/inspect/open_detail/dispatch/retry/result/preflight 단계도 포함된다. key/runId는 로컬 익명 식별자이고 appVersion/sourceCommit은 그 실행의 기준이다. due/startedAt/delayMs와 고정 개수·boolean으로 단계와 지연을 대조한다. 기록이 없다는 것만으로 실행이 없었다고 판단하지 않는다. 현재 상태에는 exportedAt·processStartedAt·build·selectedCatalogSites가 추가되며, 예전 기록의 버전을 현재 실행판으로 추정하지 않는다. 배포용에는 추가 이력 기록기가 없다.

`credentialRequestObservationSupported=false`인 사이트는 Network 관찰이 켜져 있어도 검토된 인증 POST 경로의 송신·응답 수를 집계하지 않는다. 이때0은 미전송 증거가 아니다. 이번 추가 사용자의 한미/메디게이트 후보 실패도 이 제한을 구분해 해석한다.

개발자용에는 **7일 로컬 기록기와 JSON 내보내기**가 있다. 별도 서버, 자동 업로드, 사용자 화면 녹화는 사용하지 않는다. 배포용에는 추가 기록기·전용 IPC·개발자 화면이 포함되지 않는다. 공동작업자는 소스에서 개발자용을 실행하거나 직접 빌드한다. 개발자 실행파일은 지정 collaborator 전용 Draft로 공유하며 공개 릴리스에 올리지 않는다. [접근 권한](ACCESS.md)을 확인한다.

## 재현 전에

1. 개발자용의 하단 **개발자용 진단 → 7일 진단 켜기**를 누른다. 기본은 꺼짐이며, 켠 뒤의 작업만 추가 기록한다.
2. 하단 앱 버전을 확인한다. 작업 브랜치와 `git rev-parse HEAD`, 배포 파일명도 함께 적는다. 현재 JSON에는 버전·에디션이 있고 Git commit은 자동 포함되지 않는다.
3. 문제를 한 번 재현한다. 실패 원인이 불확실하면 로그인·포인트 버튼을 반복해서 누르지 않는다. 기존 시도 기록을 삭제하지 않는다.
4. 실패 직후 **진단 파일 저장**으로 `doctor-glean-pc-developer-diagnostics.json`을 저장한다. 발생 시각(한국 시간), 사이트, 기대 동작, 실제 동작, 직접 로그인/자동 복구 중 어느 경로인지 적는다.
5. 계정·비밀번호·쿠키·토큰·원문이 없는지 확인한다. 화면 캡처의 회원 이름·아이디도 가린다. 개인 보고서 파일은 소스에 커밋하지 않는다. 공개 이슈에는 필요한 요약만 남기고 민감한 원본은 공유하지 않는다.

기록기를 켜지 않았어도 JSON에는 내보낸 시점의 사이트별 조회·세션·자동 작업·계정 진단이 있다. 이전 단계의 순서와 메모리 이력을 소급 복원하지는 못한다. **진단 삭제**는 추가 기록만 지우고 기록기를 끈다. 계정·사이트 세션·외부 제출 시도 기록은 지우지 않는다.

## 포함하는 근거

| 위치 | 용도와 제한 |
|---|---|
| `appVersion`, `edition`, `applicationId` | 실행 빌드·개발자/배포용 구분. Git commit은 별도 기록 |
| `currentState.runtime` | Windows/아키텍처·Electron·Chromium 버전 |
| `status`, `events` | 기록 동의 기간, 수집/창/제어 단계, 고정 사이트 코드·시각·수치 |
| `currentState.collection`, `sites`, `pendingQueries` | 선택 날짜·진행·판독 개수·종료 범위·대기열 |
| `currentState.siteSessions`, `browserEvents` | 로그인 관찰과 세션 보관 요청, 차단·로드 실패. 세션 저장 요청은 로그인 성공과 다름 |
| `currentState.credentials` | 보호 저장소 가용 여부·저장 여부·동의·시도 제한·최근 단계 진단. 암호문·계정값 없음 |
| 계정 결과의 `trace` | 단계·상태·경과 시간·문서 세대·허용 origin 여부·고정 인증 신호·차단 개수. 반복 관찰은 samples·firstElapsedMs로 합치고 초기 probe/fill을 보존. 최근 작업의 제한된 관찰이며 모든 과거 로그인 이력은 아님 |
| `currentState.automation`, `attempts` | 작업 설정과 슬롯별 시도/미확인/완료. 클릭과 실제 사이트 완료를 구분 |
| `heapUsedKb`, `rssKb` | Electron 주 프로세스 메모리. 전체 앱·렌더러·Windows 총 사용량이 아님 |

원시 URL·HTML·콘솔 원문·네트워크 요청 본문·비밀번호·정답·쿠키·토큰을 수집하지 않는다. OS sandbox 상태, 실제 계정 인증 성공, 포인트 적립을 관찰 없이 추정하지 않는다.

v8부터 검토한 닥터빌·디톡스 인증 경로의 실제 요청/응답 개수, HTTP 상태, 콘솔 오류 개수와 입력 형식 안내 여부도 고정 수치·boolean으로 내보낸다. credentialNetworkEnabled가 false이면 요청 개수0을 미전송 증거로 해석하지 않는다. HTTP200이나 버튼 클릭을 인증 성공으로 바꾸지 않는다. 본문·헤더·쿠키·토큰·콘솔 원문은 수집하지 않는다.

## 보관과 실패 처리

기록 활성 기간은 켠 시점부터 7일이다. 이벤트는 최근 한국 날짜 7일, 날짜당 최대 2,000개이며 파일 크기는 4 MiB로 제한한다. 한도에 도달하면 해당 날짜의 추가 이벤트를 넣지 않으므로, 이력이 없다는 것만으로 작업이 없었다고 판단하지 않는다. 꺼진 PC의 디스크 파일을 자동 삭제하지는 않으며, 실행 중 조회·기록·내보내기 때 기간을 정리한다. 내보낸 파일은 사용자가 별도 관리한다.

파일은 개발자용 데이터 폴더의 `developer-diagnostics-v1.json`이다. 다른 에디션과 공유하지 않는다. 저장 실패나 손상은 진단 수집을 중지하며 원본을 임의 초기화하지 않는다. 사용자 명시적 삭제로만 재시작할 수 있다. 진단 실패가 출석·로그인 등 실제 작업의 재전송을 유발하지 않는다.

## 구현 변경 기준

- 수집기는 `editions/developer/`, 연결은 `src/main.js`, 스키마/보관 검사는 `test/developer-journal.test.js`가 기준이다.
- 원격 사이트는 수집 API를 호출할 수 없어야 한다. `pc-dev:*`는 신뢰된 관리 창의 최상위 프레임에서만 받는다.
- 새 항목은 고정 enum·boolean·제한된 수치로 허용 목록을 확장한다. 임의 문자열이나 사이트 객체 전체를 이벤트에 복사하지 않는다.
- `npm test`, `npm run check`, 관련 `npm run test:electron -- --suite=catalog`로 기본 꺼짐·현재 상태 내보내기·명시적 기록·비밀정보 제외·배포용 제외를 확인한다. 보관·실패 조건을 바꾸면 관련 회귀도 실행한다.
- 공유한 JSON은 원인 조사 자료다. 수정 완료 근거는 합성 재현과 해당 Windows/사이트 경로의 재확인으로 따로 남긴다.

v9의 dtalksLogoutPresent·dtalksLogoutVisible·dtalksLogoutSafe·dtalksLoginConflict는 검토한 서버 프로필 메뉴의 고정 boolean이다. 회원 이름·HTML·클래스 목록·링크 원문은 내보내지 않는다. authEvidenceSource=dtalks_server_logout는 메뉴 근거이며, 후보 계정 저장에는 네이티브 실제 요청/응답과 보호 목록 재확인도 필요하다. 수동 창의 login_fallback은 고정 로그인 화면을1회 열었다는 의미로 인증 성공과 구분한다.

v15의 닥터빌 provider trace는 고정 origin에서만 `providerPath=login|other`, `callbackState=expected|missing|repeated|mismatch`를 기록한다. 값·주소·query는 남기지 않는다. 제출 전 `policy_rejected`는 blocked이며 계정 복호화·제출 없이 중단한 근거다. 제출을 시작한 뒤의 실패는 unknown과 영속 시도 제한을 유지한다. expected나 정상 로그인 화면 관찰만으로 인증 성공을 표시하지 않는다.

v16은 기본 `/` 경로를 providerPath=home으로 나누고 providerLanding/providerBarrier boolean만 추가한다. 기본 경로의 전용 읽기와 고정 PC 페이지1회 GET은 인증 성공이 아니며 후보 검증·제출 뒤에는 사용하지 않는다. 자동 작업 entry 행의 선택적 inspection은 checkedAt/readOnly·날짜/시각 대조 수·identifiedTargets/distinctIdentities/stateVariants 등 개수만 담는다. 서로 다른 강의 링크의 값이나 원문은 없다. 기존 receipt·외부 시도 형식과 분리해 실제 v15 reader의 되돌려 읽기/저장 호환을 확인했다. 개발자/배포용의 실행 시각과 현재/이전 기록을 합치지 않는다.

v18은 제공자 공개 코드의 direct_login/account_home/profile_required/account_connect/account_matching/service_transition 등 고정 경로 분류를 추가한다. providerSettling은 입력 없이 이동을 관찰했다는 boolean이며 인증 근거가 아니다. raw 경로·주소·일회용 토큰은 남기지 않는다. 계정 attempts.policy는 에디션별 직접 요청 간격과 자동/당일 한도이며, retryAt는 직접 요청·automaticRetryAt는 자동 복구의 시간이다. 최근 결과의 automatic boolean으로 두 경로를 구분한다. 스키마/시도 기록을 지우거나 일반 로그인 허용 범위를 넓히지 않는다.

작업 중인 v10은 후다닥의 고정 `/auth/login` POST에도 같은 요청/응답 개수·HTTP 상태 관찰을 적용한다. 차단 목적지·본문·헤더는 남기지 않는다. 후다닥의 refresh는 실제 제출 ACK/응답 뒤 원래 PC 페이지를1회 다시 읽은 단계다. 성공 여부는 그 페이지의 인증 근거로 별도 확인한다.

`authEvidenceSource=docple_server_calendar`는 고정 보호 페이지의 현재 토큰으로 정상 출석 calendar 응답을 확인했다는 뜻이다. 토큰·회원·과거 출석 날짜는 내보내지 않는다. 토큰·문서·날짜가 바뀐 이전 응답은 인증 근거로 재사용하지 않는다. 로그인 복구의 성공과 이후 출석 수령·적립은 별개다.

preview.26부터 catalogReference의 schedule_changed는 조회 힌트의 시작 시각과 기존 예약이 다름을 뜻한다. 이것만으로 사이트 일정 변경을 확정하지 않는다. 새 상세의 독립 날짜·제목·단일 첫 시작 시각을 읽고 기존 예약과 다를 때만 target_missing + scope_changed로 구분한다. 원문·강의 ID·URL·계정은 추가하지 않으며 기존7일 opt-in·기록/내보내기 한도를 유지한다.
