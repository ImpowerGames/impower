# Split a large agreed plan

All commands run from the worktree root unless stated otherwise.

## 4. Size it

If the agreed plan is more than one pull request's worth, split it into vertical slices: each slice cuts a complete path through every layer it touches and is verifiable on its own, rather than one layer at a time. File the feature ticket as the parent with the slice list in its plan, and each slice as a Task issue (template `.github/ISSUE_TEMPLATE/task.md`, type `Task`) that says "Split from #N" and which slices block it. File the parent first, then each slice in dependency order with the numbers it is blocked by, then edit the parent to list the slice numbers under Implementation plan.

Attach every slice to the parent as a GitHub sub-issue as soon as the slice exists, through the REST endpoint `POST /repos/{owner}/{repo}/issues/{parent}/sub_issues` with `sub_issue_id` set to the slice's numeric issue `id` (the database id from the creation response, not its `#number`). Then read `GET /repos/{owner}/{repo}/issues/{parent}/sub_issues` back and confirm it lists every slice; the "Split from #N" line is a cross-reference for readers and does not replace the link. A slice filed later for the same feature, including a follow-up from a feature review, is attached the same way.

Write each slice's blockers as one sentence starting "Blocked by" that names every blocking ticket as `#N` ("Blocked by #721 and #722."), and write "Not blocked." for a slice with none. Once the slice and its blockers exist, run `node .agents/skills/references/record-blockers.mjs <slice>`: it records every stated blocker as a GitHub issue dependency by the blocker's database id, then prints the read-back and exits non-zero if a stated blocker is still absent. The body sentence and the sub-issue link do not create the dependency, and a closed blocker is accepted. Several slice numbers can go in one run, and `--dry-run` shows what would be added.

A wide mechanical change (a rename across the codebase) is the exception: sequence it as expand, migrate in batches, contract.
