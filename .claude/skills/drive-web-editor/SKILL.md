---
name: drive-web-editor
description: See a change running in the web editor and game preview through the committed driver, which boots both dev servers on pinned ports, loads a .sd repro, scrubs the preview to a line, drives the editor's own panels and screens, and writes screenshots you then look at. Invoked by resolve-issue and file-bug at their verification and reproduction steps, and usable directly whenever a change under impower-dev/ or packages/ needs to be seen rather than reasoned about.
---

# Drive the web editor

The driver committed beside this file boots the editor and player, loads a script into the editor's OPFS, drives the preview and the editor's own surfaces, and writes PNGs. All paths are relative to the repo root (the directory whose `package.json` is named `impower-monorepo`), and every command runs from inside the worktree under test.

```
node .claude/skills/drive-web-editor/driver.mjs <command>
```

| Command               | Does                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `preflight`           | disk headroom, Playwright, `gh` auth, git repo                     |
| `up [--cross-origin]` | boot both dev servers on pinned ports, wait for ready              |
| `status`              | is it up? prints the editor URL                                    |
| `down`                | kill the whole server tree                                         |
| `verify [opts]`       | drive the game preview, print a JSON report                        |
| `ui [steps]`          | drive the editor's own panels and screens                          |
| `redgreen [opts]`     | prove a regression test fails on the base and passes on the fix (the write-regression-test skill) |

`verify` options: `--sd <file.sd>` (load into OPFS `/local/main.sd`, then reload), `--line <N>` (scrub the preview to that source line), `--shot <out.png>`, `--probe <file.js>` (body of an async function evaluated in the editor page; its return value lands in the JSON), `--headed` (visible browser).

`verify` scrubs with a real mouse click on the target line, driven through Playwright. It scrolls the line into view by moving the scroller directly, checks that the coordinates are really over the text rather than an overlay, then clicks. Nothing in that path dispatches a CodeMirror selection.

`ui` steps are tabulated below. It finds a panel by the class its CodeMirror `Panel` sets on its root (`.cm-search`, `.cm-gotoLine`) and a field by its `name`; it finds a tab by the `-trigger-<value>` suffix of its id, where the value is the workspace's own name for the pane or panel; it decides which screen is on display by which pane's inner tab row is mounted (`main` for logic, `files` for assets, `game` for share), because the screen tab's own highlight is blank on a fresh load. None of that is a test hook added to the app; if a surface you need has no such handle, adding one is in scope (#423).

`redgreen` runs no browser; `redgreen.mjs` beside the driver holds the implementation and `redgreen.test.mjs` pins it on a throwaway repository. The write-regression-test skill is where its options and its report are explained.

State lives in `.claude/skills/drive-web-editor/.state.json` (gitignored).

Playwright is a declared root devDependency (`playwright: ^1.61.0`). Browsers come from the local `ms-playwright` cache; if it is empty on a new machine, `npx playwright install chromium`. Always run `npm install` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` set, because a transitive `@playwright/browser-chromium` dependency otherwise tries to download its own Chromium build from a host this network blocks and the whole install fails. The driver itself does not need that variable: if the pinned `playwright` version expects a Chromium revision the cache does not have, it launches whatever build the cache does have instead of failing, and `preflight` reports that as `launches (fallback build: ...)`, which is still a pass.

The driver must live inside the repo tree: Node resolves `playwright` relative to the script's directory, not the working directory. Copy it to a temp dir and it dies with `ERR_MODULE_NOT_FOUND`. The same applies to any script of your own that imports the driver's exported helpers: put it under the worktree (and never `git add` it), not in the scratchpad.

---

## 1. The game preview

A change is not done until you have looked at it running where it runs. Passing tests are necessary, never sufficient; this is a hard rule from `CLAUDE.md`, and it applies to compiler fixes too, because the compiler exists to feed this preview.

Boot the servers once per session:

```bash
node .claude/skills/drive-web-editor/driver.mjs up
```

Expected (the port is derived from the worktree path, so it is stable for this worktree and unique across the worktrees on this machine):

```
launching dev servers (same-origin) pid 33964 → http://localhost:39364
COLD build takes 4-8 min (esbuild builds every worker bundle). Waiting...
READY http://localhost:39364   (mode: same-origin)
```

Then drive it:

```bash
node .claude/skills/drive-web-editor/driver.mjs verify --sd repro.sd --line 8 --shot before.png
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

How to read it, before trusting the PNG:

- `gameMounted: false` (with an `error`): the game never mounted and the Game Preview pane is blank white. The screenshot is not evidence. `down`, `up`, retry. (`neededReload: true` means it only mounted after the driver reloaded the page; fine, just slower.)
- `scrubCheck`: whether the scrub landed. Three outcomes, and the middle one is a real answer rather than a soft failure:
  - `landed`: the target line's own text is on screen. No warning is set.
  - `elsewhere`: some other line's text is on screen instead, and `showing` names which. A genuinely failed scrub; the screenshot is not evidence about the line you asked for.
  - `inconclusive`: nothing attributable. Either the line does not render verbatim (interpolation, markup, a heading, a character-name line) or its text cannot be told apart from another line's. Read `visible` and judge it yourself; do not read it as either success or failure.
- `route`: `main : 1 → main : 8` means the preview paused on beat 8. Context only. That number reports how far execution reached, not the line you asked for, so it differs from your target on any line with something after it; nothing in the driver treats it as a check.
- `visible`: the game's rendered text, which is what `scrubCheck` reads. Every line appears twice: the second copy is the text outline layer. Expected, not duplicated output.
- `scrub`: the click that drove the scrub. `clicked: true` with a `cursorLine` matching your target is the click landing. `clicked: false` carries a `reason` instead, and that is a real failure worth reading.
- `settled: false`: the DOM never stopped mutating. Re-run.
- `editorPaintWarning`: the script editor was settled but had not painted its lines and gutter within 5 s of the screenshot. The game half of the PNG is still evidence; the editor half may be blank, so do not present that PNG as a picture of the editor. Re-run for one that is.

`--sd` is only needed when the script changes: the pinned port keeps the same origin, so OPFS survives `down`/`up` and a plain `verify --line N --shot x.png` re-uses the script already loaded.

Then open the PNG and look at it. The JSON is a convenience, not the gate. A black Game Preview pane with a plausible-looking `route` is a real failure mode here.

A minimal `.sd` that exercises heading and dialogue (dialogue is `NAME:` followed by an indented body; copy syntax from a passing fixture rather than from memory when the repro needs more than this):

```
$:
  A MOONLIT ROOFTOP

ALICE:
  Hello from the driver.

BOB:
  Line two of the repro.
```

Repeat after the fix to produce `after.png`. Stop the servers when done:

```bash
node .claude/skills/drive-web-editor/driver.mjs down
```

---

## 2. The editor's own interface

`verify` reaches the game preview and nothing else. A change to the find panel, the go-to-line panel, the file list, the asset views, or the screens the bottom tabs switch between is invisible to it, and a `verify` screenshot of such a change is not evidence. Use `ui` instead: it performs the steps you give it, in order, as a user would (panels open on their own shortcut, text goes in as real keystrokes, screens switch by clicking the tab) and then reads every surface back.

```bash
node .claude/skills/drive-web-editor/driver.mjs ui --sd repro.sd --open find --type "search=Hello" --type "replace=Goodbye" --shot-of find panel.png --shot page.png
```

Verified output shape (steps first, then the read-back; `url`, `startedOn`, `ui.tabs` and `consoleErrors` are also present and omitted here, as is the run's top-level `editorSettled`, which is set only when an editor was expected where the run started):

```json
{
  "steps": [
    { "sd": "repro.sd", "wroteChars": 171, "editorSettled": true, "previewSettled": true, "editorView": "main" },
    { "surface": "find", "open": true, "pressed": "Control+f" },
    { "field": "search", "typed": true, "text": "Hello", "readBack": "Hello", "matches": true },
    { "field": "replace", "typed": true, "text": "Goodbye", "readBack": "Goodbye", "matches": true },
    { "of": "find", "screenshot": "C:\\...\\panel.png" },
    { "of": "page", "screenshot": "C:\\...\\page.png" }
  ],
  "ui": {
    "screen": "logic",
    "panelTab": "main",
    "find": { "open": true, "search": "Hello", "replace": "Goodbye", "matches": "1 of 3", "toggles": { "case": false, "word": false, "re": false } },
    "goto": { "open": false },
    "cursorLine": 5
  },
  "failed": []
}
```

The steps, each usable any number of times and in any order. Every name is checked before the browser launches, so a misspelt panel, field, button, screen or shot target, or a flag with no value, is refused at once rather than after the run:

| Step                     | Does                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--sd <file.sd>`         | load the script into OPFS and reload, as `verify` does; then waits for the editor view to settle (`editorSettled`) and, where the game preview is observable, for the first compile (`previewSettled`; `previewNote` says when it is not: cross-origin mode, or the preview showing the screenplay) |
| `--screen <name>`        | click a tab: `logic`, `assets`, `share`, or a tab inside a pane (`main`, `scripts`, `files`, `urls`, `game`, `screenplay`); a main screen counts as active once its own content is mounted |
| `--open <panel>`         | `find` (Ctrl+F) or `goto` (Ctrl+G); waits for the panel to be on screen; needs the script editor, so the logic screen's `main` tab                     |
| `--close <panel>`        | Escape from inside it                                                                                                                                 |
| `--type <field>=<text>`  | real keystrokes into `search`, `replace`, or `line`; opens the panel if needed; a literal `\n` becomes Ctrl+Enter, the field's own line break           |
| `--press <combo>`        | one key combo, e.g. `Control+Shift+G`; a shifted lowercase letter is uppercased first (see Gotchas); the `+` key is written `Control++`                |
| `--click <button>`       | a panel button by name: `next`, `prev`, `select`, `replace`, `replaceAll`, `close`, `submit`; goes to whichever owning panel is open                    |
| `--toggle <option>`      | flip a find-panel checkbox: `case`, `re`, `word`; reports the state it ended in                                                                        |
| `--shot <out.png>`       | the whole page                                                                                                                                        |
| `--shot-of <what> <png>` | one surface: `find`, `goto`, `editor` (the script editor), or `page`                                                                                  |
| `--probe <file.js>`      | as in `verify`                                                                                                                                        |

How to read it:

- Every `--type` reports `readBack` (the field's rendered text, which is what a user sees; the panel's own reader agrees with it on anything `--type` can type and differs only on a non-breaking space that arrives by paste) and `matches`. A `matches: false` carries a `reason` and lands in `failed`: either the keystrokes did not land or the field changed what it was given, and both are findings, not noise; a `--type` refused by the editor gate also reads `matches: false`, with `typed: false, gated: true` and the gate's reason, and typed nothing.
- `failed` lists every step that could not do what it was asked (a panel that never appeared, a tab not on the page, a read-back that differs, a step that threw). An empty list with the screenshot you wanted is the pass; a non-empty list means the screenshot is of something else. A step that fails never discards the report: the steps before it, their screenshots, and the read-back are still there.
- `ui.screen` is the screen whose content is on display, read from the pane itself rather than from the tab highlight; on a fresh load the app highlights no screen tab at all, so the highlight would say "none" while the logic screen is plainly showing. `ui.panelTab` is the selected tab inside it. `ui.find.matches` is the panel's own match counter, which is what tells you a search took.
- The script editor exists only on the logic screen, on its `main` tab or in its fullscreen scripts view when another script file is open, and the persistent browser profile remembers which screen, tab and view were last on display. `ui.editorView` says which: `main`, `scripts-view`, or null. In `scripts-view` the editor on screen is the other file while `--sd` still writes `main.sd`, and no `main` tab exists to click; the view's own header button is the way back, and `ui` has no step for it, so leave the editor on `main.sd` when you finish a run. A run that ends on `assets`, `share`, or the logic screen's `scripts` tab leaves the next run starting there; a panel step then reports `the script editor is not on screen (active screen: assets, tab: files); put --screen logic before this step` (or `(active screen: logic, tab: scripts); put --screen main before this step`) in `failed` rather than running. Put `--screen logic --screen main` first when the previous run may have left the profile on `assets`, `share`, or the `scripts` tab: the `main` tab exists only inside the logic pane, so from another screen the logic click has to come first, and from the `scripts` tab the `main` click is the one that matters (`--screen logic` there reports `active: true, editorHere: false` with a `note` saying so). A switch that lands on the editor (`--screen logic` onto the `main` tab, or `--screen main`) always waits up to 20 s for it and then settles it with a 15 s budget, whatever the run has settled before, because the switch mounted a fresh view; those are also the budgets a gated step uses before any settle has happened in the run; it fails the step with `editorHere: false` if the editor never mounts, or with `editorSettled: false` if it mounts but keeps being replaced for 15 s, and reports `editorSettled: true` when the switch did the settling. A `--screen logic` that is followed at once by `--screen main` does not fail for an editor the main switch is about to wait for; it carries a `note` instead, and the main switch gives the verdict. Followed by anything else, a logic switch whose editor never mounts fails as any other. A gated `--shot` or `--shot-of` also waits up to 5 s for the editor to have painted its lines and gutter, because a settled view can still be a blank pane, and fails the step if it has not; `verify` does the same wait before its screenshot and, since its evidence is the game preview, reports an `editorPaintWarning` instead of failing. That recovery does not apply to the fullscreen scripts view, which has no tab row: `--screen main` there reports that the view is open and that its own header button is the way back, and `ui` has no step for that button. A run does not fail at its start for a slow editor; a step that captures or acts on the screen (`--shot`, `--shot-of`, `--press`, and the panel-opening steps `--open` and `--type`) waits for an expected editor to mount and settle at the moment it runs, and fails with that reason if it does not, so the failure lands on the step that would otherwise have captured a page still loading. "Expected" is decided by the pane that is mounted; a page with no pane mounted yet counts as expected and waits. The wait is paid once per run, and any settle the run already did counts (at the start, after `--sd`, or in a `--screen` step that landed on the editor, all with the gate's own 15 s budget): later steps re-check with 8 s budgets for the mount and the settle, and a failure names the budget it used. After one step has given up, later gated steps take a two-second look and, if the give-up was a view that never settled, a six-second re-settle; they fail at once with `still not up` or `still being replaced` naming the step that first reported it, or clear the give-up and proceed with the run's current budgets (the shorter ones if any settle already happened) once the editor is back: a missing editor needs only the two-second look to have found it, a replaced one also needs the re-settle. A `--sd` reload resets the gate, since the settled view is gone with the page. A step on a screen where no editor is expected is never refused, whatever an earlier step found. A gate failure keeps the presence check's navigational advice (`put --screen main before this step`) when there is one, and otherwise says once to re-run. The settle check reads the editor view's own identity and document length, not the page's DOM going quiet, so an animating preview or a busy language server does not fail it. `--probe` is never gated, so a probe can diagnose a page whose editor will not mount. The start records `editorSettled` and, when the editor was expected and not yet up, or the run began on the `scripts` tab, a `startNote`. `verify` reports `editorView` and, when the logic pane is showing another file, an `editorWarning`; `ui --sd` fails its step in that state, since the file it wrote is not the one on screen. `verify` switches back on its own (the logic screen tab, then the `main` tab if the profile was on `scripts`) and reports `switchedToLogic: true` for a click that changed the screen or tab, whether or not the editor then came up (`gameMounted` and `error` say that); if it still cannot reach the editor it prints a report with `gameMounted: false` and an `error` naming the screen, and exits 1.
- A non-empty `failed` exits 1. `ui --sd x.sd --shot out.png && open out.png` cannot open a screenshot of the wrong document under a green shell.
- `ui.screens` lists every main screen whose content is mounted (the pane's inner tab row, or for logic the script editor itself, since the logic pane's fullscreen scripts view mounts no tab row); `ui.screen` is set only when that is exactly one, and null when it is none, which is what a page still loading looks like. The app mounts one pane at a time. Every editor selector the driver uses is scoped to the script editor's own root (`.sparkdown-script-editor-root`): the screenplay preview in the right-hand pane is a CodeMirror editor too, and an unscoped `.cm-content` would find it from any screen and type into it.
- The preview pane remembers screenplay mode across runs as well. In that mode the game never mounts, so `verify` clicks the preview's "Preview Game" button itself and reports `switchedToGamePreview: true`; `ui --sd` does not switch (it may be what you are testing) and reports `previewNote` instead.

Then open the PNG and look, as with `verify`. `--shot-of find` crops to the panel, which is the right picture for a panel change and useless for anything else; take `--shot` as well when the change could have moved something outside the panel.

The browser helpers `ui` is built from (`withEditor`, `writeMainSd`, `waitForEditor`, `openSurface`, `typeInto`, `pressKey`, `switchScreen`, `readSurfaces`, `shotOf` and the rest) are exported from `driver.mjs` for the case `ui` does not cover. Import them from a script that lives inside the repo tree (Node resolves `playwright` from the importing script's directory, not from the working directory), and prefer adding the missing step to `ui` over leaving the script behind.

Two surfaces `ui` has no step for yet: the hover tooltip and the completion list with its info panel. Both are language-server surfaces rather than panels, and neither `--probe` nor a synthetic event opens one; a hover needs real pointer movement, and the completion list needs real keystrokes followed by a wait for the server to answer. Drive `page.mouse.move` and `page.keyboard.type` from a script built on the exported helpers.

When what you are checking is an image on one of those surfaces, measure the rendered rect, never `naturalWidth`/`naturalHeight`. An SVG whose root declares only a `viewBox` reports a non-zero natural size while laying out at 0 × 0, and an image that failed to load reports `complete: true` with a natural size of 0, so `natural` tells you neither what is drawn nor whether it loaded. `getBoundingClientRect()` on the `<img>` is the answer, and the screenshot is the check.

---

## 3. When the change has no visual signature

Some fixes cannot show up in a screenshot: a perf change, a memory leak, an internal data structure no pixel depends on. Two before/after PNGs that look identical prove nothing, and presenting them as the gate is worse than useless; they read as evidence while carrying none.

For those, the gate is a measured before/after, and it replaces the screenshot rather than sitting alongside a pair of identical images. Still boot the editor and confirm nothing visible broke; just do not dress that up as proof the fix worked.

What makes a timing here honest:

- One candidate per process. A shared process inflates whatever runs second by several times. Run the baseline and the patch as separate commands.
- Interleave and take medians. Run-to-run variance on this machine is large enough to invert a real 2× difference. Three alternating pairs is the minimum.
- Carry a control: a second measurement the change should not affect. If the control moves as much as the candidate, the pair is noise; measure again.
- Size the fixture until the phase you changed is a visible share of the whole, and check that by timing the phase itself as well as the total. The first fixture reached for is usually too small: a 60-scene and a 400-scene script both put one session's change inside run-to-run noise, and only more content per scene made it readable. If the total moves no more than the control does, the fixture is too small; scale it up rather than concluding there is no effect, and scale what the phase actually processes (content per unit), not just the count of units.
- Report absolute numbers, not just ratios. "2×" hides whether that is 4ms → 8ms or 400ms → 800ms.
- Say where the number came from. If no benchmark in the repo covers the path (several do not; `perfProfile.test.ts` drives `SparkdownCompiler`, whose annotate set excludes `formatting` and `semantics`), say the figure comes from a scratch harness and name what it drove.

Same shape for a memory or count regression: measure the quantity over a fixed number of operations, before and after, and report both numbers.

A screenshot can also be misleading rather than merely uninformative. Display text lays out with collapsing whitespace (the game text style is `white_space: pre-line`), so one space and several look the same on screen while the letter-by-letter typing pauses differently. For anything about whitespace or timing, assert on the string the engine actually consumes and treat the screenshot as a sanity check only. The engine's own test shows the working recipe (`packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.test.ts`, `createModule` and `render`): build a bare game context carrying `context.system`, `context.character` and `context.config.interpreter.directives`, construct `new InterpreterModule(game)` and call `setup()`, then `module.parse(source, target).text?.[target] ?? []` is the array of text instructions; join their `.text` fields yourself for the string. `parse` is an instance method, so `InterpreterModule.parse(...)` on the class throws.

A performance cost the fix knowingly carries is a headline, not a footnote: put it at the top of the PR body.

---

## Gotchas

Things that look like they work and do not:

- The Game Preview goes fully black if you hand-launch the two dev servers. The editor and player agree over a postMessage handshake whose values are baked into each Vite bundle at build time, so a reload cannot fix a wrong one. Always go through `driver.mjs up` (or `npm run web:dev`); never start `impower-dev` and `sparkdown-player-app` separately.
- `npm run web:dev` picks random free ports. The driver overrides them with `EDITOR_PORT`/`PLAYER_PORT`/`HMR_PORT` derived from the worktree path. This matters because OPFS is scoped per origin: a random port each launch means the project you loaded last time is gone. The pinned port keeps it.
- Do not scrape the launcher's `✓ Live preview ready → URL` line. A detached child on Windows never flushes stdio into an inherited file handle; the log stays 0 bytes forever while the servers run perfectly. Pin the port and poll HTTP instead.
- A blank white Game Preview is a different failure from a black one. After a server restart the player iframe can load (`readyState: "complete"`, `sameOrigin: true`) while the `#game` scaffold never mounts, so the pane renders empty and every other signal looks healthy. The driver polls for `#game`, reloads once, and sets `gameMounted: false` if it still is not there. Never accept a screenshot without checking that field.
- Scrubbing only works while the preview is stopped. After PLAY the engine is time-driven and ignores the cursor entirely; the scrub silently does nothing.
- The editor restores the previous cursor position asynchronously after load and clobbers the scrub; the preview then settles on the old line. The restore can fire late, so checking the cursor once (even a second later) is not enough: it passes, then the restore wins. The driver requires the cursor to hold the target across three consecutive checks. Do not weaken that to a single check; the symptom is a confident report naming the line you asked for while `route` names a different one.
- On a cold origin the first `selectionSet` is dropped because the player worker is not listening yet. The driver waits for the first compile to settle before scrubbing. Without that you get beat 1–2 no matter what line you ask for.
- A selection that does not change produces no event, so a click landing exactly where the caret already sits scrubs nothing. The driver aims a few characters into the line to avoid it, and refuses the click with a `reason` when it cannot, which is every empty line, there being no character to aim past. Blank lines are unscrubbable, not merely discouraged.
- The preview keeps the position the last run left it on, because the profile and the origin are both pinned and the editor restores the previous cursor. So a run that scrubs to the line a previous run already reached looks like a success whether or not this run's scrub did anything, and a run whose scrub fails silently shows the previous run's beat rather than an obvious error. When you are testing the scrub itself rather than using it, always aim at a line the previous run did not visit, and check `visible` against that line's own text.
- Only a real (trusted) click scrubs the preview. `view.dispatch({selection})` moves the caret and the preview does not follow: the cursor sits on the line you asked for while `route` stays on the old beat, and nothing raises. It was measured never moving the preview through this harness, so the driver clicks and does not dispatch. If you are driving the editor yourself rather than through the driver, click; do not reach for `dispatch` because it is easier to write.
- `textContent` on the game DOM returns a wall of CSS: the player injects `<style>` blocks and every ancestor inherits their text. And the typewriter effect wraps every character in its own `<span>`, so "leaf nodes with text" gives you one letter per entry. Use `innerText` (layout-aware, and it reflows the spans back into words).
- The route indicator lives inside the player iframe, not the editor document. Searching the editor DOM for `main : N → main : M` finds nothing.
- Every visible line appears twice in `visible`. The duplicate is the text outline layer the player draws underneath. Expected, not evidence that your change is emitting content twice.
- A synthesised shortcut with a lowercase letter under Shift is not the shortcut a keyboard sends. Playwright's key strings are case-sensitive for a single character: `Control+Shift+g` delivers `key: "g"` with `shiftKey: true`, where a keyboard delivers `key: "G"`. CodeMirror resolves a letter binding from the reported key, so the shifted variant of a binding never runs from that form and the unshifted one runs instead; Ctrl+Shift+G steps forward through matches instead of back, which looks exactly like a broken keybinding and is not one. Measured in the live editor on 2026-09-04 with playwright 1.61: `Control+Shift+G`, `Control+Shift+KeyG`, and holding Control and Shift around `press("KeyG")` all deliver `G`; only the lowercase spelling delivers `g`. The driver's `--press` and `pressKey` uppercase a shifted letter before pressing it and report `rewritten: true`. In a script of your own, write the letter uppercase, and before filing any keybinding bug confirm the keydown carried the key a keyboard would report.
- The first asset request after a cold server boot can fail, in a fresh browser profile: the image comes back `complete: true` with a natural size of 0 and draws as nothing, while the identical url loads a few seconds later in the same page. The service worker that serves `/file:/` is not controlling the page yet. Re-run before concluding an asset does not load; it is not evidence about your change.
- These console messages are pre-existing noise on every run, not something your change caused: `Unhandled method workspace/semanticTokens/refresh`, `.../diagnostic/refresh`, `.../foldingRange/refresh`, and a couple of resource 404s.

---

## Troubleshooting

| Symptom                                                                    | Cause → fix                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`                   | The script was run from outside the repo tree. Node resolves from the script's directory; run `driver.mjs` at its committed path.                                                                                                                                                          |
| `driver.mjs up` times out after 15 min                                     | Read `npm run web:dev` output directly in the worktree; a workspace build error will show there. The detached log file is always empty (see Gotchas).                                                                                                                                       |
| Game Preview is black but the editor pane looks fine                       | Servers were hand-launched with mismatched origins. `down`, then `up`.                                                                                                                                                                                                                      |
| `verify` returns `preview.installed: false`                                | `window.__preview` only exists in same-origin mode. Do not pass `--cross-origin`.                                                                                                                                                                                                            |
| Game Preview pane is blank white; `gameMounted: false`                     | The `#game` scaffold never mounted after a server restart. `down`, `up`, retry. Discard the screenshot.                                                                                                                                                                                      |
| `scrubCheck.outcome` is `elsewhere`                                        | A real failed scrub: the game is showing the line named in `showing`. Usually the target is not a playable beat; pick the indented dialogue/action line, not the `NAME:` line, a heading, or a blank line.                                                                                  |
| `scrubCheck.outcome` is `inconclusive`                                     | The check could not attribute the screen to any line. Read `visible` yourself. Common causes: the line interpolates a value or carries markup so it does not render verbatim, or its text is duplicated elsewhere in the script. Not a failure, and not a pass.                              |
| `verify` dies with `Timeout 90000ms exceeded` waiting for `.cm-content`    | The machine is saturated, usually a vitest suite running in this or another worktree. The server is fine (`status` says UP, the URL returns 200). Wait for the suite and re-run; do not go hunting for a regression.                                                                        |
| `ui` reports a panel that `did not appear within 10s of pressing`          | The shortcut went to something other than the script editor: the editor was not on screen (`ui.screen` says which pane is), or another panel had focus. Put `--screen logic` first; `--close` the other panel. If the editor is up and it still fails, the binding itself changed; check `customSearch.ts`'s keymap. |
| `ui` says `no tab named "..."` and lists the tabs present                  | Tab values are the workspace's names (`logic`, `assets`, `share`, `main`, `scripts`), not the labels. Pick from the list in the message.                                                                                                                                                   |
| `ui` reports `the script editor is not on screen (active screen: assets)`  | The previous run left the persistent profile on another screen, and panels live only on the logic screen's `main` tab. Put `--screen logic` first. The report is still complete; only that step did not run. `(active screen: logic, tab: scripts)` means the inner tab: `--screen main`. `(active screen: logic, tab: main)` with "did not mount" is a cold editor on a saturated machine; re-run. |

---

## Improving this skill

If a step here failed, needed a flag or path it does not give, did not apply to your change without saying so, or cost you time on something Gotchas and Troubleshooting do not cover, report it under a "Skill feedback" heading in your final message with the edit you propose, as `CLAUDE.md` describes. Prefer a mechanism to a warning: when the problem is a step a session can forget or get wrong, propose the driver command or the check that makes the mistake impossible rather than a sentence telling the next session to be careful. A new trap goes in Gotchas; a new failure with a known fix goes in the Troubleshooting table. When you are certain of the fix and the session has a branch and pull request, make it in this file in its own commit and mention it under the pull request's Notes for reviewers.
