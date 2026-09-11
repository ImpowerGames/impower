---
name: drive-web-editor
description: See a change running in the web editor and game preview through the committed driver, which boots both dev servers on pinned ports, loads a .sd repro, scrubs the preview to a line, drives the editor's own panels and screens, and writes screenshots you then look at. Invoked by resolve-issue and file-bug at their verification and reproduction steps, and usable directly whenever a change under impower-dev/ or packages/ needs to be seen rather than reasoned about.
---

# Drive the web editor

Read [runner notes](../RUNNERS.md) and the repository's agent instructions before proceeding. Load a named skill's full SKILL.md when the runner has no skill invocation capability.

The driver committed beside this file boots the editor and player, loads a script into the editor's OPFS, drives the preview and the editor's own surfaces, and writes PNGs. All paths are relative to the repo root (the directory whose `package.json` is named `impower-monorepo`), and every command runs from inside the worktree under test.

```
node .agents/skills/drive-web-editor/driver.mjs <command>
```

| Command               | Does                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `preflight`           | disk headroom, Playwright, `gh` auth, git repo                     |
| `up [--cross-origin]` | boot both dev servers on pinned ports, wait for ready              |
| `status`              | is it up? prints the editor URL                                    |
| `down`                | kill the whole server tree                                         |
| `verify [opts]`       | drive the game preview, print a JSON report                        |
| `ui [steps]`          | drive the editor's own panels and screens                          |
| `seed --project <p>`  | load a whole project (a directory or an exported zip) into OPFS `/local`, then reload |
| `seed --clear`        | empty OPFS `/local` (dot entries stay) and remove the seed marker, then reload; with `--project`, clear first |
| `redgreen [opts]`     | prove a regression test fails on the base and passes on the fix (the write-regression-test skill) |

`verify` options: `--project <dir-or-zip>` (replace OPFS `/local` with every file of a project, then reload), `--sd <file.sd>` (load into OPFS `/local/main.sd`, then reload; after `--project` when both are given), `--line <N>` (scrub the preview to that source line; counts from one, matching the editor's gutter and its status bar), `--shot <out.png>`, `--probe <file.js>` (body of an async function evaluated in the editor page; its return value lands in the JSON), `--headed` (visible browser). A flag given with no value, an empty one, or another flag in its place is refused before the browser launches, on `verify` and `seed` as on `ui`, so `--project "$RB"` with `RB` unset cannot become a run without a project.

`verify` scrubs with a real mouse click on the target line, driven through Playwright. It scrolls the line into view by moving the scroller directly, checks that the coordinates are really over the text rather than an overlay, then clicks. Nothing in that path dispatches a CodeMirror selection.

`ui` steps are tabulated below. It finds a panel by the class its CodeMirror `Panel` sets on its root (`.cm-search`, `.cm-gotoLine`) and a field by its `name`; it finds a tab by the `-trigger-<value>` suffix of its id, where the value is the workspace's own name for the pane or panel; it decides which screen is on display by which pane's inner tab row is mounted (`main` for logic, `files` for assets, `game` for share), because the screen tab's own highlight is blank on a fresh load. None of that is a test hook added to the app; if a surface you need has no such handle, adding one is in scope (#423).

`redgreen` runs no browser; `redgreen.mjs` beside the driver holds the implementation and `redgreen.test.mjs` pins it on a throwaway repository. The write-regression-test skill is where its options and its report are explained.

The state file, `.state.json` beside the driver (gitignored), records the editor URL, the launcher pid, when it was launched, the mode and the ports. A tree launched from the driver's location under the resolve-issue skill left its state file there, and the driver reads that one while nothing sits beside it, so `status` ends its line with `state=<path>` to say which file it read. A record stands while its pid is alive and the process behind it started when the record was written; the system reports a process's start time, and a freed pid goes to the next process the system starts, so a live pid alone can belong to anything by now. `up` reuses a standing record, waiting for its URL while the launcher lives, and replaces a stale one; `down` stops a tree only through a standing record, removes a stale one without signalling anything, and keeps the record when the kill is refused; `status` exits 0 only when the recorded URL answers.

Playwright is a declared root devDependency (`playwright: ^1.61.0`). Browsers come from the local `ms-playwright` cache; if it is empty on a new machine, `npx playwright install chromium`. Always run `npm install` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` set, because a transitive `@playwright/browser-chromium` dependency otherwise tries to download its own Chromium build from a host this network blocks and the whole install fails. The driver itself does not need that variable: if the pinned `playwright` version expects a Chromium revision the cache does not have, it launches whatever build the cache does have instead of failing, and `preflight` reports that as `launches (fallback build: ...)`, which is still a pass.

The driver must live inside the repo tree: Node resolves `playwright` relative to the script's directory, not the working directory, and a copy outside it says so rather than dying in a bare `ERR_MODULE_NOT_FOUND`. The same applies to any script of your own that imports the driver's exported helpers: put it under the worktree (and never `git add` it), not in the private scratch directory.

---

## 1. The game preview

A change is not done until you have looked at it running where it runs. Passing tests are necessary, never sufficient; this is a hard rule from the repository's agent instructions, and it applies to compiler fixes too, because the compiler exists to feed this preview.

Boot the servers once per session:

```bash
node .agents/skills/drive-web-editor/driver.mjs up
```

Expected (the port is derived from the worktree path, so it is stable for this worktree and unique across the worktrees on this machine):

```
launching dev servers (same-origin) pid 33964 → http://localhost:39364
COLD build takes 4-8 min (esbuild builds every worker bundle). Waiting...
READY http://localhost:39364   (mode: same-origin)
```

Then drive it:

```bash
node .agents/skills/drive-web-editor/driver.mjs verify --sd repro.sd --line 8 --shot before.png
```

Verified output shape:

```json
{
  "url": "http://localhost:39364",
  "wroteChars": 145,
  "gameMounted": true,
  "program": { "loaded": true, "ms": 1873 },
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
- `seed.reason` (the same text as `error`, with no `gameMounted`): a `--project` seed did not leave the whole project in storage, and `seed.storage` says what is there (section 1 below). The game was never asked about, so restarting the servers does not help; read `seed.failed` and the reason, fix the source or the storage, and re-run `--project`.
- `program.loaded: false` (with a `programWarning`): the player had not loaded a program within 90 s of the game mounting, read from the toolbar's launch-state icon, which the player sets when a program reaches it. `program.errors` is the error count the editor's status bar shows for the open document (the language server publishes diagnostics per file, and the page keeps no count for the whole project): above zero, that document does not compile, so the player was never given a program and the preview is the picture of a script that does not compile, which is evidence only when that is the bug; zero, either the harness was not ready (the first compile was still running) or a file that is not open does not compile, which on a `--project` run is any included script; either way the scrub that followed was sent to a player that was not listening and the preview is not evidence. `program.ms` is how long the wait took, whether or not it succeeded. `program.loaded: null` with a `reason` means nothing was waited for, and the reason says which: the preview is not observable (cross-origin mode) or the game never mounted. Cross-origin mode is read from how `up` launched the servers; in it `verify` stops before it loads the page, seeds a project or writes a script, with an `error` saying to relaunch without `--cross-origin`, since a run that can capture nothing must replace nothing; a `previewWarning` on a same-origin run means the preview pane is showing the screenplay or never mounted.
- `scrubCheck`: a hint about whether the scrub landed, never the gate; opening the PNG and looking is the primary check, always. Three outcomes:
  - `landed`: the target line's own text is on screen. No warning is set.
  - `elsewhere`: some other line's text is on screen instead, and `showing` names which. Usually a genuinely failed scrub, but the same near-duplicate-text confusion that produces `inconclusive` can produce this outcome too, on a line whose own text is genuinely on screen; open the PNG before concluding the scrub failed, the same as for the other two outcomes.
  - `inconclusive`: nothing attributable, and this can fire even on a line that is genuinely on screen: either the line does not render verbatim (interpolation, markup, a heading, a character-name line) or its text cannot be told apart from another line's. Read `visible` and judge it yourself; do not read it as either success or failure.
- `route`: `main : 1 → main : 8` means the preview paused on beat 8. Context only. That number reports how far execution reached, not the line you asked for, so it differs from your target on any line with something after it; nothing in the driver treats it as a check.
- `visible`: the game's rendered text, which is what `scrubCheck` reads. Every line appears twice: the second copy is the text outline layer. Expected, not duplicated output.
- `scrub`: the click that drove the scrub. `clicked: true` with a `cursorLine` matching your target is the click landing. `clicked: false` carries a `reason` instead, and that is a real failure worth reading.
- `settled: false`: the DOM never stopped mutating. Re-run.
- `editorPaintWarning`: the script editor was settled but had not painted its lines and gutter within 5 s of the screenshot. The game half of the PNG is still evidence; the editor half may be blank, so do not present that PNG as a picture of the editor. Re-run for one that is.
- `script`: which script the scrub drove, and `wroteThisRun` whether this run wrote it (above).
- `consoleNoise`: known console and page errors, counted by name and partitioned out of `consoleErrors`. A zero means no matching error was captured; an error the list does not know stays in `consoleErrors`.

`--sd` is only needed when the script changes: the pinned port keeps the same origin, so OPFS survives `down`/`up` and a plain `verify --line N --shot x.png` re-uses the script already loaded. Which script that is, the report says: `script` carries the file's size, a short digest of its content, its first non-empty line, and `wroteThisRun`, false on a run that re-used what was in storage. A digest or a first line from another repro is the mismatch, and `ui` reports the same field.

`--sd` writes one script, and a change or bug that involves assets (portraits, backdrops, audio, image previews, the asset inspector, anything a script reaches through a file) needs the whole project in the editor's storage. `--project <dir-or-zip>` on `verify` and `ui`, and `seed --project <dir-or-zip>` on its own, write every file of a project directory or an exported project zip under `local/<relative path>` in OPFS and reload as `--sd` does; with both flags the project goes in first and the script over its `main.sd`, so a repro script runs against the project's assets, and the project then needs no `main.sd` of its own. The source is read where it lives and nothing is copied into the tree, so an absolute path outside the repository is the normal case: the Raffles & Bunny project the maintainer reproduces against is a private checkout outside this repository, and its path comes from the maintainer or from memory. The source has to be a project, and the seed refuses, with a `reason` and storage untouched, one that is not: no files, no `main.sd` at its root (unless `--sd` supplies one), a `node_modules/` or `dist/` anywhere in it (a package or a build output, whose dependency tree would otherwise be read into memory whole), more than 20,000 files or 20,000 directories, 1 GiB in all or 256 MiB in one file (a zip is measured on its central directory, entry by entry, before the entry a bound names is inflated), a zip holding both a file and a directory of one name, or a link that cannot be read or that leads back into the walk or above it; it also refuses when the editor remembers a project other than `local` (its `localStorage` key `project`), because the editor would open that one and not the seed, and when the previous project holds an entry whose kind clashes with the source (a file where the source has a directory of that name, or the reverse; `clashes` names them), because writing over it would mean removing it first, and `seed --clear` is how that project is emptied. Links are followed, so a junctioned asset tree seeds like a plain one, and a tree reachable by two names seeds under both, read and written once per name, so an asset tree linked under two names costs twice its size in quota and time; dot entries in the source are skipped and counted under `skipped`, as the editor's export leaves them out; a zip is unpacked in Node with the library the editor's import uses, and an archive whose entries all sit under one top-level folder holding `main.sd` (a zip made by hand from the project directory) is unwrapped, with the folder named under `unwrapped`, while a single folder without `main.sd` cannot be told from the project's own layout (an asset bundle under `assets/`), so it stays and is named under `kept` with a `note`: a script's paths then start with that folder, and a zip made from inside the folder has no such folder. The seed replaces the project as the editor's own zip import does: every file is written over whatever is there, then the entries under `local/` that the source lacks are removed and named under `removed`, while dot entries (`.name`, `.trash`) are the editor's own and stay wherever they sit beside a kept entry, so the editor keeps showing the previous project's name; a stale directory goes whole. The report lands under `seed`:

```json
"seed": { "source": "C:\\...\\project", "project": "local", "storage": "replaced", "files": 673, "bytes": 198445312, "batches": 23, "skipped": 0, "removed": [], "failed": [], "mainSd": true, "pruned": true, "kind": "directory", "ms": 52628 }
```

`files` and `bytes` are what was written and read back, not what was sent. `storage` is what storage holds after the seed: `replaced` is the whole project and nothing else; `untouched` means the seed was refused before it wrote anything, and `reason` says why; `mixed` means it stopped part-way (a file in `failed` with the storage's reason, a stale entry the storage would not remove, or a Ctrl+C), so the files that landed sit over whatever was there (the previous project's entries, or nothing after `seed --clear --project` emptied it first; the reason says which) and `local/.seeding` marks it, and a plain `verify` or `ui` refuses to run on that storage until a `--project` run seeds it again or `seed --clear` empties it. Anything but `replaced` comes with a `reason`, and the run fails on it: `verify` exits 1 with that `error`, sets no `gameMounted` and takes no screenshot; `seed` exits 1; a `ui --project` step lands in `failed` without reloading, and the steps after it do not run. `seed --clear` removes every non-dot entry under `local/` and the marker, reports them under `clear`, and reloads, and refuses with nothing removed when the editor remembers another project; with `--project` it clears once the source has been read and accepted, so a source the seed refuses leaves the previous project standing, which is the way to seed over an entry of the other kind, or into a quota the previous project and the seed cannot share (nothing is removed until every file has landed, so a seed needs room for both). Audio is most of a game's bytes (141,811,674 of the Raffles & Bunny project's 198,445,312 bytes, 135 of 189 MiB), so a seed of the whole project takes half a minute to a minute here; the pinned origin keeps it across `down`/`up`, so seed once and re-use it as with `--sd`. A project this size also compiles for several seconds after the reload, which is why `verify` waits for the program to reach the player before it scrubs (`program.loaded`, below).

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
node .agents/skills/drive-web-editor/driver.mjs down
```

---

## 2. The editor's own interface

`verify` reaches the game preview and nothing else. A change to the find panel, the go-to-line panel, the file list, the asset views, or the screens the bottom tabs switch between is invisible to it, and a `verify` screenshot of such a change is not evidence. Use `ui` instead: it performs the steps you give it, in order, as a user would (panels open on their own shortcut, text goes in as real keystrokes, screens switch by clicking the tab) and then reads every surface back.

```bash
node .agents/skills/drive-web-editor/driver.mjs ui --sd repro.sd --open find --type "search=Hello" --type "replace=Goodbye" --shot-of find panel.png --shot page.png
```

Verified output shape (steps first, then the read-back; `url`, `startedOn`, `ui.screens`, `ui.tabs`, `ui.editorView`, `script`, `consoleErrors` and `consoleNoise` are also present and omitted here, as is the run's top-level `editorSettled`, which is set only when an editor was expected where the run started):

```json
{
  "steps": [
    { "sd": "repro.sd", "wroteChars": 171, "editorSettled": true, "programLoaded": true, "previewSettled": true, "editorView": "main" },
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
| `--fresh-sw` | unregister and reload, identify the controlling worker's installed script and capture its warnings and errors |
| `--hover <line>:<col>` | move the pointer over the requested position and read the hover and its image |
| `--complete <line>:<col>=<text>` | type at the requested position and read completion options and the selected item's info panel |
| `--sd <file.sd>`         | load the script into OPFS and reload, as `verify` does; then waits for the editor view to settle (`editorSettled`) and, where the game preview is observable, for the game to mount with `verify`'s budget and reload retry (`neededReload: true` when the retry was needed, `switchedToLogic: true` when the retry had to click back to the editor; a game that never mounts fails the step with `programLoaded: null`, as it fails `verify`), for the program to reach the player (`programLoaded`; `programNote` says why when it did not within 90 s) and for the first compile (`previewSettled`; `previewNote` says when it is not observable: cross-origin mode, or the preview showing the screenplay) |
| `--project <dir-or-zip>` | replace the OPFS project with every file of a directory or an exported zip and reload, as `verify --project` does (section 1); the step carries the `seed` report, fails without reloading on its `reason` (and the steps after it do not run), and needs no `main.sd` in the project when a `--sd` step follows it; a `--sd` before a `--project` is refused before the browser launches, since the seed would remove or replace the script it wrote. A `--project` or `--sd` step that throws (a reload that times out) keeps what it reported, fails, and stops the run the same way, since the page is not known to show what storage holds |
| `--screen <name>`        | click a tab: `logic`, `assets`, `share`, or a tab inside a pane (`main`, `scripts`, `files`, `urls`, `game`, `screenplay`); a main screen counts as active once its own content is mounted |
| `--open <panel>`         | `find` (Ctrl+F) or `goto` (Ctrl+G); waits for the panel to be on screen; needs the script editor, so the logic screen's `main` tab                     |
| `--close <panel>`        | Escape from inside it                                                                                                                                 |
| `--type <field>=<text>`  | real keystrokes into `search`, `replace`, or `line`; opens the panel if needed; a literal `\n` becomes Ctrl+Enter, the field's own line break           |
| `--press <combo>`        | one key combo, e.g. `Control+Shift+G`; a shifted lowercase letter is uppercased first; the `+` key is written `Control++`                |
| `--click <button>`       | a panel button by name: `next`, `prev`, `select`, `replace`, `replaceAll`, `close`, `submit`; goes to whichever owning panel is open                    |
| `--toggle <option>`      | flip a find-panel checkbox: `case`, `re`, `word`; reports the state it ended in                                                                        |
| `--shot <out.png>`       | the whole page                                                                                                                                        |
| `--shot-of <what> <png>` | one surface: `find`, `goto`, `editor` (the script editor), `hover`, `completion`, or `page`                                                                                  |
| `--probe <file.js>`      | as in `verify`                                                                                                                                        |

How to read it:

- Every `--type` reports `readBack` (the field's rendered text, which is what a user sees; the panel's own reader agrees with it on anything `--type` can type and differs only on a non-breaking space that arrives by paste) and `matches`. A `matches: false` carries a `reason` and lands in `failed`: either the keystrokes did not land or the field changed what it was given, and both are findings, not noise; a `--type` refused by the editor gate also reads `matches: false`, with `typed: false, gated: true` and the gate's reason, and typed nothing.
- `failed` lists every step that could not do what it was asked (a panel that never appeared, a tab not on the page, a read-back that differs, a step that threw). An empty list with the screenshot you wanted is the pass; a non-empty list means the screenshot is of something else. A step that fails never discards the report: the steps before it, their screenshots, and the read-back are still there.
- `ui.screen` is the screen whose content is on display, read from the pane itself rather than from the tab highlight; on a fresh load the app highlights no screen tab at all, so the highlight would say "none" while the logic screen is plainly showing. `ui.panelTab` is the selected tab inside it. `ui.find.matches` is the panel's own match counter, which is what tells you a search took.
- The script editor exists only on the logic screen, on its `main` tab or in its fullscreen scripts view when another script file is open, and the persistent browser profile remembers which screen, tab and view were last on display. `ui.editorView` says which: `main`, `scripts-view`, or null. In `scripts-view` the editor on screen is the other file while `--sd` still writes `main.sd`, and no `main` tab exists to click; the view's own header button is the way back, and `ui` has no step for it, so leave the editor on `main.sd` when you finish a run. A run that ends on `assets`, `share`, or the logic screen's `scripts` tab leaves the next run starting there; a panel step then reports `the script editor is not on screen (active screen: assets, tab: files); put --screen logic before this step` (or `(active screen: logic, tab: scripts); put --screen main before this step`) in `failed` rather than running. Put `--screen logic --screen main` first when the previous run may have left the profile on `assets`, `share`, or the `scripts` tab: the `main` tab exists only inside the logic pane, so from another screen the logic click has to come first, and from the `scripts` tab the `main` click is the one that matters (`--screen logic` there reports `active: true, editorHere: false` with a `note` saying so). A switch that lands on the editor (`--screen logic` onto the `main` tab, or `--screen main`) always waits up to 20 s for it and then settles it with a 15 s budget, whatever the run has settled before, because the switch mounted a fresh view; those are also the budgets a gated step uses before any settle has happened in the run; it fails the step with `editorHere: false` if the editor never mounts, or with `editorSettled: false` if it mounts but keeps being replaced for 15 s, and reports `editorSettled: true` when the switch did the settling. A `--screen logic` that is followed at once by `--screen main` does not fail for an editor the main switch is about to wait for; it carries a `note` instead, and the main switch gives the verdict. Followed by anything else, a logic switch whose editor never mounts fails as any other. A gated `--shot` or `--shot-of` also waits up to 5 s for the editor to have painted its lines and gutter, because a settled view can still be a blank pane, and fails the step if it has not; `verify` does the same wait before its screenshot and, since its evidence is the game preview, reports an `editorPaintWarning` instead of failing. That recovery does not apply to the fullscreen scripts view, which has no tab row: `--screen main` there reports that the view is open and that its own header button is the way back, and `ui` has no step for that button. A run does not fail at its start for a slow editor; a step that captures or acts on the screen (`--shot`, `--shot-of`, `--press`, `--hover`, `--complete`, and the panel-opening steps `--open` and `--type`) waits for an expected editor to mount and settle at the moment it runs, and fails with that reason if it does not, so the failure lands on the step that would otherwise have captured a page still loading. "Expected" is decided by the pane that is mounted; a page with no pane mounted yet counts as expected and waits. The wait is paid once per run, and any settle the run already did counts (at the start, after `--sd`, or in a `--screen` step that landed on the editor, all with the gate's own 15 s budget): later steps re-check with 8 s budgets for the mount and the settle, and a failure names the budget it used. After one step has given up, later gated steps take a two-second look and, if the give-up was a view that never settled, a six-second re-settle; they fail at once with `still not up` or `still being replaced` naming the step that first reported it, or clear the give-up and proceed with the run's current budgets (the shorter ones if any settle already happened) once the editor is back: a missing editor needs only the two-second look to have found it, a replaced one also needs the re-settle. A `--sd`, `--project` or `--fresh-sw` reload resets the gate, since the settled view is gone with the page. A step on a screen where no editor is expected is never refused, whatever an earlier step found. A gate failure keeps the presence check's navigational advice (`put --screen main before this step`) when there is one, and otherwise says once to re-run. The settle check reads the editor view's own identity and document length, not the page's DOM going quiet, so an animating preview or a busy language server does not fail it. `--probe` is never gated, so a probe can diagnose a page whose editor will not mount; on a project an earlier seed left marked, every step but `--probe` is refused until a `--project` step has seeded it, and the run stops at the first refused step. The start records `editorSettled` and, when the editor was expected and not yet up, or the run began on the `scripts` tab, a `startNote`. `verify` reports `editorView` and, when the logic pane is showing another file, an `editorWarning`; `ui --sd` fails its step in that state, since the file it wrote is not the one on screen. `verify` switches back on its own (the logic screen tab, then the `main` tab if the profile was on `scripts`) and reports `switchedToLogic: true` for a click that changed the screen or tab, whether or not the editor then came up (`gameMounted` and `error` say that); if it still cannot reach the editor it prints a report with `gameMounted: false` and an `error` naming the screen, and exits 1.
- A non-empty `failed` exits 1. `ui --sd x.sd --shot out.png && open out.png` cannot open a screenshot of the wrong document under a green shell.
- `ui.screens` lists every main screen whose content is mounted (the pane's inner tab row, or for logic the script editor itself, since the logic pane's fullscreen scripts view mounts no tab row); `ui.screen` is set only when that is exactly one, and null when it is none, which is what a page still loading looks like. The app mounts one pane at a time. Every editor selector the driver uses is scoped to the script editor's own root (`.sparkdown-script-editor-root`): the screenplay preview in the right-hand pane is a CodeMirror editor too, and an unscoped `.cm-content` would find it from any screen and type into it.
- The preview pane remembers screenplay mode across runs as well. In that mode the game never mounts, so `verify` clicks the preview's "Preview Game" button itself and reports `switchedToGamePreview: true`; `ui --sd` does not switch (it may be what you are testing) and reports `previewNote` instead.

Then open the PNG and look, as with `verify`. `--shot-of find` crops to the panel, which is the right picture for a panel change and useless for anything else; take `--shot` as well when the change could have moved something outside the panel.

The browser helpers `ui` is built from (`withEditor`, `writeMainSd`, `waitForEditor`, `openSurface`, `typeInto`, `pressKey`, `switchScreen`, `readSurfaces`, `shotOf` and the rest) are exported from `driver.mjs` for the case `ui` does not cover. Import them from a script that lives inside the repo tree (Node resolves `playwright` from the importing script's directory, not from the working directory), and prefer adding the missing step to `ui` over leaving the script behind.

`ui --hover 5:19` opens a hover with real pointer movement; `ui --complete 7:3=~fil` types real keystrokes at the requested position and waits for completion. Hover reads the script currently visible, including another file in the fullscreen scripts view; `ui.editorView` identifies that view. Completion typing requires `main.sd` on screen and refuses the fullscreen scripts view. The typed text stays in the document and is autosaved; restore the original text with `--sd` or `--project` before a run that needs it. Positions count lines and UTF-16 columns from one, matching the status bar. Both use the go-to panel and report the verified `caret` before acting; hover also reports its `pointer`, and completion reports `typed` and `textMatches`, failing when the document read-back differs. Hover reports `present`, `text`, `imgSrc`, `imgRect`, `naturalWidth` and `naturalHeight`; completion reports `popupPresent`, label-only `options` and `selected`, `items` with separate labels and details, `optionsTruncated` when CodeMirror renders only a window of the offered list, `infoPanelPresent` and the same image fields. `surfaceRect` and `infoPanelRect` describe panels intersecting the viewport. `--shot-of hover hover.png` crops the visible hover; `--shot-of completion completion.png` includes the list and its visible info panel, or the list alone when no info panel is shown. The reader waits up to 15 s for viewport placement and up to 2 s for an optional completion info panel; crops allow 2 s for placement plus up to 2 s for optional completion information, including when an earlier completion step already waited. Off-screen surfaces do not count as present. Missing labels in a truncated list are not evidence that the server omitted them. A missing surface fails the step and reports `serverResponse: "unobserved"`: the DOM alone cannot distinguish an empty language-server answer from a request that failed, or correlate a displayed list with a particular request. These steps use the editor's existing controls; protocol-driven operations belong to #500.

When what you are checking is an image on one of those surfaces, measure the rendered rect, never `naturalWidth`/`naturalHeight`. An SVG whose root declares only a `viewBox` reports a non-zero natural size while laying out at 0 × 0, and an image that failed to load reports `complete: true` with a natural size of 0, so `natural` tells you neither what is drawn nor whether it loaded. `getBoundingClientRect()` on the `<img>` is the answer, and the screenshot is the check.

---

`verify --fresh-sw` unregisters the editor origin's service workers and reloads before verification; `ui --fresh-sw` does so at that point in the step sequence, so put it before the actions whose worker activity matters. It does not refresh a cross-origin player's worker. The `ui` report's top-level `editorSettled` records startup only; `--fresh-sw` verifies the worker, while later editor actions check the refreshed editor themselves. `verify` additionally checks the editor and preview after reloading. The report is `serviceWorker` on `verify` and on the corresponding `ui` step, with fixed `target: "editor"`, the worker `origin`, `unregistered` scopes, `refreshed`, `controlled`, `verifiedAtEnd`, `scriptURL`, and a SHA-256 of the installed worker's built script read through Chromium's debugger. A temporary message listener confirms that the hashed worker answers through the page's controller and removes itself before replying. A fallback cleanup reports failures in `cleanupErrors` without replacing the identity verdict. Runs reaching the end check identity again, as does the next `ui --fresh-sw`; replacement fails the run. An early failed exit can retain `verifiedAtEnd: false` because it did not reach that check. An initial failure stops later steps. No hash is inferred from the server's current file. Compare `sha256` between runs to identify the installed bundle; identical built bytes preserve the hash, and build inputs such as the precached-resource list can change it without a worker source edit. OPFS and Cache Storage are retained, so a fresh worker can serve previously generated cached art; its hash does not prove that generation ran again.

With `--fresh-sw`, worker-side console `warnings`, console errors and uncaught exceptions in `errors` are captured from the identified worker. Each list retains up to 25 messages and reports overflow in `warningsDropped` or `errorsDropped`. A failed filtered-image or thumbnail cache write can cause regeneration on a repeat run while still serving the art; an empty message list does not prove a cache hit. The debugger is disabled after reading the script, while runtime capture stays attached until the check closes. Page `consoleErrors` and `consoleNoise` exclude worker output; use the worker report for it.

---

## 3. When the change has no visual signature

Some fixes cannot show up in a screenshot: a perf change, a memory leak, an internal data structure no pixel depends on. Two before/after PNGs that look identical prove nothing, and presenting them as the gate is worse than useless; they read as evidence while carrying none.

For those, the gate is a measured before/after, and it replaces the screenshot rather than sitting alongside a pair of identical images. Still boot the editor and confirm nothing visible broke; just do not dress that up as proof the fix worked.

What makes a timing here honest:

- One candidate per process. A shared process inflates whatever runs second by several times. Run the baseline and the patch as separate commands.
- Interleave and take medians. Run-to-run variance on this machine is large enough to invert a real 2× difference. Three alternating pairs is the minimum.
- When timing a scrub, run one throwaway scrub on a line you will not measure and wait a minute before measuring. The driver refuses a click that would land on the position the caret already holds and says so (`clicked: false` with a reason naming the unchanged selection) rather than clicking and reporting a success that moved nothing, so the throwaway must target a line other than the one you are about to measure. This only helps inside one page session, kept open across both scrubs on a script of your own: the CLI's `verify` reloads the page on every invocation, so a throwaway scrub run through one `verify` call warms nothing for a measurement taken by the next. The scrub path's helpers are reached through the exported `liveDeps` object — `liveDeps.clickLine(page, n)`, `liveDeps.documentLines`, `liveDeps.waitForPreviewSettle` — and are not named exports, so importing them by name fails before a browser launches. The minute is for the preview session itself: a scrub that lands while the first one after a reload is still mid-build races it and mounts a stacked or ahead-of-cursor preview instead of the one that scrub asked for (#456), which would corrupt a timing run far more than it corrupts a screenshot.
- Carry a control: a second measurement the change should not affect. If the control moves as much as the candidate, the pair is noise; measure again.
- Size the fixture until the phase you changed is a visible share of the whole, and check that by timing the phase itself as well as the total. The first fixture reached for is usually too small: a 60-scene and a 400-scene script both put one session's change inside run-to-run noise, and only more content per scene made it readable. If the total moves no more than the control does, the fixture is too small; scale it up rather than concluding there is no effect, and scale what the phase actually processes (content per unit), not just the count of units.
- Report absolute numbers, not just ratios. "2×" hides whether that is 4ms → 8ms or 400ms → 800ms.
- Say where the number came from. If no benchmark in the repo covers the path (several do not; `perfProfile.test.ts` drives `SparkdownCompiler`, whose annotate set excludes `formatting` and `semantics`), say the figure comes from a scratch harness and name what it drove.

Same shape for a memory or count regression: measure the quantity over a fixed number of operations, before and after, and report both numbers.

A screenshot can also be misleading rather than merely uninformative. Display text lays out with collapsing whitespace (the game text style is `white_space: pre-line`), so one space and several look the same on screen while the letter-by-letter typing pauses differently. For anything about whitespace or timing, assert on the string the engine actually consumes and treat the screenshot as a sanity check only. The engine's own test shows the working recipe (`packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.test.ts`, `createModule` and `render`): build a bare game context carrying `context.system`, `context.character` and `context.config.interpreter.directives`, construct `new InterpreterModule(game)` and call `setup()`, then `module.parse(source, target).text?.[target] ?? []` is the array of text instructions; join their `.text` fields yourself for the string. `parse` is an instance method, so `InterpreterModule.parse(...)` on the class throws.

A performance cost the fix knowingly carries is a headline, not a footnote: put it at the top of the PR body.

---

## Gotchas

This list holds only what no driver refusal, report field or check can absorb: a behaviour of the app the driver does not wrap, a fact about this machine, or a trap whose mechanism is a feature with its own ticket. Anything a mechanism can take belongs in the driver, whose own messages carry the fix for the failure they name.

- Scrubbing only works while the preview is stopped; after PLAY the engine is time-driven, ignores the cursor, and the scrub silently does nothing. The driver never presses PLAY, so this bites only a script of your own.
- The preview keeps the position the last run left it on, because the profile and the origin are both pinned and the editor restores the previous cursor, so a run that scrubs to a line the previous run already reached looks the same whether or not this run's scrub did anything. When you are testing the scrub itself rather than using it, aim at a line the previous run did not visit.
- `textContent` on the game DOM returns a wall of CSS, because the player injects `<style>` blocks that every ancestor inherits, and the typewriter effect wraps every character in its own `<span>`, so "leaf nodes with text" gives one letter per entry; a probe of your own wants `innerText`, which the driver uses.
- The editor auto-closes `[[`, so a script of your own that types `[[show portrait bunny]]` leaves a stray `]]` behind the caret and a trailing `>` lands mid-line, silently joining two beats; type the opener, press `End`, and read the document back with `documentLines`. The driver's `--sd` path writes the file directly and is unaffected.
- The route indicator lives inside the player iframe, so searching the editor document for `main : N → main : M` finds nothing; `verify` reads it for you and reports it as `route`.
- Responses from the worker's asset endpoints carry `Cache-Control: max-age=31536000, immutable`, so the browser's own HTTP cache answers the second half of a before/after with the first half's bytes. `fetch(url, { cache: "reload" })` escapes it for a raw byte measurement; a rendered `<img>` in the game preview does not, so give each phase its own asset filename, since the url is the cache key.
- The first asset request after a cold server boot can fail in a fresh browser profile: the image comes back `complete: true` with a natural size of 0 and draws as nothing, while the identical url loads seconds later in the same page, because the service worker that serves `/file:/` is not controlling the page yet. Re-run before concluding an asset does not load.
- The command line cannot attach an image to a pull request. Describe what each frame shows under Testing and verification, keep the files in the private scratch directory, and attach them through the web form if a person wants them.
- A pid taken from `$!` in Git Bash is the MSYS pid, not the Windows pid a state file needs; get a child's pid from Node.
- A trailing slash on a scratch junction empties the directory it points at: `rm -rf <link>` removes the junction alone, but `rm -rf <link>/`, which Git Bash tab-completion adds, follows it into the real target. Remove a junction by its bare path, and before the scratch directory around it.

---

## Improving this skill

If a step here failed, needed a flag or path it does not give, did not apply to your change without saying so, or cost you time on something this file does not cover, report it under a "Skill feedback" heading in your final message with the edit you propose, as the repository's agent instructions describes. Prefer a mechanism to a warning, and prefer it here above all: a trap a session can hit belongs in the driver's own refusal or report field, with a check beside it, not in a sentence the next session reads afterwards. A new failure with a known fix goes into the message the driver prints when it happens, and into `driver-messages.test.mjs`, which requires each message to carry the fix; the Gotchas list above takes only what no mechanism can absorb. When you are certain of the fix and the session has a branch and pull request, make it in its own commit and mention it under the pull request's Notes for reviewers.
