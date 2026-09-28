---
name: clean-worktrees
description: Classify and remove merged idle worktrees through the guarded cleanup script. Use for requested cleanup, low-disk recovery or the resolve-issue preflight before a task's worktree exists; dry run first, never as an automatic post-resolution step.
---

# Clean up merged worktrees

Run from the main checkout, dry run first:

```sh
node .agents/skills/clean-worktrees/clean-worktrees.mjs
node .agents/skills/clean-worktrees/clean-worktrees.mjs --apply --root <absolute-main-checkout>
```

The dry run fetches origin with prune and prints remove/keep reasons and sizes. Inspect every proposed removal, including ignored paths such as browser profiles and node_modules; move valuable ignored data out before applying. Apply requires the explicit absolute main root and removes eligible worktrees and local branches. It records outcomes in the main checkout's `.git/clean-worktrees.log`.

## Dead records and one named directory

`--apply` first runs `git worktree prune`, so a record whose directory is gone never blocks a branch deletion or shows as a row that only says to run it. It waits, and says so, when a `<path>.removing` sits beside a dead record: the record that leftover points at must survive until it is renamed back. A dry run prunes nothing.

To give one directory back whatever its branch has merged (an abandoned ticket, an open pull request), or to clear a leftover git no longer sees as a worktree:

```sh
node .agents/skills/clean-worktrees/clean-worktrees.mjs --apply --root <absolute-main-checkout> --remove <absolute-directory>
```

It refuses the main checkout, a path outside the worktrees root, one holding another worktree or inside one (name the worktree itself), the default branch, a locked worktree, uncommitted changes, a process or driver using it (the shells that ran the command do not count), a directory the rename probe finds held, a link inside it that leads outside (named), a directory it cannot read, and a `.removing` probe. Otherwise it unlinks every link inside without following it, removes the tree (through `git worktree remove` while git knows it, directly after) and leaves the branch. There is no dry run and it does not list the ignored paths it takes (`node_modules/`, `.env.local`): check `git status --ignored` in the tree first. It records the removal in the log like `--apply`, and prints a `failed` row with what remains when the tree cannot be finished.

## Eligibility and preservation

Only clean, idle worktrees whose branch and remote commits are on origin/main qualify. Preserve uncommitted/untracked work, unmerged/unpushed commits, fresh branches, uncertain process state, external symlink/junction targets and unreadable directories. Main/default branches and paths outside the managed worktree root stay.

Before interpreting a keep/refusal, manually reconciling a link, or recovering interrupted/partial removal, read [classification and recovery](references/classification.md). Never bypass refusal with recursive deletion or remove a junction using a trailing separator. A failed removal is a recovery task; preserve its log and remaining branch/data.

## Web editor driver directories

The web editor driver keeps a directory per checkout under `%LOCALAPPDATA%\impower-driver` (system temp elsewhere; `IMPOWER_DRIVER_HOME` overrides it), named by a hash of the checkout path, with each session's server record and browser profile inside. The run lists the directory of every worktree it removes, with its size, and removes it under apply unless a session in it has a server record naming a live pid, a profile claim under 30 minutes old, or a claim lock under 30 seconds old, a running process's command line names the directory, or anything in it that the decision reads (its entries, a record, a claim) cannot be read or is a link. A directory that matches no worktree is listed with its size and retained, since the hash cannot say which checkout it served. Directories of retained worktrees are not listed.

## Review job directories

The same run lists every directory under `<main checkout>.review-jobs`, the root that holds review plans, journals, diffs and reviewer probe checkouts. A `pr-<N>` directory is removable when GitHub reports PR (or issue) N closed, every `*.jsonl` journal in it reads in full, no process a journal records is running, and no process command line names it. A `test-*` directory is a standalone check's scratch folder kept outside TEMP (the cross-provider continuation test's, for one); it is removable under the same process rules, with no GitHub lookup, and retained when it holds no journal naming its process. Anything else under the root is retained with its reason. Removal unlinks every symlink and junction inside the directory before deleting it and never follows one, since probe checkouts hold `node_modules` junctions into live worktrees. A recycled process ID that happens to be running retains the directory until a later run.

## Scratch directories

The same run lists two scratch locations the regression workflow writes, each row with its size, and `--apply` removes the removable ones and records them in the log. A `redgreen-*` directory under the system temp directory holds a red/green run's snapshot and its `red.log` and `green.log`; it is removable once it was last written more than a day ago and the pid its `owner.json` names, the red/green run that made it, is not running. A run under the main checkout's `.git/test-suites/` is removable when its `run.json` reports the coordinator released it or names a coordinator pid that is dead, and no unfinished attempt's child pid is running; a missing or unreadable `run.json` keeps it, since a run may be starting. For both, a process whose command line names the directory, or a process listing that failed, keeps it. A linked worktree's test-suite runs live in its own git dir and go with the worktree.

## Apply and verify

Run apply only for authorized cleanup after inspecting the dry run. Review removed/kept/failed rows, exit status and the recorded leftovers. Do not claim success for a partial failure. Stop owned dev servers through their drivers and rerun classification; do not force a tree with changes.

The resolve-issue preflight runs this workflow before the task's worktree exists, so that task is never among the removals. It is not a post-resolution step or archive hook: at that point the current task's PR may still be unmerged, and other sessions may use the directories.

When modifying cleanup behavior, run its Node test against printed scratch repositories; retain Windows-only and unavailable-filesystem skips as limitations. Put preventable traps into the script/check rather than warning prose.
