# Skills improve through use — report the friction

The skills under `.agents/skills/` are improved based on what happens when they are used. Friction a session meets while following a skill is reported as a comment in issue #510, the standing inbox the maintainer reads and triages.

A report belongs in the inbox when both of these hold:

- It cites a concrete event from the session: a command that failed as written, an instruction that was wrong or outdated, a step that had to be redone, a correction from the user that the skill could have supplied, or the same manual sequence repeated where a tool would have done it once.
- A session following the same skill on a different ticket would meet the same thing. Friction that comes from one ticket's particulars stays out of the inbox.

Most sessions meet nothing that passes both, and post nothing. The inbox is the only destination for a report: the maintainer reads it there, so the chat handoff neither restates a report nor says that there was none. An edit applied in the active pull request is part of that pull request's contents, and is listed for the user as the rule on shipping a simple mechanism describes.

When filing a report, read the standing inbox body with `gh issue view 510 --json body`, its paginated intake comments and the read-only `node .agents/skills/triage-skill-feedback/triage-skill-feedback.mjs reports` lookup for archived problems. Report each problem with the skill that your session encountered using that body's intake format and `gh issue comment 510 --body-file <file>`, then read it back. For the same problem, reference its problem ID and reuse your stable runner session or thread reference; each session counts once even if it supplies more observations. Separate problems in the same skill section get separate IDs. Check for your own pending report before posting again.

Before adding a Gotchas entry or caveat, decide whether code can prevent or detect the trap.

A simple mechanism can ship in the same pull request you are working on. List what you applied in both your message to the user and the pull request's Notes for reviewers so the editorial review checks it. Otherwise, if the problem requires a more complex mechanism to address it, record the proposal in the #510 skill feedback inbox for the maintainer's hand-invoked `triage-skill-feedback` skill, and a `workflow: skills` task will be filed after your feedback has been triaged.
