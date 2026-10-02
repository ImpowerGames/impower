# Delegated writing routes

An orchestrating session that resolves a ticket through a separate writer launches it at the ticket's Effort, so the writer's identity and effort in every review launcher plan match the ticket's tier.

| Runner      | Launch                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | Agent tool with `subagent_type: writer-opus-5-5-<low|medium|high>`, defined in `.claude/agents/` (`claude-opus-5-5` at that effort). A subagent launched without a definition runs at the harness default effort, not the parent session's, and a definition added after the session started is not discovered until a new session. |
| Codex       | A fresh `codex exec` process on the writer route with `-c model_reasoning_effort="<effort>"`; await process exit. |

The caller's prompt names the ticket, the branch, the review-round limit the user authorized and any settled design decisions. The writer runs the resolve-issue skill, never merges, and reports the PR number, the last independently reviewed commit, the rounds used with each reviewer route, outstanding findings and the state of each CI check.
