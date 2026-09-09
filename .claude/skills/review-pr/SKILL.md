---
name: review-pr
description: Adversarially review an open pull request with cross-model reviewer subagents that post their findings as PR comments, adjudicate every finding on the PR, re-verify any fix, and mark the PR ready only when nothing is left unanswered. Invoked by resolve-issue once its draft PR is open, and usable directly on any pull request that needs an independent review, including a later round after more commits land.
---

# Review a pull request

The goal is to break the change, not to admire it, and to have readers who were not anchored by the writer's reasoning do it, on the real diff. Every reviewer posts its findings as a comment on the PR, so nothing it finds can get lost when the session ends. The PR stays a draft for the whole review; `gh pr ready` is the last step, after section 5's list is complete.

Two reviewer definitions under `.claude/agents/` belong to this skill: `reviewer-opus-4-6.md` and `reviewer-opus-5.md`, each pinning a full model id in its frontmatter. They live in `.claude/agents/` because that is the only directory the harness reads project subagents from. `reviewer-model-values.test.sh` beside this file pins the table in section 2 and the prompt in section 3 against routing a writer to its own model; run it after any edit here, to a definition, or to the script itself. Its 63 controls run the same check function in the same process: sixty fixtures, eleven of them correct and the rest deliberately broken, one control on the bash-floor comparison, and two that re-execute the file on a fixture to pin its exit status and closing lines. The whole run, 71 assertions, takes seconds (6s on this machine) and needs bash 4.4 or newer; the result is the closing line, `All reviewer-model assertions passed, 63 controls included.`, whose count the file holds to a floor. Given a skill file and an agents directory as arguments it checks those alone and its closing line says the controls did not run.

---

## 1. Size the review

Reviewers cost real tokens. Scale the count to the blast radius of the diff under review instead of running a fixed ritual; four reviewers on a two-line fix burn tokens to find nothing.

| Tier        | Reviewers                                   | Applies when                                                                                                                                                         |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal     | 1, undirected only                          | Docs, comments, or config only; or a single-file fix of a few dozen lines whose callers you enumerated yourself and whose regression test pins the ticket behaviour. |
| Standard    | 2–3, undirected + the most relevant lenses  | A typical fix contained in one package.                                                                                                                              |
| High-impact | 4–5, undirected + every applicable lens     | Compiler or runtime semantics, incremental-compile or serialization paths, generated-grammar sources, changes spanning packages, or a diff over ~300 lines.          |

When a diff sits between tiers, round up; a missed defect costs more than a reviewer. The undirected reviewer is never dropped, whatever the tier.

---

## 2. Reviewers never run on the writer's own model

A model reviewing code written by the same model shares the writer's priors: it finds the same things plausible and overlooks the same things. So the reviewer has to be a different model from you, and you have to choose it deliberately rather than letting it default to yours.

When running in Codex with ChatGPT reviewers, use the collaboration tool's explicit model override rather than Claude-specific definitions or aliases. Choose a supported model distinct from the configured writer (for example, a `gpt-6-astra` writer can request a `gpt-5.6-sol` reviewer), and use a context-fork option that permits the override. Read the active tool schema for supported values. Each reviewer must state its configured route and distinguish that from independently verified runtime identity; do not claim runtime introspection when the harness provides none. If the reviewer knows its served model matches the writer, abort and choose another supported route. The Claude routing instructions below apply to the Claude harness.

Spawn a pinned definition by name and the review runs on that version whatever your own is: `subagent_type: "reviewer-opus-4-6"` was confirmed running `claude-opus-4-6`, and `reviewer-opus-5` running `claude-opus-5`, from a session that had them.

| You (the writer)     | Spawn                                |
| -------------------- | ------------------------------------ |
| Opus 5               | `subagent_type: "reviewer-opus-4-6"` |
| Opus 4.6             | `subagent_type: "reviewer-opus-5"`   |
| Fable, Sonnet, Haiku | `subagent_type: "reviewer-opus-5"`   |

Give these no `model:`; the definition's own frontmatter carries it, and the tool parameter cannot express a version anyway. On an Opus version with no row of its own, spawn whichever of the two pinned reviewers is not your version; there are two, so one always differs.

A definition has to be picked up by the harness before it can be spawned, and that can lag the file landing on disk; a newly added one showed up part-way through a run rather than at the moment it was written. Re-read your agent-type list before each round; a definition added mid-session may or may not have been picked up, and the file on disk does not tell you. When the table's named reviewer is absent from that list, that absence is exactly what the fallback below is for, never a reason to drop the lens or the round: fall back to `subagent_type: "general-purpose"` and an explicit `model:` of a different family from your own. Refusal is for the narrower case in "When a pin stops working" below, where every route — the pinned reviewer and the fallback both — fails to produce a reviewer of a different family:

| You (the writer)     | Fallback         |
| -------------------- | ---------------- |
| Opus                 | `model: "fable"` |
| Fable, Sonnet, Haiku | `model: "opus"`  |

That parameter takes four aliases, `sonnet`, `opus`, `haiku` and `fable`, and rejects anything else with an `InputValidationError` before a single agent starts, full model ids included. That set belongs to the harness rather than to this repo, and it has grown before, so treat it as observed on 2026-09-04 rather than fixed: if a value you expect to work is refused, read the current set back out of the rejection message and update this section and its check together. Each alias resolves to the current release of its family, so the fallback buys a different family rather than a different version.

Never answer a rejection with your own family. An Opus writer that falls back to `"opus"` has bought itself a reviewer carrying all of its own blind spots, which is the single outcome this section exists to prevent.

### When a pin stops working

A pinned id can stop naming a live model, and nothing in this repo can tell you when. The check reads the ids in this section and in the definitions; it cannot ask the API whether one is still served. Worse, a retired id fails quietly: the harness substitutes another model for that turn, most likely its default, which for an Opus writer is the writer's own model. Left alone, that produces a full review that reads as independent and is not.

So every reviewer checks its own pin before it does anything else. Section 3's prompt tells each reviewer which model you are running; substitute your real model id for `WRITER`, because a reviewer that receives the bare placeholder has nothing to compare against and will abort on that instead. The prompt and both definitions require the reviewer to compare that id against itself and, on a match, to stop before reading a single file and answer with one line beginning `ABORT:`. Because the instruction is in the prompt as well as in the definitions, it reaches a `general-purpose` reviewer on the alias fallback too, not only the pinned ones. An abort costs about 9k tokens, against 80k–150k for a review nobody can trust; measured on this repo, not estimated.

An abort is a result, not an error. Spawning stays parallel: launch the whole set as section 3 says, then re-spawn only the lenses that aborted, taking the next route down this list each round.

1. The reviewer the table names.
2. On `ABORT`, the other pinned reviewer; a retirement takes out one version, not both.
3. If that aborts too, the alias fallback above: a different family, never your own.
4. If every route aborts, stop. Do not spawn a reviewer you know is your own model, and do not adjudicate a review you would not trust. Say so in the PR and to the user: which routes aborted, and that the change is going out without independent review on that lens. An unreviewed change you have flagged is recoverable; one reviewed by itself and presented as independent is not.

Whichever route ends up working, repair the cause rather than leaving the next run to rediscover it. Invoke the `claude-api` skill and read its model table for the Opus ids currently served, point the stale definition's frontmatter at one of them, and say in the PR that you did. Its path is session-scoped, so reach it through the skill rather than a hard-coded path; the Models API (`GET /v1/models`) is the authoritative list where an `ANTHROPIC_API_KEY` is available, which in a Claude Code session it usually is not.

Read every reviewer's first line even when nothing aborted. A reviewer that reports your own model without aborting means both the pin and its own guard failed, and that review is not independent: discard it, do not adjudicate it. That reading is not optional bookkeeping: the abort is an instruction a model chooses to follow, not something the harness enforces, so your eyes on that first line are the last check in the chain.

---

## 3. Fan out; each reviewer comments on the PR

Merge `main` into the branch before capturing the diff, and not again until the round is over. A reviewer compares the branch against `main` as it stands, so on a stale branch it reports the gap as a defect the branch caused; and a reviewer reads the working tree as well as the patch, so a merge mid-review makes `main`'s new commits look like yours. Both have produced findings about work the pull request never contained. Merge first, then capture the diff, then spawn.

Capture the diff once, so every reviewer sees the same artifact:

```bash
git diff origin/main...HEAD > "$SCRATCH/review-diff.patch"
```

(`...` is deliberate: changes on your branch since it diverged from `main`, not `main`'s subsequent commits.)

If the change regenerates a large snapshot or other generated file, exclude it from the patch by path and tell the reviewers the command to inspect it separately; a multi-megabyte patch file wastes a reviewer's context before it reads a line of the actual change (one session's patch came out at 2.6 MB for this reason):

```bash
git diff origin/main...HEAD -- . ':(exclude)packages/sparkdown/src/tests/__snapshots__/big.snap' > "$SCRATCH/review-diff.patch"
```

Write it to your scratchpad, never into the checkout. A patch file inside the repo is one `git add -A` away from being committed, and it leaves the tree dirty for as long as the review runs, long enough to trip any hook or check that expects a clean tree. Give reviewers the absolute path (`$SCRATCH` is your session's scratchpad directory).

Give each reviewer a subdirectory of your scratchpad that is its own: never the writer's scratchpad directly, and never a directory that already holds files. Two reviewers sharing a directory pick up and repoint each other's probe files; one did, found the other's findings in its own file, and had to re-verify everything under fresh names. The prompt below gives each reviewer that path as REVDIR (`<scratchpad>\review-<round>-<lens>-<attempt>\`, `<attempt>` starting at 1); relaunching a lens that died is the same round and the same lens, so the relaunch increments `<attempt>` rather than reusing the dead reviewer's directory.

Spawn at most four reviewers at once. A High-impact round of five runs its fifth lens as a second batch, spawned once the first batch's comments are on the pull request; when the user says the machine is shared, a batch is at most two and the round runs as many batches as its lenses need. Batching is how the cap is obeyed without dropping a lens, so say in the round's state comment which lenses each batch covered. The failure the cap answers was machine-wide: seven reviewers at once, across two sessions running in parallel, hit the session rate limit and killed a whole round, while four or fewer did not. A session cannot see what another has in flight, which is why the number here is a batch size rather than a budget to divide, and why the user saying the machine is shared halves it.

Spawn the reviewers in parallel: one message, multiple Agent tool calls, each with the `subagent_type` from section 2 (or `general-purpose` plus a `model:`, on the fallback path). Posting a PR comment needs Bash and a scratch file, so read-only is not tool-enforced for reviewers; the prompt forbids repo edits and section 4 checks that it was obeyed. Give each one, verbatim (fill in N = issue number, P = PR number, DIFF = the absolute path you just wrote the patch to, WORKTREE = the absolute path of the worktree under review, LENS = the lens name, or `undirected`, REVDIR = the scratch subdirectory unique to this reviewer, round and attempt, ROUND = the round number, PREVIOUS = a short paragraph — on round 1, "This is the first round; there is nothing earlier to judge against."; on a later round, what round R-1 found and how this commit answers it — and WRITER = your own model id; the reviewer supplies its own model, so that one is not yours to fill in). WORKTREE is not optional: a subagent starts in the main checkout, not in your worktree, so a reviewer told only "the working tree is the branch under review" reads the unchanged files on `main` and reviews nothing you wrote. A spawned reviewer cannot be messaged or resumed; if it dies, spawn the same lens again, with `<attempt>` incremented in its REVDIR, rather than waiting on it. Your own session's turn ends when the reviewers are spawned and is not reliably resumed when they post, so before spawning, put the round's state (pull request, commit, lenses, scope) on the pull request itself, so a fresh session can pick the round up from the pull request alone.

Keep a dollar sign followed by a digit out of the prompt below, and out of anything else in this file that a session copies verbatim. The invocation's own arguments are substituted into this text before the session reads it, so `$1` arrives as whatever word was typed after the skill name and the sentence around it turns into nonsense on its way to five reviewers. Name such a token in words instead of writing it.

> Before anything else, check the pin. I am running `WRITER`. If that is missing, empty, still the literal placeholder `WRITER`, or anything other than a concrete model id, you have nothing to compare against — stop and reply with exactly one line, `ABORT: writer model not supplied.` Otherwise compare it against the model your own system prompt says you are, ignoring any context-window suffix such as `[1m]`. If the family and version match, you are my own model, this review would carry my blind spots, and going on would spend a full review to produce nothing worth reading — so stop here: read no file, run no command, and reply with exactly one line, `ABORT: pin failed, I am <your model id>, same as the writer.` Begin an abort with `ABORT:` and nothing else, so I cannot mistake it for a short review that found nothing. Only if your model differs should you do the review below.
>
> You are reviewing a fix for issue #N in the Impower monorepo, round ROUND on PR #P. The diff is at `DIFF`; the working tree under review is the git worktree at `WORKTREE` — read files from there, not from the main checkout. Your lens is \<LENS\>; if that is `undirected`, you have no assigned lens and review the whole change however you see fit, reporting anything wrong with it, and otherwise you review only through that lens. PREVIOUS Your job is to refute this change, not to approve it. Assume it is broken and find out how. If you are uncertain, report the concern rather than suppressing it. For each finding give: `file:line`, a concrete failure scenario (inputs → wrong output), and how you confirmed it in the code. Do not pad with non-findings. Do not edit, create, or delete any file inside the repo tree. Never run the change under review destructively against this machine's repository or its worktrees; every destructive experiment runs in a scratch repository under your scratchpad directory, with `pwd` printed in the same command as any destructive call. Put every file you write under your own subdirectory `REVDIR`, never the writer's scratchpad directly and never a directory that already has files in it. Before running vitest as a probe, check for a vitest process already running and wait for it to exit; the writer may be mid-suite, and the machine allows only one run at a time. If you mutate a copy of a file with JavaScript's `replace`, escape `$` in the replacement or pass a function, because a dollar sign followed by `&`, by a digit, or by another dollar sign is substituted and a corrupted copy reads as zero failures; read the copy back before trusting what it reports.
>
> When your review is done, post it as a comment on PR #P: write the full findings to a markdown file under `REVDIR` (never inside the repo), using an editor tool rather than a heredoc; name it anything that is not report-shaped — the editor tool refuses `report.md` and `findings.md` for a subagent, but a name like `pr-comment-body.md` works — starting with the heading `### Adversarial review — <LENS> (<MODEL>)`, where MODEL is the model name and id you yourself are running as, exactly as your own system prompt gives them — report what you are, never what you were asked to be. Then run `gh pr comment P --body-file <that file>`. Never pass `--body @-` — gh takes it as a literal string and posts a broken comment. If you have no findings, still post the comment with the single line "No findings through this lens." so the coverage is recorded. Confirm the comment landed by listing the PR's comments with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and finding your heading among them.
>
> Whether or not the comment lands, return your full findings as your final report — the same markdown, in full. If you cannot post at all (no `gh` on this machine, an auth failure, a denied permission), do not try to work around it and do not summarise: say in one line that you could not post and why, then return the whole report. The writer will post it for you.

Lenses; diversity matters far more than count, because redundant reviewers find redundant things:

- Undirected: fill `<LENS>` with `undirected`, and the prompt's own sentence then reads as telling the reviewer it has no assigned lens. Every other reviewer is looking where you told it to look, which means they collectively share your blind spots; this one exists to find what the lens list forgot. It is always included, at every tier.
- Correctness at boundaries: empty input, single element, first/last iteration, and specifically the loop iteration or branch the original bug lived in.
- Incrementality: the compiler reuses constructed flows and short-circuits no-change compiles. Is this still correct on the second keystroke, not just a cold compile? Does it corrupt reused state?
- Blast radius: enumerate every caller of every changed function and argue each is unaffected, citing `file:line`. Any caller you cannot account for is a finding.
- Test honesty: does the regression test pin the ticket's behaviour, or merely the shape of the patch? Would it catch the bug returning by a different route?
- Repo traps: a generated `language/*.json` edited without its `definitions/yaml/*.yaml` source (the rule in `CLAUDE.md`), a `.gitignore` interaction under `.claude/`, whitespace-significant display lines, a new file the diff relies on but never stages.

Add a lens when the diff warrants one (concurrency, serialization, asset pipeline). Skip one that cannot apply.

A reviewer launch can die with a session rate-limit error before it has posted anything. When one does, check the tree and the PR comments for whatever it did manage, then relaunch that lens after the reset time the error names; the other reviewers are unaffected.

When the fan-out returns, check the tree before anything else:

```bash
git status --short
```

Revert anything a reviewer changed inside the repo; a reviewer that edits the tree has contaminated its own evidence.

Then confirm every expected comment is on the PR with the same listing command the prompt gives. Every report that is not there, you post yourself, verbatim, one comment per reviewer, before you adjudicate. Prefix each with a line saying you are posting on the reviewer's behalf and why it could not.

This is not the rare case. Whole environments have no `gh` at all; a remote or web session reaches GitHub through an integration instead, so `gh pr comment` fails for every reviewer, not one. When that happens the temptation is to skip the posting and fold everything into your adjudication instead. Do not:

- Your summary is not their review. You are the author. The reports carry the `file:line` citations, the probes they actually ran, and the reasoning, including the parts you disagreed with, and the ones where a reviewer catches that your correction to an earlier mistake was itself wrong. A summary written by the person being reviewed launders all of that.
- The whole point of the review is that findings outlive the session. Findings that exist only in your adjudication are findings you chose which to preserve.
- Post them even when you fixed everything. Especially then; the fix is only checkable against the claim it answers.

Post them verbatim: do not trim, reorder, or correct them. Where a reviewer is wrong, say so in your adjudication, not by editing its words. Where a reviewer notes that the tree changed under it mid-review (it will, if you were iterating), keep that caveat; it tells the reader why a line number may not match.

---

## 4. Adjudicate, on the PR

Reviewer output is a hypothesis, not a verdict; subagents confidently report defects that do not exist. If every reviewer of a round failed with a rate-limit error, the round did not run: relaunch the same set after the reset the errors name, and never adjudicate a partial round. If this session's own process exits while reviewers are running, the round also did not run unless its comments already landed on the pull request: list whatever comments are there under the round's heading, and spawn the missing lenses again as one set, with the same prompt and diff.

For every finding, confirm it yourself in the code before acting. A claimed `file:line` that does not say what the reviewer claims is a dead finding, full stop. When two reviewers disagree about the same lines, break the tie by experiment rather than by the more convincing prose: for a claim that a test does not cover a branch, disable that branch and re-run; a suite that stays green proves the claim. Record the mutation and its result in the adjudication.

Then dispose of every finding where it lives, on the PR. Adjudicate every comment a reviewer posted, the latest correction winning: a reviewer that posts twice, or corrects itself in a later comment, is answered on its final position, and the earlier comment is named as superseded rather than left looking open. Post one adjudication comment (again via `--body-file`; `CLAUDE.md` has the `@-` footgun) naming each finding and what happened to it:

- Fixed, with the commit sha.
- Declined, with the concrete reason.
- Not confirmed: the cited `file:line` does not say what the reviewer claimed.

When a finding's fix depends on a defect older than the branch, fix the older defect on the branch too and say so under Notes for reviewers; ticket it separately only when the fix can stand without it.

Do not silently drop findings; an unanswered review comment on the PR reads as an open defect.

---

## 5. Re-verify, then mark ready

Any change made in response to review re-opens verification and the tests: re-run the regression test (the write-regression-test skill's `redgreen`, with `--base origin/main` once the fix is committed; for a change pinned by a standalone check under `.claude/`, re-run that check in place of `redgreen`) and re-take the live evidence (the drive-web-editor skill, or the checks that exercise a change with nothing to boot). A review fix is a code change like any other, and it is the one most likely to be committed unverified. Commit by path, push. The diff lives in your scratchpad, so there is nothing in the tree to clean up.

When the check imports a name the base revision does not export, `redgreen`'s revert fails at import: stage the base revision's file in a scratch directory beside the current check, with any sibling it imports and a junction to `node_modules`, and run the check there, reporting the failing case count. A base file that exits the process on a refusal hides every case after it; patch the scratch copy's exit into a throw, say so in the adjudication, and count the failures from the full run.

Marking the PR ready means this diff is finished and ready to be reviewed by a human. Make that claim only when every one of these is true:

- Every reviewer you spawned has come back.
- Every report is on the PR, including the ones you posted on a reviewer's behalf (section 3).
- Every finding is adjudicated in your section 4 comment, fixed, declined, or not confirmed, with nothing left unanswered.
- Every fix you made in response is committed, pushed, and re-verified as above, and the last push is on the PR.
- No re-spawned lens is still outstanding from an `ABORT` chain (section 2). If a lens ended up with no independent reviewer at all, say so on the PR before marking ready, so the human knows which angle nobody covered.
- The fix commits have themselves been reviewed under section 6's rule, or the adjudication says which final fix was not.

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

Then judge what the change costs. Editing prose in the PR body, or a doc-only tweak, does not need a second review; mark it ready again once it is in. But a change to the code under review means the diff the reviewers read no longer exists, and their verdicts are about a version that is outdated. Run this skill again on the new diff.

Size every round by the diff it reviews. Fill in the prompt's ROUND placeholder (section 3) with the new round number and PREVIOUS with what round R-1 found and how this commit answers it, and size the tier by the diff of what changed since the previous round rather than by the size of the whole PR; a one-line follow-up fix earns the Minimal tier even on a PR whose first round ran five reviewers. Summarise the earlier findings in PREVIOUS rather than sending reviewers to `gh pr view P --comments`: after a few long reviews that output runs past the tool's 400-line cut and the later rounds are the ones that fall off. A reviewer that must read an earlier comment can list them with `gh api repos/ImpowerGames/impower/issues/P/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and fetch one by id with `gh api repos/ImpowerGames/impower/issues/comments/<id> --jq .body`.

The loop has a stopping rule. Fix commits are reviewed until a round finds only wording, comments or test coverage; at that point the final fix is committed and the adjudication says it was not re-reviewed. A change with unbounded edge cases (a parser) can otherwise keep a round finding code changes indefinitely, and one pull request ran twenty-five rounds that way. After three rounds that still change code, ask the user whether to continue, and record a deliberate stop under Notes for reviewers in the PR body so the human reader knows where the review ended and why.

A round the user approves after that stop follows the same rule: if its fix still changes code, stop again, leave the pull request a draft, and say so under Notes for reviewers.

That count is about rounds that correct the work already under review. A round that reviews newly added scope, such as a second ticket folded in at the user's request, starts the count again for that scope; size it by its own diff, and say in the adjudication which ticket each round covered.

Every round posts its own comments and its own adjudication. Do not edit the previous round's comments to fit the new code; the record of what was reviewed when is what lets a human tell which findings apply to which version.

---

## Improving this skill

If a step here failed, needed something it does not give, did not apply to your review without saying so, or cost you time on a trap it does not name, report it under a "Skill feedback" heading in your final message with the edit you propose, as `CLAUDE.md` describes. An edit to the writer-to-reviewer tables, the reviewer prompt, or a definition under `.claude/agents/` is pinned by `reviewer-model-values.test.sh`; run it. When you are certain of the fix and the session has a branch and pull request, make it in this file in its own commit and mention it under the pull request's Notes for reviewers.
