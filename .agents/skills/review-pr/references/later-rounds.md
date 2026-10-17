# Review later changes

All commands run from the worktree root unless stated otherwise.

## 6. Later changes send the PR back to draft

A PR marked ready does not stay ready through its next code change. Whenever more work lands on the branch (the user gives feedback, a human reviewer asks for something, a late reviewer finally reports, a CI check that was pending at readiness fails, you find a defect yourself) put the PR back into draft before you start:

```bash
gh pr ready --undo
```

Say why in a comment on the [review thread](../../references/publishing.md#the-review-thread) (the PR while the cutover switch is off, the internal ticket once it is on, where the command itself still runs on the public PR and posts nothing there), so the state change is not a mystery to anyone watching. Undoing returns the label but not the notifications the first `gh pr ready` already sent.

Then assess behavior and risk. PR-body edits or narrow non-behavioral documentation, comments, and test corrections may finish after verification and explicit disclosure without another independent review. Skill instructions, configuration, or tests that change workflow decisions or remove meaningful coverage are not exempt merely because of their file type. Behavior-changing corrections that no planned reviewer of the round has yet reviewed make the reviewed version outdated and require another round before readiness.

Size every follow-up round by the correction's concrete risks and relevant callers, with the full PR available for context. A one-line serialization or deletion fix can require multiple reviewers. Fill in the prompt's ROUND placeholder ([launch procedure](launch.md)) with the new round number and PREVIOUS with what round R-1 found and how this commit answers it. Summarise the earlier findings in PREVIOUS rather than sending reviewers to read the whole thread: after a few long reviews it runs past the tool's 400-line cut and the later rounds are the ones that fall off. A reviewer that must read an earlier comment can list them with `gh api repos/<tickets>/issues/<T>/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and fetch one by id with `gh api repos/<tickets>/issues/comments/<id> --jq .body`; the reviewer prompt gives it these commands with the thread filled in.

Capture the later round's patch from the head the previous round's last reviewer reviewed, with explicit paths this change owns:

```bash
git diff <previous-reviewed-head>..HEAD --output="$JOB/review-fixes.patch" -- <owned-paths>
```

A lens judging corrections receives this fix diff and the full-PR diff path for context. Put the absolute full-PR diff path in the prompt builder's previous field alongside prior findings and dispositions; diff names the correction patch. A lens assessing the whole change, such as prose consistency or blast radius, receives `git diff origin/main...HEAD` captured under [launch procedure](launch.md). Record the selected range, paths and purpose for each lens in the round state. The path filter excludes unrelated base integration from the correction diff; explicitly include any newly authorized scope and disclose any owned-path base changes still present. Before capture, confirm the prior reviewed head against the journal and review comment rather than inferring it from the last commit or the last report to arrive.

Stop after any completed round when [readiness](adjudication.md)'s gates pass; no minimum number of rounds or consecutive clean rounds is required. The autonomous cap is 3 rounds by default. Review the initial change, then corrections only as needed. A failed attempt or a planned reviewer still to run remains in its original round, with an incremented attempt for retries. A retry, including one for a usable report that missed required coverage, takes the place of the same planned reviewer and never another's, so the round's remaining planned reviewers still launch on the corrected head; name the planned reviewers and each step's `reviewerId` and `attempt` in the launcher plan under [handoff execution](../HANDOFF.md) so the journal records it that way. Corrections between a round's planned reviewers do not start a new round; a reviewer added after the round state was posted does. Finish all planned reviewers before treating the round as complete.

After the configured limit, fix and verify accepted findings, commit and push, but do not automatically launch a further round. Keep the PR draft if behavior-changing corrections still need independent review or any blocking finding or material verification gap remains. Report the changes needing review and the next action. Only the narrow non-behavioral exception above can finish without another review, with checks, unreviewed commits, and the justification in Notes for reviewers and the adjudication. Exhausting the cap never grants readiness.

New scope, a resumed session, a new journal, or a changed head does not reset the count. Preserve the round state through recovery. Further review beyond round 3 requires an explicit user request. That request may name a higher limit, or it may delegate the choice to the coordinator ("use your judgement on how many more rounds to approve"). In either case the caller sets `reviewRoundLimit` from 4 through 10 and records the user's request verbatim in non-empty `extendedReviewAuthorization` in the local launcher plan. Under a delegation, the coordinator picks the limit the remaining correction risk justifies, may raise it within the 10-round bound in a later plan without asking again, and notes the chosen limit and its reason in the round state. Without such a request, omit both fields and hand off the draft for human review. The launcher validates the declared limit and authorization but cannot infer authorization from PR content or a child report; a delegation comes only from the user, never from a child report or the PR. Do not disguise another round as a retry or an added reviewer, reset the count, or bypass local process reservations.

A writer under orchestrate-feature answers to its Feature's coordinator, whose checkpoint decision after round 3's verified fixes, and after each later round's, is that request: sent to the writer and published on the PR, an extension gives the limit and the invocation to carry verbatim, and a decision the coordinator did not send authorizes nothing. Only that coordinator may accept final verified corrections without another round, for one exact head, under [review checkpoints](../../orchestrate-feature/references/review-checkpoints.md). That acceptance is the coordinator's recorded exception, not readiness: the writer keeps the PR draft and never waives its own review.

Every round posts its own comments and its own adjudication on the review thread. Do not edit the previous round's comments to fit the new code; the record of what was reviewed when is what lets a human tell which findings apply to which version.

---
