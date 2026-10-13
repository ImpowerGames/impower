# Plan actions

`plan` gives every ticket one action with its reason. Act on each as follows.

| Action | Meaning and next step |
| --- | --- |
| `dispatch` | Every blocker's merged deliverable is on origin/main and capacity allows a writer on the named route: claim and start it. |
| `propose` | Only a route this turn cannot start is available: propose the start to the user and record the proposal with `claim --operation proposed`. |
| `dispatch-step` | A start that runs in recorded steps is between steps: run the step the reason names. |
| `wait-dependency` | The reason names each blocker that is open or closed without its merged deliverable on origin/main, or the parent ticket whose own writer is still held. No stacked branches: wait for the merge or for that writer to be settled. A start already recorded under a held parent stays recorded, but none of its steps run and its writer is not briefed until then. |
| `wait-capacity` | Writers already hold the concurrency limit, or free disk admits no further writer now (consider the bounded disk recovery; the next plan admits writers against the disk it frees). |
| `adopt-pr`, `adopt-worktree` | Work for the ticket exists: find its writer and record it with `adopt`. Never start a second writer beside it. Once its writer is known to have ended, `claim --operation continue --evidence` starts a new writer on the route the entry's `continueWith` names, keeping the branch, worktree and the PR's started rounds; `continueBlocked` says why no route can. On a ticket that gained sub-issues, the existing work also holds those sub-issues until its writer is settled, and is never continued. |
| `deliver-brief` | The app adopted a newly launched writer's session: once its first turn has ended, record `deliver --plan <file> [--decision ...]`, which stores the brief and prints it, send that text by message, then record `delivered`. A send whose outcome was not recorded shows as `reconcile-pending`: settle it from the writer's transcript, or record `deliver --retry`, which prints the same stored brief under a new delivery id, and send that copy; never build a fresh one. |
| `answer-request` | The writer asked for a decision whose answer has not been delivered: decide or `relay` it, record `answer` and send the message it prints, then record `answered`, as [writer reports](writer-reports.md) describes. |
| `observe` | The owner is running. |
| `collect-report` | The owner ended its turn: read its report or question and answer it. |
| `reconcile-pending` | A recorded start has no confirmed outcome: settle it with `reconcile`, `launched` or `withdraw --evidence` before any retry, as the reason says. |
| `blocked-owner-unknown` | The owner's state is unknown: observe it before anything replaces it. |
| `release` | The owner was observed to end: release it with that evidence; the ticket becomes eligible again. |
| `stop-writer` | The writer runs another model or effort than requested: stop it and keep its evidence. It is never relaunched on a substitute. |
| `blocked-route` | No offered route runs the writer model at the ticket's effort: report the preflight reasons to the user. |
| `decision-needed` | Missing Effort, duplicate open PRs, a closed ticket without its deliverable, a held writer outside the Feature or on a ticket that gained sub-issues, or sub-issues nested past GitHub's limit: report it with a recommendation. |
| `await-maintainer` | A ready PR waits for the maintainer to merge it. Until the record settles its writer (released, or adopted and released), that writer may still be finishing and keeps its place; the reason says so, and `adopt` records it. |
| `done`, `container` | Delivered, or planned through its own sub-issues. A closed ticket whose worktree remains here and whose writer the record has not settled keeps that writer's place, as the reason says: adopt and release the writer, or remove the merged worktree through clean-worktrees. |

An adopted writer is recorded with the model and effort it actually runs, and verified against the ticket's Effort, so a mismatch plans as `stop-writer`. An owner's state comes from the observation file for sessions and tasks. A detached writer on this host is live while its recorded wrapper runs or while any process names its launch directory, which the writer carries on its own command line; a failed process census, or a process recorded on another host, leaves it unknown.
