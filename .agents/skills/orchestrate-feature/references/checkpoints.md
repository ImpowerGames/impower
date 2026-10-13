# Checkpoints, handoff and resume

The run record lives on the coordinator's machine. A portable copy of it is published as checkpoints on the Feature's state branch, `orchestrate-state/feature-<N>` in the same repository, and one status comment on the parent Feature links the exact checkpoint commit. A coordinator on any machine, account or harness starts from the Feature number alone. The commands below are `node .agents/skills/orchestrate-feature/checkpoint.mjs <command>`.

## What a checkpoint holds

Each checkpoint commit holds `checkpoint.json` and `brief.md` (the takeover brief), and its first parent is the previous checkpoint. It is pushed without force, so Git refuses an update built on a checkpoint that is no longer current. GitHub stays the authority for issue state, PR heads and bases, review comments and adjudications, CI and published decisions: the checkpoint carries only what GitHub cannot hold, namely coordinator ownership, each start's intent and confirmed outcome, writer and process identities with the host each runs on, worktree, review-job and artifact references, recorded writer reports, intended operations on PRs, references to decisions published on PRs, and an inventory of each writer's work on its host (whether its head is pushed, whether files are unfinished, a stale handoff lock, its PR's review jobs with their planned and completed reviewers). Contents of files are never copied into it. A string that looks like a credential or an authenticated endpoint refuses the whole publication, and a writer's stored brief text stays local.

## Start and automatic checkpoints

Before `feature-run.mjs init`, run `discover --repo <owner/name> --feature <N> --checkout <main checkout>`. When it finds a checkpoint, take the run over with `resume` below instead of starting it again. Otherwise run `init`, then `enable --record <run.json> --coordinator <session> --expect-revision <n>`, which refuses a Feature another coordinator already checkpoints and publishes checkpoint 1.

From then on every `feature-run.mjs` command that changes the record publishes a checkpoint after the change and reports it under `checkpoint`. Exit code 3 means the change is recorded locally but no checkpoint holds it: publish again with `publish --record --coordinator` once the remote is reachable. A save counts only after the remote head and the content read back; a failed or uncertain push is reported as such and is never described as saved. `launch`, `create` and `handoff` refuse to start anything until the intent they act on is saved, so an abrupt end leaves a recorded intent rather than an untracked writer. A merge or a change of a PR's readiness is recorded first with `intent --kind merge|ready --ticket --pr --expect-head <full sha>` and settled with `outcome --id --state confirmed|failed|uncertain --evidence`. A review checkpoint decision published on a PR is linked with `reference --pr --url --kind`; the record keeps the link, not a copy.

A refusal that names another coordinator means the run was taken over: stop, make no further change, and report that to the user.

The status comment is rewritten from the saved checkpoint after every save and read back. If that fails, the checkpoint stays saved and the result says so; `sync-summary --repo --feature --checkout` rewrites it from the state branch without repeating anything else. A summary naming an older checkpoint than the branch head is stale, and the branch head wins.

## Planned handoff

1. `prepare-handoff --step stop` stops admission: every plan shows new work as `wait-handoff`, and a checkpoint records it.
2. Ask every reachable writer to reach a safe boundary: push verified commits, finish or leave alone a running review, and end its turn. Never interrupt a review to hurry the handoff.
3. Write the observation file from what your runner reports for each writer, then run `prepare-handoff --step publish --observations <file>`. It snapshots every owned worktree on this host that has unfinished files, records each writer's observed state with this host, and publishes the snapshots, the inventory and the brief. Writers still running or in an uncertain state are listed as such; a cancellation request or a status message is not an exit.

A snapshot is shaped like a stash: its parents are the worktree's head and a commit of its index, and it is reachable only from the state branch. It is made in a copy of the index, so the writer's worktree, index, branch and any review freeze are unchanged, and it is checked against the files again before it is published. A snapshot is work in progress, never review or completion evidence. Ignored files are not part of it.

## Resume on another machine, account or harness

1. `resume --record <new run.json> --checkout <main checkout> --repo --feature --coordinator <own session> --harness --coordinator-model --coordinator-effort --invocation "<the user's request>" --evidence "<why the previous coordinator no longer coordinates>"`. The takeover is real only once its own checkpoint is pushed on top of the one it read; a second destination racing for the run is refused. Your authority comes from this session's invocation; the previous coordinator's invocation, authority and decisions stay in the record as evidence. Writers already running keep their recorded model and effort. New and replacement writers use your harness's default writer model unless the previous invocation's explicit model override still applies (it carries over) or your invocation names one. Route preflights confirm every new route before dispatch, and review-pr chooses reviewers against the actual new writer.
2. Act on every entry of `limitations` before anything replaces the work it names:
   - `owner` and `pending`: a writer or a start on another host stays unknown. A destination's own view of another host proves nothing; an absent PID, an unlisted session or a missing launch directory there is not an exit. Settle it only with an observation made on its own host, by its coordinator there or the maintainer, recorded in the observation file with that `host` (and, for a process, its recorded `start`); `withdraw` of another host's start needs `--observed-on <that host>`. Unrelated eligible tickets continue meanwhile.
   - `unpublished`: commits or unfinished files existed only on the named host at the last checkpoint. They are not recoverable from the checkpoint; recover the bytes there before restarting or overwriting that work, or report the loss to the maintainer.
   - `snapshot`: `retrieve --repo --feature --checkout --ticket N --worktree <new path>` recreates the files and staged state in a new worktree and checks both. Plan again: the worktree is then existing work to adopt or continue.
   - `handoff-lock`: only `node scripts/agent-handoff.mjs recover-lock <worktree>` on the lock's host removes it, after confirming its coordinator and child are gone.
   - `operation`: run `reconcile-operations --snapshot <file>` with a fresh snapshot. A merged PR confirms a merge; an open PR still at the intended head means it did not apply and may be retried; a moved head means the decision no longer applies.
3. Recreate the periodic check-in on your own runner: it was session-scoped and ended with the previous coordinator.
4. Snapshot GitHub and plan as usual, and read the writer reports as [writer reports](writer-reports.md) describes.

A review continuation belongs to the writer session that submitted it. Never claim it from another session or present another session as its originator. Once that writer is observed to have ended on its host, its job is cancelled and released there as the review supervisor describes, and a new writer continues the PR: the round count continues from the PR's posted rounds, and the review journals' planned and completed reviewers, carried in the inventory, show which reviewers a round still owes. A change of model, account, session or machine never resets rounds or makes an earlier acceptance apply to a new head.

## Limits

A checkpoint cannot recover work that was never pushed or snapshotted from a machine that is gone, and a destination cannot observe or stop processes on another machine. Detailed logs, review-job directories and private artifacts stay on their host; the checkpoint names where they are.
