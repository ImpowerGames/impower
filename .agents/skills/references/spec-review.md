# Spec review mechanics

All commands run from the worktree root unless stated otherwise.

The two spec review skills share everything below and differ only in the lenses they assign. The design of record is the parent Feature and its slice Tasks; the review edits tickets, never repository files. `$PRIVATE` stands for the session's private directory outside every checkout.

## Freeze the design

```bash
node scripts/spec-snapshot.mjs 565 "$PRIVATE/spec-565/round-1/snapshot.json"
```

The snapshot tool reads the parent, finds its slices (every issue the parent mentions whose body says `Split from #<parent>`; `--slices 573,574` adds a ticket the parent lists as a slice without that phrase, such as a language-wide task the feature ships with, or one the parent omits, and refuses a number unrelated to the parent) and writes one file holding each ticket's number, title, type, `updated_at`, body and body digest, plus the snapshot digest over all of them. It prints the digest and the ticket list; put both in the round-state comment and keep the file in the private review directory. The digest is what a reviewer quotes and what the launcher checks. An edited snapshot fails its own digest check in the prompt builder and in the launcher, so a changed ticket means a fresh snapshot and a new round, never an edit to the file. Reviewers read the frozen bodies, not the live issues.

The code a design cites is read from a clean, committed checkout: the launcher freezes the worktree head for the round and refuses a dirty tree, and the prompt names the commit so reviewers cite `file:line` at it.

## Independence

The caller supplies the writer identity and effort, read from the runner as the runner notes describe, a reviewer route distinct from the writer or none so the launcher resolves the default, and the launch method. A missing writer identity or effort, an identical route or a missing launch method blocks the review before any process launches, exactly as review-pr section 2 requires; never guess or invent any of them. The writer here is the session that adjudicates.

## Reviewer counts

Two reviewers by default: one undirected and one carrying the assigned lenses. Three when the feature has more than five slices or touches both the compiler and the player; then split the assigned lenses across the two directed reviewers. The undirected reviewer is always present. Each skill names its lenses; the [reviewer prompt](spec-review-prompt.md) carries every lens's procedure, so a reviewer receives it in the prompt rather than from a skill file.

## Launch

Post the round-state comment on the parent issue first: the skill, the round, the snapshot digest and its ticket list with `updated_at` values, the checkout commit, each reviewer's lenses, the writer identity and effort, the reviewer route and effort, the invocation method and each private artifact directory.

Build each reviewer's prompt from a context file:

```json
{ "target": "issue", "issue": 565, "slices": [566, 567], "snapshot": "<absolute snapshot.json>", "head": "<full checkout SHA>",
  "worktree": "<absolute worktree>", "reviewDir": "<absolute private directory for this reviewer, round and attempt>",
  "lens": "feasibility, slicing", "round": 1, "previous": "This is the first round; there is nothing earlier to judge against.",
  "writer": "<writer route>", "reviewer": "<reviewer route>", "invocation": "<launch method>" }
```

```bash
node scripts/build-review-prompt.mjs "$PRIVATE/spec-565/round-1/context-2.json" "$PRIVATE/spec-565/round-1/prompt-2.txt"
```

The builder refuses a missing or edited snapshot, a snapshot of another issue or ticket set, an unknown lens (the ids are `undirected`, `feasibility`, `slicing`, `performance`, `language`, `interface` and `player`; `undirected` stands alone) and a nonconcrete or identical route. In a second round, `previous` summarizes the first round's findings and dispositions.

Launch every reviewer through the shared launcher, `node scripts/agent-handoff.mjs <absolute-plan.json>`; read [handoff execution](../review-pr/HANDOFF.md) for the plan shape, the machine-wide reservations, the journal and recovery. A spec plan differs from a pull-request plan in these fields:

- `"target": "issue"` declares the spec target. Without it the launcher keeps its pull-request behavior and refuses the fields below.
- `issue` is the parent issue number and `snapshot` the absolute path of the snapshot file, outside the worktree; `pr` is refused. The launcher reads the file and checks its digest and its parent before any reviewer launches.
- Only `review` and `adjudicate` steps are allowed; an `implement` step is refused, because ticket edits happen outside the launcher.
- A report verifies by finding a comment on the parent issue whose body contains the snapshot digest.
- The autonomous cap is two rounds: `reviewRoundLimit` defaults to 2, and a higher limit needs the user's explicit request recorded verbatim in `extendedReviewAuthorization`, as a pull request needs beyond three.
- Recovery of a partly complete round supplies `reviewedSnapshotDigest` from the journal beside `reviewedHead`; a pending lens in the same round must see the same snapshot and head.

Await the launcher as the handoff document describes. Never edit a ticket while a reviewer runs.

## Reports

Every report appears on the parent issue verbatim as a comment headed `### Spec review — <lens> (<model>)`, including one the coordinator posts on a reviewer's behalf, prefixed with a line saying so and why. List comments through the paginated API, `gh api repos/ImpowerGames/impower/issues/<issue>/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'`, and read each full body with `gh api repos/ImpowerGames/impower/issues/comments/<id> --jq .body`; never through `gh issue view --comments`.

## Anchoring rule

A finding is accepted only when it states one of: (a) a fact about the existing code with a `file:line` at a named commit; (b) a concrete scenario the spec does not cover or contradicts itself on, quoting the ticket text; (c) a documented comparison with a named peer system and its source. Anything else is rejected at adjudication with that reason. This rule is what keeps the review from becoming a matter of taste.

## Follow-up rule

A finding that adds capability is recorded as a proposed follow-up ticket with a title, never edited into the spec, unless the reviewer shows the current design forecloses it later, in which case it is a blocking finding.

## Adjudication

Confirm each finding yourself before acting: a `file:line` that does not say what the reviewer claims is a dead finding, and a scenario is checked against the quoted ticket text. Post one adjudication comment per report on the parent issue, headed `### Spec adjudication — round <round>`, naming the report's comment ID, the round and the reviewed snapshot digest, and giving every finding a disposition:

- Accepted: the ticket edited, parent or slice, with what changed and the read-back.
- Rejected: the reason, including "not anchored" with the missing anchor kind, or the claim not confirmed at its cited location.
- Follow-up: the proposed ticket title.
- Already covered: the earlier finding and its adjudication ID.

Accepted findings edit the ticket bodies (`gh issue edit <n> --body-file <file>`) and may re-slice; the edited tickets remain the design of record. A decision the reviewer showed the tickets leave open is taken on the writer's recommendation and marked "decided by default" in the ticket, as file-feature marks an undeliberated choice, so the maintainer can see and overturn it. Read back every edited body. Where a reviewer posts twice, answer its final position and name the earlier comment as superseded. Do not silently drop findings; an unanswered report reads as an open defect in the design.

## Rounds

One round by default. A second round, on a fresh snapshot, only when accepted findings changed a ticket materially; the cap is two, and more need the user's explicit request recorded in the plan as above. New scope, a resumed session or a new journal never resets the count. The review is complete when every reviewer process exited, every report is on the parent issue, every finding is adjudicated, every accepted edit is read back, and the follow-up findings are listed with proposed titles. Report friction under [feedback reporting](feedback-reporting.md).
