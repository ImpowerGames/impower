# Adjudicate and reverify

All commands run from the worktree root unless stated otherwise.

## 4. Adjudicate, on the PR

Reviewer output is a hypothesis, not a verdict; reviewer sessions confidently report defects that do not exist. If every reviewer of a round failed with a rate-limit error, the round did not run: relaunch the same set after the reset the errors name, and never adjudicate a partial round. If the coordinator exits, recover from the recorded launch IDs and start times before replacing any attempt; a missing comment is not evidence that a process exited.

For every finding, confirm it yourself in the code before acting. A claimed `file:line` that does not say what the reviewer claims is a dead finding, full stop. When two reviewers disagree about the same lines, break the tie by experiment rather than by the more convincing prose: for a claim that a test does not cover a branch, disable that branch and re-run; a suite that stays green proves the claim. Record the mutation and its result in the adjudication.

Then dispose of every finding where it lives, on the PR. Adjudicate every comment a reviewer posted, the latest correction winning: a reviewer that posts twice, or corrects itself in a later comment, is answered on its final position, and the earlier comment is named as superseded rather than left looking open. Post one adjudication comment per review via `--body-file`, naming the review comment ID, round, reviewed head and every finding's disposition:

- Accepted: fixed, with the commit SHA and verification.
- Rejected: the concrete reason and evidence, including a claim not confirmed at its cited location.
- Already covered: the earlier finding, adjudication ID and fix that cover it.

Adjudicate late or out-of-order reports against current HEAD. For each finding, state whether it remains live, is already fixed (name the commit and verification), or is no longer applicable (explain the current code). Name the commits between that report's reviewed head and current HEAD that the reviewer did not see. Preserve the report and its original round; arrival order does not change coverage or reset the stopping rule. A live finding that needs a code change follows [later-round rules](later-rounds.md) before editing.

The adjudicating writer and every reviewer read comments through the paginated API. List all IDs and headings with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'`, then fetch each relevant full body with `gh api repos/ImpowerGames/impower/issues/comments/<id> --jq .body`. Persist long bodies to private files and read them in bounded sections so tool output limits cannot hide later findings. Read back every published review and adjudication body, not only its heading. Do not use `gh pr view P --comments` for adjudication or prompt preparation.

When a finding's fix depends on a defect older than the branch, fix the older defect on the branch too and say so under Notes for reviewers; ticket it separately only when the fix can stand without it.

Do not silently drop findings; an unanswered review comment on the PR reads as an open defect.

---

## 5. Re-verify, then mark ready

Any change made in response to review re-opens verification and the tests: re-run the regression test (the write-regression-test skill's `redgreen`, with `--base origin/main` once the fix is committed; for a change pinned by a standalone check under the shared tooling directories, re-run that check in place of `redgreen`) and re-take the live evidence (the drive-web-editor skill, or the checks that exercise a change with nothing to boot). A review fix is a code change like any other, and it is the one most likely to be committed unverified. Commit by path, push. The diff lives in your private scratch directory, so there is nothing in the tree to clean up.

When the check imports a name the base revision does not export, `redgreen`'s revert fails at import: stage the base revision's file in a scratch directory beside the current check, with any sibling it imports and a junction to `node_modules`, and run the check there, reporting the failing case count. A base file that exits the process on a refusal hides every case after it; patch the scratch copy's exit into a throw, say so in the adjudication, and count the failures from the full run.

Marking the PR ready means this diff is finished and ready to be reviewed by a human. Make that claim only when every one of these is true:

- Every reviewer you spawned has come back.
- Every report is on the PR, including the ones you posted on a reviewer's behalf (see [launch procedure](launch.md)).
- Every finding is adjudicated in your adjudication comment, accepted, rejected, or already covered, with nothing left unanswered.
- Every fix you made in response is committed, pushed, and re-verified as above, and the last push is on the PR.
- No re-spawned lens is still outstanding from an aborted or retried attempt (see [independence](../SKILL.md)). If a lens ended up with no independent reviewer at all, say so on the PR before marking ready, so the human knows which angle nobody covered.
- The fix commits have themselves been reviewed under [later-round rules](later-rounds.md)'s rule, or the adjudication says which final fix was not.
- No external draft blocker remains. Under Notes for reviewers, name any prerequisite outside review (such as another PR holding required files), what must happen first, and the remaining work in the order a follow-up session should perform it. Keep the PR draft until that prerequisite and the remaining gates are satisfied.

Only then:

```bash
gh pr ready
```

Read it back, because the flag is silent when it does nothing:

```bash
gh pr view --json number,isDraft,reviewDecision
```

If you run out of budget, get blocked, or hand the session back with any of the above unfinished, leave the PR a draft and say plainly in the PR and to the user what is still outstanding.

---
