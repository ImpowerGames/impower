# Assign Priority and Effort

Priority and Effort are organization issue fields, available directly on repository issues. Use the existing definitions; Projects access is unnecessary for these assignments.

## Choose values

Read each ticket's scope, evidence, dependencies and verification work. Use current option names from GitHub. The current rubric is:

| Field | Value | Use when |
| --- | --- | --- |
| Priority | Urgent | A confirmed severe problem needs immediate intervention, such as ongoing data loss or a critical workflow blocked without a workaround. |
| Priority | High | Recurring failures, integrity risk or substantial wasted work make this worth resolving soon. |
| Priority | Medium | A useful improvement has a workable alternative or narrower impact. |
| Priority | Low | The benefit is modest or the problem infrequent. |
| Effort | Low | A focused change has a clear fix and limited verification. |
| Effort | Medium | Several interacting changes or a focused investigation need broader verification. |
| Effort | High | New infrastructure, substantial uncertainty or coordination across multiple systems makes the work sizeable. |

Effort includes reproduction, implementation, regression and platform verification; it is an estimate, not a time commitment. Recurrence informs Priority but does not determine it alone. Record a brief reason for each estimate, especially uncertainty or a changed existing value. Keep decisions in a separate private artifact, without adding unsupported properties to the triage plan. When filing needs approval, present the estimates with the proposed tickets and continue authorized inbox maintenance using `defer` groups.

## Publish and verify

Discover current IDs and options using:

```sh
gh api -H "X-GitHub-Api-Version: 2026-03-10" orgs/ImpowerGames/issue-fields
```

Resolve the exact `Priority` and `Effort` definitions and validate both are `single_select`. Read each target's current values and open state before editing. Populate missing fields on open `workflow: skills` work tickets and assign both on newly filed Tasks. Skip #510 and closed work; retain other existing values unless reassessment is authorized by the skill.

Write a JSON request with an editor. Its `issue_field_values` array contains only changed fields, each with the discovered integer `field_id` and the selected option name as `value`. If no changes are needed, skip the write. Use POST to preserve unrelated fields; an empty array clears all fields, and PUT replaces them.

```sh
gh api -X POST -H "X-GitHub-Api-Version: 2026-03-10" repos/ImpowerGames/impower/issues/<number>/issue-field-values --input <absolute-request.json>
gh api -H "X-GitHub-Api-Version: 2026-03-10" repos/ImpowerGames/impower/issues/<number>/issue-field-values --paginate
```

Verify `single_select_option.name` for each field. On uncertain publication, read before retrying and update the same issue. Retain pending values if access fails; do not rerun ticket creation to repair metadata. See GitHub's [issue field value API](https://docs.github.com/en/rest/issues/issue-field-values).

## Access setup, only when needed

Check the operations above before changing authentication. The existing repository login may already work.

For a fine-grained token, select resource owner `ImpowerGames`, repository `impower`, repository **Issues: Read and write**, and organization **Issue Fields: Read-only**. The account must have repository write access. Organization approval may also be required under its token policy. These permissions cover reading definitions and writing values, without permission to alter field definitions. See [organization issue-field access](https://docs.github.com/en/rest/orgs/issue-fields) and the issue field value API above.

For a GitHub CLI OAuth login that already writes repository issues, a missing definition-read permission can be added with `gh auth refresh --hostname github.com --scopes read:org`; complete its browser authorization. This command refreshes the stored OAuth login, not an externally supplied token. For a fine-grained or environment-supplied token, adjust that token's permissions instead. See [GitHub CLI authentication refresh](https://cli.github.com/manual/gh_auth_refresh). Do not request `project` or `read:project` for issue-field assignment.
