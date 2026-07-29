# Contributing

## 브랜치 전략

- `main`이 메인 개발 브랜치이자 배포 브랜치입니다. `main`에 push되면 GitHub Pages 배포가 트리거됩니다.
- 각자 개인 작업 브랜치(`elio/working`, `dennis/working`)에서 작업한 뒤, PR을 열어 `main`에 머지합니다.
- `main`에 직접 커밋하지 않습니다.

## 이슈 트래커

- GitHub Issues는 **버그 트래킹 전용**입니다.
- 기능 요청, 태스크, 기획 문서(GDD 등)는 노션에서 관리합니다.

## 노션 연동 스킬 (Claude Code)

`.claude/skills/notion/` 아래 두 스킬이 코드와 노션을 동기화합니다.

- `/development-sync` — 코드 구현 상태를 노션 `개발` 에픽의 Task/TodoList에 반영
- `/gdd-pull-sync` — 노션 GDD(`기획` 에픽) 변경사항을 pull해서 코드에 반영 후 `개발` 태스크에 기록

## GitHub 이슈 스킬 (Claude Code)

- `/fix-github-issue <이슈번호 또는 URL>` — 이슈를 조회해서 원인을 분석하고 코드를 수정 (커밋/PR은 하지 않음)
- `/github-issue-pr <이슈번호(들)>` — 수정된 변경사항을 커밋/푸시하고 이슈를 링크한 PR을 `main`에 오픈. 여러 이슈를 동시에 고쳤다면 번호를 나열해 하나의 PR로 묶을 수 있음

## 환경 변수 설정

1. 저장소 루트에 `.env.example`을 복사해 `.env` 생성
2. `NOTION_TOKEN=<토큰>` 값 채우기 (토큰은 팀 내부에서 개별 공유받으세요 — 절대 커밋하지 마세요)
3. `VITE_BUCKET_BASE_URL=<버킷 base URL>` 값 채우기 — 배포 빌드에서는 GitHub Actions repo variable로 주입되지만, 로컬 개발 모드(`npm run dev`)에서는 `.env`에 직접 있어야 컷씬 영상 등이 로드됩니다
