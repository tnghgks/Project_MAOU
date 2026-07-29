---
name: gdd-pull-sync
description: 노션 GDD(기획 에픽) 문서를 pull해서 코드와 다른 최신 설계 변경사항을 찾고, 승인 후 실제 게임 코드에 반영한 다음, 반영한 작업을 개발 에픽 Task/TodoList에 기록한다. 사람이 GDD를 고치면서 변경 이력을 안 남겨도 스냅샷 diff로 정확히 뭐가 바뀌었는지 잡아내고, 문서 정리·버전·변경 이력까지 [[gdd-push-sync]]와 공유하는 state로 일관되게 관리한다. "GDD 반영해줘", "기획 바뀐 거 코드에 적용해줘", "GDD pull해줘", /gdd-pull-sync 요청 시 사용.
---

# GDD → 코드 반영 (Pull sync)

`development-sync`([[development-sync]])의 반대 방향이다. 그쪽은 "코드가 기준, 노션을 코드에 맞춤"이고
이 스킬은 "**GDD가 기준, 코드를 GDD에 맞춤**"이다. 사용자는 노션 GDD 페이지를 계속 고쳐나갈 것이고,
이 스킬은 그 변경을 감지해서 실제 구현으로 옮기는 역할을 한다.

반대로 코드에서 먼저 수치/로직을 조정하고 GDD 갱신을 나중에 하고 싶을 때는
[[gdd-push-sync]] (코드 → GDD 방향)를 대신 쓴다. 두 스킬은 **같은 shared state**
(`.claude/skills/notion/gdd-shared/`)를 읽고 쓴다 — 자세한 이유는 3번, 8번 참고.

이 스킬은 `notion/scripts/sync.mjs`를 `development-sync`, `gdd-push-sync`와 함께 재사용한다.
별도 스크립트를 새로 만들지 않는다.

GDD 페이지 ID: `3a82ca92-c5bc-80b5-b6f0-e9a35e905acd` (기획 에픽 > GDD Task)

## 0. 사전 조건

`node ../scripts/sync.mjs page-meta 3a82ca92-c5bc-80b5-b6f0-e9a35e905acd` 실행.
`NOTION_TOKEN이 설정되어 있지 않습니다` 에러가 나면 `development-sync`의 SKILL.md 0단계와 동일하게
안내하고 중단한다.

## 1. 변경 여부 확인

`.claude/skills/notion/gdd-shared/.state.json`을 읽는다 (없으면 첫 실행 — 6번 이후 전부 정상 진행,
diff 관련 단계만 "스냅샷 없음"으로 건너뛴다).

```json
{
  "version": "v0.2",
  "lastGddEditedTime": "2026-07-28T03:01:00.000Z",
  "lastSyncedCommit": "9d778b7",
  "history": [ { "direction": "push", "at": "...", "version": "v0.2", "summary": "..." } ]
}
```

`page-meta` 명령으로 받은 현재 `lastEditedTime`과 `lastGddEditedTime`을 비교한다.

- 같으면 → GDD가 그때 이후로 안 바뀐 것 (push-sync가 마지막으로 건드린 이후 사람도 안 고쳤다는 뜻).
  사용자에게 "변경 없음"이라고 보고하고 멈춘다.
- 다르거나 state 파일이 없으면 → 2번으로 진행.

## 2. GDD 전체 내용 읽기

```
node ../scripts/sync.mjs doc-blocks 3a82ca92-c5bc-80b5-b6f0-e9a35e905acd
```

전체 섹션(게임 개요/루프/핵심 시스템/육성/카드/UI/진행구조/최종화/기술설계/MVP범위/변경 이력)을
읽어서 이번 실행의 "현재 상태"로 확보한다.

## 3. 정밀 diff — 스냅샷과 비교

`.claude/skills/notion/gdd-shared/.snapshot.txt`가 있으면, 그건 **마지막으로 pull이든 push든
어느 스킬이 GDD를 다뤘던 시점의 전체 텍스트**다 (블록 ID가 안 바뀌므로 텍스트만 비교하면 됨).
2번에서 받은 새 덤프를 임시 파일로 저장하고 `diff .claude/skills/notion/gdd-shared/.snapshot.txt <새덤프>`를
떠서 **정확히 어떤 블록이 어떻게 바뀌었는지**를 얻는다.

- 이 diff가 사실상 "사람이 안 남긴 변경 이력"을 대신한다 — 전체 문서를 다시 눈으로 훑을 필요 없이
  바뀐 블록만 본다.
- 스냅샷이 없으면(첫 실행) 전체 문서를 대상으로 4번을 진행한다.
- `gdd-push-sync`가 방금 전에 GDD를 고쳤어도, 그 스킬이 끝날 때 스냅샷을 갱신해두기 때문에
  여기 diff에는 안 걸린다 — **diff에 나오는 건 항상 "자동화가 아니라 사람이 고친 부분"**이라고
  간주해도 된다.

## 4. 코드와 대조해 "GDD가 앞서가는 지점" 찾기

3번의 diff에 나온 블록(및 그 블록이 속한 섹션)을 중심으로 `src/game`, `src/scenes`, `src/ui`,
`src/data`를 읽고 GDD와 대조한다. 방향에 주의:

- GDD에 있는데 코드에 없거나 다른 값/로직이면 → **구현 대상**
- 코드에는 있는데 GDD에 없는 것은 이 스킬의 범위가 아니다 (그건 `development-sync`가 코드→노션으로
  이미 처리함). 여기서는 GDD → 코드 방향만 본다.
- 이미 code == GDD로 일치하는 부분은 건드리지 않는다.

## 5. 계획 제시 및 승인

찾은 차이점마다 "GDD 내용 / 현재 코드 상태 / 제안하는 코드 변경"을 정리해서 사용자에게 보여주고
**반드시 승인을 받는다**. 게임 로직·밸런스에 실제 영향을 주는 변경이므로, 노션 쓰기 작업보다
더 신중하게 확인받는다. 일부만 승인되면 승인된 것만 진행한다.

## 6. 코드 반영

승인된 항목만 일반적인 코드 작업 방식으로 구현한다 (Edit/Write, 필요하면 test 실행 —
`npm run test`). 이 저장소의 기존 패턴을 따른다 (예: `src/data/*.ts`에 데이터 추가,
`src/game/battleSim.ts`에 순수 로직, `src/scenes`/`src/ui`에 연결).

## 7. GDD 정리 (cleanup)

사람이 급하게 고치면서 생긴 포맷/용어 어색함을 손본다. 3번 diff에 걸린 섹션만 다시 훑어서:

- 이 문서 다른 곳과 표기가 어긋나는 용어, 어색한 문장, 깨진 표 셀 등이 있으면 `update-text-block` /
  `update-table-row`로 고친다.
- 이미 깔끔하면 아무것도 안 한다 — cleanup은 "발견되면 고치는" 단계지 매번 뭔가 써야 하는 단계가 아니다.
- 여기서 손댈 항목도 5번 승인에 포함시키거나(권장), 사소한 오탈자 수준이면 결과 보고 때 같이 알리고 진행해도 된다.

## 8. 버전 및 변경 이력 표 갱신 (gdd-push-sync와 공유)

GDD 최상단 "변경 이력" 표(`날짜 | 버전 | 수정사항 | 비고` — 없으면 [[gdd-push-sync]] SKILL.md 7번을
참고해 만든다)에 이번 pull-sync 내용을 기록한다. **이 표와 버전 번호는 두 스킬이 공유하는 자원**이다 —
포맷이 어긋나면 다음 push-sync 때도 지저분해지므로 반드시 [[gdd-push-sync]]와 같은 규칙을 따른다:

- **버전**: 3번 diff에 "버전 vX.Y ..." 문단 자체가 이미 바뀌어 있으면(사람이 직접 올렸으면) 그대로 둔다.
  안 바뀌었으면(사람이 깜빡했으면) 이 스킬이 대신 마이너 버전을 올리고 최종 수정일을 오늘 날짜로 갱신한다.
- **변경 이력 행 추가**: 기존 표의 마지막 행 뒤에 `append-table-row`로 **딱 1행** 추가한다.
  `수정사항` 셀은 항목마다 상위 불릿(`• [섹션번호]`) + 하위 불릿(`    ◦ 내용`) 2줄 조합으로 개조식으로 쓴다.
  `비고` 셀에는 방향을 표시한다: `"pull · 반영 커밋 <6번 구현 후 커밋 짧은 해시>"`
  (아직 커밋 전이면 `"pull · 미커밋"`이라고 쓰고, 나중에 사용자가 커밋하면 갱신해도 된다).

```
node ../scripts/sync.mjs append-table-row <changelogTableId> "2026-07-28|v0.3|• [3-6.용사]\n    ◦ HP 성장 곡선 상향 반영|pull · 반영 커밋 abc1234" --after <마지막행id>
```

## 9. 개발 태스크에 기록

구현이 끝나면 `development-sync`와 같은 명령으로 `개발` 에픽에 반영한다:

```
node ../scripts/sync.mjs create-task "<제목>" --epic 개발
node ../scripts/sync.mjs create-todo <taskId> "<제목>" 완료
node ../scripts/sync.mjs update-todo <todoId> 완료
```

기존 개발 Task 중 관련된 게 있으면(예: 멘탈 시스템을 실제로 구현했다면 "멘탈 시스템" 개발 Task가
아직 없을 수 있음 — 이 경우 새로 생성) 새로 만들거나, 이미 있으면 그 아래 TodoList만 갱신한다.

## 10. shared state·스냅샷 갱신 및 보고

7·8번까지 GDD를 추가로 고쳤을 수 있으므로, **끝나기 직전에 `doc-blocks`를 다시 한 번 실행**해서
최종 상태를 얻는다. 그 결과로:

- `.claude/skills/notion/gdd-shared/.snapshot.txt`를 덮어쓴다 (Write 도구).
- `.claude/skills/notion/gdd-shared/.state.json`을 갱신한다: `lastGddEditedTime`(새 `page-meta` 값),
  `version`(8번에서 정한 값), `history`에 `{ direction: "pull", at, version, summary }` 추가.
  `lastSyncedCommit`은 이 스킬이 안 건드린다 (push-sync 전용 필드).

무엇을 구현했고, GDD를 어떻게 정리했고, 버전을 몇으로 올렸고, 개발 Task에 뭘 기록했는지
요약해서 사용자에게 보고한다.
