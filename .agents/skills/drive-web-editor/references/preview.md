# Verify the game preview

All commands run from the worktree root unless stated otherwise.

`verify` options: `--project <dir-or-zip>` (replace OPFS `/local` with every file of a project, then reload), `--sd <file.sd>` (load into OPFS `/local/main.sd`, then reload; after `--project` when both are given), `--line <N>` (scrub the preview to that source line; counts from one, matching the editor's gutter and its status bar), `--shot <out.png>`, `--probe <file.js>` (body of an async function evaluated in the editor page; its return value lands in the JSON), `--headed` (visible browser). A flag given with no value, an empty one, or another flag in its place is refused before the browser launches, on `verify` and `seed` as on `ui`, so `--project "$RB"` with `RB` unset cannot become a run without a project.

`verify` scrubs with a real mouse click on the target line, driven through Playwright. It scrolls the line into view by moving the scroller directly, checks that the coordinates are really over the text rather than an overlay, then clicks. Nothing in that path dispatches a CodeMirror selection.


## Game preview

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
- `seed.reason` (the same text as `error`, with no `gameMounted`): a `--project` seed did not leave the whole project in storage, and `seed.storage` says what is there (see [project seeding](projects.md)). The game was never asked about, so restarting the servers does not help; read `seed.failed` and the reason, fix the source or the storage, and re-run `--project`.
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
