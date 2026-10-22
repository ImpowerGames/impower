# Slicing loose Bugs

Step 2 turns a parent's loose Bugs into Task slices before the first plan, so Bugs that share a mechanism go to one writer, one worktree and one review cycle instead of one each. The coordinator files, re-parents and orders the slices itself under the grant in Authority. It does not ask the maintainer to approve the grouping, since organizing the work is its job.

## Which Bugs are loose

A Bug is loose when it is open, sits directly under the parent or under a container in the parent's tree, and has no PR, worktree, writer or pending start: the snapshot shows its PRs and worktrees, and the record shows its writers and pending starts. The step runs when two or more Bugs are loose. A parent that is already sliced, such as a Feature filed through file-feature whose sub-issues are its slices, skips it.

## Grouping on evidence

Group Bugs only when reading the code behind each one shows that they share a mechanism or a file set. Titles and labels are not evidence. A sub-agent may do the reading and return each Bug's mechanism and the files a fix would edit, with `file:line` citations, so the coordinator's long-lived context stays small.

Mis-grouping is the costly failure. A Bug that does not belong holds every other Bug in its slice until the slice's PR merges, because none of them is delivered on its own. When the evidence for one Bug is weak, leave that Bug as its own ticket.

## Rules for a slice

- Each slice is one reviewable PR. A group too large to review as one PR becomes several slices.
- A slice holds only Bugs. The planner delivers a Task or Feature's sub-issues only when they are all Bugs (`delivers` in `issue-run.mjs`). A slice with any other sub-issue is a container and is never dispatched for them.
- A slice holds at least two Bugs. A lone Bug is already its own slice, so it is never wrapped in a Task.
- Never re-parent a Bug that has a PR, worktree, writer or pending start. That work stays with its own ticket.
- The slice's Effort is the Effort of its hardest Bug, since it sets the writer's effort. A Bug with no Effort is estimated first, as [issue fields](../../references/issue-fields.md) describes.
- The slice is `blocked_by` the current tail of the serial chain for the file set it edits: the last undelivered ticket in the parent's tree whose fix edits those files. No two slices on one file set are then eligible at once. A slice on a file set with no chain yet starts one and has no such blocker.

## Filing and re-parenting

1. File each slice as a Task through the [filing routes](../../references/runner-filing.md), as a sub-issue of the parent or of the container its Bugs came from. The prompt names the Bugs it holds, the shared mechanism with its `file:line` evidence, the file set, the Effort to set and the blocker. Under file-task, the blocker is a "Blocked by" sentence that `record-blockers.mjs` records.
2. Move each Bug under its slice with `gh api -X POST repos/<tickets>/issues/<slice>/sub_issues -F sub_issue_id=<id> -F replace_parent=true`, where `<id>` is `gh api repos/<tickets>/issues/<N> --jq .id`. Then read the slice's sub-issues back.
3. Run `snapshot` again, so the plan reads the new tree.

## Dispatched slices and Bugs that arrive mid-run

A slice is dispatched once it is claimed. Its brief fixes the tickets its PR delivers when it is printed, so a Bug added afterwards has no closing reference in that PR. The PR then merges and leaves the Bug open, and the planner plans the Bug as `decision-needed`. So a Bug never joins a dispatched slice.

A Bug that a later snapshot shows under the parent goes through this step again. Two or more new loose Bugs that share a mechanism get a new slice, and a slice that is not claimed yet may take a Bug on the same evidence. A Bug that is alone stays its own ticket.

## Reporting

The pre-dispatch report in step 0 lists each slice filed, with its Bugs, its file set and its place in that file set's chain (the ticket it is `blocked_by`, or that it starts the chain). A slice filed mid-run is reported the same way at the next report.
