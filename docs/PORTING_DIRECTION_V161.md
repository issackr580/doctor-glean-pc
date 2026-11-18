# PC 요청 제어 · v161

기준 PC는 preview.33, 후보는 preview.34, 런타임은 Electron 45다. 에디션별 Windows DPAPI와 Chromium 프로필, workflow/ledger, 업데이트 서명 검증 방식을 사용한다. Android 서비스·알람·키 저장소·APK는 PC 실행 구성에 포함하지 않는다.

| 인수 항목 | preview.33에서 확인한 차이 | preview.34 구현과 검증 위치 |
|---|---|---|
| 01–04 | 네이티브 조회 실패가 브라우저와 로그인 복구로 이어졌다. 서버 대기를 저장하지 않았다. | src/native-catalog.js, catalog-runner.js, site-wait.js, main.js. 사이트별 최장 대기와 403 확인 개정 번호를 단일 메인 프로세스에서 기록한다. test/server-wait.test.js |
| 05–06 | 기존 ledger와 취소는 있었으나 열린 창에 같은 사이트 제한을 전달하지 않았다. | src/hidden-resources.js, automation-page.js, credential-manager.js. 수동 사이트 창은 별도다. scripts/electron-v161-cases.mjs는 loopback HTTP의 실제 Chromium 헤더와 새 요청 경계를 확인한다. |
| 07 | 오전 고정 08:10 | src/morning-schedule.js, automation-controller.js. 로컬 설치 난수로 당일 시각을 고정하고 원래 일일 영수증과 08:40 종료를 유지한다. |
| 08–09 | 라운지 문서당 재열기·응답 시각 구분 누락 | src/lounge-runner.js, automation-page.js, workflow-store.js. 원래 페이지의 응답만 관측한다. 매일의 전송 키에 준비 초·문서 세대를 넣지 않는다. 공급자 시각만으로 지급 완료를 판정하지 않는다. |
| 10 | 종전 블루팜 판독기에 새 상태 필터 범위가 없었다. | src/catalog-page.js, vendor/direction161, src/catalog-store.js. PC가 주입하는 판독기와 원래 필터 버튼으로 제공된 다섯 fixture를 실행한다. 전체 날짜의 부재를 주장하지 않는다. |
| 11 | 조회 큐가 실행기 거절 시 항목을 버렸다. | src/catalog-queue.js. 동일 세대의 읽기만 한 번 다시 시작한다. 중지·날짜/선택 변경·관련 동의 철회가 대기를 무효화한다. 디톡스 마지막 실패 시각과 제한된 진단값을 별도로 보존한다. |
| 12 | 한미 schema2, 공식 ID·기존 예약 및 시도 기록, 디톡스 자동 입장 중지가 이미 구현되어 있다. | 기존 HMP/DTalks 회귀와 entry/replay 제품 경계를 계속 실행한다. 실제 Windows 설치 이관은 별도 검사한다. |
| 13 | 상시 메모리 카운터만 존재했다. | src/resource-use.js, main.js, ui/app.js. 7일 로컬 옵트인. API 본문·Chromium 관측 바이트·목록 DOM 판독·전체 범위 확인 결과를 개별 집계한다. OS 전체 바이트, 실제 재생/보상은 미측정이다. |
| 14 | 입력 해시와 실행별 회귀 보고서는 있었으나 새 계약 자료 누락을 검사하지 않았다. | scripts/v161-inputs.mjs, verify-pc.mjs. 필수 판독기와 합성 fixture의 고정 SHA를 확인한다. 각 실행의 원본 로그·해시를 보존한다. Windows 설치, 서명된 피드와 실계정 검증은 독립 단계다. |

개발 권장 모델은 범위가 확정된 단일 파서·표시 수정에 Sol / medium~high, 일반 이식에 Astra / high, 세션·기한·재시작 간 경쟁에 Astra / xhigh다. 새 오류는 변경 전 실제 실패 횟수와 후보의 동일 경계 횟수를 함께 기록한다.
