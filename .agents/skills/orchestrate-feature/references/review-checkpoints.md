# Review checkpoints

A writer's review reaches a formal checkpoint once round 3's accepted fixes are verified, and again after every later round's. Before round 3 there is none: a writer's ordinary review continues, and examining the root cause of each accepted defect belongs to every correction. The checkpoint is the coordinator's judgement on the whole PR, not on its round count. The helper is `node .agents/skills/orchestrate-feature/review-checkpoint.mjs <command>`; commands that change the run record take `--record`, `--coordinator` and `--expect-revision` like the run helper's.

## When a checkpoint is due

`evidence --record <run.json> --ticket N --pr P --diff-out <file>` reads the PR's review journals under `<main checkout>.review-jobs/pr-<P>`, the PR's comments, head and checks, and prints what the checkpoint decides on, with every reason it is not yet due. It is due when every planned reviewer of the last complete round, round 3 or later, has a validated completion; every review launch has an `exited` row and every launcher has finished; every report is on the PR with a later comment headed as its adjudication that names it; no later round has started; CI has started on the head with no failed check; and the PR's published decisions account for every round after the third. A round's planned reviewers are the ones its first completion recorded, and it is complete once each has a completion; a later plan declaring fewer is an audit violation, not a smaller round. Once a round is complete, a reviewer of it launched again on another head is a new round, whatever attempt or plan it claims. A round after the third needs, as the decision in force at its first launch, an extension decided after the round before it: a later question, repair or stop withdraws an earlier extension. A round whose reviewers are unnamed is complete when a completion counts the reviewers its step declared. A report the coordinator posted for a reviewer counts by its `report-posted` row. A launch that reserved a slot and recorded neither its start nor its exit may still run. Journals that ran on another machine are not here: every round the PR's round-state comments show without a journal blocks the checkpoint until it is read where it ran.

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

Only the coordinator accepts final unreviewed corrections, and only under the invocation it quotes. The helper refuses it unless something after the last independently reviewed commit is unreviewed and descends from it; every finding is resolved; every CI check on the head has passed (none pending); `verification` lists what passed on the head; and `--inspected` gives the unreviewed diff's SHA-256 from the evidence, which binds the decision to the exact range read. It also refuses a ticket whose writer is the coordinator's own session. The range is the branch's first-parent commits after the reviewed head. A merge whose other parents are on origin/main appears as its remerge diff, since the base's commits were reviewed in their own PRs; any other merge appears with every commit it brings in and its whole change against its first parent.

The decision applies to that head only. `acceptance-check --record <run.json> --pr P` says whether the PR's latest trusted acceptance applies to its current head: the run record must have published that comment with that content, and a new push, or a later decision, ends it, and a new checkpoint decides the new head. An acceptance is not ordinary readiness and not an independent review. With an acceptance that applies, the coordinator marks the PR ready itself and says so in a comment naming the decision; the writer does not, and the writer's own handoff stays an incomplete draft.

## Publish, read back and restore

Post the body with `gh pr comment P --body-file <body.md>`, read the comment back into a file through the paginated API, then record `published --ticket N --id <decision> --comment <id> --read-back <file>`, which refuses a read-back that differs from the decision. Until it is published, no other decision for the ticket is recorded and the decision counts for nothing, even after a takeover; a coordinator holding the record settles an interrupted one by finding the comment and recording `published` with its read-back, or closes one never posted with `abandon --id --evidence`. Send the writer the decision's text as the answer to its request.

The PR is the decision's authority. Each comment ends with a machine-readable block holding the decision: its kind, round, last reviewed commit, head, unreviewed range and diff hash, limit and authority, CI, reports, any unmet conditions, and the assessment. `restore --pr P` with `--trust <coordinator session>` (a coordinator taking over names the coordinators the Feature's status lists) reads every decision from the PR alone, with its exact head and range. Writers and coordinators post under one GitHub account, so neither the author nor the name in a block proves who decided: a decision whose coordinator is untrusted, or whose comment was edited, counts for nothing, and one restored from the PR alone is unverified. With `--record`, a decision counts only if that record, or a record it took over, published it, after read-back, as that comment with exactly that content; only such a verified acceptance ever applies.

A coordinator resuming with none of its predecessor's records runs `import --record --coordinator --expect-revision --ticket N --pr P --trust <predecessor session> --source "<where the Feature names it>"` once per PR. It names each predecessor from the Feature's status comment, never itself or the ticket's writer. Each unedited decision of those coordinators is checked again and recorded with its comment and the source of the trust: it belongs to this Feature and ticket and a formal checkpoint, an extension stays within ten rounds and quotes an authority, and an acceptance's range still hashes to the diff it names on its head, with every check passed, no open finding and its verification listed. The command reports every decision it refuses. Since writers post under the same account, the trust rests on the Feature's own record of its coordinators, which only coordinators write.

The PR body's Notes for reviewers distinguishes the code independently reviewed through the last reviewed commit, any accepted unreviewed range with its decision, and the work still unresolved.
