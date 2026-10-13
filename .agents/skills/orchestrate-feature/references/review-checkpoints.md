# Review checkpoints

A writer's review reaches a formal checkpoint once round 3's accepted fixes are verified, and again after every later round's. Before round 3 there is none: a writer's ordinary review continues, and examining the root cause of each accepted defect belongs to every correction. The checkpoint is the coordinator's judgement on the whole PR, not on its round count. The helper is `node .agents/skills/orchestrate-feature/review-checkpoint.mjs <command>`; commands that change the run record take `--record`, `--coordinator` and `--expect-revision` like the run helper's.

## When a checkpoint is due

`evidence --record <run.json> --ticket N --pr P --diff-out <file>` reads the PR's review journals under `<main checkout>.review-jobs/pr-<P>`, the PR's comments, head and checks, and prints what the checkpoint decides on, with every reason it is not yet due. It is due when every planned reviewer of the last complete round, round 3 or later, has a validated completion; every review launch has an `exited` row and every launcher has finished; every report is on the PR with a later comment headed as its adjudication that names it; no later round has started; CI has started on the head with no failed check; and the PR's published decisions account for every round after the third. A round's planned reviewers are the ones its first completion recorded, and it is complete once each has a completion; a later plan declaring fewer is an audit violation, not a smaller round. Once a round is complete, a reviewer of it launched again on another head is a new round, whatever attempt or plan it claims. A round after the third needs, as the decision in force at its first launch, a trusted extension decided after the round before it: a later question, repair or stop withdraws an earlier extension, and keeps withdrawing it if its comment is later edited. A round whose reviewers are unnamed is complete when the completions here number the reviewers its step declared: a count a journal carries does not stand in for another reviewer's journal and report. A report the coordinator posted for a reviewer counts by its `report-posted` row. A launch that reserved a slot and recorded neither its start nor its exit may still run. Journals that ran on another machine are not here: every round the PR's round-state comments show without a journal blocks the checkpoint until it is read where it ran.

## Read and assess

Read the PR's design, its round-state comments, every report and adjudication, and the unreviewed diff that `--diff-out` wrote. Then write the assessment, a JSON file:

- `mechanisms`: which accepted findings share an underlying mechanism, and whether the corrections prevent that class of failure or patch its instances.
- `regressions`: which defects the corrections themselves introduced, and what that says about stability or verification.
- `repairOptions`: whether a simpler or broader repair would improve the system, with the experiment or code evidence behind that.
- `residualRisk`, `coverage`, `nextRoundValue`: the concrete risks that remain, the verification that covers them, and what another independent round is expected to establish.
- `rationale`, `next`: the decision's reasoning and the next action.
- `agreedBehavior` (`preserved` or `changed`) and `architecture` (`unchanged` or `major-change`).
- `findings`: every finding of every round, `{ "comment": <report id>, "finding": "<short>", "disposition": "accepted|rejected|covered|deferred|open" }`, and `{ "comment": <id>, "disposition": "none" }` for a report with none. Known unresolved defects and material verification gaps stay `open`; they are not hypothetical future edge cases.

The helper refuses a missing field, a report the findings omit, and an open finding under `finish` or `accept-unreviewed`. It cannot tell sound reasoning from filled-in words; the published decision is where that is read and judged.

## Decide

`decide --record --coordinator --expect-revision --ticket N --pr P --kind <kind> --assessment <file> --out <body.md>` takes the evidence again, refuses a decision whose conditions fail, records it and writes the comment to post. The kinds:

| Kind | When | What it records |
| --- | --- | --- |
| `finish` | The review gates pass. | Ordinary review-pr readiness decides the PR; the decision grants nothing beyond it. |
| `repair` | Findings share a mechanism that a broader or simpler repair addresses while keeping the Feature's agreed behavior. | `scope` (what widens, across components if needed) and `verificationChange`. The round count stays; once the repair is verified, decide again on the changed risk. |
| `extend` | Another round is expected to establish something concrete. | `limit` (above the completed round, at most ten) and `limitReason`. The writer's next launcher plan sets `reviewRoundLimit` to it and `extendedReviewAuthorization` to the invocation the decision quotes, verbatim. |
| `accept-unreviewed` | Root causes were addressed and further review has diminishing benefit. | See below. |
| `maintainer` | A material concern, a change to the agreed behavior or a major architectural commitment. | `question`. The ticket waits for the answer; independent tickets continue. It may be recorded while other conditions fail, and then names each one instead of the passed gates. |

A changed agreed behavior or a major architectural change is refused under every kind but `maintainer`. Round ten admits no extension; reaching it never grants acceptance, which keeps its own conditions. A decision's round never goes below an earlier decision's, and nothing resets the count: a repair, a scope change, a new journal, a takeover or another account, model or machine.

## Accepted unreviewed corrections

Only the coordinator accepts final unreviewed corrections, and only under the invocation it quotes. The helper refuses it unless something after the last independently reviewed commit is unreviewed and descends from it; every finding is resolved; every CI check on the head has passed (none pending); `verification` lists what passed on the head; and `--inspected` gives the unreviewed diff's SHA-256 from the evidence, which binds the decision to the exact range read. Every decision is refused when the coordinator's own session ever wrote for the ticket: its writer, a released one, or a pending start. The range is the branch's first-parent commits after the reviewed head. A two-parent merge whose other parent is on origin/main appears as its remerge diff, since the base's commits were reviewed in their own PRs; any other merge, including one of three or more parents, for which Git gives no remerge diff, appears with every commit it brings in and its whole change against its first parent.

The decision applies to that head only. `acceptance-check --record <run.json> --pr P` says whether the PR's latest trusted acceptance applies to its current head: the run record must have published that comment with that content, and a new push, or a later decision (even one whose comment was since edited), ends it, and a new checkpoint decides the new head. An acceptance is not ordinary readiness and not an independent review. With an acceptance that applies, the coordinator marks the PR ready itself and says so in a comment naming the decision; the writer does not, and the writer's own handoff stays an incomplete draft.

## Publish, read back and restore

Post the body with `gh pr comment P --body-file <body.md>`, read the comment back into a file through the paginated API, then record `published --ticket N --id <decision> --comment <id> --read-back <file>`, which refuses a read-back that differs from the decision. Until it is published, no other decision for the ticket is recorded and the decision counts for nothing, even after a takeover; a coordinator holding the record settles an interrupted one by finding the comment and recording `published` with its read-back, or closes one never posted with `abandon --id --evidence`. Send the writer the decision's text as the answer to its request.

The PR is the decision's authority. Each comment ends with a machine-readable block holding the decision: its kind, round, last reviewed commit, head, unreviewed range and diff hash, limit and authority, CI, reports, any unmet conditions, and the assessment. `restore --pr P` with `--trust <coordinator session>` (a coordinator taking over names the coordinators the Feature's status lists) reads every decision from the PR alone, with its exact head and range. Writers and coordinators post under one GitHub account, so neither the author nor the name in a block proves who decided. A decision is verified only when a run record published it, after read-back, as that comment with exactly that content (the record's own decisions and those of the coordinators it took over from), and only a verified acceptance ever applies. A decision of a trusted coordinator the record does not hold is trusted but unverified: it counts for round accounting and nothing more. An edited comment, a malformed block, a decision the record holds unpublished or with other content, and a block naming the record's own coordinator that the record never published count for nothing; malformed blocks are reported.

A coordinator resuming with none of its predecessor's records names each predecessor for the ticket with `trust-predecessor --record --coordinator --expect-revision --ticket N --session <predecessor> --source "<where the Feature names it>"`, from the Feature's status comment; its own session and any session that wrote for the ticket are refused. The predecessor's decisions then account for the rounds they authorized, but none is verified. To finish the ticket, the successor reads the PR and decides and publishes its own checkpoint, including any acceptance, on the current head.

The PR body's Notes for reviewers distinguishes the code independently reviewed through the last reviewed commit, any accepted unreviewed range with its decision, and the work still unresolved.
