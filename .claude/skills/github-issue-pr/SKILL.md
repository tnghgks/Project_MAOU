---
name: github-issue-pr
description: Branch, commit, push, and open a GitHub pull request that links one or more issue numbers in the tnghgks/Project_MAOU repo, using gh CLI. Bundles multiple issues into a single PR when the user is fixing several at once. Use once fixes for one or more GitHub issues are already implemented and the user wants them turned into a PR (e.g. "PR 올려줘", "이슈 12번 PR 만들어줘", "커밋하고 PR 올려줘", "10, 11, 12 다 하나의 PR로 올려줘"). Pairs with fix-github-issue, which does the investigation and code changes first.
---

# GitHub Issue PR

Turn already-implemented changes into a branch + commit(s) + pushed PR that
links back to one or more originating GitHub issues. Supports both a single
issue and a batch of issues sharing one PR.

## Steps

1. **Identify the issue number(s).** From the user's message, the current
   conversation (e.g. just fixed via `fix-github-issue`), or ask if unclear.
   Accept a list (e.g. `10, 11, 12`) — all of them land in the same branch
   and the same PR unless the user explicitly asks for separate PRs.

2. **Check pending changes.**
   ```
   git status
   git diff HEAD
   git branch --show-current
   ```
   If there's nothing to commit, stop and tell the user.

3. **Get issue context for naming/linking**, one call per issue:
   ```
   gh issue view <number> --repo tnghgks/Project_MAOU --json title,url
   ```

4. **Create a branch if currently on `main`.** If already on a feature
   branch, reuse it — don't create a new one.
   - Single issue: `fix/issue-<number>-<short-kebab-slug-of-title>`
   - Multiple issues: `fix/issues-<n1>-<n2>-<n3>` (numbers joined by `-`, no
     slug — a title slug doesn't generalize across issues)

5. **Commit.** Prefer one commit per issue when the changes are cleanly
   separable by file/area (easier to review, easier to revert one fix later)
   — message per commit: `fix: <short description> (#<number>)`. If the
   fixes are entangled in the same files/lines, a single combined commit
   referencing all numbers is fine — don't force an artificial split, e.g.:
   ```
   fix: <short combined description> (#10, #11, #12)
   ```
   Match this repo's existing commit style (see `git log` — `feat:`/`fix:`
   prefixes are the convention here). Stage specific files, not `-A`.

6. **Push.**
   ```
   git push -u origin <branch>
   ```

7. **Open a single PR against `main`** (this repo's default branch, and the
   branch that triggers the GitHub Pages deploy on push — see
   `.github/workflows/deploy.yml`). Follow the repo's PR template
   (`.github/PULL_REQUEST_TEMPLATE.md`: 요약 / 변경 사항 / 확인 / 참고). List
   one `Closes #<number>` line per issue so every one of them auto-closes on
   merge — a single `Closes` line only closes one issue, do not comma-join
   numbers on one line:
   ```
   gh pr create --repo tnghgks/Project_MAOU --base main \
     --title "<title covering all fixes>" --body "$(cat <<'EOF'
   ## 요약
   <what changed and why, covering all issues>

   ## 변경 사항
   - (#10) <bullet>
   - (#11) <bullet>
   - (#12) <bullet>

   ## 확인
   - [ ] 동작 확인함

   ## 참고
   Closes #10
   Closes #11
   Closes #12
   EOF
   )"
   ```

8. **Report the PR URL** back to the user. Do not merge it yourself.

## Notes

- Never force-push or amend existing commits in this flow.
- If the user hasn't actually implemented a fix yet, redirect them to the
  `fix-github-issue` skill first — this skill assumes the diff already
  exists.
- If the user's issues are unrelated in scope (e.g. touch completely
  different systems) and they didn't explicitly ask to bundle them, ask
  before combining into one PR rather than assuming.
