# Review later changes

All commands run from the worktree root unless stated otherwise.

## 6. Later changes send the PR back to draft

A PR marked ready does not stay ready through its next code change. Whenever more work lands on the branch (the user gives feedback, a human reviewer asks for something, a late reviewer finally reports, you find a defect yourself) put the PR back into draft before you start:

```bash
gh pr ready --undo
```

Say why in a PR comment, so the state change is not a mystery to anyone watching. Undoing returns the label but not the notifications the first `gh pr ready` already sent.

Then judge what the change costs. Editing prose in the PR body, or a doc-only tweak, does not need a second review; mark it ready again once it is in. A code change makes the reviewed version outdated. Assess the new diff under the stopping rule below before launching another round.

Size every round by the diff it reviews. Fill in the prompt's ROUND placeholder (see [launch procedure](launch.md)) with the new round number and PREVIOUS with what round R-1 found and how this commit answers it, and size the tier by the diff of what changed since the previous round rather than by the size of the whole PR; a one-line follow-up fix earns the Minimal tier even on a PR whose first round ran five reviewers. Summarise the earlier findings in PREVIOUS rather than sending reviewers to `gh pr view P --comments`: after a few long reviews that output runs past the tool's 400-line cut and the later rounds are the ones that fall off. A reviewer that must read an earlier comment can list them with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and fetch one by id with `gh api repos/ImpowerGames/impower/issues/comments/<id> --jq .body`.

Capture the later round's patch from the previous round's recorded reviewed head, with explicit paths this change owns:

```bash
git diff <previous-reviewed-head>..HEAD -- <owned-paths> > "$SCRATCH/review-<round>-fixes.patch"
```

A lens judging corrections receives this fix diff. A lens assessing the whole change, such as prose consistency or blast radius, receives `git diff origin/main...HEAD` captured using [launch procedure](launch.md). Record the selected range, paths and purpose for each lens in the round state. The path filter excludes unrelated base integration from the correction diff; explicitly include any newly authorized scope and disclose any owned-path base changes still present. Round 4 remains narrow under the stopping rule below. Before capture, confirm the prior reviewed head against the journal and review comment rather than inferring it from the last commit or the last report to arrive.

The loop has a stopping rule. Continue reviewing code corrections through round 3. If code changes after round 3, run one narrow round 4 covering only the changes since round 3's reviewed head and the callers needed to assess them. Use one reviewer for internal skills work unless a specific deletion or data-preservation risk warrants a second. Documentation, comments and test-only corrections can finish after verification with an explicit note that the final correction was not independently re-reviewed.

After round 4, do not automatically launch another review. Fix and verify accepted findings, commit and push them, then assess the remaining risk of those final changes. Keep the PR draft when another independent review would materially reduce unresolved correctness, deletion or data-preservation risk, and tell the user which changes warrant another round and why. If another round would add little value and the [readiness gates](adjudication.md) are satisfied, mark the PR ready for human review. In either case, record the final unreviewed commits, checks and the reason for the readiness decision under Notes for reviewers and in the adjudication. Readiness is a judgment supported by evidence, not an automatic reward for exhausting the round count.

New scope added during a review cycle is named explicitly in the round's scope and included in its diff; it does not silently reset the count. Further review beyond round 4 requires explicit user direction.

Every round posts its own comments and its own adjudication. Do not edit the previous round's comments to fit the new code; the record of what was reviewed when is what lets a human tell which findings apply to which version.

---
