---
name: drive-vscode-web
description: See a change to the VS Code extension running in a headless VS Code for the Web, through the committed driver, which serves the built extension with vscode-test-web on a port pinned to the worktree, opens a .sd file in the served workbench, reads its diagnostics and a hover, and writes screenshots you then look at. Invoked by resolve-issue and file-bug for a VS Code extension ticket, and usable directly whenever a change under vscode-sparkdown/ or the language server needs to be seen rather than reasoned about.
---

# Drive the VS Code extension headlessly

The driver committed beside this file serves the built extension through `@vscode/test-web`, a server that hosts a downloaded VS Code for the Web build with the extension under `vscode-sparkdown/` loaded as a development extension and a project folder mounted as the workspace, and then drives the served workbench with Playwright. It is the only way to see the extension run without a desktop VS Code; the desktop host has no headless path. What it can see is what an open `.sd` editor shows: the text, the diagnostics the language server reports on it, and a hover; a preview panel, a command, a tree view or the debug adapter is out of its reach and is seen in a desktop development host. All paths are relative to the repo root (the directory whose `package.json` is named `impower-monorepo`), and every command runs from inside the worktree under test.

```
node .claude/skills/drive-vscode-web/driver.mjs <command>
```

| Command          | Does                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `up [opts]`      | serve the built extension on a port pinned to this worktree, wait for ready, repair the stylesheet |
| `status`         | is it up? prints the URL and the served folder                                                |
| `down`           | stop the server                                                                               |
| `verify [opts]`  | open a file in the served workbench, read its diagnostics and a hover, screenshot; JSON report |

`up` options: `--sd <file.sd>` (serve a one-file project holding the script as `main.sd`) or `--project <folder>` (serve an existing folder, which is what a hover on an image needs, since the image files must be in the workspace; the folder is served as it is, and must not sit under the data directory's `builds`); `--data <dir>` (where the VS Code builds, the served projects and the server logs live; the default is `impower-vscode-test-web` under the system temp directory, shared by every worktree so a build downloads once, and never inside a checkout); `--quality stable|insiders` (each quality has its own directory under `builds`; any other value is refused); `--fresh` (download the newest build of that quality instead of serving the one already unpacked; refused while another worktree's server serves from that quality's directory, since the download deletes it first).

`verify` options: `--file <name>` (the file to open from the explorer, `main.sd` by default; a name at the top level of the served folder, matched exactly, so a file of that name in a subfolder is never the one opened), `--hover <word>` (put the cursor on the word and open the hover with Ctrl+K Ctrl+I; a whole word, on the first rendered line that holds it), `--line <text>` (only look for the word on a line containing this text), `--hover-image` (the hover must carry an image, or the run fails; for a change whose point is the image), `--shot <out.png>`, `--hover-shot <out.png>` (the hover widget alone; `--line`, `--hover-image` and `--hover-shot` are refused without `--hover`), `--probe <file.js>` (body of an async function evaluated in the page; its return value lands in the JSON), `--settle <seconds>` (how long to wait for the diagnostics to stop changing, 60 by default and never below 30, since a file the server finds clean needs 25 readings a second apart before the rule can call it settled, plus 5 s for taking them; a run whose diagnostics have not settled by then is a `failed` entry), `--headed`.

The state file `.state.json` beside the driver (gitignored) records the URL, the server pid, the served folder, the data directory, the build's commit and the log path. The driver imports the web editor driver's process helpers and its Chromium fallback, so the Playwright notes in the drive-web-editor skill apply here too: browsers come from the local `ms-playwright` cache, and `npm install` runs with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. The driver must stay inside the repo tree, because Node resolves `playwright` from the script's directory. The repro and the screenshots the commands below name (`repro.sd`, `after.png`, `hover.png`) are written into the checkout and are gitignored there.

---

## 1. Build the extension

```bash
cd vscode-sparkdown && npm run build
```

About a minute here (49 s measured), once per worktree; after that the driver's own refusals name the shorter steps below. For an open `.sd` editor the served workbench loads `vscode-sparkdown/out/extension.js` (the extension bundle), `out/workers/sparkdown-language-server.js` (the language server every diagnostic and hover comes from, copied by `node scripts/esbuild.ts` from `packages/sparkdown-language-server/dist`, which only that package's own build rewrites) and `out/data/*` (copies of the files under `data/`). A launch and every `verify` refuse to go on while any of those is missing or older than a source that feeds it: `vscode-sparkdown/src/` and `vscode-sparkdown/language/` feed the extension bundle (the bundle takes the language configuration in by value), `data/` its copies, and `packages/*/src/` and `packages/*/language/` both bundles, since the bundles resolve the workspace packages by source and the compiler takes the grammar JSON in by value (tests, snapshots, `node_modules`, `dist` and `out` excepted), so `npm run language` under `definitions/` makes both stale. The message names the artifact, the newer source and the steps that rebuild it, so a screenshot is always of a build that includes the change; the report's `build` names the older of the two bundles and when it was written (the copies under `out/data` are checked too, but a copy carries its source's time and dates nothing). The webview bundles, the other workers and the rest of `out/data` (codicons, the player's types) are not watched, because the driver cannot show a webview, a command or an export. A source file touched but not changed (`git checkout`, a redgreen restore) does not refuse: whenever a build is accepted with no source newer than its artifacts, the driver stamps the artifacts and the content of every source into `out/.drive-vscode-web-build.json`, and a newer file whose content is what was stamped, with the stamped artifacts still in place, is the build's own. A source deleted or added since the stamp refuses, whatever the artifacts are, unless every artifact it feeds was written after the directory the entry changed in (the system writes a directory's time whenever an entry is added or removed), which is what the steps the refusal names do; the stamp is never rewritten over such a gap. An artifact rebuilt on its own while another is older than a touched file refuses too, and the full steps clear it. `package.json` is read by the workbench as it is and needs no build. The build log ends with `Error: Compiled with errors` from `dts-bundle-generator` in the `spark-web-player` step and `no type bundle produced; skipping post-process`; that type bundle is not part of the extension and the command exits 0.

A change under `vscode-sparkdown/src/`, `vscode-sparkdown/language/` or `data/` alone needs only `cd vscode-sparkdown && node scripts/esbuild.ts` (5 s here); a change under `packages/` needs `cd vscode-sparkdown && npm run build:sparkdown-language-server && node scripts/esbuild.ts` (9 s here for both), which rebuilds the language server bundle and then the extension bundle with it. The refusal names exactly the steps for the artifacts it found stale, in the order they run. After those steps `out/` is no longer a full build: `out/workers/sparkdown-screenplay-pdf.js` and the webview bundles stay as they were, which matters to a session that then packages the extension or tests an export, and `npm run build` brings them up.

---

## 2. Serve it

Boot the server once per session, with either a script or a folder:

```bash
node .claude/skills/drive-vscode-web/driver.mjs up --sd repro.sd
```

Expected, on a machine that has the build already:

```
serving C:\...\Temp\impower-vscode-test-web\projects\34223 pid 27048 → http://localhost:34223 (build a44adf7f53, already unpacked)
Waiting for the server...
READY http://localhost:34223
```

The first launch on a machine says `downloading the VS Code build (about 55 MB). Waiting...` instead, downloads and unpacks the build (27 s here) and writes the stylesheet alias under it (`stylesheet alias written in ...`); later launches pin the server to the commit already under `builds/<quality>` and answer in under ten seconds, because the server then serves what it has. The data directory is shared by every worktree and a download empties the quality's build directory before it unpacks, so a launch that will download takes a lock beside `builds` and holds it until the server answers; a second worktree launching into the same download is refused, naming the worktree to wait for, and a lock whose launch has exited is dropped by the next one. A server that exits before its port answers ends `up` at once with the log path, rather than after the ten-minute download budget. The port is derived from the worktree path, so it is stable for this worktree and clear of the other worktrees' servers. While the server is up, `up --sd other.sd` rewrites the served `main.sd` and the next `verify` reads the new script; the folder, the quality, the data directory and the build are fixed at launch, so `up --project` with another folder, `up --quality` with the other quality, `up --data` with another directory (or with any directory, against a record that does not say which one its server uses), or `up --fresh` is refused until `down`.

A minimal `.sd` with a diagnostic (an undefined backdrop) and a dialogue line; copy syntax from a passing fixture rather than from memory when the repro needs more:

```
-> START

scene START

  [[show backdrop missing_backdrop]]

  ALICE:
    Hello from the served workbench.
end
```

A clean file, for a run that should settle at `No Problems`, is a scene holding a line of action and no character: a character line names a character the script does not declare, which is itself a warning, so the repro above minus its backdrop line is not clean.

Stop the server when done:

```bash
node .claude/skills/drive-vscode-web/driver.mjs down
```

---

## 3. Drive it

```bash
node .claude/skills/drive-vscode-web/driver.mjs verify --hover missing_backdrop --shot after.png --hover-shot hover.png
```

`verify` loads a fresh page, opens the file by clicking its explorer row, waits for the language server's diagnostics to settle, reads them, asks for the hover, screenshots, and prints the report. Verified output shape (`consoleErrors`, `url`, `project` and `build` omitted here; the repro above, with a hover on the image reference `missing_backdrop`):

```json
{
  "file": "main.sd",
  "failed": [],
  "editor": "main.sd",
  "opened": true,
  "settled": true,
  "settledAfterS": 9,
  "extension": { "activated": true, "answered": true },
  "diagnostics": {
    "problems": "0 2",
    "problemsLabel": "Warnings: 2",
    "squiggles": { "error": 0, "warning": 2, "info": 0 }
  },
  "hover": {
    "word": "missing_backdrop",
    "line": 5,
    "col": 19,
    "cursor": "Ln 5, Col 19",
    "present": true,
    "text": "Cannot find image named 'missing_backdrop'sparkdown main.sd(5, 19): View Problem (Alt+F8) No quick fixes available",
    "img": null
  },
  "hoverScreenshot": "C:\\...\\hover.png",
  "screenshot": "C:\\...\\after.png"
}
```

How to read it, before trusting the PNG:

- `opened` is true only when the explorer row labelled exactly `--file` was clicked and the editor tab that became active carries that title, which `editor` reports. `opened: false` (with the reason in `failed`): the row never appeared, or another editor opened. The screenshot shows the workbench as it was; usually the served folder is not what you think (`status` names it) or the workbench never finished loading.
- `settled` and `settledAfterS`: the diagnostics were read once a second, a reading whose counter carried no number (the item not there yet, or there with no text) set aside wherever it fell, until the readings had changed from the workbench's own starting value and then held for eight, or held for eight after twenty-five had been taken for a file the server finds clean and `extension` showed both marks below; the last reading must carry a number, so a settled value is always a count. A clean file therefore takes at least 25 s to settle, and a file with a diagnostic about 9 s. `settled: false` is a `failed` entry naming the rule that was not met (the last eight disagreed, the counter never changed and the floor was not reached, the counter never changed and the extension never showed itself or the language server never answered, the last reading carried no count); the numbers reported are the last reading before `--settle` ran out, not a result.
- `extension.activated` is whether the extension's own status bar item is in the page, which only `out/extension.js` creates when it activates; `extension.answered` is whether a breadcrumb follows the file's name above the editor, which the workbench adds once the language server has answered a document symbol request (the symbol at the cursor, or `…` outside every symbol). A counter that never leaves the workbench's own `0 0` is what a clean file and a build that never ran both produce, so it settles only with both marks, and a run that reaches the floor without them is a `failed` entry naming the one missing. A file with no scene, function or label gives the server no symbol to answer with; give such a file a scene.
- `diagnostics.problems` is the status bar's counter, errors then warnings, and `problemsLabel` its label (`No Problems`, `Warnings: 2`); the counter is the whole workspace's, so in `--project` mode it includes files you never opened, and a diagnostic arriving for one of those counts as a change for the settle rule. `squiggles` counts the underline overlays in the open editor by severity, and Monaco renders overlays for the lines in the viewport only (about 45 lines at the driver's 900 px), so on a longer file the two can disagree; the counter is the file's total, the squiggles are what the screenshot shows. A `0 0` that settled is a clean file the server answered for; `consoleErrors` and the server log (`status` names it) say what a server that never answered did.
- `hover`: `line`, `col` and `cursor` say where the hover was asked for. `line` is the gutter number beside the rendered line, and a line with none is a `failed` entry, since the caret cannot be placed on a line the driver cannot name. `col` counts characters on the rendered line, where Monaco draws a tab as several, and `cursor` is the status bar's reading after the click, a visual column that counts the same way; neither is the model's column on a tab-indented line, so the driver judges the click by the caret's left edge in pixels against the word's own edges rather than by a column (a line caret and a block caret both start on the character boundary), and a caret off the word lands in `failed` rather than in a hover attributed to the wrong word. `present: false` lands in `failed`. The language server answers a hover only for a reference to an image asset (`packages/sparkdown-language-server/src/utils/providers/getHover.ts`), and Monaco adds any diagnostic under the cursor to the same widget, so on a word carrying a marker `text` is the diagnostic message and `img` is null; on an image reference `img` reports whether the `<img>` has a `src`, the size it rendered at, and its `natural` size once loaded (`complete: true`), and `text` is empty. An image with no `src`, one still loading after ten seconds, or one whose natural size is `0 x 0` (what a `src` the workbench cannot fetch leaves behind, since `complete` is true after an error too and the hover's own height keeps the box at full size) is a `failed` entry. A hover with no image at all is a clean pass unless `--hover-image` was given, so a change whose point is the image passes that flag, or the report cannot fail for the image being gone. A word that is neither opens nothing, which is the extension working, not failing.
- `failed` lists every step that could not do what it was asked, including anything that threw part-way; the report is printed whatever happens. An empty list with the screenshot you wanted is the pass; a non-empty list exits 1, so `verify ... && open after.png` cannot open a screenshot of the wrong thing.
- `consoleErrors` holds what is worth reading, because the lines every run produces (two `404 (Not Found)` resources, the `FileSystemObserver` file watcher, the `Not Found` page error) are partitioned out and counted under `consoleNoise` instead. A name whose count is zero did not appear this run; a line the list does not know stays in `consoleErrors`.

Then open the PNG and look at it. The JSON is a convenience, not the gate.

After a change, rebuild (§1) and run `verify` again. Each `verify` loads a fresh page, which fetches the extension from disk, so the server does not need restarting. `verify` drives only the server its own record started: a record whose pid is another process by now is refused with `down` then `up`, so a report never describes another worktree's workbench under this worktree's build.

---

## Gotchas

What is left here after #497 is what the driver cannot absorb, because it belongs to a script of your own rather than to a driver command. Everything else became a refusal, a report field or a repair the driver makes, and the driver's own messages carry the fix.

- Monaco draws every space in a `.view-line` as U+00A0, so `textContent.includes("show backdrop")` never matches the source's spaces. The driver normalizes both sides; a probe of your own has to as well.
- Headless, a hover never opens under the mouse however carefully the pointer is moved, and Quick Open (Ctrl+P) is unreliable. The driver clicks the file's explorer row and opens the hover with Ctrl+K Ctrl+I, the Show Hover command, which works every time; a script of your own wants the same two.

---

## Improving this skill

If a step here failed, needed a flag or path it does not give, did not apply to your change without saying so, or cost you time on something this file does not cover, report it under a "Skill feedback" heading in your final message with the edit you propose, as `CLAUDE.md` describes. Prefer a mechanism to a warning, and prefer it here above all: a new failure with a known fix goes into the message the driver prints when it happens, and into the check, which requires each message to carry the fix; the Gotchas list above takes only what no mechanism can absorb.

`driver.test.mjs` beside the driver pins the stylesheet alias and its copy-then-rename, the launch plan (the server's whole argument list and where the project and the log go), the detached spawn, the readiness wait, the commit pin, the guard on `--fresh` and the download lock that keeps two worktrees' first launches apart, the port rule on both loopbacks, the build rule (the artifacts, their sources, the freshness by time, the stamp and the directory evidence that clears it, the steps a refusal names), the word location as the page rebuilds it, the caret and image rules, the settle rule with its marks and the failure of an unsettled run, the console partition, and the flag parsing; `up`, `checkBuild`, `status` and `verify` themselves run in it against stubbed dependencies and a document shaped as the workbench is, with every page function rebuilt from its source as the page does, so a refusal removed, a step skipped or a selector that names nothing real fails the check rather than the next session, and `status`'s line is pinned through clean-worktrees' own parser. Run it after any change here. When you are certain of the fix and the session has a branch and pull request, make it in this file in its own commit and mention it under the pull request's Notes for reviewers.
