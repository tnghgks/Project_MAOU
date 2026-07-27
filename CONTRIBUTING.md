# Contributing

## 브랜치 전략

- `develop`이 메인 개발 브랜치입니다.
- 각자 개인 작업 브랜치(`elio/working`, `dennis/working`)에서 작업한 뒤, PR을 열어 `develop`에 머지합니다.
- `develop`에 직접 커밋하지 않습니다.

## 이슈 트래커

- GitHub Issues는 **버그 트래킹 전용**입니다.
- 기능 요청, 태스크, 기획 문서(GDD 등)는 노션에서 관리합니다.

## 노션 연동 스킬 (Claude Code)

`.claude/skills/notion/` 아래 두 스킬이 코드와 노션을 동기화합니다.

- `/development-sync` — 코드 구현 상태를 노션 `개발` 에픽의 Task/TodoList에 반영
- `/gdd-pull-sync` — 노션 GDD(`기획` 에픽) 변경사항을 pull해서 코드에 반영 후 `개발` 태스크에 기록

사용하려면:

1. 저장소 루트에 `.env.example`을 복사해 `.env` 생성
2. `NOTION_TOKEN=<토큰>` 값 채우기 (토큰은 팀 내부에서 개별 공유받으세요 — 절대 커밋하지 마세요)
