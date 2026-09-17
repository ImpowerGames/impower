---
name: review-spec-engineering
description: Adversarially review a filed Feature and its slice Tasks against the code and against the plan itself before any slice is implemented. Use after file-feature and before resolve-issue starts on the first slice; every sliced feature gets this review.
---

# Review a feature's engineering design

Independent reviewers check the design of record, the parent Feature and its slices, against the code it relies on and against its own plan, before an implementer fills the gaps with guesses. The review edits tickets, never repository files. Before the first step, read [spec review mechanics](../references/spec-review.md): the snapshot, independence, launcher, report, anchoring, adjudication and round rules both spec reviews share.

## 1. Freeze the design

Read the parent and every slice. Take the snapshot, record the checkout commit the reviewers read code at, and post the round-state comment on the parent issue. The worktree must be clean and committed; the launcher refuses otherwise.

## 2. Assign lenses

Size the review by the shared count rule. The `undirected` lens is always present; assign the rest within the remaining reviewers, combining lenses where the count requires:

- `feasibility`: every claim in the Implementation plan traced to the code it relies on; each hook, seam or package that does not exist, each collision with an open ticket or branch, and each step whose package is wrong.
- `slicing`: every slice ships and is testable on its own, the dependency order is right, and each acceptance criterion names a seam a reviewer can check.
- `performance`, only when the feature touches the compile, typing or render path: the plan against the measurements it cites and the method to take them.

## 3. Launch and await

The caller supplies the writer identity and effort, a reviewer route distinct from the writer or none, and the launch method; a missing value blocks the review. Build each prompt with the shared builder and launch each reviewer through the launcher with a `target: "issue"` plan, as the mechanics reference describes. Await the launcher; do not edit a ticket while a reviewer runs. Read every report through the paginated API and post any missing report on the reviewer's behalf, verbatim.

## 4. Adjudicate

Confirm each finding in the code before acting. Post each disposition on the parent issue with the report's comment ID, the round and the snapshot digest, under the anchoring and follow-up rules. Accepted findings edit the parent or the affected slice and are read back; the edited tickets remain the design of record. Stop after one round unless accepted edits changed a ticket materially; the cap is two.

## 5. Hand off

Report the reviewed snapshot digest, every report and adjudication by comment ID, the edited tickets, the follow-ups with proposed titles, and any reviewer that did not report. At completion, or when yielding for input or help, provide the normal chat handoff and invoke [notify-user](../notify-user/SKILL.md) for an optional companion alert identifying the work and next action. Use `done` when no action is needed, `user_input_needed` for a question or a decision on an accepted edit, or `blocked` when progress requires help. If the notifier is unavailable, skip it silently.
