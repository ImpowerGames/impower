# Choose and preview group actions

All commands run from the worktree root unless stated otherwise.

## 2. Decide each group's outcome

Edit only `groups` in the plan with the editor tool. Keep every open row's key in exactly one nonempty group; counted problems use their `F-...` ID as the key. Read `priorities` for recorded session counts, `unknownPriorities` for uncounted work and `possibleDuplicates` for same-section reports to inspect; weigh severity before choosing work. Counts remain separate for distinct IDs, including suspected duplicates; grouping them into one Task combines the work without claiming their observations describe the same problem. Counted open problems default to `defer`, including reopened work without an open Task; unclassified bundles propose `ticket`. Inspect and change these proposals before applying; frequency is a prioritization signal, not a filing threshold. The initial groups select `existing` for recurrence on an open Task. Prior references survive in published context, the applied summary or deferred row text, including after groups are split; contributor proposals stay separate. Read related tickets before creating a duplicate. Each group takes one of these forms:

```json
{ "action": "ticket", "title": "Make standalone checks report interrupted runs", "keys": ["write-regression-test, section 3"] }
{ "action": "existing", "number": 496, "keys": ["review-pr, section 3"] }
{ "action": "applied", "number": 123, "keys": ["example, section 2"] }
{ "action": "defer", "keys": ["F-123456789"] }
```

Use `existing` when an open Task is the right scope for every item in the group; the script posts the new feedback to its discussion and verifies the comment before deleting intake. Closed Tasks are refused. Use `applied` only after a certain sentence edit is committed and pushed on the invoking session's branch and the named pull request carries it. Closed unmerged targets are refused. List those edits under Skill feedback and the pull request's Notes for reviewers. A proposed mechanism gets a check; a complex mechanism gets a Task. Avoid adding a caveat to work around an unimplemented mechanism. When no branch can carry a certain edit, file it as work.

New Tasks use the Task template's headings, the grouped observations and proposals, `type=Task`, and `workflow: skills`. Existing-ticket comments contain the grouped feedback, context and recovery marker without a second Task checklist. A group may add a `context` paragraph for related work and scope decisions. Run `node .agents/skills/triage-skill-feedback/triage-skill-feedback.mjs preview <absolute-plan.json>` and read the exact proposed ticket bodies or existing-ticket comments before applying. Preview writes no artifacts. The script validates each created or linked Task and its feedback on read-back. Applied rows stay until their pull request merges; ticketed rows stay until their issue closes.
