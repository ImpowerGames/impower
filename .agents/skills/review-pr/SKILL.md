---
name: review-pr
description: Adversarially review an open pull request with independent reviewer sessions that post their findings as PR comments, adjudicate every finding on the PR, re-verify any fix, and mark the PR ready only when nothing is left unanswered. Invoked by resolve-issue once its draft PR is open, and usable directly on any pull request that needs an independent review, including a later round after more commits land.
---

# Review a pull request

The goal is to break the change, not to admire it, and to have readers who were not anchored by the writer's reasoning do it, on the real diff. Every reviewer posts its findings as a comment on the PR, so nothing it finds can get lost when the session ends. The PR stays a draft for the whole review; `gh pr ready` is the last step, after section 5's list is complete.

Read [runner notes](../RUNNERS.md) for concrete mappings. The caller supplies the reviewer route and execution method. The shared prompt below carries the complete reviewer contract, including for a runner with no agent definitions.

---

## 1. Size the review

Reviewers cost real tokens. Scale the count to user impact and the risk of losing work. Internal `workflow: skills` tooling defaults to one undirected reviewer, with a second focused reviewer when deletion or data preservation warrants it; diff size alone does not increase that count. Use the tiers below for application changes. Risk selection requires the maintainer's and writer's judgment; the feedback inbox captures problems found through later skill use.

| Tier        | Reviewers                                   | Applies when                                                                                                                                                         |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal     | 1, undirected only                          | Docs, comments, or config only; or a single-file fix of a few dozen lines whose callers you enumerated yourself and whose regression test pins the ticket behaviour. |
| Standard    | 2–3, undirected + the most relevant lenses  | A typical fix contained in one package.                                                                                                                              |
| High-impact | 4–5, undirected + every applicable lens     | Compiler or runtime semantics, incremental-compile or serialization paths, generated-grammar sources, changes spanning packages, or a diff over ~300 lines.          |

When a diff sits between tiers, round up; a missed defect costs more than a reviewer. The undirected reviewer is never dropped, whatever the tier.

---

## 2. Require an independent reviewer invocation

Before review, require the caller to supply a concrete writer model identity, a concrete reviewer model route and an invocation method supported by this runner. Missing values, unresolved placeholders or a route known to match the writer block review explicitly. Never select a default model, silently substitute an alias or invent an identity. The caller also supplies any authorized fallback; unavailable allowance may use that fallback only if its route differs from the writer.

Record the configured route separately from the model the reviewer reports from its own runtime context. Runtime introspection may be unavailable; report that limit rather than treating an echoed request as independent proof. When it is unavailable, proceed using the caller's concrete, distinct configured routes and label the report as configured-route evidence. Missing runtime introspection alone does not abort review; it does not authorize inventing an identity or claiming backend attestation. If the runtime identity is known to match the writer, abort before reading files. If it differs from the requested route, stop that attempt and have the caller adjudicate the routing mismatch before accepting any review. Strip only a context-window suffix when comparing identities; do not collapse distinct model versions.

An abort is not a clean review. Preserve its output and retry only the affected lens with an explicitly supplied independent route. If no such route is available, keep the PR draft and state which coverage is missing.

---

## 3. Fan out; each reviewer comments on the PR

Fetch the current base and record its SHA before capturing the diff. If the branch must incorporate base changes, finish that integration before review, within the caller's Git constraints; never merge or rebase merely because the review skill was invoked. Freeze the reviewed head, base and working files for the entire round. A changed head invalidates the round.

Capture the diff once, so every reviewer sees the same artifact:

```bash
git diff origin/main...HEAD > "$SCRATCH/review-diff.patch"
```

(`...` is deliberate: changes on your branch since it diverged from `main`, not `main`'s subsequent commits.)

If the change regenerates a large snapshot or other generated file, exclude it from the patch by path and tell the reviewers the command to inspect it separately; a multi-megabyte patch file wastes a reviewer's context before it reads a line of the actual change (one session's patch came out at 2.6 MB for this reason):

```bash
git diff origin/main...HEAD -- . ':(exclude)packages/sparkdown/src/tests/__snapshots__/big.snap' > "$SCRATCH/review-diff.patch"
```

Write it to your private scratch directory, never into the checkout. A patch file inside the repo is one `git add -A` away from being committed, and it leaves the tree dirty for as long as the review runs, long enough to trip any hook or check that expects a clean tree. Give reviewers the absolute path (`$SCRATCH` is your session's private scratch directory).

Give each reviewer a subdirectory of your private scratch directory that is its own: never the writer's private scratch directory directly, and never a directory that already holds files. Two reviewers sharing a directory pick up and repoint each other's probe files; one did, found the other's findings in its own file, and had to re-verify everything under fresh names. The prompt below gives each reviewer that path as REVDIR (`<private scratch directory>\review-<round>-<lens>-<attempt>\`, `<attempt>` starting at 1); relaunching a lens that died is the same round and the same lens, so the relaunch increments `<attempt>` rather than reusing the dead reviewer's directory.

Start every local CLI reviewer through the [handoff launcher](HANDOFF.md); its atomic shared reservation enforces a machine-wide limit of four participating reviewer processes until confirmed process exit. The launcher runs one lens at a time per worktree under its coordinator lock. A High-impact round runs all five lenses serially; the shared ceiling coordinates reviewers in other worktrees, not parallel lenses within this worktree. Record the serial lens order in the round state. A posted comment or completion file does not release a slot. Native or remote agent tasks are unsupported for this enforced workflow because the launcher cannot reserve and verify their process lifetime. An unaccountable native or remote review launch blocks the machine-wide capacity guarantee; do not substitute manual counts or claim it is covered by the reservation. Do not launch a local CLI reviewer directly to bypass an occupied or inaccessible slot store.

Run reviewers using the caller-supplied method. Without subagents, run each lens as a separate fresh serial session with the same frozen diff and the complete prompt below. Wait for each process to exit, then verify its report landed before starting the next lens. A single session changing lenses is not independent review. Never edit while a reviewer is running.

Before launch, post a round state comment naming PR, round, base SHA, reviewed head SHA, scope, lenses, writer identity, configured reviewer route, invocation method and each unique artifact directory. Record every launch's task/session ID or process ID, start time and output path. Await completion in the coordinator; do not end the turn expecting a comment to wake it automatically. On recovery, inspect those launch records and process/task status, including start time to distinguish PID reuse. Missing comments alone do not authorize a duplicate launch. A confirmed stopped attempt with no usable report may be retried in a fresh directory with an incremented attempt.

For autonomous implement/review exchanges, use the handoff runner described in [handoff execution](HANDOFF.md). It waits for each child to exit and validates that child's completion artifact before launching the next configured role. The caller supplies both routes and prompts; the implementation prompt loads resolve-issue and the review prompt is built from this section. The shared journal and PR state carry the head, round, active role, result paths, review comment IDs and adjudication IDs. A stopped coordinator is recovered from the journal, never by assuming a child stopped. No concurrent writers are allowed.

Build the prompt with `node scripts/build-review-prompt.mjs <absolute-context.json> <absolute-prompt.txt>`; it rejects missing reviewer inputs and unsafe substitution templates before any process launches. Its context fields are writer, reviewer, invocation, issue, pr, head, worktree, diff, reviewDir, lens, round and previous. Fill N, P, DIFF, WORKTREE, LENS, REVDIR, ROUND, HEAD, REVIEWER and WRITER in the prompt. PREVIOUS is the prior round's findings and dispositions, or “This is the first round; there is nothing earlier to judge against.” WORKTREE and REVDIR are absolute paths. REVDIR is unique for each round, lens and attempt and starts empty. The reviewer supplies its own identity. The copied block is bounded by the review-prompt:start and review-prompt:end HTML comments. Its token multiplicities are pinned in the builder's counts table; review intentional template and count changes together, and run the prompt-builder and portability checks. Keep unrelated blockquotes outside those markers.

Keep a dollar sign followed by a digit out of the prompt below, and out of anything else in this file that a session copies verbatim. The invocation's own arguments are substituted into this text before the session reads it, so a positional token arrives as whatever word was typed after the skill name and the sentence around it turns into nonsense on its way to five reviewers. Name such a token in words instead of writing it.

<!-- review-prompt:start -->
> Before anything else, check the pin. I am running `WRITER`; your configured reviewer route is `REVIEWER`. If the writer value is missing, empty, still an unfilled placeholder, or not a concrete model id, stop with exactly `ABORT: writer model not supplied.` If the reviewer route or invocation method is missing, empty, an unfilled placeholder or otherwise not concrete, stop with exactly `ABORT: reviewer invocation not supplied.` Compare the writer against your own runtime identity when available, ignoring only a context-window suffix. If the family and version match, read no file and run no command: reply `ABORT: pin failed, I am <your model id>, same as the writer.` If your runtime differs from the configured route, reply `ABORT: reviewer route mismatch.` State your configured route and the identity your own runtime context actually provides; if it provides no independent identity, say “Runtime identity unavailable; configured route only.” In that case proceed with the review using the caller-supplied distinct configured routes; unavailable runtime introspection alone is not an abort condition. Label the report with the configured route and this limitation. Never claim the requested route was independently verified. A known matching configured route also aborts.
>
> You are reviewing a fix for issue #N in the Impower monorepo, round ROUND on PR #P at reviewed head HEAD. Confirm that HEAD is still checked out before reviewing and before posting; a changed head aborts the attempt. The diff is at `DIFF`; the working tree under review is the git worktree at `WORKTREE` — read files from there, not from the main checkout. Your lens is \<LENS\>; if that is `undirected`, you have no assigned lens and review the whole change however you see fit, reporting anything wrong with it, and otherwise you review only through that lens. PREVIOUS Your job is to refute this change, not to approve it. Assume it is broken and find out how. If you are uncertain, report the concern rather than suppressing it. For each finding give: `file:line`, a concrete failure scenario (inputs → wrong output), and how you confirmed it in the code. Do not pad with non-findings. Do not edit, create, or delete any file inside the repo tree. Never run the change under review destructively against this machine's repository, its worktrees, or the shared VS Code data directory the extension driver serves builds from; every destructive experiment runs in a scratch repository under your private scratch directory, with `pwd` printed in the same command as any destructive call. Put every file you write under your own subdirectory `REVDIR`, never the writer's private scratch directory directly and never a directory that already has files in it. Before running vitest as a probe, check for a vitest process already running and wait for it to exit; the writer may be mid-suite, and the machine allows only one run at a time. If you mutate a copy of a file with JavaScript's `replace`, escape `$` in the replacement or pass a function, because a dollar sign followed by `&`, by a digit, or by another dollar sign is substituted and a corrupted copy reads as zero failures; read the copy back before trusting what it reports.
>
> When your review is done, post it as a comment on PR #P: write the full findings to a markdown file under `REVDIR` (never inside the repo), using an editor tool rather than a heredoc, starting with the heading `### Adversarial review — <LENS> (<MODEL>)`, where MODEL is your reported runtime identity or explicitly the configured route when runtime identity is unavailable. Include round ROUND and reviewed head HEAD in the comment, followed by the identity distinction above. Then run `gh pr comment P --body-file <that file>`. Never pass `--body @-` — gh takes it as a literal string and posts a broken comment. If you have no findings, still post the comment with the single line "No findings through this lens." so the coverage is recorded. Confirm the comment landed by listing the PR's comments with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and finding your heading among them.
>
> Whether or not the comment lands, return your full findings as your final report — the same markdown, in full. If you cannot post at all (no `gh` on this machine, an auth failure, a denied permission), do not try to work around it and do not summarise: say in one line that you could not post and why, then return the whole report. The writer will post it for you.
<!-- review-prompt:end -->

Lenses; diversity matters far more than count, because redundant reviewers find redundant things:

- Undirected: fill `<LENS>` with `undirected`, and the prompt's own sentence then reads as telling the reviewer it has no assigned lens. Every other reviewer is looking where you told it to look, which means they collectively share your blind spots; this one exists to find what the lens list forgot. It is always included, at every tier.
- Correctness at boundaries: empty input, single element, first/last iteration, and specifically the loop iteration or branch the original bug lived in.
- Incrementality: the compiler reuses constructed flows and short-circuits no-change compiles. Is this still correct on the second keystroke, not just a cold compile? Does it corrupt reused state?
- Blast radius: enumerate every caller of every changed function and argue each is unaffected, citing `file:line`. Any caller you cannot account for is a finding.
- Test honesty: does the regression test pin the ticket's behaviour, or merely the shape of the patch? Would it catch the bug returning by a different route?
- Repo traps: a generated `language/*.json` edited without its `definitions/yaml/*.yaml` source (the rule in the repository's agent instructions), a `.gitignore` interaction under the shared tooling directories, whitespace-significant display lines, a new file the diff relies on but never stages.

Add a lens when the diff warrants one (concurrency, serialization, asset pipeline). Skip one that cannot apply.

A reviewer launch can die with a session rate-limit error before it has posted anything. When one does, check the tree and the PR comments for whatever it did manage, then relaunch that lens after the reset time the error names; the other reviewers are unaffected.

When the fan-out returns, check the tree before anything else:

```bash
git status --short
```

If a reviewer changed files, preserve and inspect those changes, invalidate its evidence and restore only changes confirmed to belong to that reviewer. Do not discard another writer's work.

Then confirm every expected comment is on the PR with the same listing command the prompt gives. Every report that is not there, you post yourself, verbatim, one comment per reviewer, before you adjudicate. Prefix each with a line saying you are posting on the reviewer's behalf and why it could not.

This is not the rare case. Whole environments have no `gh` at all; a remote or web session reaches GitHub through an integration instead, so `gh pr comment` fails for every reviewer, not one. When that happens the temptation is to skip the posting and fold everything into your adjudication instead. Do not:

- Your summary is not their review. You are the author. The reports carry the `file:line` citations, the probes they actually ran, and the reasoning, including the parts you disagreed with, and the ones where a reviewer catches that your correction to an earlier mistake was itself wrong. A summary written by the person being reviewed launders all of that.
- The whole point of the review is that findings outlive the session. Findings that exist only in your adjudication are findings you chose which to preserve.
- Post them even when you fixed everything. Especially then; the fix is only checkable against the claim it answers.

Post them verbatim: do not trim, reorder, or correct them. Where a reviewer is wrong, say so in your adjudication, not by editing its words. Where a reviewer notes that the tree changed under it mid-review (it will, if you were iterating), keep that caveat; it tells the reader why a line number may not match.

---

## 4. Adjudicate, on the PR

Reviewer output is a hypothesis, not a verdict; reviewer sessions confidently report defects that do not exist. If every reviewer of a round failed with a rate-limit error, the round did not run: relaunch the same set after the reset the errors name, and never adjudicate a partial round. If the coordinator exits, recover from the recorded launch IDs and start times before replacing any attempt; a missing comment is not evidence that a process exited.

For every finding, confirm it yourself in the code before acting. A claimed `file:line` that does not say what the reviewer claims is a dead finding, full stop. When two reviewers disagree about the same lines, break the tie by experiment rather than by the more convincing prose: for a claim that a test does not cover a branch, disable that branch and re-run; a suite that stays green proves the claim. Record the mutation and its result in the adjudication.

Then dispose of every finding where it lives, on the PR. Adjudicate every comment a reviewer posted, the latest correction winning: a reviewer that posts twice, or corrects itself in a later comment, is answered on its final position, and the earlier comment is named as superseded rather than left looking open. Post one adjudication comment per review via `--body-file`, naming the review comment ID, round, reviewed head and every finding's disposition:

- Accepted: fixed, with the commit SHA and verification.
- Rejected: the concrete reason and evidence, including a claim not confirmed at its cited location.
- Already covered: the earlier finding, adjudication ID and fix that cover it.

Adjudicate late or out-of-order reports against current HEAD. For each finding, state whether it remains live, is already fixed (name the commit and verification), or is no longer applicable (explain the current code). Name the commits between that report's reviewed head and current HEAD that the reviewer did not see. Preserve the report and its original round; arrival order does not change coverage or reset the stopping rule. A live finding that needs a code change follows section 6 before editing.

The adjudicating writer and every reviewer read comments through the paginated API. List all IDs and headings with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'`, then fetch each relevant full body with `gh api repos/ImpowerGames/impower/issues/comments/<id> --jq .body`. Persist long bodies to private files and read them in bounded sections so tool output limits cannot hide later findings. Read back every published review and adjudication body, not only its heading. Do not use `gh pr view P --comments` for adjudication or prompt preparation.

When a finding's fix depends on a defect older than the branch, fix the older defect on the branch too and say so under Notes for reviewers; ticket it separately only when the fix can stand without it.

Do not silently drop findings; an unanswered review comment on the PR reads as an open defect.

---

## 5. Re-verify, then mark ready

Any change made in response to review re-opens verification and the tests: re-run the regression test (the write-regression-test skill's `redgreen`, with `--base origin/main` once the fix is committed; for a change pinned by a standalone check under the shared tooling directories, re-run that check in place of `redgreen`) and re-take the live evidence (the drive-web-editor skill, or the checks that exercise a change with nothing to boot). A review fix is a code change like any other, and it is the one most likely to be committed unverified. Commit by path, push. The diff lives in your private scratch directory, so there is nothing in the tree to clean up.

When the check imports a name the base revision does not export, `redgreen`'s revert fails at import: stage the base revision's file in a scratch directory beside the current check, with any sibling it imports and a junction to `node_modules`, and run the check there, reporting the failing case count. A base file that exits the process on a refusal hides every case after it; patch the scratch copy's exit into a throw, say so in the adjudication, and count the failures from the full run.

Marking the PR ready means this diff is finished and ready to be reviewed by a human. Make that claim only when every one of these is true:

- Every reviewer you spawned has come back.
- Every report is on the PR, including the ones you posted on a reviewer's behalf (section 3).
- Every finding is adjudicated in your section 4 comment, accepted, rejected, or already covered, with nothing left unanswered.
- Every fix you made in response is committed, pushed, and re-verified as above, and the last push is on the PR.
- No re-spawned lens is still outstanding from an aborted or retried attempt (section 2). If a lens ended up with no independent reviewer at all, say so on the PR before marking ready, so the human knows which angle nobody covered.
- The fix commits have themselves been reviewed under section 6's rule, or the adjudication says which final fix was not.
- No external draft blocker remains. Under Notes for reviewers, name any prerequisite outside review (such as another PR holding required files), what must happen first, and the remaining work in the order a follow-up session should perform it. Keep the PR draft until that prerequisite and the remaining gates are satisfied.

Only then:

```bash
gh pr ready
```

Read it back, because the flag is silent when it does nothing:

```bash
gh pr view --json number,isDraft,reviewDecision
```

If you run out of budget, get blocked, or hand the session back with any of the above unfinished, leave the PR a draft and say plainly in the PR and to the user what is still outstanding.

---

## 6. Later changes send the PR back to draft

A PR marked ready does not stay ready through its next code change. Whenever more work lands on the branch (the user gives feedback, a human reviewer asks for something, a late reviewer finally reports, you find a defect yourself) put the PR back into draft before you start:

```bash
gh pr ready --undo
```

Say why in a PR comment, so the state change is not a mystery to anyone watching. Undoing returns the label but not the notifications the first `gh pr ready` already sent.

Then judge what the change costs. Editing prose in the PR body, or a doc-only tweak, does not need a second review; mark it ready again once it is in. A code change makes the reviewed version outdated. Assess the new diff under the stopping rule below before launching another round.

Size every round by the diff it reviews. Fill in the prompt's ROUND placeholder (section 3) with the new round number and PREVIOUS with what round R-1 found and how this commit answers it, and size the tier by the diff of what changed since the previous round rather than by the size of the whole PR; a one-line follow-up fix earns the Minimal tier even on a PR whose first round ran five reviewers. Summarise the earlier findings in PREVIOUS rather than sending reviewers to `gh pr view P --comments`: after a few long reviews that output runs past the tool's 400-line cut and the later rounds are the ones that fall off. A reviewer that must read an earlier comment can list them with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and fetch one by id with `gh api repos/ImpowerGames/impower/issues/comments/<id> --jq .body`.

Capture the later round's patch from the previous round's recorded reviewed head, with explicit paths this change owns:

```bash
git diff <previous-reviewed-head>..HEAD -- <owned-paths> > "$SCRATCH/review-<round>-fixes.patch"
```

A lens judging corrections receives this fix diff. A lens assessing the whole change, such as prose consistency or blast radius, receives `git diff origin/main...HEAD` captured under section 3. Record the selected range, paths and purpose for each lens in the round state. The path filter excludes unrelated base integration from the correction diff; explicitly include any newly authorized scope and disclose any owned-path base changes still present. Round 4 remains narrow under the stopping rule below. Before capture, confirm the prior reviewed head against the journal and review comment rather than inferring it from the last commit or the last report to arrive.

The loop has a stopping rule. Continue reviewing code corrections through round 3. If code changes after round 3, run one narrow round 4 covering only the changes since round 3's reviewed head and the callers needed to assess them. Use one reviewer for internal skills work unless a specific deletion or data-preservation risk warrants a second. Documentation, comments and test-only corrections can finish after verification with an explicit note that the final correction was not independently re-reviewed.

After round 4, do not automatically launch another review. Fix and verify accepted findings, commit and push them, then assess the remaining risk of those final changes. Keep the PR draft when another independent review would materially reduce unresolved correctness, deletion or data-preservation risk, and tell the user which changes warrant another round and why. If another round would add little value and section 5's gates are satisfied, mark the PR ready for human review. In either case, record the final unreviewed commits, checks and the reason for the readiness decision under Notes for reviewers and in the adjudication. Readiness is a judgment supported by evidence, not an automatic reward for exhausting the round count.

New scope added during a review cycle is named explicitly in the round's scope and included in its diff; it does not silently reset the count. Further review beyond round 4 requires explicit user direction.

Every round posts its own comments and its own adjudication. Do not edit the previous round's comments to fit the new code; the record of what was reviewed when is what lets a human tell which findings apply to which version.

---

## Improving this skill

If a step here failed, needed something it does not give, did not apply to your review without saying so, or cost you time on a trap it does not name, report it under a "Skill feedback" heading in your final message with the edit you propose, as the repository's agent instructions describe. Run the portability and review-contract checks after editing the prompt, runner configuration or generated definitions. Apply certain fixes on the PR branch and mention them under Notes for reviewers.
