---
name: review-pr
description: Independently review an open PR, record and adjudicate every finding, verify corrections and mark ready only after completion. Use for initial or later review rounds.
---

# Review a pull request

Keep the PR draft until review, corrections and current-head CI are complete. Never edit the reviewed head or worktree while any reviewer process remains active.

## 1. Size the review

Internal skills/tooling work defaults to one undirected reviewer; add a focused second only for deletion or data-preservation risk. Application changes use one for minimal docs/config or a small proven fix, two or three for a typical package change, and four or five for compiler/runtime semantics, incrementality, serialization, generated grammar or broad changes. Always include the undirected lens; when application risk lies between tiers, round up.

## 2. Require independence

The caller supplies concrete writer identity, distinct reviewer model route and supported launch method, plus any authorized fallback. Missing values block review; never select a default or invent an identity.

Record configured route separately from runtime identity. An unavailable runtime identity alone does not abort; disclose configured-route evidence. A known match with the writer aborts before review. A runtime/requested-route mismatch stops the attempt for caller adjudication. Strip only context-window suffixes when comparing identities, not model versions. An abort is not a clean review.

## 3. Launch and await

Before preparing a round, read [launch procedure](references/launch.md). Build the complete [reviewer prompt](references/reviewer-prompt.md) with `node scripts/build-review-prompt.mjs <absolute-context.json> <absolute-prompt.txt>`.

For a PR with no linked issue, set the prompt builder's `issue` field to `null`; never invent an issue number.

Freeze head, base and files; record SHAs and a single diff artifact. Give each lens/round/attempt a unique private directory. Read [handoff execution](HANDOFF.md) before launching any local CLI reviewer; it reserves machine-wide slots and runs serial lenses. Native/remote tasks do not satisfy this enforced workflow. Before selecting executable arguments, read [runner mappings](../references/runner-review.md).

Post round state with identities, SHAs, scope, lenses, launch method and artifact paths. Record process IDs, OS start identities and output paths. Wait for each process to exit, then verify its report landed before advancing. Missing comments alone never justify relaunch. Preserve uncertain launches and recover through the journal and reservation status.

Every report must appear on the PR verbatim, including reports posted by the coordinator on a reviewer's behalf. Read paginated comments. Inspect unauthorized tree changes, preserve other writers' work, and invalidate affected evidence.

## 4. Adjudicate and reverify

Before handling findings, read [adjudication and readiness](references/adjudication.md). Confirm each claim in code and use experiments to resolve disagreement. Post each finding's disposition with comment ID, round and reviewed head: accepted with fix and verification, rejected with concrete evidence, or already covered with earlier IDs. Preserve superseded reports and answer the reviewer's final position.

Any code correction reopens regression and live/tooling verification. Commit by path, push and inspect CI for the new head. For cancelled or timed-out runs read [CI evidence](../resolve-issue/references/ci-evidence.md); a later pass does not explain an earlier cancellation.

## 5. Readiness gate

Before `gh pr ready`, require every reviewer process to exit; every full report to be published; every finding to be adjudicated; all accepted fixes committed, pushed and reverified; no retried lens outstanding; current-head CI green; and final correction review/disclosure under the next section. Read back `number,isDraft,reviewDecision`. If incomplete, leave a draft and state what remains on the PR and to the user.

## 6. Later changes

Before editing a ready PR, return it to draft and explain why. Read [later-round rules](references/later-rounds.md) before deciding whether to launch another round. Size rounds by the new diff, preserve round history and review through round 3; if code changes afterward, run one narrow round 4. After round 4, do not automatically launch another review. Verify final corrections and record unreviewed commits and remaining risk. Keep the PR draft when another independent review would materially reduce unresolved risk; otherwise mark the PR ready for human review only when all gates pass. New scope does not silently reset the count; further review requires explicit user direction.
