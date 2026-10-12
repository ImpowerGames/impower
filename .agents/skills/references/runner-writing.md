# Delegated writing routes

An orchestrating session that resolves a ticket through a separate writer launches it at the ticket's Effort, so the writer's identity and effort in every review launcher plan match the ticket's tier. The writer runs exactly the requested model at that effort; a route that cannot provide both is a blocker for that ticket, never a reason to launch another model or effort in its place.

| Runner      | Route            | Launch                                                                                                                                                             |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | `claude-agent`   | Agent tool with `subagent_type: writer-opus-5-5-<low|medium|high>`, defined in `.claude/agents/` (`claude-opus-5-5` at that effort). A subagent launched without a definition runs at the harness default effort, not the parent session's, and a definition added after the session started is not discovered until a new session. |
| Claude Code | `claude-desktop` | A separate desktop session started with the exact model id and the ticket's effort, working in its own worktree. It outlives the orchestrating session, and the user can open, answer and stop it. The session start ignores a model above the orchestrator's own and an effort above its own, so the orchestrator starts only its own model at or below its own effort. Before building any reviewer plan, the writer reads its own model and effort through `get_session` on `self` and stops with a blocker if either differs from the request. |
| Codex       | `codex-cli`      | A fresh `codex exec` process on the writer route with `-c model_reasoning_effort="<effort>"`; await process exit. |
| Codex       | `codex-app`      | The app's native collaboration writer with the model and reasoning-effort overrides, when the host's collaboration tool offers that model at that effort. The writer's rollout `turn_context` confirms both after launch. |

## Check the route before dispatch

Before dispatching a batch, run the route preflight with an absolute request file:

```sh
node scripts/writer-route-preflight.mjs <absolute-request.json>
```

The request names `route` (one of the routes above), `model` (the exact model id) and `tickets`, each a `{ "number", "effort" }` pair at the ticket's effort. Some routes need `evidence` from the host:

- `claude-agent` reads the pinned writer definitions in `.claude/agents/` and needs none.
- `claude-desktop` needs `evidence.coordinator`, the `model` and `effort` that `get_session` on `self` reports for the orchestrating session.
- `codex-cli` reads the CLI's model catalog (`codex debug models`) for the efforts the model supports, because the CLI launches and records an unsupported effort without complaint, and then runs one short probe launch per effort, because the catalog also lists models an account refuses. `evidence.codex` overrides the executable, as a path or an argument list.
- `codex-app` needs `evidence.modelParameter`, the description of the collaboration tool's `model` parameter, which lists the host's models with their supported reasoning efforts.

The preflight prints one verdict per ticket: `available` (with the `subagent_type` for `claude-agent`) or `blocked` with the reason. A ticket may also carry `observed`, the launched writer's actual `{ "model", "effort" }` from its own metadata or `{ "rollout": "<absolute path>" }` for a Codex rollout file, and its verdict is then `confirmed` or `blocked` by comparison alone. The command exits 0 when no ticket is blocked, 1 when any is, and 2 for a malformed request. Report each blocked ticket to the user with its reason.

The caller's prompt names the ticket, the branch, the review-round limit the user authorized and any settled design decisions. The writer runs the resolve-issue skill, never merges, and reports the PR number, the last independently reviewed commit, the rounds used with each reviewer route, outstanding findings and the state of each CI check.

Independent reviewers keep their own launch and reservation rules in [runner review](runner-review.md); these writer routes do not apply to them.
