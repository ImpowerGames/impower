# Commit and open the draft PR

All commands run from the worktree root unless stated otherwise.

## 7. Commit, push, and open a draft PR

The PR opens before the review so the reviewers have a PR to comment on; findings live on the PR itself, tracked next to the code they criticize, instead of dying in a session transcript. Open it as a draft and leave it a draft until `/review-pr` says otherwise.

Clean up scratch files, then look at what you are about to stage (`rm -f testrun.log`, `git status --short`). Stage deliberately, by path; `git add -A` will happily commit a screenshot, a scratch `.sd`, or a crash dump. Stage new files before running any index-based check or pushing: `git ls-files`, the check loops built on it, and CI see only what is tracked, so an unstaged new file passes locally and is absent from the pull request.

```bash
git add packages/sparkdown/src/compiler/utils/filterImage.ts packages/sparkdown/src/tests/compiler/FilterImageLayers.test.ts
git status --short
git commit -F commit-msg.txt
git push -u origin fix/302-filterimage-layers
gh pr create --draft --title "fix(compiler): accumulate all matching filtered_layers (#302)" --body-file pr-body.md
```

The body follows `.github/PULL_REQUEST_TEMPLATE.md` (same headings, same order; `gh pr create` does not apply it for you) and must contain the line `Closes #302`, the only thing that makes GitHub close the issue on merge; the `(#302)` in the title is a mention and closes nothing. Read [shared publishing rules](../../../references/publishing.md) before publication: bodies go through `--body-file` (never `@-`), and you read the artifact back (`gh pr view --json number,title,body,isDraft`, then `gh pr view --json body --jq .body | grep -i "closes #302"`).

Where the material from the steps above goes: Summary carries the one-paragraph summary and the `Closes #N` line; Motivation what broke and why, with `file:line`; Changes the fix and any alternative you rejected; Testing and verification the regression test's path with its red/green evidence, the suites you ran with their real `Test Files` / `Tests` counts (naming any pre-existing failure you confirmed also fails on `origin/main`), and the before/after screenshots or the measurement that replaces them; Notes for reviewers any performance cost the fix carries, repeated in the first line of Summary so it is the first thing a reviewer reads.

---
