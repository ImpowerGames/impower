---
name: clean-worktrees
description: Classify and remove merged idle worktrees through the guarded cleanup script. Use for requested cleanup, low-disk recovery, orchestrate-issues post-merge cleanup or the resolve-issue preflight; dry run first, never otherwise automatic after resolution.
---

# Clean up merged worktrees

Run from the main checkout, dry run first:

```sh
node .agents/skills/clean-worktrees/clean-worktrees.mjs
node .agents/skills/clean-worktrees/clean-worktrees.mjs --apply --root <absolute-main-checkout>
```

The dry run fetches origin with prune and prints remove/keep reasons and sizes. Inspect every proposed removal, including ignored paths such as browser profiles and node_modules; move valuable ignored data out before applying. Apply requires the explicit absolute main root and removes eligible worktrees and local branches. It records outcomes in the main checkout's `.git/clean-worktrees.log`.

Routine resolve-issue preflight uses the dry run only. For blocked disk headroom, follow [bounded recovery](references/classification.md#bounded-low-disk-recovery) with explicit authorization.

## Dead records and one named directory

`--apply` first runs `git worktree prune`, so a record whose directory is gone never blocks a branch deletion or shows as a row that only says to run it. It waits, and says so, when a `<path>.removing` sits beside a dead record: the record that leftover points at must survive until it is renamed back. A dry run prunes nothing.

To give one directory back whatever its branch has merged (an abandoned ticket, an open pull request), or to clear a leftover that is not a registered worktree:

```sh
node .agents/skills/clean-worktrees/clean-worktrees.mjs --apply --root <absolute-main-checkout> --remove <absolute-directory>
```

It refuses the main checkout, a path outside the worktrees root, a link, one holding another worktree or inside one (name the worktree itself), the default branch, a locked worktree, uncommitted changes, a tree `git status` cannot answer for (a worktree git can no longer read, or an unregistered directory holding its own `.git`), a process or driver using it (only the shell whose own command line runs this script does not count), a directory the rename probe finds held, a link inside it that leads outside (named), a directory it cannot read, and a `.removing` probe. Otherwise it unlinks every link inside without following it, removes the tree (through `git worktree remove` while git knows it, directly after) and leaves the branch. There is no dry run and it does not list the ignored paths it takes (`node_modules/`, `.env.local`): check `git status --ignored` in the tree first. It records the removal in the log like `--apply`, and prints a `failed` row with what remains when the tree cannot be finished.

## Eligibility and preservation

Only clean, idle worktrees whose branch and remote commits are on origin/main qualify. A detached worktree qualifies when its commit is an ancestor of origin/main and it passes the same clean, idle and link checks, nothing is in progress in it (rebase, bisect, merge), its HEAD reflog and per-worktree refs reach no commit that only they hold, and HEAD last moved over 24 hours ago. Preserve uncommitted/untracked work, unmerged/unpushed commits, fresh branches, uncertain process state, external symlink/junction targets and unreadable directories. Main/default branches and paths outside the managed worktree root stay.

Before interpreting a keep/refusal, manually reconciling a link, or recovering interrupted/partial removal, read [classification and recovery](references/classification.md). Never bypass refusal with recursive deletion or remove a junction using a trailing separator. A failed removal is a recovery task; preserve its log and remaining branch/data.

## Other locations

After the worktrees, the same run lists, with sizes and reasons, and under `--apply` removes when nothing still uses them: the web editor driver's checkout directories (once their worktree goes or the checkout their owner record names is gone), the review job directories under `<main checkout>.review-jobs`, the filer job directories under `<main checkout>.filer-jobs`, redgreen snapshots under the main checkout's `.tmp/` and test-suite runs under its `.git/test-suites/`. The entry points agents run point `TEMP`, `TMP` and `TMPDIR` at the ignored `.tmp/` of their own checkout, so a worktree's scratch goes with the worktree. Before interpreting a row for one of these, read [other locations](references/locations.md).

## Apply and verify

Run apply only for authorized cleanup after inspecting the dry run. Review removed/kept/failed rows, exit status and the recorded leftovers. Do not claim success for a partial failure. Stop owned dev servers through their drivers and rerun classification; do not force a tree with changes.

Resolve-issue preflight inspects candidates before creating its worktree. Cleanup is never an automatic post-resolution or archive step; unmerged work and other sessions remain protected.

Review jobs containing registered worktrees, embedded repositories with work or uncertain ownership are protected, with inventory refreshed before removal; see [ownership protection](references/classification.md#review-job-ownership).

When modifying cleanup behavior, run its Node test against printed scratch repositories; retain Windows-only and unavailable-filesystem skips as limitations. Put preventable traps into the script/check rather than warning prose.
