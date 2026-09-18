---
name: review-feature-engineering
description: Adversarially review a filed Feature and its slice Tasks against the code and against the plan itself, agree the corrections with the maintainer in an interview, and apply them to the tickets. Use only when the maintainer asks for this review; it runs in a fresh session of a different model than the one that filed the feature, before resolve-issue starts on the first slice.
---

# Review a feature's engineering design

This session checks the design of record, the parent Feature and its slices, against the code it relies on and against its own plan, then puts what it found to the maintainer as questions and edits the tickets with the answers. The review edits tickets, never repository files. Before the first step, read [feature review mechanics](../references/feature-review.md): the independence check, what is reviewed, the anchoring and follow-up rules, and the interview and apply steps both feature reviews share.

## 1. Check independence and read the design

Compare the ticket's `Filed by` model with this session's model and stop in a same-model session. Read the parent and every slice it lists, and record the clean checkout's commit.

## 2. Review through every lens

Keep each finding in context with its anchor as it is found. Apply all of these, in order:

- Undirected: read the whole design against the code and against its own plan and note anything wrong that can be anchored, before the lenses below, so they do not narrow the pass.
- Feasibility: trace every claim in the Implementation plan of the parent and of each slice to the code it relies on. Note each hook, seam, function or package the plan assumes that does not exist at this commit; each collision with an open ticket or branch (`gh issue list --state open`, `git branch -r`); and each step whose named package is wrong for the work it describes. A claim that names a `file:line` is checked at that line; a claim with no location is traced to where the code actually is, and noted when it is nowhere.
- Slicing and verifiability: check that every slice ships and is testable on its own. Note each acceptance criterion a reviewer could not check without a later slice, and each pair of slices whose dependency order is wrong or missing. For every acceptance criterion, name the seam a reviewer would check it at (a test file and what it proves, a driver command and what it shows, a measurement and how it is taken), and note each criterion that names none or names one that cannot observe what it claims.
- Performance, when the feature touches the compile, typing or render path: check the plan against the measurements it cites. Note each budget or number with no method to take it, each measurement the cited method cannot produce, and each step that adds work to a per-keystroke, per-frame or per-compile path without saying where its cost lands. The measurement method is in [the editor driver's performance reference](../drive-web-editor/references/performance.md).

## 3. Interview the maintainer

Group the findings into decisions and ask in rounds as the mechanics reference describes: blocking decisions first, each with its evidence, the recommended resolution and the edit it implies. Continue until the frontier is empty.

## 4. Apply the agreed edits

Edit the parent and the affected slices, read each back, and post the one summary comment on the parent.

## 5. Hand off

Report the tickets edited, the follow-ups proposed with their titles, and any question the maintainer deferred. At completion, or when yielding for input or help, provide the normal chat handoff and invoke [notify-user](../notify-user/SKILL.md) for an optional companion alert identifying the work and next action. Use `done` when no action is needed, `user_input_needed` when a round of questions is waiting, or `blocked` when progress requires help. If the notifier is unavailable, skip it silently.
