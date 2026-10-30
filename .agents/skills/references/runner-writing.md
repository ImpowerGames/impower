# Delegated writing routes

An orchestrating session that resolves a ticket through a separate writer launches it at the ticket's Effort, so the writer's identity and effort in every review launcher plan match the ticket's tier. The writer runs exactly the requested model at that effort; a route that cannot provide both is a blocker for that ticket, never a reason to launch another model or effort in its place.

| Runner      | Route        | Launch |
| ----------- | ------------ | ------ |
| Claude Code | `claude-cli` | A fresh detached `claude -p` process with `--model <id>`, `--effort <effort>` and `--permission-mode <mode>`, started by the orchestrate-issues helper's `launch` (below). It outlives the orchestrating session and any turn, and its permission mode is the one the claim recorded, the coordinator's own. The writer confirms all three from the command line that started its `claude` process and its effort from `CLAUDE_EFFORT` in its own shell, and reports to the coordinator with `SendMessage`, `to` set to the coordinator's session id. It is the only Claude dispatch route. |
| Codex       | `codex-cli`  | A fresh `codex exec` process on the writer route with `-c model_reasoning_effort="<effort>"`; await process exit. |
| Codex       | `codex-app`  | The app's native collaboration writer with the model and reasoning-effort overrides, when the host's collaboration tool offers that model at that effort. The writer's rollout `turn_context` confirms both after launch. |

A coordinator runs unattended, so the Claude routes that need something only the maintainer can give are retired and never dispatched: `claude-desktop` starts a session only in a turn the user's own message began; `claude-adopted` (a CLI session handed to the desktop app) resumes at the app's own default effort and permission mode, and raising the mode shows the maintainer an approval card the coordinator cannot answer, since the settings default does not reach an adopted session; and an Agent-tool writer (`claude-agent`) ends with the coordinator's session. `.claude/writer-defaults.json` lists them under `retiredRoutes` with these reasons, which the plan and the route preflight report. An existing writer on one of them can still be adopted with its work and confirmed against what it runs.

## Default writer model, routes and reports

`.claude/writer-defaults.json` holds, for each orchestrator harness, the writer model used when the user names none (`claude-opus-5-5` for a Claude orchestrator, `gpt-6.1-sol` for a Codex orchestrator) and its scheduling capability for the periodic check-in; and for each vendor its dispatch routes in preference order, each with its self-check and, keyed by the coordinator's harness, how its writer reports to the coordinator. An explicit writer model from the user's request wins and uses its own vendor's routes. The orchestrate-issues brief carries the route's self-check verbatim with the instruction to stop on a mismatch, and its report mechanism with the coordinator's session id from the run record.

A Claude writer messages a Claude coordinator with `SendMessage`. A Claude session cannot message a Codex thread, a Codex writer cannot message a Claude session, and no message from a Codex writer to another Codex thread has been verified; on those combinations the writer ends each decision point with its report as its turn's last message, and the coordinator's periodic check-in reads it from the writer's transcript.

Supported combinations: a Claude orchestrator dispatches `claude-cli` writers, and `codex-cli` writers when the Codex CLI is installed and signed in; a Codex orchestrator dispatches `codex-cli` and `codex-app` writers, and `claude-cli` writers when the Claude CLI is installed and signed in. A Claude orchestrator starting a Codex app writer is unsupported: the preflight lacks its evidence and the plan reports the route as blocked.

## Check the route before dispatch

Before dispatching a batch, run the route preflight with an absolute request file:

```sh
node scripts/writer-route-preflight.mjs <absolute-request.json>
```

The request names `route`, `model` (the exact model id) and `tickets`, each a `{ "number", "effort" }` pair at the ticket's effort. Each route judges the host from its own evidence:

- `claude-cli` runs one short `claude -p --model <id> --effort <effort> --output-format json` probe per effort without the orchestrator's `CLAUDE*` environment variables, as the detached writer starts without them, and requires the answer's `modelUsage` to name the requested model. `evidence.claude` names the executable, as a path or an argument list; on Windows it is the native `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`, since the npm `claude` shim is a shell wrapper. The probe cannot read the effort in force, so the launched writer's own flags and `CLAUDE_EFFORT` confirm it (`observed`).
- `codex-cli` reads the CLI's model catalog (`codex debug models`) for the efforts the model supports, because the CLI launches and records an unsupported effort without complaint, and then runs one short probe launch per effort, because the catalog also lists models an account refuses. `evidence.codex` overrides the executable, as a path or an argument list.
- `codex-app` needs `evidence.modelParameter`, the description of the collaboration tool's `model` parameter, which lists the host's models with their supported reasoning efforts.
- A retired route is blocked for every ticket, with its reason.

The preflight prints one verdict per ticket: `available` or `blocked` with the reason. A ticket may also carry `observed`, the launched writer's actual `{ "model", "effort" }` from its own metadata or `{ "rollout": "<absolute path>" }` for a Codex rollout file, whose latest newline-terminated `turn_context` record counts, and its verdict is then `confirmed` or `blocked`; this confirmation also applies to an existing writer on a retired route. A Claude observation is judged by comparison alone, since its metadata reports the effort in force. A Codex rollout records the requested effort even when the model does not support it, so a matching Codex observation is also checked against the CLI catalog (without a probe launch) or the app's advertised efforts, and `codex-app` confirmation still needs `evidence.modelParameter`. The command exits 0 when no ticket is blocked, 1 when any is, and 2 for a malformed request. Report each blocked ticket to the user with its reason.

## Start and observe a writer

A `claude-cli` writer starts through the orchestrate-issues helper after its claim:

```sh
node .agents/skills/orchestrate-issues/issue-run.mjs launch --record <run.json> --coordinator <session> --expect-revision <n> --ticket <N> --executable <absolute claude executable> --prompt <absolute brief file> --arg -p --arg --model --arg <id> --arg --effort --arg <effort> --arg --permission-mode --arg <mode> --arg --output-format --arg stream-json --arg --verbose
```

It refuses a `--model`, `--effort` or `--permission-mode` other than the claim's, and arguments a command line would interpret, and keeps the brief it sent. The launch directory, and the artifact parent the brief names for the writer's own `writer-<N>-<suffix>` directory, sit in the coordinator's session scratch directory, which Claude Code lays out as `<system temp>/claude/<main checkout path with every non-alphanumeric character as ->/<session>/scratchpad`; clean-worktrees sweeps every session's under the main checkout's slug. The writer runs from the main checkout with the brief on standard input and its stream in `out.jsonl` inside a launch directory named for the claim, and the helper adds `--add-dir <launch directory>` to its arguments, so the writer's own command line names that directory: a process census then finds the writer before its start is recorded and after its wrapper ends, and the ticket stays owned while it runs. On Windows the helper creates the wrapper through `Win32_Process.Create`, outside the tool's process tree, because a process started with `Start-Process` from a command tool can end with that tool call; elsewhere the repository's `scripts/detached-launch.mjs` starts a detached shell.

A detached CLI writer's process exits when its turn ends, and nothing wakes it again. Its brief therefore tells it never to end a turn waiting on a background task, a reviewer journal or CI: it waits in the foreground inside one tool call, or repeats foreground checks within the same turn, and ends a turn only for a decision request, a blocker or completion, each sent to the coordinator by message first. Its first message acknowledges the brief with the model, effort and permission mode it confirmed, which the coordinator records with `acknowledged`; the coordinator reads the model from the `init` line of `out.jsonl` too, and both go into the preflight's `observed` confirmation.

A writer that ended its turn with a request is answered by resuming its CLI session, the one its stream's `init` line names, with the answer as the prompt; one that stopped with work left, on a wait it should have run in the foreground, is resumed the same way with a prompt to continue:

```sh
node .agents/skills/orchestrate-issues/issue-run.mjs resume --record <run.json> --coordinator <session> --expect-revision <n> --ticket <N> --executable <absolute claude executable> --prompt <absolute answer file> --arg -p --arg --resume --arg <session-id> --arg --model --arg <id> --arg --effort --arg <effort> --arg --permission-mode --arg <mode> --arg --output-format --arg stream-json --arg --verbose
```

It refuses a writer that is still running, another session, and a model, effort or permission mode other than the writer's own; it records the intent before starting the process detached the same way as `launch`, in a `resume-<N>-<id>` directory whose `out.jsonl` is then the writer's transcript, and the resumed process becomes the writer's handle. A resume whose outcome was lost is settled with `reconcile`, never run again.

The maintainer may want to read, or talk to, a CLI writer whose turn has ended. `open` hands that idle writer's session, the one its stream's `init` line names, to the desktop app with `claude --desktop --resume <session-id>`, run in a hidden console of its own created through `Win32_Process.Create`, because the app refuses a resume with redirected output; the open's intent is saved before it runs. Confirm the adoption with `list_sessions`, which lists the session as `local_<session-id>` within seconds, and record it with `opened --session local_<session-id>`; an open whose outcome was lost is settled the same way and never run again. Opening changes nothing about who the writer is or how it runs: the record keeps the CLI process as the writer, and the maintainer answers any prompt the app shows when they choose to talk to the session.

```sh
node .agents/skills/orchestrate-issues/issue-run.mjs open --record <run.json> --coordinator <session> --expect-revision <n> --ticket <N> --executable <absolute claude executable>
node .agents/skills/orchestrate-issues/issue-run.mjs opened --record <run.json> --coordinator <session> --expect-revision <n> --ticket <N> --session local_<session-id>
```

The coordinator observes its writers for `plan --observations`: an existing desktop writer adopted with its work through `get_session` on its id (`running` while `isRunning`, `idle` when its turn ended, `archived` when archived, `absent` when the app no longer knows it), and a Codex writer through its awaited process or collaboration status. A detached CLI writer needs no observation: the helper compares its recorded process start identity on the same host.

A writer's own record of what it said is its transcript, which the [writer reports](../orchestrate-issues/references/writer-reports.md) wake routine reads once its turn has ended: a detached CLI writer's `out.jsonl` in its launch directory, a desktop writer through `list_events` (or `export_transcript`) on its session id, and a Codex writer through its rollout file.

The caller's prompt names the ticket, the branch, the review-round limit the user authorized and any settled design decisions. The writer runs the resolve-issue skill, never merges, and reports the PR number, the last independently reviewed commit, the rounds used with each reviewer route, outstanding findings and the state of each CI check.

Independent reviewers keep their own launch and reservation rules in [runner review](runner-review.md); these writer routes do not apply to them.
