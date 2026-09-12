---
name: clean-worktrees
description: Classify and remove merged idle worktrees through the guarded cleanup script. Use for requested cleanup or low-disk recovery; dry run first, never as an automatic post-resolution step.
---

# Clean up merged worktrees

Run from the main checkout, dry run first:

```sh
node .agents/skills/clean-worktrees/clean-worktrees.mjs
node .agents/skills/clean-worktrees/clean-worktrees.mjs --apply --root <absolute-main-checkout>
```

The dry run fetches origin with prune and prints remove/keep reasons and sizes. Inspect every proposed removal, including ignored paths such as browser profiles and node_modules; move valuable ignored data out before applying. Apply requires the explicit absolute main root and removes eligible worktrees and local branches. It records outcomes in the main checkout's `.git/clean-worktrees.log`.

## Eligibility and preservation

Only clean, idle worktrees whose branch and remote commits are on origin/main qualify. Preserve uncommitted/untracked work, unmerged/unpushed commits, fresh branches, uncertain process state, external symlink/junction targets and unreadable directories. Main/default branches and paths outside the managed worktree root stay.

Before interpreting a keep/refusal, manually reconciling a link, or recovering interrupted/partial removal, read [classification and recovery](references/classification.md). Never bypass refusal with recursive deletion or remove a junction using a trailing separator. A failed removal is a recovery task; preserve its log and remaining branch/data.

## Apply and verify

Run apply only for authorized cleanup after inspecting the dry run. Review removed/kept/failed rows, exit status and the recorded leftovers. Do not claim success for a partial failure. Stop owned dev servers through their drivers and rerun classification; do not force a tree with changes.

This is not an automatic resolve-issue step or archive hook: the current task's PR may still be unmerged, and other sessions may use the directories.

When modifying cleanup behavior, run its Node test against printed scratch repositories; retain Windows-only and unavailable-filesystem skips as limitations. Put preventable traps into the script/check rather than warning prose.
