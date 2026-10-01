# Delegated filing routes

The resolve-issue [outstanding work](../resolve-issue/references/follow-ups.md) sweep hands each out-of-scope item to a cheap filing route instead of reproducing it in the writer's own context. The route runs the file-bug or file-task skill in its own worktree and reports the ticket number.

| Runner      | Launch                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | Agent tool with `subagent_type: filer-sonnet-5-5-low`, defined in `.claude/agents/filer-sonnet-5-5-low.md` (`claude-sonnet-5-5` at low effort); one agent per item, launched together, awaited before the handoff. |
| Codex       | A fresh `codex exec` process per item on the installation's lowest-cost model at low reasoning effort, with the same prompt body as the Claude definition; await process exit. |

The prompt for one item carries its `file:line`, one sentence on the symptom, the base commit, the PR number and the instruction to report the issue number or `Not filed` with the reason. The writer reads every filed ticket back before recording it in the PR body. When the runner offers no such route, the writer runs the sweep itself as the reference describes.
