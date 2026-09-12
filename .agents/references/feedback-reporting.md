# Skills improve through use — report the friction

The skills under `.agents/skills/` are improved based on what happens when they are used. If a command fails, a path is outdated, a step is unclear, or you run into any other issues which you feel like could have been resolved if the skill was better, please report as a comment in issue #510.

When filing a report, read the standing inbox body with `gh issue view 510 --json body`, its paginated intake comments and the read-only `node .agents/skills/triage-skill-feedback/triage-skill-feedback.mjs reports` lookup for archived problems. Report each problem with the skill that your session encountered using that body's intake format and `gh issue comment 510 --body-file <file>`, then read it back. For the same problem, reference its problem ID and reuse your stable runner session or thread reference; each session counts once even if it supplies more observations. Separate problems in the same skill section get separate IDs. Check for your own pending report before posting again. Refer to the problem or its ticket in your final message.

Before adding a Gotchas entry or caveat, decide whether code can prevent or detect the trap.

A simple mechanism can ship in the same pull request you are working on. List what you applied in both your message to the user and the pull request's Notes for reviewers so the editorial review checks it. Otherwise, if the problem requires a more complex mechanism to address it, record the proposal in the #510 skill feedback inbox for the maintainer's hand-invoked `triage-skill-feedback` skill, and a `workflow: skills` task will be filed after your feedback has been triaged.
