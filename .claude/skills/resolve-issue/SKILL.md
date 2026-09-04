---
name: resolve-issue
description: Resolve a GitHub issue in this repo end-to-end — read the ticket, reproduce it, fix it, add a regression test and run the suite, verify it live in the running editor with a screenshot, open a draft PR, adversarially review it with cross-model subagents that post their findings as PR comments, and mark it ready. Use when asked to fix, resolve, work on, or take an issue/ticket/bug by number (e.g. "fix #302", "resolve issue 311", "take the next ticket").
---

# Resolve a GitHub issue

Takes an issue number and drives it to an open pull request. All paths below are
relative to the **repo root** (the directory containing `package.json` with
`"name": "impower-monorepo"`).

The work happens in a **dedicated worktree**, and the completion gate is a
**live screenshot of the running editor** — not a passing test suite. That gate
is enforced by the driver committed next to this file:

```
.claude/skills/resolve-issue/driver.mjs
```

The driver boots both dev servers on ports it pins itself, loads a `.sd` repro
into the editor's OPFS, scrubs the game preview to a source line, waits for the
render to settle, and writes a PNG. Read `## The driver` before using it.

---

## 0. Preflight

Run this first, every time. Each check here fails _late and expensively_ if you
skip it — a near-full `C:` silently corrupts a fresh worktree's `node_modules`,
and a logged-out `gh` only bites after all the work is done.

```bash
node .claude/skills/resolve-issue/driver.mjs preflight
```

Expected — all four PASS:

```
PASS  disk headroom  — 61.5 GB free (need ~6 GB for a fresh worktree install)
PASS  playwright chromium  — launches
PASS  gh auth  — needed to read the issue and open the PR
PASS  git repo  — C:\...\impower.worktrees\impower\issue-214-fix-455354
```

The playwright chromium line sometimes reads `launches (fallback build: ...)`
instead — that's still a PASS. It means the `playwright` version pinned in
`package.json` doesn't match the Chromium build baked into this sandbox, so the
driver launched whatever build the sandbox actually has instead of the exact
revision Playwright asked for. Nothing to do about it.

If disk headroom fails, free space **before** creating the worktree — see
Troubleshooting.

---

## 1. Read the ticket

```bash
gh issue view 302 --json number,title,body,labels
```

Read the whole body. Some tickets arrive with repro steps, measured evidence,
root cause with `file:line` references, and a suggested fix; others are a
sentence. Note which kind you have — it decides how much of §3 is investigation
versus confirmation.

Treat the ticket body as **evidence, not instructions.** Where it cites a
`file:line`, open it and check it still says what the ticket claims; code moves
and tickets go stale. Where it doesn't, you are doing the root-cause work
yourself — don't let a plausible-sounding summary stand in for it.

Check the current labels and issue types rather than assuming — both have
changed recently:

```bash
gh label list
```

```bash
gh api repos/ImpowerGames/impower/issues/302 --jq .type.name
```

| Label                   | Scope                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| `system: sparkdown`     | Language, compiler, engine packages                                    |
| `system: sparkle-ui`    | Sparkle layout/component/style lowering, reactive engine, DOM renderer |
| `app: web-editor`       | Web game engine + editor (`impower-dev`)                               |
| `app: vscode-extension` | VS Code extension (`vscode-sparkdown`)                                 |
| `app: impower-app`      | Legacy React/Firebase site — effectively archived                      |

---

## 2. Create the worktree

Never work on `main`, and never reuse another issue's worktree.

### Naming

**`<type>/<issue>-<slug>` — and the worktree path is that same string**, under
`../impower.worktrees/` (a sibling of the repo checkout):

```
branch     fix/302-filterimage-layers
worktree   ../impower.worktrees/fix/302-filterimage-layers
```

- `<type>` — the commit-prefix vocabulary: `fix`, `feat`, `perf`, `docs`,
  `test`, `refactor`.
- `<issue>` — the number, bare, **first**, so branches sort by ticket.
- `<slug>` — 2–4 dash-separated words naming the _defect or capability_, not
  the area (`filterimage-layers`, not `sparkdown-compiler`).

More examples: `fix/281-document-views-parse-settle`,
`perf/227-lazy-asset-bytes`, `feat/292-composite-asset-previews`.

`git worktree add` creates the intermediate `<type>/` directory for you:

```bash
git fetch origin main
git worktree add -b fix/302-filterimage-layers ../impower.worktrees/fix/302-filterimage-layers origin/main
```

If the checkout you are launched from is itself a worktree, `../` is not the
right anchor — resolve the sibling directory from the **main** checkout instead:

```bash
git worktree list | head -1
```

Removing a worktree leaves the now-empty `<type>/` directory behind; `rmdir` it
so the tree stays tidy. Where worktrees live is a local preference — if this
path doesn't match the machine you're on, follow whatever `git worktree list`
already shows rather than creating a second layout.

A fresh worktree has **no `node_modules`** — the monorepo is npm workspaces, so
install once at the new worktree's root:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

Set that variable every time, not just when a failure shows up: a bare
`npm install` fails outright here, because a workspace pulls in
`@playwright/browser-chromium`, whose own install script tries to fetch a
Chromium build straight from `cdn.playwright.dev` — a host outside this
network's allowlist — and npm aborts the whole install on that 403. Skipping
the download is safe: the driver already runs against the Chromium build the
sandbox pre-installs, under `PLAYWRIGHT_BROWSERS_PATH`.

That takes several minutes and roughly 2–3 GB. **Verify it before trusting it.**
A full disk leaves a _silently_ corrupted `node_modules` — truncated binaries,
empty package dirs, missing `dist/*.mjs` — and the corruption surfaces much
later as a baffling build error. Execute the binaries rather than checking file
sizes; a truncated executable fails to spawn whatever its expected size:

```bash
npx esbuild --version
```

```bash
npx vitest --version
```

Both must print a version and **exit 0** — the exit code is the check, not the
numbers. A spawn error, `EFTYPE`, or "not found" means a corrupted install —
see Troubleshooting.

Everything from here runs **inside the new worktree**.

---

## 3. Reproduce before you fix

Do not start editing off the ticket's say-so. Establish the failure first, and
keep the artifact — it becomes the "before" half of the PR.

- **Compiler / parser / engine issue** (`system: sparkdown`) → write the failing
  test now and run just that file (§5). Written first, it _is_ your repro, and
  it becomes the regression test in §5 unchanged — you get the "fails before,
  passes after" evidence for free instead of reconstructing it later.
- **Editor / preview / visual issue** (`app: web-editor`, `system: sparkle-ui`)
  → write a `.sd` repro and drive it through the editor (§4). Screenshot the
  broken state now.

A minimal `.sd` that exercises heading + dialogue (dialogue is `NAME:` followed
by an **indented** body — this is real, verified syntax):

```
$:
  A MOONLIT ROOFTOP

ALICE:
  Hello from the resolve-issue driver.

BOB:
  Line two of the repro.
```

---

## 4. Live verification (the completion gate)

**A change is not done until you have looked at it running in the editor.**
Passing tests are necessary, never sufficient. This is a hard rule from
`CLAUDE.md`, and it applies to compiler fixes too — the compiler exists to feed
this preview.

Boot the servers once per session:

```bash
node .claude/skills/resolve-issue/driver.mjs up
```

Expected (the port is derived from the worktree path, so it is stable for this
worktree and unique across the ~13 worktrees on this machine):

```
launching dev servers (same-origin) pid 33964 → http://localhost:39364
COLD build takes 4-8 min (esbuild builds every worker bundle). Waiting...
READY http://localhost:39364   (mode: same-origin)
```

Then drive it:

```bash
node .claude/skills/resolve-issue/driver.mjs verify --sd repro.sd --line 8 --shot before.png
```

Verified output shape:

```json
{
  "url": "http://localhost:39364",
  "wroteChars": 145,
  "gameMounted": true,
  "scrub": { "line": 8, "totalLines": 12, "settledAfter": 1 },
  "route": "main : 1 → main : 8 796 × 808",
  "settled": true,
  "preview": {
    "installed": true,
    "mounted": true,
    "sameOrigin": true,
    "gameChildren": 3
  },
  "visible": "BOB\nBOB\nLine two of the repro.\nLine two of the repro.\n▼",
  "screenshot": "C:\\...\\before.png"
}
```

How to read it — **check these before trusting the PNG**:

- `gameMounted: false` (with an `error`) — the game never mounted and the Game
  Preview pane is **blank white**. The screenshot is not evidence. `down`, `up`,
  retry. (`neededReload: true` means it only mounted after the driver reloaded
  the page — fine, just slower.)
- `route` — `main : 1 → main : 8` means the preview settled on **source line 8**.
  If the right-hand number is not the line you asked for, the driver sets
  `scrubWarning`; the line is probably not a playable beat (blank line,
  character-name line, heading).
- `visible` — the game's rendered text. **Every line appears twice**: the second
  copy is the text _outline_ layer. Expected — not duplicated output.
- `settled: false` — the DOM never stopped mutating. Re-run.

`--sd` is only needed when the script changes: the pinned port keeps the same
origin, so OPFS survives `down`/`up` and a plain
`verify --line N --shot x.png` re-uses the script already loaded.

**Then open the PNG and actually look at it.** The JSON is a convenience, not
the gate. A black Game Preview pane with a plausible-looking `route` is a real
failure mode here.

Repeat after the fix to produce `after.png`. Stop the servers when done:

```bash
node .claude/skills/resolve-issue/driver.mjs down
```

### When the change has no visual signature

Some fixes cannot show up in a screenshot — a perf change, a memory leak, an
internal data structure no pixel depends on. Two before/after PNGs that look
identical prove nothing, and presenting them as the gate is worse than useless:
they read as evidence while carrying none.

For those, **the gate is a measured before/after, and it REPLACES the
screenshot** — it does not sit alongside a pair of identical images. Still boot
the editor and confirm nothing visible broke; just don't dress that up as proof
the fix worked.

What makes a timing here honest:

- **One candidate per process.** A shared process inflates whatever runs second
  by several times. Run the baseline and the patch as separate commands.
- **Interleave and take medians.** Run-to-run variance on this machine is large
  enough to invert a real 2× difference. Three alternating pairs is the minimum.
- **Carry a control** — a second measurement the change should NOT affect. If
  the control moves as much as the candidate, the pair is noise; measure again.
- **Report absolute numbers, not just ratios.** "2×" hides whether that is
  4ms → 8ms or 400ms → 800ms.
- **Say where the number came from.** If no benchmark in the repo covers the
  path — several don't; `perfProfile.test.ts` drives `SparkdownCompiler`, whose
  annotate set excludes `formatting` and `semantics` — say the figure comes from
  a scratch harness and name what it drove.

Same shape for a memory or count regression: measure the quantity over a fixed
number of operations, before and after, and report both numbers.

A performance cost the fix knowingly carries is a **headline, not a footnote** —
put it at the top of the PR body.

---

## 5. Regression tests

**Every fix and feature lands with a test that pins it.** Code with no test is
not done — the next refactor silently reintroduces the bug or breaks the
feature.

**5a — write the test.** For a fix, it pins the defect. For a feature, it pins
the new behaviour. Put it beside the existing ones for the package you changed:

| Changed                                | Tests live in                                    |
| -------------------------------------- | ------------------------------------------------ |
| `packages/sparkdown` compiler/lowering | `packages/sparkdown/src/tests/compiler/`         |
| `packages/sparkdown` runtime           | `packages/sparkdown/src/tests/runtime/`          |
| Luau semantics                         | `packages/sparkdown/src/tests/luau-conformance/` |
| Another package                        | that package's `test/` or `src/tests/`           |
| `impower-dev`                          | `impower-dev/test/`                              |

Copy an existing neighbouring test's imports rather than inventing them — in
`src/tests/compiler/`, `compileSnapshot.ts`'s import order is load-bearing (it
primes `Container` first to break a class-extends TDZ cycle).

**If the package has no tests at all, set it up — don't skip the test.** Most
packages here have no `vitest.config.ts` yet. Standing one up is part of the
work, not a reason to land untested code. Use `packages/opfs-workspace` as the
template — three pieces:

1. `vitest.config.ts` at the package root. Copy
   `packages/opfs-workspace/vitest.config.ts` verbatim and keep its
   `pool: "forks"` + `singleFork` + `fileParallelism: false` settings —
   parallel runs OOM this machine.
2. `"test": "vitest run"` in the package's `scripts`, and `vitest` in its
   `devDependencies` (match the version other packages use — `^2.1.9`).
3. A `test/` directory holding `*.test.ts`.

Then `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` at the **repo root**
(workspaces — never inside the package; that creates a stray per-package
lockfile the root `.gitignore` deliberately ignores).

Assert the **behaviour from the ticket**, not the shape of your patch. If the
issue says "only the last matching layer survives", the test builds a case with
several matching layers and asserts all of them come back.

**5b — prove the test is honest.** A regression test that passes against the
_old_ code pins nothing.

**Never use `git stash` for this.** The stash stack is per-**repo**, not
per-worktree, and this checkout has ~17 live worktrees with other sessions
running concurrently. A `git stash pop` takes whatever is at `stash@{0}` _at
that moment_ — which may be another session's WIP pushed between your push and
your pop. That lands their work in your tree and leaves your fix on the stack.

Copy the file aside instead, revert it, and copy it back:

```bash
cp packages/sparkdown/src/compiler/utils/filterImage.ts "$SCRATCH/fix.ts"
git checkout -- packages/sparkdown/src/compiler/utils/filterImage.ts
```

Re-run the new test — it **must fail**, and fail for the reason in the ticket,
not on an import error or a typo. Then restore **from the copy**:

```bash
cp "$SCRATCH/fix.ts" packages/sparkdown/src/compiler/utils/filterImage.ts
```

`git checkout --` reverts to HEAD, so it restores the _pre-fix_ file — using it
to undo the revert silently throws the fix away. **Confirm the restore landed
before trusting anything downstream:**

```bash
git diff --stat
```

The file must still be listed. A test that passed alone and then fails in the
full suite is usually this, not a flake — check the diff before blaming timing.

Re-run — it must pass. Record both outcomes for the PR body.

Where a whole-file revert would break the test's imports (the fix adds an export
the test uses), simulate the old behaviour in place instead: disable the one
branch that matters, or restore the old function body under the new name. Keep a
**positive control** in the file — an assertion that passes both before and
after — so a red run proves the defect, not a broken harness.

**5c — run the suite.** Start with the file, widen to the package.

Then run the standalone shell checks under `.claude/`. Nothing in CI invokes them, so they only ever run because someone remembers to; they are quick, and each one pins a footgun that has already cost a session:

```bash
for t in .claude/**/*.test.sh; do echo "--- $t"; bash "$t" || echo "FAILED: $t"; done
```

(Needs `shopt -s globstar` in bash, or list them explicitly.)

---

### Running vitest safely

**Never run two vitest suites at once, and never run one uncapped.** This
monorepo has OOM'd and hard-crashed this machine. Check first:

Run this via the **PowerShell** tool (in bash, `$_` gets eaten by the shell):

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*vitest*' } | Select-Object ProcessId
```

Other worktrees frequently have runs in flight. If anything comes back, wait.

Single file:

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=1024" npx vitest run src/tests/compiler/constDeclarationValidity.test.ts --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1
```

```
 ✓ src/tests/compiler/constDeclarationValidity.test.ts (8 tests) 885ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

A directory, with a slightly larger cap:

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/tests/compiler --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2
```

`packages/sparkdown`'s full suite is ~156 files / ~1800 tests / ~28 min and is
at the edge of this machine even at `--max-old-space-size=4096`. **Never run it
in one go** — run it in halves, sequentially, waiting for each to fully exit:

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=4096" npx vitest run src/tests/compiler src/tests/runtime --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2
```

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=4096" npx vitest run src/tests/luau-conformance --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2
```

**Exit code 0 does not mean green.** Two OOM shapes both exit 0:
`Error: Worker exited unexpectedly` with no pass count; or the log simply
_stops_ with no `Test Files` / `Tests` summary at all. Confirm the summary lines
exist and the file count matches what you expected — a run can exit 0 having
completed 13 of 156 files and look perfectly clean. To count:

```bash
grep -c "✓ src/" testrun.log
```

Report the real numbers in the PR body. If a pre-existing failure is unrelated
to your change, say so explicitly rather than quietly ignoring it — confirm it
also fails on `origin/main`.

---

## 6. Commit, push, and open a draft PR

The PR opens before the adversarial review (§7) so the reviewers have a PR to comment on — findings live on the PR itself, tracked next to the code they criticize, instead of dying in a session transcript. Open it as a draft and mark it ready only at the end of §7.

First clean up scratch files, then look at what you are about to stage:

```bash
rm -f testrun.log
git status --short
```

Stage deliberately, by path. `git add -A` will happily commit a screenshot, a scratch `.sd`, or a crash dump some earlier command left behind:

```bash
git add packages/sparkdown/src/compiler/utils/filterImage.ts packages/sparkdown/src/tests/compiler/FilterImageLayers.test.ts
git status --short
git commit -F commit-msg.txt
git push -u origin fix/302-filterimage-layers
```

Write bodies to a file and pass `--body-file`. `@-` is a curl idiom; `gh` and `git` take it as the literal two-character string `@-` and exit 0, so the damage is invisible until you read the artifact back.

```bash
gh pr create --draft --title "fix(compiler): accumulate all matching filtered_layers (#302)" --body-file pr-body.md
```

Read it back — always:

```bash
gh pr view --json number,title,body,isDraft
```

PR body should carry:

- What broke and why, with `file:line`.
- The fix.
- The regression test — its path, and the red/green evidence from §5b ("fails on the pre-fix source with `<assertion>`, passes after").
- Suite results — which suites you ran and their actual `Test Files` / `Tests` counts. Note any pre-existing failure you confirmed also fails on `origin/main`.
- The before/after screenshots from §4 — or, when the change has no visual signature, the before/after measurement that replaces them, with absolute numbers and how they were taken.
- Any performance cost the fix carries, at the top of the body.

---

## 7. Adversarial code review (on the PR)

The goal is to break your own fix, not to admire it — and to have readers who weren't anchored by your reasoning do it, on the real diff. Every reviewer posts its findings as a comment on the PR, so nothing it finds can get lost when the session ends.

### 7a — size the review

Reviewers cost real tokens. Scale the count to the blast radius of the change instead of running a fixed ritual — four reviewers on a two-line fix burn tokens to find nothing.

| Tier        | Reviewers                                   | Applies when                                                                                                                                                         |
| ----------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal     | 1 — undirected only                         | Docs, comments, or config only; or a single-file fix of a few dozen lines whose callers you enumerated yourself and whose regression test pins the ticket behaviour. |
| Standard    | 2–3 — undirected + the most relevant lenses | A typical fix contained in one package.                                                                                                                              |
| High-impact | 4-5 — undirected + every applicable lens    | Compiler or runtime semantics, incremental-compile or serialization paths, generated-grammar sources, changes spanning packages, or a diff over ~300 lines.          |

When a diff sits between tiers, round up — a missed defect costs more than a reviewer. The undirected reviewer is never dropped, whatever the tier.

### 7b — reviewers never run on the writer's own model

A model reviewing code written by the same model shares the writer's priors — it finds the same things plausible and overlooks the same things. So the reviewer has to be a different model from you, and you have to choose it deliberately rather than letting it default to yours.

Two reviewer definitions in the repo pin an exact version: `.claude/agents/reviewer-opus-4-6.md` and `.claude/agents/reviewer-opus-5.md`, each naming a full model id in its frontmatter. Spawn one by name and the review runs on that version whatever your own is — `subagent_type: "reviewer-opus-4-6"` was confirmed running `claude-opus-4-6`, and `reviewer-opus-5` running `claude-opus-5`, from a session that had them.

| You (the writer)     | Spawn                                     |
| -------------------- | ----------------------------------------- |
| Opus 5               | `subagent_type: "reviewer-opus-4-6"`      |
| Opus 4.6             | `subagent_type: "reviewer-opus-5"`        |
| Fable, Sonnet, Haiku | `subagent_type: "reviewer-opus-5"`        |

Give these no `model:` — the definition's own frontmatter carries it, and the tool parameter cannot express a version anyway.

A definition has to be picked up by the harness before it can be spawned, and that can lag the file landing on disk — a newly added one showed up part-way through a run rather than at the moment it was written. Go by your agent-type list, not by the file: if a name is not in it yet, fall back to `subagent_type: "general-purpose"` and an explicit `model:`. That parameter takes four aliases — `sonnet`, `opus`, `haiku`, `fable` — and rejects anything else with an `InputValidationError` before a single agent starts, full model ids included. That set belongs to the harness rather than to this repo, and it has grown before, so treat it as observed on 2026-09-04 rather than fixed: if a value you expect to work is refused, read the current set back out of the rejection message and update this section and its check together. Each alias resolves to the current release of that family, so on this path pick a family that is not your own — an Opus writer takes `model: "fable"`, everyone else takes `model: "opus"`.

Never answer a rejection with your own family. An Opus writer that falls back to `"opus"` has bought itself a reviewer carrying all of its own blind spots, which is the single outcome this section exists to prevent.

Do not take the pin on trust. The reviewer prompt in §7c has each reviewer open its report with the model it is actually running as, so a review that landed on your own model is visible in the PR comment instead of passing for independent.

### 7c — fan out; each reviewer comments on the PR

Capture the diff once, so every reviewer sees the same artifact:

```bash
git diff origin/main...HEAD > review-diff.patch
```

(`...` is deliberate: changes on your branch since it diverged from `main`, not `main`'s subsequent commits.) The file is untracked — delete it before committing any review fixes, or it gets swept in.

Spawn the reviewers in parallel — one message, multiple Agent tool calls, each with the `subagent_type` from §7b (or `general-purpose` plus a `model:`, on the fallback path). Posting a PR comment needs Bash and a scratch file, so read-only is not tool-enforced for reviewers; the prompt forbids repo edits and §7d checks that it was obeyed. Give each one, verbatim (fill in N = issue number, P = PR number, LENS — the reviewer supplies its own model, so that one is not yours to fill in):

> You are reviewing a fix for issue #N in the Impower monorepo. The diff is in `review-diff.patch`; the working tree is the branch under review. Your lens is \<LENS\> — review only through it. Your job is to refute this change, not to approve it. Assume it is broken and find out how. If you are uncertain, report the concern rather than suppressing it. For each finding give: `file:line`, a concrete failure scenario (inputs → wrong output), and how you confirmed it in the code. Do not pad with non-findings. Do not edit, create, or delete any file inside the repo tree.
>
> When your review is done, post it as a comment on PR #P: write the full findings to a markdown file in your scratchpad directory (never inside the repo), starting with the heading `### Adversarial review — <LENS> (<MODEL>)`, where MODEL is the model name and id you yourself are running as, exactly as your own system prompt gives them — report what you are, never what you were asked to be. Then run `gh pr comment P --body-file <that file>`. Never pass `--body @-` — gh takes it as a literal string and posts a broken comment. If you have no findings, still post the comment with the single line "No findings through this lens." so the coverage is recorded. Confirm the comment landed by reading it back with `gh pr view P --comments`.
>
> **Whether or not the comment lands, return your full findings as your final report — the same markdown, in full.** If you cannot post at all (no `gh` on this machine, an auth failure, a denied permission), do not try to work around it and do not summarise: say in one line that you could not post and why, then return the whole report. The writer will post it for you.

Lenses — diversity matters far more than count; redundant reviewers find redundant things:

- Undirected — give this one no lens at all. Replace the `<LENS>` sentence with: "You have no assigned lens. Review the whole change however you see fit and report anything wrong with it." Every other reviewer is looking where you told it to look, which means they collectively share your blind spots; this one exists to find what the lens list forgot. It is always included, at every tier.
- Correctness at boundaries — empty input, single element, first/last iteration, and specifically the loop iteration or branch the original bug lived in.
- Incrementality — the compiler reuses constructed flows and short-circuits no-change compiles. Is this still correct on the second keystroke, not just a cold compile? Does it corrupt reused state?
- Blast radius — enumerate every caller of every changed function and argue each is unaffected, citing `file:line`. Any caller you cannot account for is a finding.
- Test honesty — does the §5 regression test pin the ticket's behaviour, or merely the shape of the patch? Would it catch the bug returning by a different route?
- Repo traps — check the Gotchas below against this diff: a generated `language/*.json` edited without its `definitions/yaml/*.yaml` source, a `.claude`-style ignore interaction, whitespace-significant display lines.

Add a lens when the diff warrants one (concurrency, serialization, asset pipeline). Skip one that cannot apply.

When the fan-out returns, check the tree before anything else:

```bash
git status --short
```

Revert anything a reviewer changed inside the repo — a reviewer that edits the tree has contaminated its own evidence.

Then confirm every expected comment is on the PR (`gh pr view P --comments`). **Every report that is not there, you post yourself, verbatim, one comment per reviewer, before you adjudicate.** Prefix each with a line saying you are posting on the reviewer's behalf and why it could not.

This is not the rare case. Whole environments have no `gh` at all — a remote or web session reaches GitHub through an integration instead, so `gh pr comment` fails for _every_ reviewer, not one. When that happens the temptation is to skip the posting and fold everything into your adjudication instead. Don't:

- **Your summary is not their review.** You are the author. The reports carry the `file:line` citations, the probes they actually ran, and the reasoning — including the parts you disagreed with, and the ones where a reviewer catches that your _correction_ to an earlier mistake was itself wrong. A summary written by the person being reviewed launders all of that.
- **The whole point of §7 is that findings outlive the session.** Findings that exist only in your adjudication are findings you chose which to preserve.
- **Post them even when you fixed everything.** Especially then — the fix is only checkable against the claim it answers.

Post them verbatim: do not trim, reorder, or correct them. Where a reviewer is wrong, say so in your adjudication, not by editing its words. Where a reviewer notes that the tree changed under it mid-review (it will, if you were iterating), keep that caveat — it tells the reader why a line number may not match.

### 7d — adjudicate, on the PR

Reviewer output is a hypothesis, not a verdict; subagents confidently report defects that do not exist. For every finding, confirm it yourself in the code before acting — a claimed `file:line` that doesn't say what the reviewer claims is a dead finding, full stop.

Then dispose of every finding where it lives — on the PR. Post one adjudication comment (again via `--body-file`) naming each finding and what happened to it:

- Fixed — with the commit sha.
- Declined — with the concrete reason.
- Not confirmed — the cited `file:line` does not say what the reviewer claimed.

Do not silently drop findings; an unanswered review comment on the PR reads as an open defect.

### 7e — re-verify, then mark ready

Any change made in response to review re-opens §4 and §5: re-run the regression test and re-take the live screenshot. A review fix is a code change like any other, and it is the one most likely to be committed unverified. Delete `review-diff.patch`, commit by path, push.

Then take the PR out of draft:

```bash
gh pr ready
```

---

## The driver

`node .claude/skills/resolve-issue/driver.mjs <command>`

| Command               | Does                                                  |
| --------------------- | ----------------------------------------------------- |
| `preflight`           | disk headroom, Playwright, `gh` auth, git repo        |
| `up [--cross-origin]` | boot both dev servers on pinned ports, wait for ready |
| `status`              | is it up? prints the editor URL                       |
| `down`                | kill the whole server tree                            |
| `verify [opts]`       | drive the editor, print a JSON report                 |

`verify` options: `--sd <file.sd>` (load into OPFS `/local/main.sd`, then
reload), `--line <N>` (scrub the preview to that source line), `--shot <out.png>`,
`--probe <file.js>` (body of an async function evaluated in the editor page;
its return value lands in the JSON), `--headed` (visible browser).

State lives in `.claude/skills/resolve-issue/.state.json` (gitignored).

Playwright is a **declared root devDependency** (`playwright: ^1.61.0`).
Browsers come from the local `ms-playwright` cache — if it's empty on a new
machine, `npx playwright install chromium`. Always run `npm install` with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` set (see §2) — otherwise a transitive
`@playwright/browser-chromium` dependency tries to download its own Chromium
build from a host this network blocks, and the whole install fails. The
driver itself doesn't need that variable: if the pinned `playwright` version
expects a Chromium revision the cache doesn't have, it launches whatever
build the cache does have instead of failing.

The driver must still live **inside the repo tree**: Node resolves `playwright`
relative to the **script's** directory, not the working directory. Copy it to a
temp dir and it dies with `ERR_MODULE_NOT_FOUND`.

---

## Gotchas

Things that look like they work and don't:

- **The Game Preview goes fully black if you hand-launch the two dev servers.**
  The editor and player agree over a postMessage handshake whose values are
  baked into each Vite bundle at build time, so a reload cannot fix a wrong one.
  Always go through `driver.mjs up` (or `npm run web:dev`) — never start
  `impower-dev` and `sparkdown-player-app` separately.
- **`npm run web:dev` picks random free ports.** The driver overrides them with
  `EDITOR_PORT`/`PLAYER_PORT`/`HMR_PORT` derived from the worktree path. This
  matters because **OPFS is scoped per origin**: a random port each launch means
  the project you loaded last time is gone. The pinned port keeps it.
- **Do not scrape the launcher's `✓ Live preview ready → URL` line.** A detached
  child on Windows never flushes stdio into an inherited file handle — the log
  stays 0 bytes forever while the servers run perfectly. Pin the port and poll
  HTTP instead.
- **A blank WHITE Game Preview is a different failure from a black one.** After
  a server restart the player iframe can load — `readyState: "complete"`,
  `sameOrigin: true` — while the `#game` scaffold never mounts, so the pane
  renders empty and every other signal looks healthy. The driver polls for
  `#game`, reloads once, and sets `gameMounted: false` if it still isn't there.
  Never accept a screenshot without checking that field.
- **Scrubbing only works while the preview is STOPPED.** After PLAY the engine
  is time-driven and ignores the cursor entirely; the scrub silently does
  nothing.
- **The editor restores the previous cursor position asynchronously after load**
  and clobbers the scrub — the preview then settles on the _old_ line. The
  restore can fire **late**, so checking the cursor once (even a second later)
  is not enough: it passes, then the restore wins. The driver requires the
  cursor to hold the target across three consecutive checks. Don't weaken that
  to a single check — the symptom is a confident report naming the line you
  asked for while `route` names a different one.
- **On a cold origin the first `selectionSet` is dropped** because the player
  worker isn't listening yet. The driver waits for the first compile to settle
  _before_ scrubbing. Without that you get beat 1–2 no matter what line you ask
  for.
- **Re-dispatching the same cursor position produces no event.** To re-arm a
  scrub you must bounce to another line and back.
- **A real (trusted) click on the target line is the most reliable scrub.**
  `view.dispatch({selection})` moves the caret, but the preview can silently
  fail to follow — the cursor sits on the line you asked for while `route`
  stays on the old beat, and nothing raises. If the hold-check and the bounce
  don't move the preview, scroll the line into view and `page.mouse.click()`
  its coordinates (`view.coordsAtPos(line.from)` gives them); a trusted event
  drives the real selection path.
- **`textContent` on the game DOM returns a wall of CSS** — the player injects
  `<style>` blocks and every ancestor inherits their text. And the typewriter
  effect wraps **every character** in its own `<span>`, so "leaf nodes with
  text" gives you one letter per entry. Use `innerText` (layout-aware, and it
  reflows the spans back into words).
- **The route indicator lives inside the player iframe**, not the editor
  document. Searching the editor DOM for `main : N → main : M` finds nothing.
- **Every visible line appears twice** in `visible`. The duplicate is the text
  **outline** layer the player draws underneath. Expected — not evidence that
  your change is emitting content twice.
- **Generated files silently revert. DO NOT EDIT THEM.**
  `packages/sparkdown/language/*.json` are build artifacts of
  `definitions/yaml/*.yaml`. Editing the JSON will _seem_ to work — tests will
  _seem_ to pass, the change will ship — and then the next `definitions` build
  erases it. Edit the YAML, not the JSON, regenerate, and commit both:
  ```bash
  cd definitions && npx tsx src/language.ts ../packages/sparkdown/language
  ```
  Grep for the **rule name**, not the regex — the YAML uses `{{WS}}`-style
  templating so the expanded pattern does not appear in the source.
- **Heredocs are lossy through some shell paths here** (a `//` comment came out
  as `/`, breaking a file mid-edit). Write files with the editor tool, not by
  piping a heredoc.
- **`tsc` is not a gate** — there is no CI typecheck anywhere in the repo, and
  the only PR workflow is the VS Code extension's _bundler_ build (esbuild
  strips types without checking them). A clean `tsc` proves nothing about CI,
  and a broken one blocks nothing. Verify with vitest.
  **This is being fixed — see
  [#320](https://github.com/ImpowerGames/impower/issues/320). When that lands on
  `main`, delete this bullet** and add the typecheck command to §5 alongside the
  test suite.
- These console messages are **pre-existing noise** on every run, not something
  your change caused: `Unhandled method workspace/semanticTokens/refresh`,
  `.../diagnostic/refresh`, `.../foldingRange/refresh`, and a couple of resource
  404s.

---

## Troubleshooting

| Symptom                                                                                                    | Cause → fix                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`                                                   | The script was run from outside the repo tree. Node resolves from the _script's_ directory — run `driver.mjs` at its committed path.                                                                                                                                                        |
| `driver.mjs up` times out after 15 min                                                                     | Read `npm run web:dev` output directly in the worktree; a workspace build error will show there. The detached log file is always empty (see Gotchas).                                                                                                                                       |
| Game Preview is black but the editor pane looks fine                                                       | Servers were hand-launched with mismatched origins. `down`, then `up`.                                                                                                                                                                                                                      |
| `verify` returns `preview.installed: false`                                                                | `window.__preview` only exists in same-origin mode. Don't pass `--cross-origin`.                                                                                                                                                                                                            |
| Game Preview pane is blank **white**; `gameMounted: false`                                                 | The `#game` scaffold never mounted after a server restart. `down`, `up`, retry. Discard the screenshot.                                                                                                                                                                                     |
| Scrub lands on the wrong beat; `scrubWarning` set                                                          | The target line isn't a playable beat — pick the indented dialogue/action line, not the `NAME:` line, a heading, or a blank line.                                                                                                                                                           |
| `verify` dies with `Timeout 90000ms exceeded` waiting for `.cm-content`                                    | The machine is saturated — usually a vitest suite running in this or another worktree. The server is fine (`status` says UP, the URL returns 200). Wait for the suite and re-run; don't go hunting for a regression.                                                                        |
| vitest exits 0 with no `Test Files` / `Tests` summary                                                      | An OOM'd worker was killed by the OS. Not a pass. Lower `maxForks`, split the suite.                                                                                                                                                                                                        |
| `minThreads and maxThreads must not conflict`                                                              | You passed `maxForks` without `minForks`. Always pass both.                                                                                                                                                                                                                                 |
| `npm install` dies `ENOSPC`; or `npx esbuild --version` / `npx vitest --version` fails to spawn (`EFTYPE`) | Disk was full; `node_modules` is silently corrupt (truncated binaries, empty dirs). `npm cache clean --force`, prune `%LOCALAPPDATA%\Temp`, delete **all** `node_modules` (root + every workspace — nested ones die with the parent), reinstall **once**. Piecemeal repair is whack-a-mole. |
| `npm install` dies with `request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"` (or any `@playwright/browser-chromium` download failure) | A workspace depends on `@playwright/browser-chromium`, whose install script tries to fetch its own Chromium build from a blocked host. Re-run as `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` — see §2. |
| `git worktree remove` → `Directory not empty`                                                              | Windows can't delete `node_modules` that way. `Remove-Item -Recurse -Force <path>`, then `git worktree prune`.                                                                                                                                                                              |
| A `gh` PR/issue body came out as the literal `@-`                                                          | You used `--body @-`. Use `--body-file`, then read it back with `gh pr view --json body`.                                                                                                                                                                                                   |
