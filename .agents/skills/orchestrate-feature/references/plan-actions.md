# Plan actions

`plan` gives every ticket one action with its reason. Act on each as follows.

| Action | Meaning and next step |
| --- | --- |
| `dispatch` | Every blocker's merged deliverable is on origin/main and capacity allows a writer on the named route: claim and start it. |
| `propose` | Only a route this turn cannot start is available: propose the start to the user and record the proposal with `claim --operation proposed`. |
| `wait-dependency` | The reason names each blocker that is open or closed without its merged deliverable on origin/main. No stacked branches: wait for the merge. |
| `wait-capacity` | Writers already hold the concurrency limit, or free disk admits no further writer (consider the bounded disk recovery). |
| `adopt-pr`, `adopt-worktree` | Work for the ticket exists: find its writer and record it with `adopt`. Never start a second writer beside it. |
| `observe` | The owner is running. |
| `collect-report` | The owner ended its turn: read its report or question and answer it. |
| `reconcile-pending` | A recorded start has no confirmed outcome: settle it with `reconcile`, `launched` or `withdraw --evidence` before any retry. |
| `blocked-owner-unknown` | The owner's state is unknown: observe it before anything replaces it. |
| `release` | The owner was observed to end: release it with that evidence; the ticket becomes eligible again. |
| `stop-writer` | The writer runs another model or effort than requested: stop it and keep its evidence. It is never relaunched on a substitute. |
| `blocked-route` | No offered route runs the writer model at the ticket's effort: report the preflight reasons to the user. |
| `decision-needed` | Missing Effort, duplicate open PRs, a closed ticket without its deliverable, or a held writer outside the Feature: report it with a recommendation. |
| `await-maintainer` | A ready PR waits for the maintainer to merge it. |
| `done`, `container` | Delivered, or planned through its own sub-issues. |

An owner's state comes from the observation file for sessions and tasks, and from the recorded process start identity for a detached process on this host. A process recorded on another host is unknown here.
