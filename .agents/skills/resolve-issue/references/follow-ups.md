# Settle outstanding work before the handoff

Run this once, at the end of the session's own work: after review-pr's last correction is adjudicated and reverified, immediately before the PR is marked ready, before asking the user to authorize rounds beyond the cap, or before an incomplete draft handoff. Not earlier. Until then an out-of-scope observation is a one-line note with its `file:line`; reproducing, investigating or filing it mid-task spends context the issue's own fix, verification and review still need. Even in the sweep, the reproduction and filing are delegated, as the last section describes.

When the sweep starts, list what the session noticed and left unresolved: a defect in neighboring code, a wrong or stale comment or document, a failing or missing test, a workaround you added, a verification gap. Then settle each item, either by fixing it in this PR or by filing a ticket. Nothing on the list is left only in the session transcript.

## Fix it here by default

The default is to fix the item in this PR. A ticket is the expensive option: another session has to rediscover what you already know, build a worktree and go through its own review, and the maintainer has to triage one more issue. Fix the item here when any of these is true:

- The issue's fix is not correct, complete or verifiable without it, including a defect older than the branch that the fix depends on.
- It is in code, tests or documents this PR already changes, or it has the same root cause as the issue.
- Fixing and testing it costs about as much as filing it well.

None of these is a reason to file instead of fixing: the item is tedious or hard, it predates the branch, its test is awkward to write, or fixing it now means another review round. Work the issue's own acceptance criteria require is never a follow-up; while it is unfinished, the PR stays draft and the handoff is an incomplete draft handoff.

A fix made after the reviewed head is a correction under review-pr's [later-round rules](../../review-pr/references/later-rounds.md), and it waits until every reviewer process has exited. That cost is the reason to fix what you meet during steps 4 to 6, when you meet it, and to keep this sweep for what is left.

## File a ticket only for separate work

File a ticket only when all of these are true:

- This PR's change is correct and verified without the item.
- Fixing it here would widen the PR beyond its issue: it sits in another subsystem, needs its own reproduction and review, or turns on a behavior decision the maintainer has not made.
- It is real: reproduced, or confirmed in the code at a `file:line`, during this sweep rather than while the issue's own work was unfinished. A suspicion, a style preference or an improvement with no named consequence is not a ticket; mention it in the handoff or drop it.

This step authorizes filing the items that meet that bar, without asking first. New functionality with unsettled design is not filed from here: propose it in the handoff, since file-feature needs the user's decisions. A Task that review-pr already filed for a deferred finding is not filed again. Friction with a skill goes to the feedback inbox, not a ticket.

## Delegate the reproduction and filing

Do not reproduce or file the candidates yourself. Read [filing routes](../../references/runner-filing.md) and launch the runner's cheap filing route once per candidate, all together, each with the item's `file:line`, one sentence on the symptom, the base commit and this PR's number. The route follows [file-bug](../../file-bug/SKILL.md) for wrong behavior or [file-task](../../file-task/SKILL.md) for bounded maintenance in its own worktree, never this PR's, searches for an existing issue first so an open match is reused, declines to file what it cannot reproduce, and reports the issue number or `Not filed` with the reason. Await every route before the handoff, read each filed ticket back, and treat a `Not filed` report as a dropped item to mention in the handoff. Only when the runner offers no filing route do you run file-bug or file-task yourself, skipping their user handoff.

## Record it

In the PR body, name each in-passing fix under Changes and each filed ticket under Notes for reviewers, with one sentence on why it is separate work, and read the body back. In the handoff, list the tickets filed and the in-passing fixes, or say None. Most sessions file nothing.
