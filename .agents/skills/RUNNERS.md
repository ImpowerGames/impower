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

For links that are broken or point at another checkout after a move or copy, run `node scripts/link-agent-skills.mjs --repair-links`. That explicit option replaces link entries only, without following them or modifying their targets. It still refuses every populated real directory and every linked tool parent. The default installer refuses foreign or broken links until this recovery is selected.

## Shell selection

The installed Windows Claude file glob did not traverse a skills junction in the discovery acceptance probe, while its native catalog discovered all nine skills. Use the native catalog or canonical paths for explicit enumeration; do not treat an empty glob over an ignored link as an empty skill set.

Bash examples require Git for Windows bash on Windows, ordinarily `C:/Program Files/Git/bin/bash.exe`. Generic `bash` can resolve to the unavailable WSL launcher. Use PowerShell's `&` with that absolute path for shell checks. POSIX uses its installed bash. Use native paths for process argument arrays and `pathToFileURL` for Windows dynamic imports; quote paths in shell commands.

Hooks under `.claude/` supplement the shared rules; other runners must follow those rules even when no equivalent hook runs. Installed hooks cover generated-language edits, typed issues and shared stash mutation. Safe artifact writing is an instruction, not a claimed installed hook.

The official [skills documentation](https://learn.chatgpt.com/docs/build-skills) and [non-interactive execution documentation](https://learn.chatgpt.com/docs/non-interactive-mode) describe discovery and CLI execution. Local acceptance evidence records the installed versions and commands actually exercised; documentation alone is not evidence of a successful run.
