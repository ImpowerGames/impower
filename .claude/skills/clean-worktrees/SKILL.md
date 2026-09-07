---
name: clean-worktrees
description: Remove the worktrees under ../impower.worktrees/ whose work is already on main, and keep every other one with the reason printed. Run by hand just before a session is archived, or whenever resolve-issue's preflight reports low disk; a dry run is the default and --apply --root <main checkout> removes. Not a step of resolve-issue and not a hook, because a resolving session ends before its pull request merges and a hook would delete a directory another session is using.
---

# Clean up merged worktrees

Git never removes a worktree on its own. Merging a pull request and deleting its branch on GitHub deletes the remote copy only; the directory under `../impower.worktrees/`, its local branch and its `node_modules` stay until `git worktree remove` runs, at about a gigabyte each. The script beside this file classifies every registered worktree and removes the ones whose work is on `origin/main`. Run it from the main checkout, dry run first, and give `--apply` the main checkout's absolute path as `--root`:

```bash
node .claude/skills/clean-worktrees/clean-worktrees.mjs                                   # classify, remove nothing
node .claude/skills/clean-worktrees/clean-worktrees.mjs --apply --root <main checkout>    # remove the removable ones
```

`--apply` refuses to run without `--root`, and refuses when `--root` is not the main checkout the current directory belongs to, so the repository it acts on is always the one named on the command line and never whatever the shell happens to be in; a shell left in the wrong checkout has removed fifteen worktrees that way in four minutes. The dry run fetches `origin` with `--prune`, which updates the remote-tracking refs in the repository every worktree shares, and touches nothing else. It prints one row per worktree as it is sized, `remove` or `keep` first, then the path, the branch, the size it would free, and the reason, and ends with the count and the total it would free. `--apply` removes each `remove` row with `git worktree remove`, deletes its local branch, removes a type directory (`fix/`, `docs/`) it leaves empty, and prints the same table with `removed`, `kept` or `failed` in the first column and the space freed; a `failed` row says what is left and where. Every row of an `--apply` run is also appended, as it is decided, to `.git/clean-worktrees.log` in the main checkout, so a run that is killed part-way leaves its record on disk and the next run can say which branch a failed removal left behind. It exits non-zero when a removal failed or when it refused to run at all (from a worktree, without `--root`, or with an unknown option).

## What is removed and what is kept

A worktree is removed only when every commit on its branch and on its remote is on `origin/main` (the branch is merged, whether or not its remote still exists), its tree is clean, and nothing is using it. The merge test needs the branch's own commits on `origin/main`, which a merge commit gives; a branch merged by squash or rebase keeps its commits off `origin/main` and stays as unpushed work. Each of these keeps a worktree, and every reason that applies is printed:

- the main checkout, and any other path outside `../impower.worktrees/`; the worktrees under the main checkout's own `.claude/worktrees/` are listed this way and go by hand with `git worktree remove`;
- a locked worktree, one whose directory is already gone (`git worktree prune` drops that record), and one git no longer sees as a worktree though its directory is there (its `.git` link is gone; delete the directory by hand);
- a detached or unborn head, or a worktree git cannot answer for (a corrupt index, say): there is no branch to judge or no answer to judge it by, so it is listed for a person;
- uncommitted changes, counting untracked files; ignored files never count, so a `remove` row names the ignored paths it takes with it (`node_modules/`, a driver's `.chrome-profile/`), and anything worth keeping among them is moved out before `--apply`;
- commits on neither `origin/main` nor the branch's remote, which is unpushed work whether the remote is gone or never existed;
- commits on the remote but not on `origin/main`, whether the local branch holds them or is behind the remote, which is a pull request still open or unmerged;
- a branch with no commit made on it, which is a fresh worktree a session may be working in, and is removed by hand when it is done: its tip sits on `origin/main`'s first-parent line, where a merged branch's tip (the second parent of its merge) never does, or its reflog shows it created at its tip with nothing since. Fast-forwarding, rebasing or resetting the branch does not count as a commit, and a merged branch goes whether or not its reflog has expired; a branch merged by fast-forward with its reflog expired, or a worktree checked out from a remote branch with no commit made locally, looks fresh and goes by hand;
- dev servers the worktree's own driver reports as up, or a state file whose launcher pid is still alive; `node <worktree>/.claude/skills/drive-web-editor/driver.mjs down` settles that (the driver sits under `resolve-issue/` in older worktrees);
- a running process whose command line names the directory, which is how servers started with `npm run web:dev`, and anything else launched with the path as an argument, are seen without a driver; the row names the pids, and it clears once they exit.

Directories under `../impower.worktrees/` that are not worktrees are listed too, with their size, because an interrupted removal leaves one behind and no git command shows it; they go by hand, and the row says what the log knows about them: a `<path>.removing` is the directory an interrupted probe renamed and did not rename back, and a directory an earlier `--apply` failed to finish is named with the branch it stranded.

The refusals are not to be overridden by hand for a tree with changes in it. Commit or discard the changes so the next run judges the tree, and stop the servers so the next run sees them down. The session's own worktree goes only if its pull request has merged by the time the script runs; otherwise it stays for the next run, which is the reason this is not a step of `resolve-issue`.

## Gotchas

- `git fetch --prune origin` runs first, so the classification is against the `origin/main` and the remote branches of that moment; a pull request merged during the run is picked up by the next one.
- `git worktree remove` deletes a tree's entries in directory order, stops at the first it cannot delete, and drops its own record whatever it managed, so what it leaves is no longer a worktree even when every file is still there. Under `--apply` the script re-checks that the tree is still clean, still on its branch and still has no commits of its own, then renames the directory and renames it back; Windows refuses that rename while any process has a file open or its current directory inside the tree (an editor, an indexer, a shell), and a refused rename keeps the tree untouched with a row that says so, even where git itself would have managed. When git still stops part-way, the rest of the directory is removed directly; if something remains, the row says how much and where, the branch stays, and the next run lists the leftover with that branch.
- The local branch is deleted with `-D` once the commit count that justified the removal has been read again; `-d` would compare against the local `main`, which is usually behind `origin/main`.
- Sizing the removable worktrees walks their `node_modules`, so a dry run over twenty of them takes a minute or two.

## Improving this skill

`clean-worktrees.test.mjs` beside the script pins its decisions against stubbed git, driver and process-listing output, models what real git does to a tree it cannot finish removing, runs controls that cut one rule at a time, and runs the real commands on a scratch repository with a held worktree and one git cannot finish; it takes about twenty seconds, so run it after any change here. The held tree and the part-way failure depend on Windows refusing a rename and a long path, so those two checks are skipped elsewhere and say so. A refusal the script does not make, or a removal it should have refused, is a bug in the classification, and the fix goes into the script and its check rather than into a sentence here.
