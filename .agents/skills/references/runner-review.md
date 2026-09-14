# Reviewer execution mappings

For originating-task capability evidence, see [continuation conformance](runner-continuation.md). The opt-in [supervised review route](review-supervisor.md) selects the registered Windows Codex app or Claude CLI adapter; unsupported configurations retain the awaited mode below.

## Headless serial sessions

The caller supplies exact models, executable paths and argument arrays. Inspect the installed CLI help before launch; available options and served models can differ by installation.

### Claude review agents

For the opt-in supervised route, set each review entry's `transport` to `native-claude-json`, use the native executable with `--output-format json`, and retain it until actual process exit. The supervisor checks native terminal success in addition to completion artifacts and published reports. Other unsupported reviewer transports retain awaited mode until their native outcome mapping is implemented and verified.

For Claude Code, the installed reviewer definition can be invoked as:

```text
claude -p --agent reviewer-opus-5 --allowedTools "Read,Grep,Glob,Bash,Write" "<filled reviewer prompt>"
```

Use `--output-format json` when collecting a machine-readable session ID and result. The minimal definitions under `.claude/agents/` are generated from `.claude/reviewer-models.json` by `node scripts/generate-reviewer-agents.mjs`; `--check` checks both their content and the generated ignore entries. The caller selects a definition; shared skills contain no model-selection table.

### Codex review agents

For Codex CLI, a separate serial review session can be launched with `codex exec -m <caller-model> -C <absolute-worktree> --json -o <private-final-file> -`, supplying the filled prompt on stdin. Select permissions appropriate to the authorized review and its private artifacts. A reviewer with no posting capability returns the full report to its caller, which posts it verbatim and reads it back. Do not remove restrictions to hide a denied operation.

The automatic `native-codex-jsonl` route is narrower: the executable version is pinned to `0.154.0-alpha.6.2`. Its argument grammar is `exec --model <caller-model> -c 'model_reasoning_effort="<caller-effort>"' -c 'approval_policy="never"' --sandbox workspace-write -c sandbox_workspace_write.network_access=true --cd <private-review-directory> --skip-git-repo-check --json --disable multi_agent --disable multi_agent_v2 --output-last-message <fresh-private-report> -`. These are argument-array entries, not shell interpolation. Declare `permissions` as `{ "sandbox": "workspace-write", "approvalPolicy": "never", "networkAccess": true, "cwd": "<private-review-directory>", "artifactWrites": "handoff-directory" }`; use only when private artifacts and GitHub report posting are authorized. The private directory must exclude both repository and supervisor state. The launcher adds only its fresh completion directory with `--add-dir`. Alternate roots, profiles, config overrides and bypasses fail before launch.

The reviewer reads the frozen repository by absolute path, loads its supplied review instructions, posts the full report, and writes the guarded completion artifact. JSONL stdout and stderr are separate. Success requires native `turn.completed` and a complete assistant response, actual process exit, and the existing posted-report checks. Missing completion, errors, failed turns, duplicate terminal events and truncated output cannot pass. Interruption can end without a terminal JSONL event; absence alone does not prove cancellation. This automatic route does not use the awaited mode's caller-posting fallback.

Both native collaboration feature flags must be explicitly disabled with `--disable multi_agent --disable multi_agent_v2`. Missing, duplicate or overriding feature arguments fail preflight, preserving the launcher's reviewer reservation ownership even when inherited settings enable collaboration.

## Register the originating Claude CLI

Before starting the intended writer, create a private directory outside the writer/reviewed checkout and Git administrative directories, plus a private JSON hook configuration with `directory` and the absolute native Claude `executable`. Add session-local command hooks for `SessionStart`, `UserPromptSubmit`, `MessageDisplay`, `Stop` and `SessionEnd`, each invoking `node <absolute-repo>/scripts/claude-continuation-hook.mjs <private-hook-config.json>`. Preserve the writer's chosen tools, model, effort and permissions; probe-only tool restrictions are not workflow defaults. The writer needs its authorized command/editor capability to claim and adjudicate.

The hook checks its native ancestor and version, captures OS start identity and inherited inbox credentials, and exclusively writes private `registration.json`. It appends selected native fields to `receipts.jsonl`. Registration contains a token and must never be committed, posted or copied into an envelope. The hook only observes; failed or oversized evidence leaves automatic mode unavailable or delivery uncertain.

After a completed writer turn, declare `destination.host: "claude-cli-windows"`, `threadId` as its session UUID, native MessageDisplay `turnId`, canonical `cwd`, absolute `registration` path, and that file's `registrationId`. Declare `writer`, `writerEffort`, and `permissions: { "permissionMode": "<actual native mode>" }` from SessionStart/Stop evidence. Preflight requires matching inherited credentials, live OS identity and exact native configuration. A fresh registration cannot silently replace the job's generation.

The outbox retains work while a newer prompt's configuration is unknown, then revalidates after Stop. Submission sends one authenticated exact-session frame with the durable UUID and `priority: "next"`. Host delivery can fold after a tool into an existing turn. Socket write/close is not acceptance: reconciliation requires transcript arrival plus a unique MessageDisplay marker and records its native turn UUID. Duplicate/out-of-order records and partial trailing rows do not trigger resubmission. Conflicting turns remain uncertain. An ended process leaves delivery pending; the adapter never launches or resumes a writer. CLI claim additionally checks inherited session credentials and OS identity.

## Running on Windows

On Windows, prefer an executable over an npm shell wrapper; an installed package entry point can be launched with Node. Supply prompts on stdin where supported or as one argument through a process API; never interpolate them into shell code. Launch background processes with hidden windows.

Pass these reviewer executable arguments through `node scripts/agent-handoff.mjs <absolute-plan.json>` as described in [handoff execution](../review-pr/HANDOFF.md), including for one serial reviewer. Its shared slot reservation covers local participating CLI processes across worktrees until child exit. Native collaboration tasks and remote reviewers are unsupported for the enforced capacity guarantee because the launcher cannot reserve and verify their lifetime. Manual counts do not establish that guarantee; use the supported launcher or report the blocked review path.
