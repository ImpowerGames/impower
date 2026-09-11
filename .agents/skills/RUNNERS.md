# Runner notes

Shared skills express capabilities. Read the repository's agent instructions before using a skill. A skill invocation means loading its entire SKILL.md and following its steps, including when no invocation tool exists.

| Capability | Claude Code | Codex |
| --- | --- | --- |
| Repository instructions | CLAUDE.md imports AGENTS.md | AGENTS.md is the project entry point |
| Discover skills | Installer link under the harness project directory | Native .agents/skills discovery; the installer also provides the compatibility link |
| Invoke a skill | Skill tool, named by frontmatter | Use the discovered skill or read its SKILL.md directly |
| Read and edit files | Read, Grep, Glob, Write/Edit | File reading and apply_patch/editor capability exposed by the host |
| Rename a session | set_session_title when offered | set_thread_title when offered; optional in CLI |
| Independent review | Agent tool with caller-supplied subagent_type, or a fresh CLI process | Caller-supplied collaboration model override when available, or a fresh CLI process |
| Private artifacts | Unique directory under system temp; a scratchpad is usable if private | Unique directory under system temp or a host-provided private directory |
| Observe completion | Await task status or CLI process exit, then read paginated PR comments | Await task status or CLI process exit, then read paginated PR comments |

## Headless serial sessions

The caller supplies exact models, executable paths and argument arrays. Inspect the installed CLI help before launch; available options and served models can differ by installation. A configured model is routing evidence, not independent runtime introspection. Preserve the runtime self-report and disclose when the harness cannot attest it.

For Claude Code, the installed reviewer definition can be invoked as:

```text
claude -p --agent reviewer-opus-5 --allowedTools "Read,Grep,Glob,Bash,Write" "<filled reviewer prompt>"
```

Use `--output-format json` when collecting a machine-readable session ID and result. The minimal definitions under `.claude/agents/` are generated from `.claude/reviewer-models.json` by `node scripts/generate-reviewer-agents.mjs`; `--check` checks both their content and the generated ignore entries. The caller selects a definition; shared skills contain no model-selection table.

For Codex CLI, a separate serial review session can be launched with `codex exec -m <caller-model> -C <absolute-worktree> --json -o <private-final-file> -`, supplying the filled prompt on stdin. Select permissions appropriate to the authorized review and its private artifacts. A reviewer with no posting capability returns the full report to its caller, which posts it verbatim and reads it back. Do not remove restrictions to hide a denied operation.

On Windows, prefer an executable over an npm shell wrapper; an installed package entry point can be launched with Node. Supply prompts on stdin where supported or as one argument through a process API; never interpolate them into shell code. Launch background processes with hidden windows.

## Migration and recovery

Fresh checkouts install links through postinstall. An existing checkout can retain ignored driver state, browser profiles or personal skills in a real harness skills directory after Git moves the tracked files. The installer intentionally refuses that populated directory, including during npm install, so it cannot discard local work. An agent handling this refusal must reconcile the contents before retrying; silently treating a refused install as success would leave discovery incomplete.

Use canonical driver status commands to inspect both drivers; each reads its existing-checkout state fallback. Stop the recorded servers through those drivers before moving any state or profile. If ownership or shutdown cannot be established, preserve the data and report the blocked migration rather than guessing.

Preserve the populated directory in a private backup outside the checkout before removing its entry from the harness directory. Verify the resolved source and backup paths and use one filesystem API to move it; never recursively remove it. Reconcile any personal skill files with the canonical source without overwriting existing files. Preserve browser profiles and OPFS projects; restore each profile to the corresponding canonical skill directory only when that destination is absent. Keep the backup until its contents have been verified. Do not restore stopped server state as if it described a running server. Then rerun the installer and verify all links and both harness catalogs. This reconciliation needs judgment about personal files, so the installer does not automate it.

For links that are broken or point at another checkout after a move or copy, run `node scripts/link-agent-skills.mjs --repair-links`. That explicit option replaces link entries without modifying their targets. Classification resolves each link and refuses unexpected resolution errors; an absent target cannot be distinguished from a disconnected volume. Before any mutation the CLI prints planned actions with each repaired entry's raw previous target. Retain that output: if a later creation fails, it identifies the entries and targets needed for recovery. The returned records also retain action and previousTarget. It still refuses every populated real directory and every linked tool parent. The default installer refuses foreign or broken links until this recovery is selected.

## Discovery, paths and shell selection

The installed Windows Claude file glob did not traverse a skills junction in the discovery acceptance probe, while its native catalog discovered all nine skills. Use the native catalog or canonical paths for explicit enumeration; do not treat an empty glob over an ignored link as an empty skill set.

Bash examples require Git for Windows bash on Windows, ordinarily `C:/Program Files/Git/bin/bash.exe`. Generic `bash` can resolve to the unavailable WSL launcher. Use PowerShell's `&` with that absolute path for shell checks. POSIX uses its installed bash. Use native paths for process argument arrays and `pathToFileURL` for Windows dynamic imports; quote paths in shell commands.

Shared hook functions live in `.agents/hooks/`. Claude's `.claude/settings.json` and thin `.claude/hooks/` entry points and Codex's `.codex/hooks.json` invoke that source. Node is required; the launch wrappers convert runtime failures into blocking exit 2. Both cover direct generated-language edits, typed issue creation and shared stash mutation. Safe artifact writing and the other AGENTS rules remain instructions unless a dedicated check enforces them.

Codex project hooks require a trusted project and review of the current hook definitions through `/hooks`; changes require renewed trust. Installation of skill links does not grant hook trust. Verify the configured hooks are enabled before claiming enforcement. The Codex adapter reads both shell dialects because its `Bash` tool name also represents PowerShell, and extracts every patch target including rename destinations. Claude's explicit shell names select their own dialect. Windows hook commands use `commandWindows`; POSIX commands resolve from the Git root so nested working directories work.

These are static guardrails, not an enforcement boundary against evasion. Variable-built commands, aliases, wrapper scripts and generated-file writes through shell programs are outside these checks. Codex does not run PreToolUse again for `write_stdin`, and hosted or specialized tool paths can bypass hooks. Avoid interactive shell input for guarded operations. Hooks do not wake an idle coordinating session; use the awaited handoff runner for automatic implement/review exchanges. See the official [hooks documentation](https://learn.chatgpt.com/docs/hooks) for coverage and trust semantics. Acceptance must capture actual allowed and denied tool calls in fresh sessions, with destructive operations replaced by inert functions in printed scratch repositories; a unit test or enabled feature flag alone is insufficient.

The official [skills documentation](https://learn.chatgpt.com/docs/build-skills) and [non-interactive execution documentation](https://learn.chatgpt.com/docs/non-interactive-mode) describe discovery and CLI execution. Local acceptance evidence records the installed versions and commands actually exercised; documentation alone is not evidence of a successful run.
