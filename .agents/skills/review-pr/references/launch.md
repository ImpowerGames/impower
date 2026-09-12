# Prepare and launch independent reviews

All commands run from the worktree root unless stated otherwise.

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

Give each reviewer a subdirectory of your private scratch directory that is its own: never the writer's private scratch directory directly, and never a directory that already holds files. Two reviewers sharing a directory pick up and repoint each other's probe files; one did, found the other's findings in its own file, and had to re-verify everything under fresh names. The [reviewer prompt](reviewer-prompt.md) gives each reviewer that path as REVDIR (`<private scratch directory>\review-<round>-<reviewer-id>-<attempt>\`, `<attempt>` starting at 1); relaunching a reviewer that died is the same round and the same reviewer, so the relaunch increments `<attempt>` rather than reusing the dead reviewer's directory. The reviewer-id is a stable short assignment label, distinct from the model route; one assignment may combine several lenses.

Start every local CLI reviewer through the [handoff launcher](../HANDOFF.md); its atomic shared reservation enforces a machine-wide limit of four participating reviewer processes until confirmed process exit. The launcher runs one reviewer at a time per worktree under its coordinator lock, including the three reviewers in a High-impact round. The shared ceiling coordinates reviewers in other worktrees. Record the serial reviewer order and assigned lenses in the round state. A posted comment or completion file does not release a slot. Native or remote agent tasks are unsupported for this enforced workflow because the launcher cannot reserve and verify their process lifetime. An unaccountable native or remote review launch blocks the machine-wide capacity guarantee; do not substitute manual counts or claim it is covered by the reservation. Do not launch a local CLI reviewer directly to bypass an occupied or inaccessible slot store.

Run reviewers using the caller-supplied method. Without subagents, run each reviewer as a separate fresh serial session with the same frozen diff and the complete [reviewer prompt](reviewer-prompt.md). Wait for each process to exit, then verify its report landed before starting the next reviewer. One reviewer may cover several assigned lenses; reusing that session under another lens does not count as a second independent reviewer. Never edit while a reviewer is running.

Preserve independent first passes even though reviewers run serially: do not include current-round reports in another reviewer's prompt. Each reviewer records its own full findings before reading other current-round reports. Earlier rounds remain available for correction review. After the independent passes, challenge disputed claims with evidence during adjudication.

Before launch, post a round state comment naming PR, round, base SHA, reviewed head SHA, scope, lenses, writer identity, configured reviewer route, invocation method and each unique artifact directory. Record every launch's task/session ID or process ID, start time and output path. Await completion in the coordinator; do not end the turn expecting a comment to wake it automatically. On recovery, inspect those launch records and process/task status, including start time to distinguish PID reuse. Missing comments alone do not authorize a duplicate launch. A confirmed stopped attempt with no usable report may be retried in a fresh directory with an incremented attempt.

For autonomous implement/review exchanges, use the handoff runner described in [handoff execution](../HANDOFF.md). It waits for each child to exit and validates that child's completion artifact before launching the next configured role. The caller supplies both routes and prompts; the implementation prompt loads resolve-issue and the review prompt is built from the reviewer template. The shared journal and PR state carry the head, round, active role, result paths, review comment IDs and adjudication IDs. A stopped coordinator is recovered from the journal, never by assuming a child stopped. No concurrent writers are allowed.

Build the prompt with `node scripts/build-review-prompt.mjs <absolute-context.json> <absolute-prompt.txt>`; it rejects missing reviewer inputs and unsafe substitution templates before any process launches. Its context fields are writer, reviewer, invocation, issue, pr, head, worktree, diff, reviewDir, lens, round and previous. Fill N, P, DIFF, WORKTREE, LENS, REVDIR, ROUND, HEAD, REVIEWER and WRITER in the prompt. PREVIOUS is the prior round's findings and dispositions, or “This is the first round; there is nothing earlier to judge against.” WORKTREE and REVDIR are absolute paths. REVDIR is unique for each round, reviewer and attempt and starts empty. The reviewer supplies its own identity. The template block is bounded by the review-prompt:start and review-prompt:end HTML comments. Its token multiplicities are pinned in the builder's counts table; review intentional template and count changes together, and run the prompt-builder and portability checks. Keep unrelated blockquotes outside those markers.

Keep a dollar sign followed by a digit out of the [reviewer prompt](reviewer-prompt.md), and out of anything else in this file that a session copies verbatim. The invocation's own arguments are substituted into this text before the session reads it, so a positional token arrives as whatever word was typed after the skill name and corrupts the sentence sent to reviewers. Name such a token in words instead of writing it.

Lenses; diversity matters far more than count, because redundant reviewers find redundant things:

- Undirected: fill `<LENS>` with `undirected`, and the reviewer prompt's sentence then reads as telling the reviewer it has no assigned lens. Every other reviewer is looking where you told it to look, which means they collectively share your blind spots; this one exists to find what the lens list forgot. It is always included, at every reviewer count.
- Correctness at boundaries: empty input, single element, first/last iteration, and specifically the loop iteration or branch the original bug lived in.
- Incrementality: the compiler reuses constructed flows and short-circuits no-change compiles. Is this still correct on the second keystroke, not just a cold compile? Does it corrupt reused state?
- Blast radius: enumerate every caller of every changed function and assess their behavior, citing `file:line`. An unaccounted-for caller is a coverage gap until evidence establishes a failure scenario.
- Test honesty: does the regression test pin the ticket's behaviour, or merely the shape of the patch? Would it catch the bug returning by a different route?
- Repo traps: a generated `language/*.json` edited without its `definitions/yaml/*.yaml` source (the rule in the repository's agent instructions), a `.gitignore` interaction under the shared tooling directories, whitespace-significant display lines, a new file the diff relies on but never stages.

Assign relevant lenses (including concurrency, serialization, or the asset pipeline when warranted) within the selected reviewer count. Skip those that cannot apply. Test honesty and repo traps above apply to every reviewer rather than consuming additional reviewer slots.

A reviewer launch can die with a session rate-limit error before it has posted anything. When one does, check the tree and the PR comments for whatever it did manage, then relaunch that reviewer after the reset time the error names; the other reviewers are unaffected.

When the fan-out returns, check the tree before anything else:

```bash
git status --short
```

If a reviewer changed files, preserve and inspect those changes, invalidate its evidence and restore only changes confirmed to belong to that reviewer. Do not discard another writer's work.

Then confirm every expected comment is on the PR with the listing command in [reviewer prompt](reviewer-prompt.md). Every report that is not there, you post yourself, verbatim, one comment per reviewer, before you adjudicate. Prefix each with a line saying you are posting on the reviewer's behalf and why it could not.

This is not the rare case. Whole environments have no `gh` at all; a remote or web session reaches GitHub through an integration instead, so `gh pr comment` fails for every reviewer, not one. When that happens the temptation is to skip the posting and fold everything into your adjudication instead. Do not:

- Your summary is not their review. You are the author. The reports carry the `file:line` citations, the probes they actually ran, and the reasoning, including the parts you disagreed with, and the ones where a reviewer catches that your correction to an earlier mistake was itself wrong. A summary written by the person being reviewed launders all of that.
- The whole point of the review is that findings outlive the session. Findings that exist only in your adjudication are findings you chose which to preserve.
- Post them even when you fixed everything. Especially then; the fix is only checkable against the claim it answers.

Post them verbatim: do not trim, reorder, or correct them. Where a reviewer is wrong, say so in your adjudication, not by editing its words. Where a reviewer reports a changed tree, preserve the caveat and invalidate affected evidence; do not iterate while a reviewer runs.

---
