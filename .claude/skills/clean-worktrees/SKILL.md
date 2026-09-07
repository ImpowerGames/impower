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

The dry run prints one row per worktree, `remove` or `keep` first, then the path, the branch, the size it would free, and the reason, and ends with the count and total it would free. `--apply` removes each `remove` row with `git worktree remove`, deletes its local branch, removes a type directory (`fix/`, `docs/`) it leaves empty, prunes the worktree list once at the end, and prints the same table with `removed`, `kept` or `failed` in the first column and the space freed. It exits non-zero only when a removal failed.

## What is removed and what is kept

A worktree is removed only when every commit on its branch is on `origin/main` (the branch is merged, whether or not its remote still exists), its tree is clean, and nothing is using it. Each of these keeps a worktree, and every reason that applies is printed:

- the main checkout, and any other path outside `../impower.worktrees/`, which is also the one place the script will delete a directory from directly;
- a locked worktree, and one whose directory is already gone (`git worktree prune` drops that record);
- a detached head: the worktree has no branch to judge, so it is listed for a person;
- uncommitted changes, counting untracked files, so a scratch `.sd` left behind keeps its worktree;
- commits on neither `origin/main` nor the branch's remote, which is unpushed work whether the remote is gone or never existed;
- commits on the remote but not on `origin/main`, which is a pull request still open or unmerged;
- dev servers the worktree's own driver reports as up, or a state file whose launcher pid is still alive; `node <worktree>/.claude/skills/drive-web-editor/driver.mjs down` settles that (the driver sits under `resolve-issue/` in older worktrees);
- a branch with no commits of its own, which is a fresh worktree a session may be working in. A merged branch's tip is the second parent of a merge on `main` and never sits on `main`'s first-parent line, which is how the two are told apart.

The refusals are not to be overridden by hand for a tree with changes in it. Commit or discard the changes so the next run judges the tree, and stop the servers so the next run sees them down. The session's own worktree goes only if its pull request has merged by the time the script runs; otherwise it stays for the next run, which is the reason this is not a step of `resolve-issue`.

## Gotchas

- `git fetch --prune origin` runs first, so the classification is against the `origin/main` and the remote branches of that moment; a pull request merged during the run is picked up by the next one.
- `git worktree remove` on Windows refuses a directory a process still holds a file in. The script then removes the directory directly and prunes the record, and says so in the row.
- `git branch -d` compares against the local `main`, which is usually behind `origin/main` in the main checkout; when it refuses, the script deletes with `-D`, which is safe because every commit was already found on `origin/main`, and says so in the row.
- Sizing the removable worktrees walks their `node_modules`, so a dry run over twenty of them takes a minute or two.

## Improving this skill

`clean-worktrees.test.mjs` beside the script pins its decisions against stubbed git and driver output, runs controls that cut one refusal at a time, and runs the real commands once on a scratch repository; it takes about five seconds, so run it after any change here. A refusal the script does not make, or a removal it should have refused, is a bug in the classification, and the fix goes into the script and its check rather than into a sentence here.
