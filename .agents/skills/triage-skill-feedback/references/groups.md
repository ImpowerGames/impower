# Choose and preview group actions

All commands run from the worktree root unless stated otherwise.

## 2. Decide each group's outcome

Edit only `groups` in the plan with the editor tool. A problem needs a group when it has no Task (a new problem, an archived problem still marked open, a table row still open, or a recurrence of an applied edit) or when it carries a new observation for its Task. Keep each of those `F-...` IDs in exactly one nonempty group. Read `priorities` for recorded session counts and each problem's current Task, and `possibleDuplicates` for same-target reports to inspect; weigh severity before choosing work. Counts remain separate for distinct IDs, including suspected duplicates; grouping them into one Task combines the work without claiming their observations describe the same problem. The initial groups file one `ticket` per problem without a Task and select `existing` for a recurrence on the Task the archive maps it to. Prior references survive in published context and the applied summary, including after groups are split; contributor proposals stay separate. Read related tickets before creating a duplicate. Each group takes one of these forms:

```json
{ "action": "ticket", "title": "Address write-regression-test feedback F-123456789 from the skills inbox", "keys": ["F-123456789"] }
{ "action": "existing", "number": 496, "keys": ["F-123456789"] }
{ "action": "applied", "number": 123, "keys": ["F-123456789"] }
```

Every counted problem ends the apply mapped to a Task or an applied pull request. A problem the maintainer does not want implemented is still filed; close its Task as not planned afterwards. A plan with any other action, including `defer`, is refused.

Use `existing` when a Task is the right scope for every item in the group; the script posts the new feedback to its discussion and verifies the comment before deleting intake. A closed Task is reopened when it already records every problem in the group, which is how a recurrence keeps counting on one ticket; any other closed Task is refused. Use `applied` only for a committed, pushed edit verified in the named pull request. This includes reconciling an earlier session's reported fix; read its published evidence and merge state instead of requiring a new edit in the triage session. Proposed or local-only edits do not qualify, and closed unmerged targets are refused. List edits made in this session under Skill feedback and the pull request's Notes for reviewers; identify reconciled earlier fixes separately. A proposed mechanism gets a check; a complex mechanism gets a Task.

New Tasks use the Task template's headings, the grouped observations and proposals, `type=Task`, and `workflow: skills`, and are attached to #510 as sub-issues. Existing-ticket comments contain only the new observations, context and recovery marker without a second Task checklist. A group may add a `context` paragraph for related work and scope decisions. Run `node .agents/skills/triage-skill-feedback/triage-skill-feedback.mjs preview <absolute-plan.json>` and read the exact proposed ticket bodies or existing-ticket comments before applying; `reopen: true` marks an existing group whose Task the apply will reopen. Preview writes no artifacts. The script validates each created or linked Task and its feedback on read-back.
