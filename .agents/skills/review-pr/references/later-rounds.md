# Review later changes

All commands run from the worktree root unless stated otherwise.

## 6. Later changes send the PR back to draft

A PR marked ready does not stay ready through its next code change. Whenever more work lands on the branch (the user gives feedback, a human reviewer asks for something, a late reviewer finally reports, you find a defect yourself) put the PR back into draft before you start:

```bash
gh pr ready --undo
```

Say why in a PR comment, so the state change is not a mystery to anyone watching. Undoing returns the label but not the notifications the first `gh pr ready` already sent.

Then assess behavior and risk. PR-body edits or narrow non-behavioral documentation, comments, and test corrections may finish after verification and explicit disclosure without another independent review. Skill instructions, configuration, or tests that change workflow decisions or remove meaningful coverage are not exempt merely because of their file type. Behavior-changing corrections make the reviewed version outdated and require another round before readiness.

Size every follow-up round by the correction's concrete risks and relevant callers, with the full PR available for context. A one-line serialization or deletion fix can require multiple reviewers. Fill in the prompt's ROUND placeholder ([launch procedure](launch.md)) with the new round number and PREVIOUS with what round R-1 found and how this commit answers it. Summarise the earlier findings in PREVIOUS rather than sending reviewers to `gh pr view P --comments`: after a few long reviews that output runs past the tool's 400-line cut and the later rounds are the ones that fall off. A reviewer that must read an earlier comment can list them with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and fetch one by id with `gh api repos/ImpowerGames/impower/issues/comments/<id> --jq .body`.

Capture the later round's patch from the previous round's recorded reviewed head, with explicit paths this change owns:

```bash
git diff <previous-reviewed-head>..HEAD -- <owned-paths> > "$SCRATCH/review-<round>-fixes.patch"
```

A lens judging corrections receives this fix diff and the full-PR diff path for context. Put the absolute full-PR diff path in the prompt builder's previous field alongside prior findings and dispositions; diff names the correction patch. A lens assessing the whole change, such as prose consistency or blast radius, receives `git diff origin/main...HEAD` captured under [launch procedure](launch.md). Record the selected range, paths and purpose for each lens in the round state. The path filter excludes unrelated base integration from the correction diff; explicitly include any newly authorized scope and disclose any owned-path base changes still present. Before capture, confirm the prior reviewed head against the journal and review comment rather than inferring it from the last commit or the last report to arrive.

Stop after any completed round when [readiness](adjudication.md)'s gates pass; no minimum number of rounds or consecutive clean rounds is required. The autonomous cap is 3 rounds. Review the initial change, then corrections only as needed. A failed attempt or pending reviewer on the same frozen head remains in its original round, with an incremented attempt for retries. Finish all required reviewers before treating the round as complete.

After round 3, fix and verify accepted findings, commit and push, but do not automatically launch a further round. Keep the PR draft if behavior-changing corrections still need independent review or any blocking finding or material verification gap remains. Report the changes needing review and the next action. Only the narrow non-behavioral exception above can finish without another review, with checks, unreviewed commits, and the justification in Notes for reviewers and the adjudication. Exhausting the cap never grants readiness.

New scope, a resumed session, a new journal, or a changed head does not reset the count. Preserve the round state through recovery. Further review beyond round 3 is a human decision requiring explicit user direction. The launcher supports only rounds 1–3 and has no beyond-cap override: hand off the draft for human review instead of promising a supported local continuation. Do not disguise another round as a retry, reset the count, or bypass local process reservations.

Every round posts its own comments and its own adjudication. Do not edit the previous round's comments to fit the new code; the record of what was reviewed when is what lets a human tell which findings apply to which version.

---
