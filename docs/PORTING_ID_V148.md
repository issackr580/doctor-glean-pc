# PC 공식 강의 ID 이식 — preview.31

2026-11-07 KST. 기준은 실제 PC main `bcc976abdca932a9f6d828851156341736961e31`, 실행판 preview.30의 소스 `8848de5fa086d235778fac3a6d5d05b9cf49c454`다. 첨부 모바일의 기능이나 문서를 PC 구현 증거로 사용하지 않았다. 별도 `feat/official-lecture-id-v148` 작업본에서 조사·구현했다.

## 출처와 실제 기준

인계 ZIP SHA256 `9c31701e99643e01fa97a156aeaf6aff5f16b6d6bc4cee8bb96eb4cc6ee90cc6`, 모바일 v0.7.148/code199/소스 `32d9080c77decadd48ed520b7e357bbcdd5928fd`. 체크섬138파일, SOURCE_MAP114참조의 크기·해시를 대조했다. 02~05 문서, SITE_ID_RULES, 실제 JS lecture-identity/수집기/auto-entry, Java 정책과 합성46사례·PC runtime18항목을 비교했다. Android UI/서비스/알람/Keystore·APK·암호문·인증·키는 복사하지 않는다.

| 조사 항목 | 기존 PC에서 확인한 구현 | preview.31 연결 |
|---|---|---|
| 런타임 | Windows x64/Electron45.0.0, Node24/npm11, lock 고정 | 유지 |
| 계정/프로필 | Windows DPAPI, 별도 후보 인증, `persist:doctor-glean-pc-${edition}-v1-${site}` | 저장 형식·수동 창·사이트/에디션 분리 유지, 변경 epoch로 옛 입장 작업 무효화 |
| 설정 | catalog/pc-options/workflows의 기능·사이트 선택, 자동 기능 기본 꺼짐 | ID 발견으로 선택·동의를 변경하지 않음 |
| 예약 키 | 대부분 SHA256(JSON `[site,date,hmpTimeOrEmpty,normalizedTitle]`), 닥플은 기존 공식 ID 키 | 입증된 ID는 기존 단일 키에 별칭. 신규 공식 예약만 새 키 사용 |
| 필수 시도 | `state-v1.json`, SHA256(JSON `[site,kind,date,target,slot]`), fsync+rename | 기존 key/slot 소비 보존, 저장 성공 뒤 한 번 dispatch |
| 작업/로그 | 예약 key·실행 runId·선택적 executionId·시도/receipt 참조 | 변경·초기화 없음. worker 소유 nonce는 선택 필드 추가 |
| 일정 | D26 닥터빌 새 상세 2회 확인·당일 미입장 복구, 일반2계획, 한미5슬롯, 후다닥/디톡스3회 | 별도 정책 유지. ID만으로 기한·횟수·재시도 권한을 늘리지 않음 |
| 서명/업데이트 | 고정 PC Ed25519 공개키·서명 피드·전체 app SHA·에디션/runtime·helper/rollback | 유지, Android 패키지는 후보가 아님 |
| 시청/월간집계 | 장기 시청/디톡스180초+완료/서로 다른 월3강의/메디게이트 native 집계 재시도 proof 없음 | 미구현을 보존했다고 쓰지 않음. 새 asset의 receipt/watch 권한도 host에서 차단 |

## ID 지원 화면과 legacy

| 사이트 / namespace | 관측된 원래 화면의 공식 ID | 범위 |
|---|---|---|
| 닥터빌 / seminar | seminarDetail 또는 seminarVodReplayDetail의 `seminarId`, 선택 `viewType=1/2` | 수집·예약·목록/상세·입장 재검사. replay ID가 LIVE 권한을 주지 않음 |
| 키메디 / live | `/meditv/live/{문자·숫자·_·-}` | 원래 링크가 있는 카드/상세 |
| 메디게이트 / symposium | `/symposium/{양의 정수}` | 원래 상세 링크·카드·입장 버튼 |
| 후다닥 / webi | `/webinar/webi/view?id={양의 정수}`, 선택 page | 관측된 목록/상세, 기존 반복 회차 보존 |
| 닥플 / webinar | 정확한 docple-plus.com `/webinar/{양의 정수}`, 허용 목록 query | C01/LIVE 목록·신청 완료·상세·입장, 기존 닥플 예약 key 유지 |
| 한미 / schedule | 원래 scheduleList.hm의 보이는 단일 `goDetail(숫자 리터럴)` | 제한된 DOM에서 참조만 판독. 실행/eval/계산식/복수호출 금지 |
| 인터엠디·블루팜·디톡스 | 확인된 공식 ID 없음 | 기존 v139 legacy 수집/입장. `event.id`, seq, UUID, 토큰 등을 ID로 승격하지 않음 |

PC 기존 호스트 허용 목록을 넘기지 않는다. 숨긴/과대 DOM, 잘못된 URL·중복/예상 밖 query·fragment·dot segment는 ID 근거가 아니다. 공식 ID가 없는 기존 사용자 경로는 갑자기 공식 지원으로 바뀌지 않는다. 종근당은 기존 조회만 유지하며 자동 입장 대상에 추가하지 않는다.

## 저장·소유권·클릭

`entry-identity.js`가 site+namespace+ID를 정의한다. ID가 같으면 제목 변경을 허용하고, 동일 제목의 다른 ID는 별개다. `entry-job.js`, WorkflowStore, EntryRunner, 상세 참조/일정 보정/영수증 소유권, 수동 입장 관찰이 이를 공유한다. 날짜·시작/회차·신청/종료·버튼 활성·로그인/보안·원래 기한은 독립 조건이다.

기존 예약을 재작성하지 않는다. 단일 기존 키만 증명된 별칭을 얻으며 취소/시도/unknown/수동/슬롯/일정계획·이력·실행 ID는 유지한다. 여러 옛 키가 같은 ID면 새 조회 전 재시작에서도 자동 선택하지 않는다. ID 없는 소비/취소 예약과 새 제목의 동일 시각이 겹치면 연결을 추정하지 않는다. 명시적 재예약도 미시도·미소비·원래 기한을 요구한다. 진단 삭제/목록 갱신이 필수 소비를 지우지 않는다.

주 프로세스의 단일 실행 소유자가 기존 시도 키로 원자적 reserve와 beginDispatch를 저장하고 WorkflowStore의 entryAttempted까지 저장한 다음 renderer를 호출한다. 어느 저장이든 실패하면 클릭0회다. renderer 요청 직전에 계정/선택/ledger epoch·같은 worker·소비 상태를 확인한다. 실제 원격 창의 isolated world1003에서 문서 nonce와 원래 버튼/root와 관측한 href·onclick 등의 속성를 묶고, click 시 같은 ID·일정·상태·보안·버튼을 다시 판독한다. 새 문서·같은 내용의 교체 카드·다른 handler는 이전 관찰을 사용할 수 없다. 사이트 main world의 JSON true나 nonce는 권한이 아니다. 수동 관찰은 별도 world1001에서 trusted input만 기존 key로 통지하고 worker를 중단한다.

PC는 실제 관측한 링크·카드·원래 버튼만 쓴다. ID로 detail/player URL을 조립하거나 원래 goDetail handler를 평가해 탐색하지 않는다. 불확실 응답/프로세스 중단/재시작은 소비 상태를 남기며 재전송하지 않는다.

## 스냅샷과 되돌리기

클라우드 작업본 밖에 v30 소스 git archive·commit/tree/해시를 보관했다. 실제 사용자 Windows APPDATA는 이 환경에 없으므로 사용자 상태를 백업했다고 주장하지 않는다. 앱은 첫 v31 시작 시 저장소를 열어 복구하기 **전에** 해당 에디션 데이터 폴더의 `identity-state-snapshots/before-official-id-v1`에 기존 JSON을 불투명 byte로 복사·fsync·해시 기록한다. 계정 암호문을 해독하거나 외부로 보내지 않으며 브라우저 프로필은 옮기지 않는다. 백업 실패/변조는 실행을 막는다. 소스 ZIP/앱/진단 내보내기에서 이 폴더를 제외한다.

v30은 선택적 예약 메타데이터를 무시할 수 있도록 필수 root/schema/receipt를 유지했다. 실제 rollback은 자동 작업을 중지한 상태에서 기존 updater 절차를 쓴다. 과거 스냅샷으로 **더 새로운 소비 기록을 덮어쓰면 안 된다**. 자동 상태 복원 API는 없으며, 복구 시 더 새로운 state/시도/unknown/취소와 프로필을 보존해야 한다.

## 재현과 검증의 해석

`npm run identity:sync -- <검증한 인계 루트>`는 명시한 출처의 ID 관련7출력과 합성 계약 자료만 갱신한다. manifest에 원본·변환본 해시를 남긴다. v139 legacy engine/daily/credential snapshot은 그대로다. PC가 실제 주입하는 각 standalone asset에 identity 의존 함수가 들어간다. PC 보조 판독기는 `pcEntrySource()`로 모든 의존 함수를 함께 직렬화한다.

`scripts/id-policy-adapter.mjs`는 실제 PC 저장소/EntryRunner/예약 생성/선택/worker/receipt 정책을 호출하며 expected를 읽지 않는다. 합성46계약은 test fixture로 재현한다. 기존 PC legacy 키는 모바일의 pipe hash와 다르므로 **새 ID 없는 DTO 출력만** reference 표현으로 투영하고 실제 `pcKey`를 별도 반환한다. 네이티브 키가 바뀌지 않는 회귀 검사도 있다. 이 차이를 숨기거나 모바일 키로 마이그레이션하지 않는다.

추가 Node 장애 검사와 `electron-id148-cases.mjs`는 원자적 저장 실패·경쟁·재시작·소비 후 응답 유실·계정/선택/취소/수동의 늦은 callback·다른 ID/문서/root/handler·독립 날짜/시작/등록/보안·실제 주입된6수집기/엔진·trusted 수동 통지를 검사한다. [runtime 수용표](PORTING_ID_V148_ACCEPTANCE.json)에 증거 범위와 미확인을 기록한다. 고정 입력 전체 `npm run verify:pc -- --container-no-sandbox` 및 Windows 묶음/에디션 분리/패치/서명 검증을 따로 수행한다.

이는 Linux Electron 합성 HTTPS와 PC 정책 검사다. 실제 Windows/DPAPI·실계정 로그인·회원 화면 DOM·실제 강의 입장/재생/출석/보상·절전/복귀/재부팅·사용자 버튼 설치 성공을 뜻하지 않는다. 사용자 개인 로그/인증 자료는 소스·보고에 복사하지 않았다.

## PC 최종 게시 검증

실행 소스 `8678d498b62abeb750c1166c43ad081742b8ea72` / pc-source-v0.1.0-preview.31, [PR75](https://github.com/issackr580/doctor-glean-pc/pull/75). 실제 PC 어댑터46계약/320항목·Node393·구문·Linux Electron45/Xvfb 합성 HTTPS 조회115·일일30·계정121·입장402·replay136·신청193·업데이트23, Electron 전체1020개. 입력 SHA `7e1b10e6d1486b8f00fe488eb25afb6403b4ff52f3f269b2f49f2865e4b65ea3` 전후 일치. 최종 Windows resources/app의 Linux 관리 창 개발자115/배포101·에디션 데이터 분리·깨끗한 소스234파일·의존성/Node393/구문 재현·같은 에디션20~30의 실제 ZIP runtime·전체 app 패치 교체22경우·12서버 자산/독립 공개·Draft404·고정 Ed25519 서명/실제 서버 패치를 대조했다. [수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/42269812067)와 [릴리스 기록](releases/0.1.0-preview.31.md)을 따른다.

v30 저장소가 v31의 선택적 필드를 읽고 다시 써도 기존 key/identity/owner/소비를 보존하는 것은 별도 합성으로 확인했다. v30의 ID 실행 의미가 동일하다는 증거는 아니다. 되돌릴 때 자동 작업을 중지하고 더 새로운 소비/unknown/취소를 유지하며, 옛 자동 작업을 즉시 재개하지 않는다. 실제 Windows와 실계정 결과는 계속 미확인이다.
