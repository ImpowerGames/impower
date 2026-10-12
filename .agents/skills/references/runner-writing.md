# Delegated writing routes

An orchestrating session that resolves a ticket through a separate writer launches it at the ticket's Effort, so the writer's identity and effort in every review launcher plan match the ticket's tier. The writer runs exactly the requested model at that effort; a route that cannot provide both is a blocker for that ticket, never a reason to launch another model or effort in its place.

| Runner      | Route            | Launch                                                                                                                                                             |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | `claude-desktop` | A separate desktop session started with the exact model id and the ticket's effort, working in its own worktree. It outlives the orchestrating session, and the user can open, answer and stop it. The session start ignores a model above the orchestrator's own and an effort above its own, so the orchestrator starts only its own model at or below its own effort. The app starts a session only during a turn the user's own message began (`start_session` with `user_asked`); a turn begun by a session note, CI event or timer can only propose one as a card, and a session started from a card has been observed to run at another effort than proposed. Before building any reviewer plan, the writer reads its own model and effort through `get_session` on `self` and stops with a blocker if either differs from the request. |
| Claude Code | `claude-cli`     | A fresh detached `claude -p` process with `--model <id>` and `--effort <effort>`, started by the orchestrate-feature helper's `launch` (below). It outlives the orchestrating session and any turn, so it is the route for dispatch from an event-driven turn. The writer reads its model from the stream's `init` event and its effort from `CLAUDE_EFFORT` in its own shell. |
| Claude Code | `claude-agent`   | Agent tool with `subagent_type: writer-opus-5-5-<low|medium|high>`, defined in `.claude/agents/` (`claude-opus-5-5` at that effort). A subagent launched without a definition runs at the harness default effort, not the parent session's, and a definition added after the session started is not discovered until a new session. A subagent ends with the orchestrating session, so it is the last resort for unattended dispatch. |
| Codex       | `codex-cli`      | A fresh `codex exec` process on the writer route with `-c model_reasoning_effort="<effort>"`; await process exit. |
| Codex       | `codex-app`      | The app's native collaboration writer with the model and reasoning-effort overrides, when the host's collaboration tool offers that model at that effort. The writer's rollout `turn_context` confirms both after launch. |

## Default writer model and route order

`.claude/writer-defaults.json` holds, for each orchestrator harness, the writer model used when the user names none (`claude-opus-5-5` for a Claude orchestrator, `gpt-6.1-sol` for a Codex orchestrator), and for each vendor its routes in preference order with each route's self-check. An explicit writer model from the user's request wins and uses its own vendor's routes. A Claude orchestrator prefers `claude-desktop` in a user-begun turn, `claude-cli` from an event-driven turn, and `claude-agent` only when neither is available. The orchestrate-feature helper's `plan --turn user|event` applies that order and proposes a desktop session, recorded as a pending dispatch, when it is the only available route and the turn cannot start it.

Supported combinations: a Claude orchestrator dispatches `claude-desktop`, `claude-cli` and `claude-agent` writers, and `codex-cli` writers when the Codex CLI is installed and signed in; a Codex orchestrator dispatches `codex-cli` and `codex-app` writers, and `claude-cli` writers when the Claude CLI is installed and signed in. A Codex orchestrator starting a Claude desktop session or Agent-tool writer, and a Claude orchestrator starting a Codex app writer, are unsupported: the preflight lacks their evidence and the plan reports those routes as blocked.

## Check the route before dispatch

Before dispatching a batch, run the route preflight with an absolute request file:

```sh
node scripts/writer-route-preflight.mjs <absolute-request.json>
```

The request names `route` (one of the routes above), `model` (the exact model id) and `tickets`, each a `{ "number", "effort" }` pair at the ticket's effort. Each route judges the host from its own evidence:

- `claude-agent` needs `evidence.agents`, the agent types the orchestrator's Agent tool offers in the current session, and reads the pinned writer definitions in `.claude/agents/`; a definition on disk that the session does not offer is blocked.
- `claude-desktop` needs `evidence.coordinator`, the `model` and `effort` that `get_session` on `self` reports for the orchestrating session.
- `claude-cli` runs one short `claude -p --model <id> --effort <effort> --output-format json` probe per effort without the orchestrator's `CLAUDE*` environment variables, as the detached writer starts without them, and requires the answer's `modelUsage` to name the requested model. `evidence.claude` names the executable, as a path or an argument list; on Windows it is the native `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`, since the npm `claude` shim is a shell wrapper. The probe cannot read the effort in force, so the launched writer's own `CLAUDE_EFFORT` confirms it (`observed`).
- `codex-cli` reads the CLI's model catalog (`codex debug models`) for the efforts the model supports, because the CLI launches and records an unsupported effort without complaint, and then runs one short probe launch per effort, because the catalog also lists models an account refuses. `evidence.codex` overrides the executable, as a path or an argument list.
- `codex-app` needs `evidence.modelParameter`, the description of the collaboration tool's `model` parameter, which lists the host's models with their supported reasoning efforts.

The preflight prints one verdict per ticket: `available` (with the `subagent_type` for `claude-agent`) or `blocked` with the reason. A ticket may also carry `observed`, the launched writer's actual `{ "model", "effort" }` from its own metadata or `{ "rollout": "<absolute path>" }` for a Codex rollout file, whose latest newline-terminated `turn_context` record counts, and its verdict is then `confirmed` or `blocked`. A Claude observation is judged by comparison alone, since session metadata reports the effort in force. A Codex rollout records the requested effort even when the model does not support it, so a matching Codex observation is also checked against the CLI catalog (without a probe launch) or the app's advertised efforts, and `codex-app` confirmation still needs `evidence.modelParameter`. The command exits 0 when no ticket is blocked, 1 when any is, and 2 for a malformed request. Report each blocked ticket to the user with its reason.

## Start and observe a writer

A `claude-cli` writer starts through the orchestrate-feature helper after its claim:

```sh
node .agents/skills/orchestrate-feature/feature-run.mjs launch --record <run.json> --coordinator <session> --expect-revision <n> --ticket <N> --executable <absolute claude executable> --prompt <absolute brief file> --arg -p --arg --model --arg <id> --arg --effort --arg <effort> --arg --permission-mode --arg <mode> --arg --output-format --arg stream-json --arg --verbose
```

It refuses a `--model` or `--effort` other than the claim's, and arguments a command line would interpret. The writer runs from the main checkout with the brief on standard input and its stream in `out.jsonl` inside a launch directory named for the claim. On Windows the helper creates it through `Win32_Process.Create`, outside the tool's process tree, because a process started with `Start-Process` from a command tool can end with that tool call; elsewhere a detached shell runs it. The permission mode is the orchestrator's own, never higher. The coordinator reads the writer's model from the `init` line of `out.jsonl`; the writer reports `CLAUDE_EFFORT` from its own shell, and both go into the preflight's `observed` confirmation.

The coordinator observes its writers for `plan --observations`: a desktop writer through `get_session` on its id (`running` while `isRunning`, `idle` when its turn ended, `archived` when archived, `absent` when the app no longer knows it), an Agent-tool writer through its task notification (`running`, `completed`, `failed`, or `stopped` once stopping is confirmed), and a Codex writer through its awaited process or collaboration status. A detached CLI writer needs no observation: the helper compares its recorded process start identity on the same host.

The caller's prompt names the ticket, the branch, the review-round limit the user authorized and any settled design decisions. The writer runs the resolve-issue skill, never merges, and reports the PR number, the last independently reviewed commit, the rounds used with each reviewer route, outstanding findings and the state of each CI check.

Independent reviewers keep their own launch and reservation rules in [runner review](runner-review.md); these writer routes do not apply to them.
