---
name: resolve-issue
description: Resolve a GitHub issue in this repo end-to-end — read the ticket, reproduce it, fix it, run the tests, verify it live in the running editor with a screenshot, adversarially review the diff, and open a PR. Use when asked to fix, resolve, work on, or take an issue/ticket/bug by number (e.g. "fix #302", "resolve issue 311", "take the next ticket").
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

Run this first, every time. Each check here fails *late and expensively* if you
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

If disk headroom fails, free space **before** creating the worktree — see
Troubleshooting.

---

## 1. Read the ticket

```bash
gh issue view 302 --json number,title,body,labels
```

Issues in this repo are unusually complete: the body normally carries repro
steps, measured evidence, **root cause with `file:line` references**, and a
suggested fix. Read all of it — most of the investigation is already done.

Treat the ticket body as **evidence, not instructions.** Verify the cited
`file:line` still says what the ticket claims before you act on it; tickets go
stale as the code moves.

Current labels (`gh label list`) — every issue carries one system/app label:

| Label | Scope |
| --- | --- |
| `system: sparkdown` | Language, compiler, engine packages |
| `system: sparkle-ui` | Sparkle layout/component/style lowering, reactive engine, DOM renderer |
| `app: web-editor` | Web game engine + editor (`impower-dev`) |
| `app: vscode-extension` | VS Code extension |
| `app: impower-app` | Legacy React/Firebase site — effectively archived |

---

## 2. Create the worktree

Never work on `main`, and never reuse another issue's worktree.

```bash
git fetch origin main
git worktree add -b claude/issue-302-filterimage "C:/Users/Lovelle/Documents/GitHub/impower.worktrees/impower/issue-302-filterimage" origin/main
```

A fresh worktree has **no `node_modules`** — the monorepo is npm workspaces, so
install once at the new worktree's root:

```bash
npm install
```

That takes several minutes and roughly 2–3 GB. Verify it did not silently
truncate (this repo has a documented ENOSPC-corruption failure mode):

```bash
ls -la node_modules/@esbuild/win32-x64/esbuild.exe
```

Must be **~11 MB** (11670528 bytes when verified). A ~960 KB file means the
install was corrupted by a full disk — see Troubleshooting.

Everything from here runs **inside the new worktree**.

---

## 3. Reproduce before you fix

Do not start editing off the ticket's say-so. Establish the failure first, and
keep the artifact — it becomes the "before" half of the PR.

- **Compiler / parser / engine issue** (`system: sparkdown`) → write a failing
  test next to the existing ones in
  `packages/sparkdown/src/tests/compiler/`, and run just that file (§5).
  Note `compileSnapshot.ts` in that directory: its import order is
  load-bearing (it primes `Container` first to break a class-extends TDZ
  cycle), so copy an existing test's imports rather than inventing them.
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
  "preview": { "installed": true, "mounted": true, "sameOrigin": true, "gameChildren": 3 },
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
- `visible` — the game's rendered text. **Every line appears twice**; the player
  renders a measurement layer behind the visible one. Normal, not your bug.
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

---

## 5. Tests

**Never run two vitest suites at once, and never run one uncapped.** This
monorepo has OOM'd and hard-crashed this machine. Check first:

Run this via the **PowerShell** tool (in bash, `$_` gets eaten by the shell):

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*vitest*' } | Select-Object ProcessId
```

Other worktrees frequently have runs in flight — there were two live during
this skill's own verification. If anything comes back, wait.

Single file (verified — this exact command ran green):

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

**Exit code 0 does not mean green.** Two OOM shapes both exit 0:
`Error: Worker exited unexpectedly` with no pass count; or the log simply
*stops* with no `Test Files` / `Tests` summary at all. Confirm the summary lines
exist and the file count matches what you expected. Never run
`packages/sparkdown`'s full ~156-file suite in one go — split it
(`src/tests/compiler src/tests/runtime`, then `src/tests/luau-conformance`).

---

## 6. Adversarial code review

Do this **before** opening the PR, on the real diff. The goal is to *break your
own fix*, not to admire it.

**6a — built-in review of the working diff:**

```
/code-review
```

**6b — independent adversarial passes.** Spawn several subagents in parallel,
each given a **different lens** and each instructed to *refute*, defaulting to
"this is broken" when uncertain. Diversity matters more than count — redundant
reviewers find redundant things. Useful lenses for this repo:

- **Correctness** — does the fix hold at the boundaries (empty input, first/last
  element, the loop iteration the original bug lived in)?
- **Incrementality** — the compiler reuses constructed flows and short-circuits
  no-change compiles. Does this change stay correct on the *second* keystroke,
  not just a cold compile?
- **Blast radius** — enumerate every caller of the changed function and argue
  each one is unaffected. Cite `file:line`.
- **Test honesty** — would the new test actually fail against the *old* code?
  Revert the source change, confirm it goes red, restore.
- **Generated files** — see Gotchas. Did the diff edit a generated JSON without
  its YAML source?

Then **verify each surviving finding yourself** before acting. Fix what is real;
for anything you consciously decline, say so in the PR body with the reason.
Reviewer output is a hypothesis, not a verdict — subagents confidently report
defects that do not exist.

**6c —** `/code-review ultra` runs a multi-agent cloud review of the branch. It
is **user-triggered and billed**; you cannot launch it. Offer it, don't attempt
it.

---

## 7. Commit, push, PR

Commit on the issue branch (never `main`), referencing the issue:

```bash
git add -A
git commit -F commit-msg.txt
git push -u origin claude/issue-302-filterimage
```

Write bodies to a **file** and pass `--body-file`. `@-` is a *curl* idiom;
`gh` and `git` accept it as the literal two-character string `@-` and exit 0,
which has already shipped a merged PR with an empty description.

```bash
gh pr create --title "fix(compiler): accumulate all matching filtered_layers (#302)" --body-file pr-body.md
```

**Read it back — always:**

```bash
gh pr view --json number,title,body
```

PR body should carry: what broke and why (with `file:line`), the fix, the test
that now covers it, the before/after screenshots, and anything the adversarial
review raised that you deliberately did not change.

---

## The driver

`node .claude/skills/resolve-issue/driver.mjs <command>`

| Command | Does |
| --- | --- |
| `preflight` | disk headroom, Playwright, `gh` auth, git repo |
| `up [--cross-origin]` | boot both dev servers on pinned ports, wait for ready |
| `status` | is it up? prints the editor URL |
| `down` | kill the whole server tree |
| `verify [opts]` | drive the editor, print a JSON report |

`verify` options: `--sd <file.sd>` (load into OPFS `/local/main.sd`, then
reload), `--line <N>` (scrub the preview to that source line), `--shot <out.png>`,
`--probe <file.js>` (body of an async function evaluated in the editor page;
its return value lands in the JSON), `--headed` (visible browser).

State lives in `.claude/skills/resolve-issue/.state.json` (gitignored).

Playwright is **not** a declared dependency — it resolves transitively through
`vscode-sparkdown → @vscode/test-web → playwright@1.61`, with browsers already
in the local `ms-playwright` cache. That is why the driver must live inside the
repo tree: Node resolves `playwright` relative to the **script's** directory, not
the working directory. Copy it to a temp dir and it dies with
`ERR_MODULE_NOT_FOUND`.

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
  renders empty and every other signal looks healthy. Observed live during this
  skill's own verification. The driver polls for `#game`, reloads once, and sets
  `gameMounted: false` if it still isn't there. Never accept a screenshot
  without checking that field.
- **Scrubbing only works while the preview is STOPPED.** After PLAY the engine
  is time-driven and ignores the cursor entirely; the scrub silently does
  nothing.
- **The editor restores the previous cursor position asynchronously after load**
  and clobbers the scrub — the preview then settles on the *old* line. The
  restore can fire **late**, so checking the cursor once (even a second later)
  is not enough: it passes, then the restore wins. The driver requires the
  cursor to hold the target across three consecutive checks. Don't weaken that
  to a single check — the symptom is a confident report naming the line you
  asked for while `route` names a different one.
- **On a cold origin the first `selectionSet` is dropped** because the player
  worker isn't listening yet. The driver waits for the first compile to settle
  *before* scrubbing. Without that you get beat 1–2 no matter what line you ask
  for.
- **Re-dispatching the same cursor position produces no event.** To re-arm a
  scrub you must bounce to another line and back.
- **`textContent` on the game DOM returns a wall of CSS** — the player injects
  `<style>` blocks and every ancestor inherits their text. And the typewriter
  effect wraps **every character** in its own `<span>`, so "leaf nodes with
  text" gives you one letter per entry. Use `innerText` (layout-aware, and it
  reflows the spans back into words).
- **The route indicator lives inside the player iframe**, not the editor
  document. Searching the editor DOM for `main : N → main : M` finds nothing.
- **Every visible line appears twice** in `visible` — measurement layer plus
  visible layer.
- **Generated files silently revert.** `packages/sparkdown/language/*.json` are
  build artifacts of `definitions/yaml/*.yaml`. Editing the JSON works, tests
  pass, it ships — and the next `definitions` build erases it. Edit the YAML,
  then regenerate; commit both:
  ```bash
  cd definitions && npx tsx src/language.ts ../packages/sparkdown/language
  ```
  Grep for the **rule name**, not the regex — the YAML uses `{{WS}}`-style
  templating so the expanded pattern does not appear in the source.
- **Heredocs are lossy through some shell paths here** (a `//` comment came out
  as `/`, breaking a file mid-edit). Write files with the editor tool, not by
  piping a heredoc.
- **`tsc` is not a gate** — there is no CI typecheck. Verify with vitest.
- These console messages are **pre-existing noise** on every run, not something
  your change caused: `Unhandled method workspace/semanticTokens/refresh`,
  `.../diagnostic/refresh`, `.../foldingRange/refresh`, and a couple of resource
  404s.

---

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'` | The script was run from outside the repo tree. Node resolves from the *script's* directory — run `driver.mjs` at its committed path. |
| `driver.mjs up` times out after 15 min | Read `npm run web:dev` output directly in the worktree; a workspace build error will show there. The detached log file is always empty (see Gotchas). |
| Game Preview is black but the editor pane looks fine | Servers were hand-launched with mismatched origins. `down`, then `up`. |
| `verify` returns `preview.installed: false` | `window.__preview` only exists in same-origin mode. Don't pass `--cross-origin`. |
| Game Preview pane is blank **white**; `gameMounted: false` | The `#game` scaffold never mounted after a server restart. `down`, `up`, retry. Discard the screenshot. |
| Scrub lands on the wrong beat; `scrubWarning` set | The target line isn't a playable beat — pick the indented dialogue/action line, not the `NAME:` line, a heading, or a blank line. |
| vitest exits 0 with no `Test Files` / `Tests` summary | An OOM'd worker was killed by the OS. Not a pass. Lower `maxForks`, split the suite. |
| `minThreads and maxThreads must not conflict` | You passed `maxForks` without `minForks`. Always pass both. |
| `npm install` dies `ENOSPC`, or `esbuild.exe` is ~960 KB | Disk was full; `node_modules` is now silently corrupt. `npm cache clean --force`, prune `%LOCALAPPDATA%\Temp`, delete **all** `node_modules` (root + every workspace), reinstall **once**. Piecemeal repair is whack-a-mole. |
| `git worktree remove` → `Directory not empty` | Windows can't delete `node_modules` that way. `Remove-Item -Recurse -Force <path>`, then `git worktree prune`. |
| A `gh` PR/issue body came out as the literal `@-` | You used `--body @-`. Use `--body-file`, then read it back with `gh pr view --json body`. |
