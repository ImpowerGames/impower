---
name: orchestrate-issues
description: Coordinate one parent issue (Feature, Task or Bug) and its sub-issue tree: admit dependency-ready tickets, dispatch resolve-issue writers at each ticket's Effort, adopt existing PRs and worktrees, merge eligible PRs through a gate, verify the parent's acceptance criteria and keep a run record. Use only when the user explicitly asks to use orchestrate-issues for a parent issue; discussing, filing or reviewing this skill is not an invocation.
---

# Orchestrate a parent issue

One coordinator owns the delivery of the named parent issue, a Feature, Task or Bug whose sub-issue tree is the work. Each ticket's writer runs [resolve-issue](../resolve-issue/SKILL.md) and its review workflow unchanged; the coordinator schedules, observes, adopts, merges and reports. It never edits a writer's worktree or launches its reviewers. Helper commands are `node .agents/skills/orchestrate-issues/issue-run.mjs <command>`; each that changes the record takes `--record`, `--coordinator` and `--expect-revision`, refusing a stale revision or another coordinator.

## Authority

An explicit request such as "Use orchestrate-issues for #692" grants the coordinator, for that parent: dispatching writers for its open sub-issues, setting missing Effort, organizing its loose Bugs into Task slices in step 2 (filing them, re-parenting the Bugs, setting Effort, milestone and blockers) with no maintainer approval, placing tickets filed during the run (attaching, milestone, blocker, a PR sent back for the proper fix), the review checkpoint decisions in [review checkpoints](references/review-checkpoints.md), merging its slices' PRs through the gate in [integration](references/integration.md), and the bounded disk recovery in step 6. That merge is the one exception to the repository's maintainer-only merge rule: writers and ordinary resolve-issue sessions never merge, and discussing, filing or reviewing this skill grants nothing.

## 0. Start

Before `init`, read [starting a run](references/start.md).

1. Read your own model, effort and permission mode as the [runner notes](../RUNNERS.md) describe, and know which [writer routes](../references/runner-writing.md) your runner offers. Run in bypass permissions mode: writers launch in your own mode; nothing is dispatched until `init` records bypass.
2. Allocate your private directory with resolve-issue's [allocator](../resolve-issue/references/publishing.md#private-writer-allocation), passing the parent's number as `--issue`; the run record lives there.
3. Run `init`, recording the request verbatim with `--invocation` and who merges with `--merging`. A checkpointed parent is resumed as [checkpoints](references/checkpoints.md) describes, never restarted.
4. Schedule the periodic check-in at 30 minutes.
5. Before any dispatch, report to the user the writer model, the concurrency bound and its basis, and each slice step 2 filed with its Bugs, file set and chain position.

## 1. Read the parent

Read the parent in full: its body, as its template structures it, is the design of record, and its status comments record later decisions. Then run `snapshot --record <file> --out <file>`, which reads every sub-issue with its Effort, blockers, PRs and worktrees. Surface contradictory or missing decisions to the user with a recommendation, and keep planning the tickets they do not affect.

## 2. Group loose Bugs into slices

Two or more open Bugs directly under the parent, or under a container in its tree, with no PR, worktree, writer or pending start, are grouped into Task slices as [slicing](references/slicing.md) describes; an already sliced parent skips this step. Group only on a mechanism or file set the code behind each Bug shows they share, never on titles. File each slice through the [filing routes](../references/runner-filing.md), re-parent its Bugs, give it its hardest Bug's Effort and make it `blocked_by` the tail of its file set's serial chain outside its own Bugs, then rerun `snapshot`.

A slice is one reviewable PR of Bugs only, since only an all-Bug slice delivers. Never wrap a lone Bug in a Task, re-parent a Bug with a PR, worktree, writer or pending start, or add a Bug to a dispatched slice; a Bug arriving mid-run gets a new slice, or stays its own ticket when alone.

## 3. Plan

Before planning, read [plan actions](references/plan-actions.md).

1. Write the observation file, shaped as plan actions shows, from what your runner reports for every writer the record holds. Report only what you observed: a missing entry and any other state stay unknown.
2. Run the route preflight for each route your runner offers at the eligible tickets' efforts, as the writing routes describe.
3. Run `plan --record --snapshot --observations --preflight <file,file> --out <file>`. Claude writers dispatch only on the detached CLI route.

The plan's `remaining` list and `complete` flag belong in every report, with its `checkIn` and `sweep` entries acted on; `complete` holds only after step 7 verified the parent's acceptance criteria on main.

## 4. Dispatch

For each `dispatch` ticket, one at a time:

1. `claim --plan <file> --ticket N --worktree <path> --branch <type>/<N>-<slug> --artifact-parent <dir>` records the intent before anything starts. The worktree follows resolve-issue's layout and must not exist yet. Plan again after each claim.
2. `brief --record --plan --ticket N [--decision "<settled decision>" ...]` prints the writer's whole contract.
3. Start the writer on the claimed route as the writing routes describe, with the brief as its prompt: a detached CLI writer through `launch`; any other route confirmed with `launched`.
4. Record the writer's acknowledgement with `acknowledged --model --effort --permission-mode --evidence`, and the preflight's observed verdict with `verify --preflight <file>`. A mismatch marks the ticket `stop-writer`; never relaunch it on another model, effort or mode.

## 5. Observe, adopt and release

A writer is replaced only after it is observed to have ended; `release --observations <file> --evidence <text>` refuses any other owner. Missing output, a cancellation request, an unanswered session or an unknown launch outcome proves nothing.

For `adopt-pr` and `adopt-worktree`, record the existing writer with `adopt`, and continue its work only as plan actions describes.

At every check-in, on the first wake after you restart, and before acting on any writer's report or request, run the wake routine in [writer reports](references/writer-reports.md). It triages each ticket filed during the run as you learn of it. A writer's checkpoint report is decided as [review checkpoints](references/review-checkpoints.md) describes, never by its round count alone. Writers keep their own review jobs, round counts, freezes and the machine-wide reviewer and test reservations.

## 6. Cleanup and disk recovery

When disk headroom blocks a writer or reviewer, or the plan admits none for free disk, run the [clean-worktrees](../clean-worktrees/SKILL.md) dry run from the main checkout, then apply it; it removes only merged, removable entries. Record each removal with `disk-recovery --removed <path> --branch <branch> --classifier "<its row>"`. Clean up after each merge and release per [cleanup](references/cleanup.md). No other cleanup is authorized.

## 7. Integrate and finish

Before any merge or verification, read [integration](references/integration.md). A `merge-gate` ticket merges only through `integration.mjs merge`; a refused or uncertain merge is settled from GitHub, never retried blind. Once every slice is delivered on main, `verify-issue` checks the parent's "Acceptance criteria" section; `close-issue` closes the parent only on a complete verdict, never on merged PRs alone.

## 8. Report

Report at each meaningful change and on stopping: each ticket's action and reason, merges, PRs left to the maintainer, blockers with recommendations, disk recoveries, the `remaining` list and the next action. At completion, or when you need the maintainer, send the optional [notify-user](../notify-user/SKILL.md) alert. `recover-lock` removes only a record lock left by an exited helper process. File what the run turns up through the [filing routes](../references/runner-filing.md), never a session proposal, and triage it too.
