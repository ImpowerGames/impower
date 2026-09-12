# Runner notes

Use this map only when a runner capability is unclear. Repository instruction and skill loading follow AGENTS.md; unchanged material already available need not be read again.

| Capability              | Claude Code                                                            | Codex                                                                               |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Repository instructions | CLAUDE.md imports AGENTS.md                                            | AGENTS.md is the project entry point                                                |
| Discover skills         | Installer link under the harness project directory                     | Native .agents/skills discovery; the installer also provides the compatibility link |
| Invoke a skill          | Skill tool, named by frontmatter                                       | Use the discovered skill or read its SKILL.md directly                              |
| Read and edit files     | Read, Grep, Glob, Write/Edit                                           | File reading and apply_patch/editor capability exposed by the host                  |
| Rename a session        | set_session_title when offered                                         | set_thread_title when offered; optional in CLI                                      |
| Independent review      | Agent tool with caller-supplied subagent_type, or a fresh CLI process  | Caller-supplied collaboration model override when available, or a fresh CLI process |
| Private artifacts       | Unique directory under system temp; a scratchpad is usable if private  | Unique directory under system temp or a host-provided private directory             |
| Observe completion      | Await task status or CLI process exit, then read paginated PR comments | Await task status or CLI process exit, then read paginated PR comments              |

## Review execution

Before launching a local CLI reviewer, read [reviewer mappings](../references/runner-review.md) and [handoff execution](review-pr/HANDOFF.md). Supply caller-selected routes and use the shared reservation launcher. Native or remote tasks do not satisfy its enforced capacity contract.

## Migration and recovery

If installation refuses populated directories, foreign links or broken links, read [installation recovery](../references/runner-recovery.md) before retrying. Preserve local skills, driver state and browser profiles.

## Maintenance

When debugging discovery, shell selection or hooks, read [runner maintenance](../references/runner-maintenance.md). Hook trust is separate from skill installation; never claim enforcement merely because links exist.
