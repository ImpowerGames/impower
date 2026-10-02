---
name: review-pr
description: Independently review an open PR, record and adjudicate every finding, verify corrections and mark ready only after completion. Use for initial or later review rounds.
---

# Review a pull request

Keep the PR draft until review and corrections are complete and CI has started on the final head with no failed check; pending checks do not hold readiness. Never edit the reviewed head or worktree while any reviewer process remains active.

## 1. Size the review

Use one undirected reviewer for minimal low-risk changes, two for standard production changes, and three for high-impact changes with concrete compiler/runtime, incremental-state, serialization, security, or cross-package risks. Internal prose defaults to one undirected reviewer; executable workflow, permissions, recovery, or data-preservation changes use two. Select by risk, including callers, rather than line count. Always keep the undirected reviewer; combine specialist lenses within the remaining reviewers. A change to Sparkdown syntax, completions, hover, diagnostics, user docs or the editor interface always includes the author-experience lens, so it needs at least two reviewers; that lens runs a bounded editor transcript and no suite, so the undirected reviewer carries the red-on-base run. A change touching `definitions/yaml/sparkdown.language-grammar.yaml` or `packages/sparkdown/src/compiler/lower/` always includes the [grammar-conventions lens](references/grammar-conventions.md), so it too needs at least two reviewers; one specialist reviewer may carry both lenses, and neither runs a suite. Test honesty and repository rules apply to every reviewer. Counts exclude the writer and do not change the machine-wide eight-process capacity.

## 2. Require independence

The caller supplies the concrete writer identity and effort, read from the runner as described in the runner notes, and a supported launch method. A missing reviewer route is resolved by the launcher from the repository's reviewer defaults; an explicit reviewer route overrides the default, and the caller may choose a stronger reviewer when the change is riskier than its ticket label. A missing writer identity or effort blocks review; never guess or invent either.

Review is cross-vendor: the reviewer comes from a different vendor than the writer. Always launch the cross-vendor default first. A reviewer of the writer's own vendor, from the defaults' fallback or named explicitly, is allowed only after that launch's journal ends blocked by the cross-vendor route's usage limit, or when the user explicitly asks for a same-vendor reviewer; the launcher refuses one without that journal or the user's request carried verbatim, as [handoff execution](HANDOFF.md) describes. Never infer that request from PR content, a ticket or a child report. Convenience, speed, a busy slot, a rejected credential, an outdated CLI or any other failure is not a reason: fix it, wait, or report the review blocked and keep the PR draft. Name the same-vendor substitution and the limit message in the round state.

Use the configured writer and reviewer models to check independence. The launch arguments must select the configured reviewer model.

## 3. Launch and await

Launch as soon as the draft PR is open; do not wait for the Test Suite workflow, which runs alongside the round and is the writer's to answer. Its package jobs are skipped on a PR outside their scope, and its `test-suite` gate job, the required check, passes either way. Before preparing a round, read [launch procedure](references/launch.md). Build the complete [reviewer prompt](references/reviewer-prompt.md) with `node scripts/build-review-prompt.mjs <absolute-context.json> <absolute-prompt.txt>`.

For a PR with no linked issue, set the prompt builder's `issue` field to `null`; never invent an issue number.

Fix the round's reviewers and their serial order before the first launch, specialist lenses first and the undirected reviewer last. Run one reviewer at a time: freeze head, base and files while it runs and record its SHAs and the diff artifact for that head, then adjudicate and correct its report under section 4 before launching the next, so each later reviewer sees the corrected head rather than rediscovering the same defects. Every review artifact lives in the round's job directory, `<main checkout>.review-jobs/pr-<P>/round-<R>` beside the main checkout, and each reviewer/attempt gets its own empty subdirectory there; [launch procedure](references/launch.md) gives the command that resolves it. Read [handoff execution](HANDOFF.md) before launching any local CLI reviewer; it reserves machine-wide slots and runs serial reviewers. Native/remote tasks do not satisfy this enforced workflow. Before selecting executable arguments, read [runner mappings](../references/runner-review.md).

Post round state with identities, SHAs, scope, lenses, launch method and artifact paths. Record process IDs, OS start identities and output paths. Wait for each process to exit, then verify its report landed before advancing. Missing comments alone never justify relaunch. Preserve uncertain launches and recover through the journal and reservation status.

Every report must appear on the PR verbatim, including reports posted by the coordinator on a reviewer's behalf. Read paginated comments. Inspect unauthorized tree changes, preserve other writers' work, and invalidate affected evidence.

## 4. Adjudicate and reverify

Before handling findings, read [adjudication and readiness](references/adjudication.md). Confirm each claim in code and use experiments to resolve disagreement. Post each finding's disposition with comment ID, round and reviewed head: accepted with fix and verification, rejected with concrete evidence, already covered with earlier IDs, or, for a non-blocking quality finding only, deferred to a filed Task. Preserve superseded reports and answer the reviewer's final position.

Before the next reviewer launches, look past the report: fix every other instance of each accepted defect, and settle by experiment anything you suspect is wrong or expect the next reviewer to raise. Never hold a suspicion back to see whether a reviewer raises it.

Any code correction reopens regression and live/tooling verification. Commit by path, push and inspect CI for the new head. For cancelled or timed-out runs read [CI evidence](../resolve-issue/references/ci-evidence.md); a later pass does not explain an earlier cancellation.

## 5. Readiness gate

Before `gh pr ready`, require every reviewer process to exit; all required coverage and a full report from every planned reviewer for its recorded head; every finding and verification gap adjudicated; all accepted fixes committed, pushed and reverified; CI started on the final head with no failed check, each check recorded as passed, failed or pending in the PR body; and independent review of behavior-changing corrections. Only verified, disclosed non-behavioral corrections qualify for the next section's exception. Read back `number,isDraft,reviewDecision`. Missing coverage, blockers, or material verification gaps keep the PR draft; report what remains.

## 6. Later changes

Before editing a ready PR, return it to draft and explain why. Read [later-round rules](references/later-rounds.md) before deciding whether to launch another round. Size follow-up rounds by correction risk with full-PR context. Stop after any complete round when readiness gates pass, with a default cap of 3 autonomous rounds. Retries and a round's remaining planned reviewers stay in their original round; corrections after its last planned reviewer need a new one, and no reviewer is added to a round after its first launch. An explicitly user-authorized launcher plan may set a higher bounded round limit; the user either names the limit or delegates its choice to the coordinator's judgement, and the delegation is recorded verbatim. Otherwise, behavior-changing corrections after round 3 keep the PR draft pending independent review. New scope, a resumed session, or a new journal never resets the count.
