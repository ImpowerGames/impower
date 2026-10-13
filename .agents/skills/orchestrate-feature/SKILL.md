---
name: orchestrate-feature
description: Coordinate a filed Feature's slice tickets as its one coordinator, admitting dependency-ready tickets, dispatching writers that each run resolve-issue at the ticket's Effort, adopting existing PRs and worktrees, merging eligible PRs through a gate, verifying the Feature's acceptance, and keeping a run record. Use only when the user explicitly asks to use orchestrate-feature for a Feature number; discussing, filing or reviewing this skill is not an invocation.
---

# Orchestrate a Feature

One coordinator owns the named Feature's delivery. Each ticket's writer runs [resolve-issue](../resolve-issue/SKILL.md) and its review workflow unchanged; the coordinator schedules, observes, adopts, merges and reports. It never edits a writer's worktree and never launches a writer's reviewers. The helper commands below are `node .agents/skills/orchestrate-feature/feature-run.mjs <command>`; every command that changes the record takes `--record`, `--coordinator <own session>` and `--expect-revision <revision>`, and refuses a stale revision or another coordinator.

## Authority

An explicit request such as "Use orchestrate-feature for #692" grants the coordinator four things for that Feature: dispatching writers for its open sub-issues, the review checkpoint decisions in [review checkpoints](references/review-checkpoints.md), merging its slices' PRs through the gate in [integration](references/integration.md), and the bounded disk recovery in step 5. That merge is the one exception to the repository's maintainer-only merge rule: writers and ordinary resolve-issue sessions never merge, and discussing, filing or reviewing this skill grants nothing. Record the request verbatim with `init --invocation` (extensions, acceptances and merges quote it) and who merges with `--merging`, as integration describes. It accepts a writer model override (`--writer-model`) and a concurrency override (`--concurrency`).

## 0. Start

1. Read your own model and effort as the [runner notes](../RUNNERS.md) describe, and know which [writer routes](../references/runner-writing.md) your runner offers.
2. Allocate your private directory with resolve-issue's [allocator](../resolve-issue/references/publishing.md#private-writer-allocation), passing the Feature number as `--issue`. The run record lives there; it holds no credentials.
3. Run `init` with `--record <dir>/run.json --checkout <main checkout> --repo <owner/name> --feature <N> --harness <your runner> --coordinator-model --coordinator-effort --invocation "<request>" --merging coordinator|maintainer`. It resolves the writer model, sets the concurrency bound, and refuses a second coordinator for the same Feature; continue in the one it names, or ask the maintainer. Before `init` or a planned switch of account, harness or machine, read [checkpoints](references/checkpoints.md); a checkpointed Feature is resumed, never restarted.
4. Report the writer model, the concurrency bound and its basis to the user before any dispatch.

## 1. Read the Feature

Read the parent Feature in full: its Proposed solution is the design of record, and its status comments record later decisions. Then run `snapshot --record <file> --out <file>`, which reads every sub-issue with its Effort, blockers, PRs and worktrees. A blocker counts as delivered only when its merged PR's commit is on origin/main; a closed issue alone is not delivery. Surface contradictory or missing decisions to the user with a recommendation, and keep planning the tickets they do not affect.

## 2. Plan

Before planning, read [plan actions](references/plan-actions.md).

1. Write the observation file, shaped as plan actions shows, from what your runner reports for every writer the record holds. Report only what you observed: a missing entry and any other state stay unknown.
2. Run the route preflight for each route your runner offers at the eligible tickets' efforts, as the writing routes describe.
3. Run `plan --record --snapshot --observations --preflight <file,file> --turn user|event --out <file>`. `--turn user` means the user's own message began this turn; a message from another session, a CI event or a timer is `event`. Some routes start a writer only in a user turn; the plan then falls back to the next route, or proposes.

The plan's `remaining` list and `complete` flag belong in every report; `complete` holds only after step 6 verified the Feature's acceptance criteria on main.

## 3. Dispatch

For each `dispatch` ticket, one at a time:

1. `claim --plan <file> --ticket N --worktree <path> --branch <type>/<N>-<slug> --artifact-parent <dir>` records the intent before anything starts. The worktree follows resolve-issue's layout and must not exist yet. Plan again after each claim.
2. `brief --record --plan --ticket N [--decision "<settled decision>" ...]` prints the writer's whole contract.
3. Start the writer on the claimed route as the writing routes describe, with the brief as its prompt. A detached process starts through `launch`. A session handed to the app goes through `create`, `handoff`, `launched`, `deliver` and `delivered`. Any other route is confirmed with `launched --handle-kind session|task --handle <id>`.
4. Once the writer has checked its own model and effort, record the preflight's observed verdict with `verify --preflight <file>`. A blocked verdict marks the ticket `stop-writer`; never relaunch it on another model or effort.

For `propose`, offer the start to the user and record it with `claim --operation proposed`. Confirm a started proposal with `launched`; withdraw a declined one with `withdraw --evidence`.

## 4. Observe, adopt and release

A writer is replaced only after it is observed to have ended; `release --observations <file> --evidence <text>` refuses any other owner. Missing output, a cancellation request, an unanswered session or an unknown launch outcome proves nothing. A pending start is settled with `reconcile`, `launched` or `withdraw --evidence` before any retry.

For `adopt-pr` and `adopt-worktree`, record the existing writer with `adopt`, and continue its work only as plan actions describes; the PR keeps its started rounds.

Before acting on any writer's report or request, and on the first wake after you restart, read [writer reports](references/writer-reports.md): messages are hints, a short note is never the report, and every request and answer is recorded. A writer's checkpoint report, sent after round 3's verified fixes and after every later round's, is decided as [review checkpoints](references/review-checkpoints.md) describes, never by its round count alone. Writers keep their own review jobs, round counts, freezes and the machine-wide reviewer and test reservations.

## 5. Bounded disk recovery

When a writer or reviewer is blocked on disk headroom, or the plan says free disk admits no writer, run the [clean-worktrees](../clean-worktrees/SKILL.md) dry run from the main checkout, then apply it, which removes only what it classifies as merged and removable. Record each removed path with `disk-recovery --removed <path> --branch <branch> --classifier "<its row>"`. Everything it keeps stays until the maintainer decides. No other cleanup is part of this authority.

## 6. Integrate and finish

Before any merge or verification, read [integration](references/integration.md). A `merge-gate` ticket merges only through `integration.mjs merge`, which runs the gate again on the current head, saves the intent before calling GitHub with that head, and records what GitHub reads back; a refused or uncertain merge is settled from GitHub, never retried blind. Once every slice is delivered on main, verify the Feature's acceptance criteria with `verify-feature`, and close the Feature with `close-feature` only on a complete verdict.

## 7. Report

Report at each meaningful change and when you stop: each ticket's action and reason, merges with their disposition, PRs left to the maintainer, blockers with recommendations, disk recoveries, the `remaining` list, and the next action. The final report separates reviewed completion, accepted unreviewed corrections and incomplete work, as `verify-feature` writes it. At completion, or when you need the maintainer, also send the optional [notify-user](../notify-user/SKILL.md) alert. If the record lock is left by a helper process that has exited, `recover-lock` removes it; any other refusal leaves the record as it was.
