---
name: gdd-pull-sync
description: 노션 GDD(기획 에픽) 문서를 pull해서 코드와 다른 최신 설계 변경사항을 찾고, 승인 후 실제 게임 코드에 반영한 다음, 반영한 작업을 개발 에픽 Task/TodoList에 기록한다. "GDD 반영해줘", "기획 바뀐 거 코드에 적용해줘", "GDD pull해줘", /gdd-pull-sync 요청 시 사용.
---

# GDD → 코드 반영 (Pull sync)

`development-sync`([[development-sync]])의 반대 방향이다. 그쪽은 "코드가 기준, 노션을 코드에 맞춤"이고
이 스킬은 "**GDD가 기준, 코드를 GDD에 맞춤**"이다. 사용자는 노션 GDD 페이지를 계속 고쳐나갈 것이고,
이 스킬은 그 변경을 감지해서 실제 구현으로 옮기는 역할을 한다.

이 스킬은 `notion/scripts/sync.mjs`를 `development-sync`와 함께 재사용한다
(같은 Notion 워크스페이스, 같은 토큰 게이팅). 별도 스크립트를 새로 만들지 않는다.

GDD 페이지 ID: `3a82ca92-c5bc-80b5-b6f0-e9a35e905acd` (기획 에픽 > GDD Task)

## 0. 사전 조건

`node ../scripts/sync.mjs page-meta 3a82ca92-c5bc-80b5-b6f0-e9a35e905acd` 실행.
`NOTION_TOKEN이 설정되어 있지 않습니다` 에러가 나면 `development-sync`의 SKILL.md 0단계와 동일하게
안내하고 중단한다.

## 1. 변경 여부 확인

`.claude/skills/notion/gdd-pull-sync/.state.json`을 읽는다 (없으면 첫 실행).

```json
{ "gddLastEditedTime": "2026-07-27T05:48:00.000Z" }
```

`page-meta` 명령으로 받은 현재 `lastEditedTime`과 비교한다.

- 저장된 값과 같으면 → GDD가 그때 이후로 안 바뀐 것. 사용자에게 "변경 없음"이라고 보고하고 멈춘다.
- 다르거나 state 파일이 없으면 → 2번으로 진행.

## 2. GDD 전체 내용 읽기

```
node ../scripts/sync.mjs doc-blocks 3a82ca92-c5bc-80b5-b6f0-e9a35e905acd
```

전체 섹션(게임 개요/루프/핵심 시스템/육성/카드/UI/진행구조/최종화/기술설계/MVP범위)을 훑는다.

## 3. 코드와 대조해 "GDD가 앞서가는 지점" 찾기

`src/game`, `src/scenes`, `src/ui`, `src/data`를 읽고 GDD와 대조한다. 이번엔 방향이 반대라는 것에 주의:

- GDD에 있는데 코드에 없거나 다른 값/로직이면 → **구현 대상**
- 코드에는 있는데 GDD에 없는 것은 이 스킬의 범위가 아니다 (그건 `development-sync`가 코드→노션으로
  이미 처리함). 여기서는 GDD → 코드 방향만 본다.
- 이미 code == GDD로 일치하는 부분은 건드리지 않는다.

## 4. 계획 제시 및 승인

찾은 차이점마다 "GDD 내용 / 현재 코드 상태 / 제안하는 코드 변경"을 정리해서 사용자에게 보여주고
**반드시 승인을 받는다**. 게임 로직·밸런스에 실제 영향을 주는 변경이므로, 노션 쓰기 작업보다
더 신중하게 확인받는다. 일부만 승인되면 승인된 것만 진행한다.

## 5. 코드 반영

승인된 항목만 일반적인 코드 작업 방식으로 구현한다 (Edit/Write, 필요하면 test 실행 —
`npm run test`). 이 저장소의 기존 패턴을 따른다 (예: `src/data/*.ts`에 데이터 추가,
`src/game/battleSim.ts`에 순수 로직, `src/scenes`/`src/ui`에 연결).

## 6. 개발 태스크에 기록

구현이 끝나면 `development-sync`와 같은 명령으로 `개발` 에픽에 반영한다:

```
node ../scripts/sync.mjs create-task "<제목>" --epic 개발
node ../scripts/sync.mjs create-todo <taskId> "<제목>" 완료
node ../scripts/sync.mjs update-todo <todoId> 완료
```

기존 개발 Task 중 관련된 게 있으면(예: 멘탈 시스템을 실제로 구현했다면 "멘탈 시스템" 개발 Task가
아직 없을 수 있음 — 이 경우 새로 생성) 새로 만들거나, 이미 있으면 그 아래 TodoList만 갱신한다.

## 7. state 갱신 및 보고

`.claude/skills/notion/gdd-pull-sync/.state.json`에 방금 읽은 `lastEditedTime`을 저장한다
(Write 도구로 직접 갱신). 무엇을 구현했고 개발 Task에 뭘 기록했는지 요약해서 보고한다.
