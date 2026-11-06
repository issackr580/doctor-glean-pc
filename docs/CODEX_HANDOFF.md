# PC판 현재 인계 — preview.31

| 항목 | 기준 |
|---|---|
| 제품 | Windows PC 전용, Electron45.0.0 / Node24/npm11 |
| 실행판 | 0.1.0-preview.31 |
| 실행 소스 | 8678d498b62abeb750c1166c43ad081742b8ea72 / pc-source-v0.1.0-preview.31 |
| 배포용 | https://github.com/issackr580/doctor-glean-pc/releases/tag/pc-v0.1.0-preview.31 |
| 개발자용 | https://github.com/issackr580/doctor-glean-pc/releases/tag/untagged-a27ff258b377eab34f98 — 관리자·쓰기 권한 collaborator Draft, ID436838597 |
| 피드 | updates/preview.json, 고정 PC Ed25519 공개키·실제 서버 패치 메타데이터 |

[PC-020](STATUS.md)·D30·[ID 이식 조사/지원 화면/저장 호환](PORTING_ID_V148.md)·[수용표](PORTING_ID_V148_ACCEPTANCE.json)·[v31 기록](releases/0.1.0-preview.31.md)을 읽는다. 실제 main bcc976a/preview.30의 별도 작업본에서 구현했고 [PR75](https://github.com/issackr580/doctor-glean-pc/pull/75)로 병합했다. 첨부 참고 코드나 과거 모바일 문서로 PC 구현을 추정하지 않았다.

닥터빌·키메디·메디게이트·후다닥·닥플·한미는 관측된 site+namespace+공식 ID를 수집→예약→목록/상세→입장 직전까지 전달한다. 같은 ID는 제목 변경을 허용하고 다른 ID는 별개다. 날짜/회차·시작·신청/종료·버튼·로그인/보안·원래 기한은 별도다. HMP goDetail은 원래 화면의 보이는 단일 숫자 리터럴만 읽고 실행/eval하지 않는다. ID로 detail/player URL을 만들지 않는다. 인터엠디·블루팜·디톡스는 기존 legacy다.

기존 단일 예약 key에만 ID 별칭을 붙인다. 실행/로그·시도/취소/수동/unknown·회차/일정/receipt를 재키잉/초기화하지 않는다. 같은 ID의 복수 옛 key는 새 조회 전 재시작에도 추가 실행을 막는다. 기존 원자적 ledger/workflow 저장 성공 뒤 같은 worker·계정/선택 epoch·격리 문서 nonce·원래 카드/버튼/root를 다시 확인한다. 저장 실패0클릭·불확실 재전송0회다. 기능/사이트 기본 선택과 Windows DPAPI/에디션·사이트 세션은 유지하며 모바일 인증/키/암호문·APK를 복사하지 않았다.

46계약/320항목을 실제 PC 정책 어댑터로 검사했다. 기존 PC legacy 키가 모바일과 달라 reference DTO의 새 ID 없는 출력만 투영하고 pcKey를 함께 제공한다. Node393·구문·Linux Electron45/Xvfb 합성 HTTPS 조회115·일일30·계정121·입장402·replay136·신청193·업데이트23, Electron 전체1020개와 최종 Windows resources/app의 Linux 관리 창 개발자115/배포101·에디션 데이터 분리·깨끗한 소스234파일·의존성/Node393/구문 재현·같은 에디션20~30의 실제 ZIP runtime·전체 app 패치 교체22경우를 확인했다. 고정 입력 SHA `7e1b10e6d1486b8f00fe488eb25afb6403b4ff52f3f269b2f49f2865e4b65ea3` 전후 일치. [소유자 수동 runner](https://github.com/issackr580/doctor-glean-pc/actions/runs/42269812067) 뒤12자산 재다운로드·서버 SHA/체크섬·ZIP 전체·독립 공개/404 경계를 확인했다. 배포용만 공개하고 개발자용은 Draft다. 서명 피드와 실제 서버 ZIP을 검증한 뒤 문서/피드를 별도 PR로 반영하고 임시 workflow를 제거한다.

앱의 첫 시작 시 로컬 JSON을 복구 전에 같은 에디션의 identity-state-snapshots에 불투명 백업한다. 사용자 Windows APPDATA는 클라우드에 없어 이 작업에서 백업했다고 주장하지 않는다. 되돌릴 때 자동 작업을 중지하고 더 새로운 소비/unknown/취소 기록을 유지해야 한다. v30 저장소의 선택적 필드 read/write 호환만 합성으로 확인했으며 v30은 새 ID 실행 정책을 이해하지 못한다. 되돌린 뒤 옛 자동 작업을 바로 재개하지 않는다. 자동 상태 복원/소비 리셋 API는 없다.

실제 Windows/DPAPI·회원 DOM/로그인·강의 입장/시청/출석/보상·알림/절전/복귀/재부팅·사용자 GitHub 로그인/버튼 설치는 별도 미확인이다. 기존 PC에는 장기 시청/디톡스180초+완료·월간 서로다른3강의/메디게이트 native 집계 재시도 proof가 없어 완료로 표시하지 않는다. 클릭/이동은 시청·적립 증거가 아니다. 기존 D26 일정 보정/당일 미입장 복구와 반복 슬롯은 유지한다.

실행 소스/검증 보고는 위의 고정 소스 기준이다. 이 인계와 피드는 제품 동작을 바꾸지 않는 후속 커밋이다. 다음 제품 변경은 새 버전으로 하고 RELEASE_PROCESS/UPDATES를 따른다. 서명 개인키·개인 ZIP/로그·계정/쿠키/토큰·Android APK/키는 소스/실행물에 넣지 않는다. Windows Authenticode와 PC 업데이트 서명은 별개다.
