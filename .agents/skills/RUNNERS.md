# Runner notes

Use this map when a runner capability is unclear.

| Capability              | Claude Code                                                            | Codex                                                                               |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Repository instructions | CLAUDE.md imports AGENTS.md                                            | AGENTS.md is the project entry point                                                |
| Discover skills         | Installer link under the harness project directory                     | Native .agents/skills discovery; the installer also provides the compatibility link |
| Invoke a skill          | Skill tool, named by frontmatter                                       | Use the discovered skill or read its SKILL.md directly                              |
| Read and edit files     | Read, Grep, Glob, Write/Edit                                           | File reading and apply_patch/editor capability exposed by the host                  |
| Rename a session        | set_session_title when offered, loaded through tool search before the call | set_thread_title when offered; the CLI has none and uses the hook's acknowledgement command |
| Own model and effort    | Desktop `get_session` on `self`; `CLAUDE_EFFORT` in shells             | Latest `turn_context` row of the session rollout file                               |
| Independent review      | Agent tool with caller-supplied subagent_type, or a fresh CLI process  | Caller-supplied collaboration model override when available, or a fresh CLI process |
| Private artifacts       | Exclusive directory per agent/attempt; parent scratchpads may be shared; resolve-issue writers use its [allocator](resolve-issue/SKILL.md#0-preflight) | Exclusive directory per agent/attempt; resolve-issue writers use its [allocator](resolve-issue/SKILL.md#0-preflight) |
| Observe completion      | Await task status or CLI process exit, then read paginated PR comments | Await task status or CLI process exit, then read paginated PR comments              |
| Shell backslashes       | Bash tool collapses `\\` to `\`; PowerShell tool preserves them        | Not measured                                                                        |

## Review execution

Before launching a local CLI reviewer, read [reviewer mappings](references/runner-review.md) (cloud containers: [Codex route](references/runner-review.md#codex-reviewer-in-a-linux-cloud-container)) and [handoff execution](review-pr/HANDOFF.md). Supply the writer route and effort, any caller-selected reviewer route, and use the shared reservation launcher. For the writer's model and effort, or a reviewer left to the defaults, read [default reviewer routes](references/runner-reviewer-defaults.md). Native or remote tasks do not satisfy its enforced capacity contract.

## Delegation

Read [writing routes](references/runner-writing.md) before launching a separate writer, and [filing routes](references/runner-filing.md) before the outstanding-work sweep files a ticket.

## Migration and recovery

If installation refuses populated directories, foreign links or broken links, read [installation recovery](references/runner-recovery.md) before retrying. Preserve local skills, driver state and browser profiles.

## Maintenance

When debugging discovery, shell selection or hooks, read [runner maintenance](references/runner-maintenance.md). Hook trust is separate from skill installation; never claim enforcement merely because links exist.
