---
name: clean-worktrees
description: Remove the worktrees under ../impower.worktrees/ whose work is already on main, and keep every other one with the reason printed. Run by hand just before a session is archived, or whenever resolve-issue's preflight reports low disk; a dry run is the default and --apply removes. Not a step of resolve-issue and not a hook, because a resolving session ends before its pull request merges and a hook would delete a directory another session is using.
---

# Clean up merged worktrees

Git never removes a worktree on its own. Merging a pull request and deleting its branch on GitHub deletes the remote copy only; the directory under `../impower.worktrees/`, its local branch and its `node_modules` stay until `git worktree remove` runs, at about a gigabyte each. The script beside this file classifies every registered worktree and removes the ones whose work is on `origin/main`. Run it from the main checkout, dry run first:

```bash
node .claude/skills/clean-worktrees/clean-worktrees.mjs           # classify, remove nothing
node .claude/skills/clean-worktrees/clean-worktrees.mjs --apply   # remove the removable ones
```

The dry run fetches `origin` with `--prune`, which updates the remote-tracking refs in the repository every worktree shares, and touches nothing else. It prints one row per worktree as it is sized, `remove` or `keep` first, then the path, the branch, the size it would free, and the reason, and ends with the count and the total it would free. `--apply` removes each `remove` row with `git worktree remove`, deletes its local branch, removes a type directory (`fix/`, `docs/`) it leaves empty, and prints the same table with `removed`, `kept` or `failed` in the first column and the space freed; a `failed` row says what is left and where. It exits non-zero when a removal failed or when it refused to run at all (from a worktree, or with an unknown option).

## What is removed and what is kept

A worktree is removed only when every commit on its branch and on its remote is on `origin/main` (the branch is merged, whether or not its remote still exists), its tree is clean, and nothing is using it. Each of these keeps a worktree, and every reason that applies is printed:

- the main checkout, and any other path outside `../impower.worktrees/`; the worktrees under the main checkout's own `.claude/worktrees/` are listed this way and go by hand with `git worktree remove`;
- a locked worktree, one whose directory is already gone (`git worktree prune` drops that record), and one git no longer sees as a worktree though its directory is there (its `.git` link is gone; delete the directory by hand);
- a detached or unborn head: the worktree has no branch to judge, so it is listed for a person;
- uncommitted changes, counting untracked files; ignored files never count, so a `remove` row names the ignored paths it takes with it (`node_modules/`, a driver's `.chrome-profile/`), and anything worth keeping among them is moved out before `--apply`;
- commits on neither `origin/main` nor the branch's remote, which is unpushed work whether the remote is gone or never existed;
- commits on the remote but not on `origin/main`, whether the local branch holds them or is behind the remote, which is a pull request still open or unmerged;
- a branch that has not moved since it was created, which its reflog shows: a fresh worktree a session may be working in, whatever it was branched from, and it is removed by hand when it is done (a branch merged by fast-forward with no commit made on it locally looks the same, and goes the same way);
- dev servers the worktree's own driver reports as up, or a state file whose launcher pid is still alive; `node <worktree>/.claude/skills/drive-web-editor/driver.mjs down` settles that (the driver sits under `resolve-issue/` in older worktrees);
- a running process whose command line names the directory, which is how servers started with `npm run web:dev`, and anything else launched from the tree, are seen without a driver; the row names the pids, and stopping them settles it.

Directories under `../impower.worktrees/` that are not worktrees are listed too, with their size, because an interrupted removal leaves one behind and no git command shows it; they go by hand.

The refusals are not to be overridden by hand for a tree with changes in it. Commit or discard the changes so the next run judges the tree, and stop the servers so the next run sees them down. The session's own worktree goes only if its pull request has merged by the time the script runs; otherwise it stays for the next run, which is the reason this is not a step of `resolve-issue`.

## Gotchas

- `git fetch --prune origin` runs first, so the classification is against the `origin/main` and the remote branches of that moment; a pull request merged during the run is picked up by the next one.
- `git worktree remove` deletes what it can before it fails on a directory a process holds (on Windows, any process whose current directory is inside the tree), and what it leaves is no longer a worktree. So under `--apply` the script re-checks that the tree is still clean and still has no commits of its own, then renames the directory and renames it back, which the system refuses while a process holds it; a refused rename keeps the tree untouched and the row says so. When git still stops part-way, the row says what is left and where, the branch stays, and the next run lists the leftover directory.
- The local branch is deleted with `-D` once the commit count that justified the removal has been read again; `-d` would compare against the local `main`, which is usually behind `origin/main`.
- Sizing the removable worktrees walks their `node_modules`, so a dry run over twenty of them takes a minute or two.

## Improving this skill

`clean-worktrees.test.mjs` beside the script pins its decisions against stubbed git, driver and process-listing output, models what real git does to a held tree, runs controls that cut one rule at a time, and runs the real commands on a scratch repository with a held worktree; it takes about twenty seconds, so run it after any change here. A refusal the script does not make, or a removal it should have refused, is a bug in the classification, and the fix goes into the script and its check rather than into a sentence here.
