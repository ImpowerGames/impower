# Split a large agreed plan

All commands run from the worktree root unless stated otherwise.

## 4. Size it

If the agreed plan is more than one pull request's worth, split it into vertical slices: each slice cuts a complete path through every layer it touches and is verifiable on its own, rather than one layer at a time. File the feature ticket as the parent with the slice list in its plan, and each slice as a Task issue (template `.github/ISSUE_TEMPLATE/task.md`, type `Task`) that says "Split from #N" and which slices block it. File the parent first, then each slice in dependency order with the numbers it is blocked by, then edit the parent to list the slice numbers under Implementation plan. A wide mechanical change (a rename across the codebase) is the exception: sequence it as expand, migrate in batches, contract.
