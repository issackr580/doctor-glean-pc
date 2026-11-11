# Android v156 방향의 PC 적용 — PC-023 / D32

기준일: 2026-11-11 KST. 현재 PC 코드를 직접 조사한 결과이며 Android 구현을 PC 성공 근거로 쓰지 않는다. v156의 디톡스/한미 정책은 과거 v139/v148 이식 문서와 충돌할 때 우선한다.

## 시작 기준과 되돌릴 수 있는 상태

- 원본 PC main: `ef947fe72fd907fe2e2a6a324e12387154259662`, 실행판0.1.0-preview.32, 실행 소스 `ccfdbb4922d4c146468a7353c87c05ee883d027f` / `pc-source-v0.1.0-preview.32`. 별도 `feat/pc-v156-policy` 작업본에서 변경했다. 수정 전 소스는 저장소 밖에 보존했다.
- Electron45.0.0 / Node24.19 / npm11.9, Windows x64 독립 앱. 기존 vendor v139 DOM reader와 v148 공식 ID PC 주입 계층을 확인했다. 새 모바일 소스 import나 APK/Android 키 이식은 없다.
- 에디션별 DoctorGleanPC-Developer / DoctorGleanPC, 사이트별 persist partition, 수동 창 소유권을 유지한다. 계정은 별도 검증 프로필의 실제 제출 ACK/인증 뒤 Windows DPAPI로만 저장한다. 기본/임시/다른 계정 쿠키를 읽기 API 인증으로 쓰지 않는다.
- 설정·동의·중지·조회/출석/입장 선택·PC 옵션, catalog-v1, workflows-v1, state-v1, 로그인/퀴즈/신청 fuse, developer journal의 실제 경계를 확인했다. 예약 key/실행 ID/로그 참조/공식 ID alias는 유지한다.
- 앱 시작 시 실제 복구/이관 전에 같은 에디션 데이터의 `identity-state-snapshots/before-entry-policy-v156`에 파일 해시와 불투명 원본을 fsync/원자적으로 보존한다. 보호 암호문은 해독/내보내기/다른 플랫폼 복사를 하지 않는다. 스냅샷 실패 때 실행을 중단한다. 이 클라우드에는 사용자의 Windows APPDATA가 없으므로 실제 사용자 데이터 백업 완료를 주장하지 않는다.
- `workflows-v1.json` 파일명은 유지하되 내부 schemaVersion은2다. 구 v1은 안전하게 이관하며 v32의 v1 전용 reader는 새 형식에서 storage_error로 중단한다. HMP 신규 원장 slot32/33/34와 구0~4를 분리하고 구 소비 원장을 지우지 않는다. **구 앱으로 되돌릴 때 최신 소비/unknown/취소 기록을 옛 스냅샷으로 덮지 않는다.** 자동 복원/초기화 기능은 없다. 이전 소스로 자동 작업을 재개하지 말고, 현재 데이터 백업과 소비 기록 보존을 먼저 확인한다.
- PC Ed25519 고정 키/서명 피드·앱 버튼 updater·helper·에디션 분리·협업자 Draft/배포용 공개 규칙을 유지한다. 키/토큰은 저장소와 소스/실행물 밖에 있다. Windows Authenticode와 PC 업데이트 서명은 별개다.

## 구현 여부와 차이

| 범위 | 기존 v32 실제 상태 | 이번 PC 변경 / 남은 확인 |
|---|---|---|
| 디톡스 | 자동3회형과 조회/로그인 경로 존재 | 자동 허용 목록에서 제외. 저장 true 보존, 활성 reserved/running/attempting/opening을 cancelled로 닫고 전송/회차/receipt 보존. 새 예약·선택·재시도·입장용 복구·주입 호출·늦은 callback·반복/재생 자동 경로 차단. 조회/계정/직접 열기/수동 입장은 유지. PC에 없던 디톡스 출석/180초 장기 시청을 완료로 표시하지 않음 |
| 한미 | start+10분씩5회, root v1, native hmpAttempts/schema 필드 없음 | schema2/timing=start_0_25_35, 실제 시작0/25분·조건부35분, 각90초. 13:10이면13:10/13:35, 조건이 맞을 때만13:45. 준비10분 전은 읽기 전용. 과거 key/ID·attempts/receipt·취소/직접/unknown 보존 |
| 한미 이관 | slot1은+10분, 옛 callbacks 존재 가능 | 같은 날 explicit false/reserved/미소비만 남은0/25 창으로 이관. 전송/불명/실행 중은 unknown, 과거 회차는 재명명하지 않음. worker/schema/timing/due/회차와 ledger namespace를 비교. +30 목록 갱신이 허가된+35를 취소하지 않음. 새 조회의 종료/미신청/다른 ID·시각/중복은 별도 중단 |
| 공식 ID |6사이트 지원 화면과3 legacy 경로 | 기존 site+namespace+ID 전달/독립 날짜·시작·신청/종료·버튼/인증·기한 검사를 유지. 같은 ID 제목 변경 허용/다른 ID 구분. 인터엠디·블루팜은 legacy, 디톡스는 조회/수동 legacy. ID로 상세/player URL을 만들지 않음 |
| 읽기 API | PC CatalogRunner는 브라우저 중심 | 실제 main에 NativeCatalogRead 연결. 원래 예산·취소·계정/프로필/쿠키 세대·전체 페이지/ID/일정/상태를 검증할 때만 화면 생략. 실패 시 기존 화면1회, 프로필 변경은 결과 폐기. 자동 로그인/입장 권한 생성 없음 |
| 상태 변경 | 기존 버튼+필수 영속 기록 | 그대로. 새로운 입장/출석 API, heartbeat/시청·보상 생성 없음. 저장 성공 뒤 정확히 한 번 dispatch, 응답 유실 unknown·UI 재전송 없음 |
| 숨은 리소스 | 브라우저 요청 기본 허용 | 숨은 조회/로그인/퀴즈/상태 읽기의 명백한 영상/음원 GET만 제한. 원래 POST/API/이미지/배지/캡차/CSS/JS, 수동 창·입장/플레이어는 보존. 캐시 강제 변경/전역 이미지 차단 없음 |
| 진단 | 사용자 내보내기, developer opt-in | 한미 schema별 checkpoint 구분, 현 프로세스 제한 수치 추가. 원문 URL/헤더/본문/토큰은 기록하지 않음. 배포용에 개발자 기록기/추가 preload/API/화면 없음. 자동 전송 없음 |

## 한미 조건부35분의 정확한 근거

현재 예약의 native 이력에서 schema2/slot1 행이 정확히 하나여야 한다. due는 시작+25분이고 at은 due 이상·35분 deadline 이하 정수다. 실제 boolean `entryAttempted=false`와 expired/not_open/button_missing/target_missing/network/busy, 또는 실제 boolean true + clicked + play_failed만 허용한다. 구 schema1/slot1, 중복행, 문자열 false, 누락, unknown·요청·읽기 불가·no_video·gesture_required는 근거가 아니다. 로그인/보안/권한/미신청/취소/수동/중지/종료를 우회하지 않는다. 35분 뒤 추가 회차는 없고 새 목록만으로35분을 만들지 않는다.

두 저장 경계(state ledger reserve/beginDispatch, workflow attempting) 성공 뒤 현재 문서 nonce/원래 control/root·같은 worker/계정·선택 epoch를 다시 확인한다. 저장 실패0클릭·동일 회차 중복0회다. 소비된25분의 만료를 미실행 false로 바꿔35분을 허가하지 않는다. 재시작/진단 삭제/목록 갱신은 원장을 초기화하지 않는다.

## API별 실제 근거와 검토 범위

| API | PC 연결 | 확인 수준 / fallback 조건 |
|---|---|---|
| 종근당 webinarCalAjax.do / webinarCalDtlAjax.do | 고정 POST 읽기2개, r_month/r_date, Cookie/Bearer 없이 Node fetch. 당일 실제 로그인 제출+인증 daily lease admission과 정확한 계정/프로필 세대 필요 | 월6필드/달력5~6주·전체 ID/완전 날짜·시작·WB/Bell/use/delete, 월/일 양방향 동일성을 검증. 첫 profile/프로세스에서 lease 증거 없거나 불명/오류면 화면으로 이어감. 임의 detail URL/버튼 권한 생성 없음 |
| 닥플 C01/LIVE | 고정 GET list,6행/최대20페이지·count/pages불변·행수/중복ID/typed 등록·상태·현지 시작/종료 검증 | 정확한 normal partition에서 단일 accessToken/check-accessToken만 요청 메모리에 사용. Cookie jar/Set-Cookie를 변경하지 않음. API가 명시한 원래 detailUrl/url의 공식 ID까지 일치해야 성공. 회원 응답의 실제 링크 필드는 아직 미확인하므로 해당 조건 없는 응답은 기존 화면으로 이어감. ID로 URL을 조립하지 않음 |
| 메디게이트 공개 포틀릿 | 전체 조회 대체하지 않음 | 부분 목록이며 회원 전체/등록 상태 근거가 아님. 기존 화면 유지 |
| 메디게이트 집계 native 읽기·일회 재시도 proof | 검토 | 기존 PC에 해당 장기 시청/집계 구현이 없고 실제 원래 계약/인증/응답 근거 부족. 합성으로 완료 표시하지 않음 |
| 키메디 목록/상세·기타 API | 검토 | 실제 클라이언트 요청/필드/인증/페이지/원래 링크를 확보한 뒤 전환. 현재 화면·기존 계정 복구 보존 |
| 입장·출석 등 상태 변경 API | 미연결 | 원래 요청/성공 근거와 공통 once-only 계약 확보 전 기존 버튼만 유지 |

PC에서 2026-11-11 익명 종근당 고정 읽기2개를 직접 요청해 HTTP200 JSON 월10,446바이트/일1,015바이트(합11,461본문 바이트)를 받았고 새 PC parser의 월/일 일치 검사를 통과했다. 대상 날짜1개는 Bell N이라 선택 결과0개다. **회원 인증/벨 수령/Windows 성공의 근거가 아니며 OS 전체 전송량이나 절감률도 아니다.** 익명 원문은 저장소/보고에 복사하지 않았다. 닥플 회원 API/Windows 네트워크는 실제 확인하지 않았다.

## 수용 사례와 PC 실행 경계

첨부 합성43사례(17 API + E01~E26)는 fixture로만 유지한다. 실제 PC `EntryRunner`/`WorkflowStore`/`LocalState`/`CatalogRunner`/`NativeCatalogRead`/주입 renderer/원래 IPC 경계가 기대 동작을 수행하는지 검사한다. fixture의 proposed_not_executed 표시는 첨부 당시 상태이며 PC 결과를 소급해 바꾸지 않는다.

| Runtime 항목 | PC 검사 | 해석 |
|---|---|---|
| R01 disabled | 저장 true/활성 예약/반복·재시도/늦은 callback/입장용 wrapper·실제 renderer 모든 모드 | 자동 GET·복구·POST0, 기존 조회/수동 보존 |
| R02 durable | 필수 두 저장 실패·중복/재시작/전송 뒤 응답 유실, 실제 HMP IPC 제출 전 durable slot33 확인 |0클릭 또는 소비 unknown. 같은 회차 재전송 없음 |
| R03 schema | 실제 v1→2 저장소 이관/원본 snapshot/소비 보존, 구 callback·string schema 거절, passive journal 분리 | 구+10 slot1은 새+25 proof 아님 |
| R04 conditional | typed false6종/play_failed·반례·+30 refresh/중복/취소·기한 | 허용된35만 유지, 새 목록 단독 생성 없음 |
| R05 owner | 실제 Electron exact partition bearer/쿠키 변경과 Node native 응답, 계정/취소 합성 | stale 폐기, 다른/임시/default 세션 혼용 없음 |
| R06 complete | 전체 다중 페이지/행수/ID/변동/부분/401·원래 남은 예산, 실제 HTTP→화면1회 | 부분/인증 오류를 빈 성공으로 처리하지 않음 |
| R07 write future | 신규 write API 미연결·기존 ledger/IPC 회귀 | 향후 계약 없이 상태 변경 API 추가하지 않음 |
| R08 resources | 실제 Electron webRequest·badge/CAPTCHA/CSS/JS/API/POST/수동·entry role | 숨은 media GET만 취소, security prefs 유지 |
| R09 cancel | 중지/계정·선택 철회/자정/구 callback/소유 자원 해제 | 새로운 권한·예약 부활 없음 |
| R10 measurement | 실제 합성 HTTP 본문 바이트·브라우저 계측·페이지/dispatch·창 생존 수치, 비밀값 부재 | **부분: 실제 Windows 동일 기간 OS 전송/성공률 비교와 실제 재생 유지시간 미측정** |

전체 고정 입력 검사와 패키징/게시 결과는 [v33 기록](releases/0.1.0-preview.33.md)에 남긴다. Linux Electron 합성 HTTPS와 Node 계약 성공은 Windows·DPAPI·실계정 로그인/입장/재생/출석/보상 성공과 다르다.

## 측정 한계와 다음 실제 확인

`resourceUse`는 현 프로세스의 apiRequests/apiBodyBytes/apiCompleted/apiFallbacks, 전체 생성 page/숨은 page/mainFrame load, 차단 media GET, 관측한 debugger Network 요청/encoded byte, 실제 entry dispatch/입장 창 생존 ms다. URL/계정/토큰/본문은 없다. debugger 바이트는 관측 범위/캐시/요청 경계의 제한이 있으며 OS 전체가 아니다. 창 생존은 실제 재생 시간이 아니다. OS network/playbackDuration은 null과 measured=false로 명시한다. 앱 재시작 전후의 장기 합계로 쓰지 않는다.

다음 평일에 같은 사이트/계정·날짜·등록 강의·기능 선택·기간으로 API body, 생성 page, 입장 횟수/실제 재생 유지, OS 실제 전송량과 성공률을 함께 비교해야 한다. 현재 자료와 합성 성공만으로 절감 GB/%나 회원 성공을 주장하지 않는다. 기존 사용자 설정/동의/opt-in·중지와 수동 작업을 유지한 채 사용자가 내보낸 새 보고를 확인한다.
