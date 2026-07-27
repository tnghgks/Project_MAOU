---
name: development-sync
description: 현재 코드베이스의 구현 상태를 노션 "개발" 에픽의 Tasks/TodoList DB에 동기화한다. 코드를 분석해 새 Task/TodoList 항목을 만들거나 기존 항목의 진행 상태(시작 전/진행 중/완료)를 갱신한다. "노션 동기화", "노션 태스크 업데이트", "노션에 진행상황 반영해줘", /development-sync 요청 시 사용.
---

# Notion 개발 태스크 동기화

Project_MAOU 코드베이스의 실제 구현 상태를 노션 워크스페이스의 `개발` 에픽(프로젝트) 아래
`Tasks` DB / `TodoList` DB에 반영한다. **`기획` 에픽(GDD, 원페이저, 컨셉 탐색 등)의 문서 내용 자체는
건드리지 않는다** — 이 스킬은 코드 → 개발 방향 전용이다.

반대 방향(GDD를 고쳤을 때 그 변경을 코드에 반영하는 것)은 별도 스킬
`.claude/skills/notion/gdd-pull-sync`가 담당한다. 두 스킬은 같은 `../scripts/sync.mjs`를 공유한다.

## 0. 사전 조건 확인

`node .claude/skills/notion/scripts/sync.mjs list` 를 실행해본다.
`NOTION_TOKEN이 설정되어 있지 않습니다` 에러가 나면, 사용자에게 다음을 안내하고 **중단**한다:

1. 저장소 루트에 `.env` 파일 생성 (`.env.example` 참고)
2. `NOTION_TOKEN=<발급받은 토큰>` 한 줄 추가
3. 토큰은 팀 내부에서 개별 공유되는 값이며, 절대 git에 커밋하지 않는다 (`.env`는 이미 `.gitignore`에 포함됨)

토큰이 없으면 이 스킬은 아무 작업도 하지 않는다 — 코드 분석도 먼저 하지 말고 여기서 멈출 것.

## 1. 현재 노션 상태 조회

```
node .claude/skills/notion/scripts/sync.mjs list
```

`개발` 에픽에 연결된 모든 Task와 그 하위 TodoList 항목(제목/상태/완료 여부)을 JSON으로 반환한다.

## 2. 현재 코드 상태 분석

리포지토리(`src/game`, `src/scenes`, `src/ui`, `src/data`)와 최근 커밋(`git log`)을 조사해
실제로 구현된 기능/시스템 목록을 만든다. 필요하면 Explore 서브에이전트로 위임해도 된다.
GDD가 노션에 있다면(현재 `기획` 에픽의 GDD Task 페이지) 참고용으로만 확인하되,
**항상 코드가 최신 기준**이라는 점을 유지한다 — GDD와 코드가 다르면 코드를 따른다.

## 3. 매칭 및 계획 수립

1번에서 얻은 기존 Task 제목과 2번에서 얻은 코드 기능을 제목/키워드 유사도로 비교한다(AI 판단):

- 기존 Task와 대응되는 기능이 있으면 → 해당 Task 아래 TodoList 항목을 새로 만들거나
  기존 항목의 상태를 갱신
- 코드에 있는데 대응되는 Task가 없으면 → 새 Task를 `개발` 에픽 아래 생성
- 상태 판단 기준: 실제로 동작하는 코드가 있으면 `완료`, 일부만 구현됐으면 `진행 중`,
  코드가 전혀 없으면 `시작 전`. 추측하지 말고 실제로 파일을 읽어서 확인한 것만 반영한다.

이 계획(신규 Task 목록, 신규/변경 TodoList 목록과 각각의 상태)을 **사용자에게 먼저 보여주고
확인을 받는다** — 노션 워크스페이스에 쓰기 작업이라 승인 없이 바로 쓰지 않는다.

## 4. 반영

승인 후 아래 명령으로 반영한다.

```
# 새 Task 생성 (개발 에픽에 자동 연결됨)
node .claude/skills/notion/scripts/sync.mjs create-task "<Task 제목>"

# 새 TodoList 항목 생성 (status: 시작 전 | 진행 중 | 완료)
node .claude/skills/notion/scripts/sync.mjs create-todo <taskId> "<Todo 제목>" <status>

# 기존 TodoList 항목 상태 갱신
node .claude/skills/notion/scripts/sync.mjs update-todo <todoId> <status>
```

Task/프로젝트 레벨의 자동 상태(`TaskStatus`, `AutoStatus`, `Progress`)는 TodoList의
`Complete` 체크박스를 롤업해서 자동 계산되므로, TodoList 상태만 정확히 맞추면 상위 레벨은
따로 건드릴 필요 없다.

## 5. 결과 보고

무엇을 새로 만들었고 무엇의 상태를 바꿨는지, 그리고 `개발` 에픽의 갱신된 전체 진행률을
간단히 요약해서 사용자에게 알려준다.
