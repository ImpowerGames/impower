# Cleanup as the run goes

Clean up after each `confirmed` merge, and after a ticket is released or withdrawn, rather than at the end of the run. Start only once the ticket's writer is released and every reviewer process on its PR has exited.

1. Run the [clean-worktrees](../../clean-worktrees/SKILL.md) dry run from the main checkout. Inspect the rows for the ticket's worktree, its local branch, its web editor driver directory, its `pr-<N>` review job directory and the run's finished scratch directories, then apply it.
2. Clear the other worktrees and branches the run made for the ticket and no longer needs, such as a reproduction, a probe or a replaced attempt: a worktree through clean-worktrees' `--remove <absolute-directory>`, and its local branch with `git branch -d`, which refuses a branch whose commits are not merged. A refused branch holding work no PR carries stays and is named in the report.
3. Record each removal with `disk-recovery --removed <path> --branch <branch> --classifier "<its row or the command that removed it>"`.

A worktree or branch a guard keeps (uncommitted or unpushed work, a live process, an unmerged commit) stays, with its reason in the report; never force it or delete with `-D`. Never touch a worktree or branch the run did not create, or one another ticket's writer still uses.
