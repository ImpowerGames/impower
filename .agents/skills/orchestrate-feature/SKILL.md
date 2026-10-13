---
name: orchestrate-feature
description: Coordinate a filed Feature's slice tickets as its one coordinator, admitting dependency-ready tickets, dispatching writers that each run resolve-issue at the ticket's Effort, adopting existing PRs and worktrees, and keeping a run record. Use only when the user explicitly asks to use orchestrate-feature for a Feature number; discussing, filing or reviewing this skill is not an invocation.
---

# Orchestrate a Feature

One coordinator owns the named Feature's delivery. Each ticket's writer runs [resolve-issue](../resolve-issue/SKILL.md) and its review workflow unchanged; the coordinator schedules, observes, adopts and reports. It never edits a writer's worktree, never launches a writer's reviewers, and never merges. The helper commands below are `node .agents/skills/orchestrate-feature/feature-run.mjs <command>`; every command that changes the record takes `--record`, `--coordinator <own session>` and `--expect-revision <revision>`, and refuses a stale revision or another coordinator.

## Authority

An explicit request such as "Use orchestrate-feature for #692" grants the coordinator three things for that Feature: dispatching writers for its open sub-issues, the review checkpoint decisions in [review checkpoints](references/review-checkpoints.md), and the bounded disk recovery in step 5. Record the request verbatim with `init --invocation`; extensions and acceptances quote it. It accepts a writer model override (`--writer-model`) and a concurrency override (`--concurrency`). It does not authorize any merge: the maintainer merges ready PRs.

## 0. Start

1. Read your own model and effort as the [runner notes](../RUNNERS.md) describe, and know which [writer routes](../references/runner-writing.md) your runner offers.
2. Allocate your private directory with resolve-issue's [allocator](../resolve-issue/references/publishing.md#private-writer-allocation), passing the Feature number as `--issue`. The run record lives there; it holds no credentials.
3. Run `init` with `--record <dir>/run.json --checkout <main checkout> --repo <owner/name> --feature <N> --harness <your runner> --coordinator-model --coordinator-effort --invocation "<request>"`. It resolves the writer model (the runner's default, or the override), sets the concurrency bound from memory (plans check disk), and refuses a second coordinator for the same Feature. A refusal names the existing coordinator: continue there, or ask the maintainer. Before `init` or a planned switch of account, harness or machine, read [checkpoints](references/checkpoints.md); a checkpointed Feature is resumed, never restarted.
4. Report the writer model, the concurrency bound and its basis to the user before any dispatch.

## 1. Read the Feature

Read the parent Feature in full: its Proposed solution is the design of record, and its status comments record later decisions. Then run `snapshot --record <file> --out <file>`, which reads every sub-issue, its Effort field, its GitHub blocked-by relationships, PRs with their heads, started review rounds and checks, and local worktrees named for the ticket. A blocker counts as delivered only when its merged PR's commit is on origin/main; a closed issue alone is not delivery. Surface contradictory or missing decisions to the user with a recommendation, and keep planning the tickets they do not affect.

## 2. Plan

1. Write the observation file `{ "sessions": { "<id>": { "state": "running|idle|archived|absent" } }, "tasks": { "<id>": { "state": "running|completed|failed|stopped|<other>" } } }` from what your runner reports for every writer the record holds. Report only what you observed: a missing entry and any other state stay unknown.
2. Run the route preflight for each route your runner offers at the eligible tickets' efforts, as the writing routes describe.
3. Run `plan --record --snapshot --observations --preflight <file,file> --turn user|event --out <file>`. `--turn user` means the user's own message began this turn; a message from another session, a CI event or a timer is `event`. Some routes start a writer only in a user turn; the plan then falls back to the next route, or proposes.

Before acting on a plan, read [plan actions](references/plan-actions.md). Its `remaining` list and `complete: false` belong in every report: this skill does not verify the Feature's acceptance criteria, so never report the Feature complete.

## 3. Dispatch

For each `dispatch` ticket, one at a time:

1. `claim --plan <file> --ticket N --worktree <path> --branch <type>/<N>-<slug> --artifact-parent <dir>` records the intent before anything starts. The worktree follows resolve-issue's layout and must not exist yet. Plan again after each claim; the next claim needs the new revision.
2. `brief --record --plan --ticket N [--decision "<settled decision>" ...]` prints the writer's whole contract, from its worktree and self-check to its review cap and report fields.
3. Start the writer on the claimed route as the writing routes describe, with the brief as its prompt. A detached process starts through `launch`, which checks its model and effort arguments and records its process identity. A session handed to the app goes through `create`, `handoff`, `launched`, `deliver` and `delivered`. Any other route is confirmed with `launched --handle-kind session|task --handle <id>`.
4. Once the writer has checked its own model and effort, confirm the route with the preflight's observed verdict and record it with `verify --preflight <file>`. A blocked verdict marks the ticket `stop-writer`; never relaunch it on another model or effort.

For `propose`, offer the start to the user and record it with `claim --operation proposed`, so the proposal is a pending dispatch rather than an untracked card. Confirm a started proposal with `launched`; withdraw a declined one with `withdraw --evidence`.

## 4. Observe, adopt and release

A writer is replaced only after it is observed to have ended; `release --observations <file> --evidence <text>` refuses any other owner. Missing output, a cancellation request, an unanswered session or an unknown launch outcome proves nothing. For a pending detached start, `reconcile` searches running processes for its launch directory; for another route, find the started writer and record it with `launched`, or `withdraw --evidence` with what you observed.

For `adopt-pr` and `adopt-worktree`, identify the existing writer and record it with `adopt`. Once it is known to have ended (released first if the record holds it), `claim --operation continue --evidence <how you know>` starts a new writer on its branch; the PR keeps its started rounds.

Before acting on any writer's report or request, and on the first wake after you restart, read [writer reports](references/writer-reports.md): messages are hints, a short note is never the report, and every request and answer is recorded. A writer's checkpoint report, sent after round 3's verified fixes and after every later round's, is decided as [review checkpoints](references/review-checkpoints.md) describes, never by its round count alone. Writers keep their own review jobs, round counts, freezes and the machine-wide reviewer and test reservations; the coordinator holds no lock on their worktrees.

## 5. Bounded disk recovery

When a writer or reviewer is blocked on disk headroom, or the plan says free disk admits no writer, run the [clean-worktrees](../clean-worktrees/SKILL.md) dry run from the main checkout, then apply it, which removes only what it classifies as merged and removable. Record each removed path with `disk-recovery --removed <path> --branch <branch> --classifier "<its row>"`. Everything it keeps (uncommitted or unmerged work, paths a live process uses, unregistered directories, retained review-job directories) stays until the maintainer decides. No other cleanup is part of this authority.

## 6. Report

Report at each meaningful change and when you stop: each ticket's action and reason, PRs ready for the maintainer with their reviewed heads and rounds, blockers with recommendations, disk recoveries, the `remaining` list, and the next action. If the record lock is left by a helper process that has exited, `recover-lock` removes it; any other refusal leaves the record as it was.
