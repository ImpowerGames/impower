# Reviewer execution mappings

## Headless serial sessions

The caller supplies exact models, executable paths and argument arrays. Inspect the installed CLI help before launch; available options and served models can differ by installation. A configured model is routing evidence, not independent runtime introspection. Preserve the runtime self-report and disclose when the harness cannot attest it.

### Claude review agents

For Claude Code, the installed reviewer definition can be invoked as:

```text
claude -p --agent reviewer-opus-5 --allowedTools "Read,Grep,Glob,Bash,Write" "<filled reviewer prompt>"
```

Use `--output-format json` when collecting a machine-readable session ID and result. The minimal definitions under `.claude/agents/` are generated from `.claude/reviewer-models.json` by `node scripts/generate-reviewer-agents.mjs`; `--check` checks both their content and the generated ignore entries. The caller selects a definition; shared skills contain no model-selection table.

### Codex review agents

For Codex CLI, a separate serial review session can be launched with `codex exec -m <caller-model> -C <absolute-worktree> --json -o <private-final-file> -`, supplying the filled prompt on stdin. Select permissions appropriate to the authorized review and its private artifacts. A reviewer with no posting capability returns the full report to its caller, which posts it verbatim and reads it back. Do not remove restrictions to hide a denied operation.

## Running on Windows

On Windows, prefer an executable over an npm shell wrapper; an installed package entry point can be launched with Node. Supply prompts on stdin where supported or as one argument through a process API; never interpolate them into shell code. Launch background processes with hidden windows.

Pass these reviewer executable arguments through `node scripts/agent-handoff.mjs <absolute-plan.json>` as described in [handoff execution](../skills/review-pr/HANDOFF.md), including for one serial reviewer. Its shared slot reservation covers local participating CLI processes across worktrees until child exit. Native collaboration tasks and remote reviewers are unsupported for the enforced capacity guarantee because the launcher cannot reserve and verify their lifetime. Manual counts do not establish that guarantee; use the supported launcher or report the blocked review path.
