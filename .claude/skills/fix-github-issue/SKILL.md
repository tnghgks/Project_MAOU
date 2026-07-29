---
name: fix-github-issue
description: Look up a GitHub issue in the tnghgks/Project_MAOU repo via gh CLI, analyze its root cause against the codebase, and implement a fix. Use when the user gives an issue number or URL and asks to look up, investigate, triage, or fix a GitHub issue (e.g. "이슈 12번 확인해서 고쳐줘", "fix issue #45", "이 이슈 조회해서 원인 분석해줘"). Does not commit, push, or open a PR — hand off to the github-issue-pr skill for that.
---

# Fix GitHub Issue

Fetch a GitHub issue, understand it, and implement the fix in code. Stop before
committing — PR creation is a separate skill (`github-issue-pr`).

## Steps

1. **Identify the issue number.** Parse it from the user's message or a pasted
   URL. If missing, ask for it — do not guess.

2. **Fetch the issue.**
   ```
   gh issue view <number> --repo tnghgks/Project_MAOU --json number,title,body,labels,state,comments,url
   ```
   Read the body and comments in full — comments often contain repro steps,
   root-cause hints, or scope changes agreed on after the issue was filed. If
   the issue references screenshots/videos, note them but don't block on
   fetching binary content.

3. **Check issue state.** If already closed, tell the user and confirm they
   still want work done before proceeding.

4. **Investigate the codebase.** Use Grep/Glob/Read (or the Explore agent for
   broad searches) to locate the relevant code. Do not start editing before
   you can state the root cause in one or two sentences.

5. **Present a short plan** if the fix is non-trivial or touches multiple
   files — one or two sentences on the root cause and approach. Skip this for
   obviously small fixes; don't over-ask.

6. **Implement the fix** with Edit/Write, following this repo's existing
   patterns and conventions (check CLAUDE.md and neighboring code — don't
   introduce new abstractions or unrelated cleanup).

7. **Verify.** Run relevant tests/build/lint if the project has them. For
   UI/gameplay changes, prefer actually running the change over claiming
   success from a type-check alone.

8. **Hand off.** Tell the user the fix is ready and that the `github-issue-pr`
   skill (or `/github-issue-pr <number>`) will branch, commit, push, and open
   the PR referencing this issue. Do not commit or push yourself.

## Notes

- This repo's default branch is `main`, which is also the PR target and the
  branch that triggers deploy (see `github-issue-pr` for branch/PR
  conventions) — don't create branches or assume a target branch yourself in
  this skill.
- If `gh issue view` fails (auth, not found, wrong repo), surface the raw
  error rather than guessing at the issue content.
