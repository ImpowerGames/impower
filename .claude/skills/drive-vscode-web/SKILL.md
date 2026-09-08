---
name: drive-vscode-web
description: See a change to the VS Code extension running in a headless VS Code for the Web, through the committed driver, which serves the built extension with vscode-test-web on a port pinned to the worktree, opens a .sd file in the served workbench, reads its diagnostics and a hover, and writes screenshots you then look at. Invoked by resolve-issue and file-bug for a VS Code extension ticket, and usable directly whenever a change under vscode-sparkdown/ needs to be seen rather than reasoned about.
---

# Drive the VS Code extension headlessly

The driver committed beside this file serves the built extension through `@vscode/test-web`, a server that hosts a downloaded VS Code for the Web build with the extension under `vscode-sparkdown/` loaded as a development extension and a project folder mounted as the workspace, and then drives the served workbench with Playwright. It is the only way to see the extension run without a desktop VS Code; the desktop host has no headless path. All paths are relative to the repo root (the directory whose `package.json` is named `impower-monorepo`), and every command runs from inside the worktree under test.

```
node .claude/skills/drive-vscode-web/driver.mjs <command>
```

| Command          | Does                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `up [opts]`      | serve the built extension on a port pinned to this worktree, wait for ready, repair the stylesheet |
| `status`         | is it up? prints the URL and the served folder                                                |
| `down`           | stop the server                                                                               |
| `verify [opts]`  | open a file in the served workbench, read its diagnostics and a hover, screenshot; JSON report |

`up` options: `--sd <file.sd>` (serve a one-file project holding the script as `main.sd`) or `--project <folder>` (serve an existing folder, which is what a hover on an image needs, since the image files must be in the workspace); `--data <dir>` (where the VS Code builds, the served projects and the server logs live; the default is `impower-vscode-test-web` under the system temp directory, shared by every worktree so the build downloads once, and never inside a checkout); `--quality stable|insiders`.

`verify` options: `--file <name>` (the file to open from the explorer, `main.sd` by default), `--hover <word>` (click the word and open the hover with Ctrl+K Ctrl+I), `--line <text>` (only look for the word on a line containing this text), `--shot <out.png>`, `--hover-shot <out.png>` (the hover widget alone), `--probe <file.js>` (body of an async function evaluated in the page; its return value lands in the JSON), `--settle <seconds>` (how long to wait for the diagnostics to stop changing, 60 by default), `--headed`.

The state file `.state.json` beside the driver (gitignored) records the URL, the server pid, the served folder and the log path. The driver imports the web editor driver's process helpers and its Chromium fallback, so the Playwright notes in the drive-web-editor skill apply here too: browsers come from the local `ms-playwright` cache, and `npm install` runs with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. The driver must stay inside the repo tree, because Node resolves `playwright` from the script's directory.

---

## 1. Build the extension

```bash
cd vscode-sparkdown && npm run build
```

About a minute here (49 s measured). It writes `vscode-sparkdown/out/extension.js`, and `up` refuses to serve until that file exists. The log ends with `Error: Compiled with errors` from `dts-bundle-generator` in the `spark-web-player` step and `no type bundle produced; skipping post-process`; that type bundle is not part of the extension, the command exits 0, and the check that the build happened is the modification time of `out/extension.js`, not the absence of that line.

After a change to the language server only, the full build is more than you need: `cd packages/sparkdown-language-server && npm run build` (6 s) then `cd vscode-sparkdown && node scripts/esbuild.ts` (9 s) rewrites `out/extension.js`, because the extension's esbuild bundles the server's `dist`. A change under `vscode-sparkdown/src/` needs only the second command.

---

## 2. Serve it

Boot the server once per session, with either a script or a folder:

```bash
node .claude/skills/drive-vscode-web/driver.mjs up --sd repro.sd
```

Expected:

```
serving C:\...\Temp\impower-vscode-test-web\projects\34223 pid 27048 → http://localhost:34223
first launch downloads the VS Code build (about 55 MB). Waiting...
stylesheet alias written in C:\...\impower-vscode-test-web\builds\vscode-web-stable-a44adf7f5...\out\vs\workbench
READY http://localhost:34223
```

The first launch on a machine downloads and unpacks the build (27 s here); later launches answer in under ten seconds. The port is derived from the worktree path, so it is stable for this worktree and clear of the other worktrees' servers. While the server is up, `up --sd other.sd` rewrites the served `main.sd` and the next `verify` reads the new script; the folder itself is fixed at launch, so `up --project` with another folder is refused until `down`.

A minimal `.sd` with a diagnostic (an undefined backdrop) and a dialogue line; copy syntax from a passing fixture rather than from memory when the repro needs more:

```
-> START

scene START

  [[show backdrop missing_backdrop]]

  ALICE:
    Hello from the served workbench.
end
```

Stop the server when done:

```bash
node .claude/skills/drive-vscode-web/driver.mjs down
```

---

## 3. Drive it

```bash
node .claude/skills/drive-vscode-web/driver.mjs verify --hover missing_backdrop --shot after.png --hover-shot hover.png
```

`verify` loads a fresh page, opens the file by clicking its explorer row, waits for the language server's diagnostics to settle, reads them, asks for the hover, screenshots, and prints the report. Verified output shape (`consoleErrors` and `url` omitted here; a `project` with assets and a hover on the image reference `colorscript_001`):

```json
{
  "file": "main.sd",
  "failed": [],
  "opened": true,
  "settled": true,
  "settledAfterS": 9,
  "diagnostics": {
    "problems": "0 2",
    "problemsLabel": "Warnings: 2",
    "squiggles": { "error": 0, "warning": 2, "info": 0 }
  },
  "hover": {
    "word": "colorscript_001",
    "present": true,
    "text": "",
    "img": { "hasSrc": true, "srcHead": "data:image/webp;base64,UklGRnQOAABXRUJQV", "rendered": "319 x 180", "complete": true }
  },
  "hoverScreenshot": "C:\\...\\hover.png",
  "screenshot": "C:\\...\\after.png"
}
```

How to read it, before trusting the PNG:

- `opened: false` (with the reason in `failed`): the file's explorer row never appeared. The screenshot shows the workbench as it was; usually the served folder is not what you think (`status` names it) or the workbench never finished loading.
- `settled` and `settledAfterS`: the diagnostics were read once a second until they had changed from the workbench's own starting value and then held for eight seconds, or held for eight seconds after twenty-five had passed for a file the server finds clean. `settled: false` means they were still changing when `--settle` ran out; the numbers reported are the last reading, not a result.
- `diagnostics.problems` is the status bar's counter, errors then warnings, and `problemsLabel` its label (`No Problems`, `Warnings: 2`); `squiggles` counts the underline overlays in the open editor by severity. A `0 0` that settled after twenty-five seconds is either a clean file or a language server that never started; `consoleErrors` and the server log (`status` names it) tell the two apart.
- `hover`: `present: false` lands in `failed`. The language server answers a hover only for a reference to an image asset (`packages/sparkdown-language-server/src/utils/providers/getHover.ts`), and Monaco adds any diagnostic under the cursor to the same widget, so on a word carrying a marker `text` is the diagnostic message (`Cannot find variable named 'bunny_realization' sparkdown main.sd(11, 10): ...`) and `img` is null; on an image reference `img` reports whether the `<img>` has a `src` and the size it rendered at, and `text` is empty. A word that is neither opens nothing, which is the extension working, not failing.
- `failed` lists every step that could not do what it was asked. An empty list with the screenshot you wanted is the pass; a non-empty list exits 1, so `verify ... && open after.png` cannot open a screenshot of the wrong thing.
- `consoleErrors` carries pre-existing noise on every run: two `404 (Not Found)` resource errors (`package.nls.json` and `out/data/spark.d.ts`), a `File Watcher ('FileSystemObserver')` error, and a `Not Found` page error. Something else in that list is worth reading.

Then open the PNG and look at it. The JSON is a convenience, not the gate.

After a change, rebuild (§1) and run `verify` again. Each `verify` loads a fresh page, which fetches the extension from disk, so the server does not need restarting.

---

## Gotchas

Things that look like they work and do not:

- Mouse movement never opens a hover headlessly. Moving the pointer onto the token, in steps, with a rest, produces no `.monaco-hover` at all while `elementFromPoint` confirms the pointer is over the right span. The driver clicks the word to place the cursor and presses Ctrl+K then Ctrl+I, the Show Hover command, which opens it every time. Do the same in a script of your own.
- A `.monaco-hover` element sits in the DOM hidden and empty between hovers, so `querySelector(".monaco-hover")` being non-null proves nothing. The driver counts only one with a rect bigger than 1 x 1 that holds an `img` or text.
- Rendered line text uses non-breaking spaces. Monaco draws every space in a `.view-line` as U+00A0, so `textContent.includes("show backdrop")` never matches the source's spaces. The driver normalizes both sides; a probe of your own has to as well.
- The first diagnostics readings are the workbench's own `0 0`. The extension host and the language server boot in workers after the page loads, and a hover asked for in that window opens nothing; a flat wait of a few seconds is not enough on a loaded machine. The driver's settle rule waits for the readings to change and hold, and only reads the hover after that.
- The stylesheet the served build ships is not the one the page links. The build's `out/vs/workbench/` holds `workbench.web.main.internal.css`; the server's page template links `workbench.web.main.css`, which returns 404, and the workbench renders as a plain document. `up` and `verify` both copy the file into place under every unpacked build, so this only bites a server launched by hand.
- The directory given to `vscode-test-web --testRunnerDataDir` is deleted whole before a build it does not have is downloaded, so a project folder or log written into it disappears with the next VS Code release. The driver keeps the served projects and the logs beside its `builds` directory, and a folder you serve with `--project` must not sit inside `builds`.
- Quick Open (Ctrl+P) is unreliable headlessly; the driver opens the file from its explorer row.
- `--esm` is required with this `@vscode/test-web` and the current build; without it the page's loader 404s and the workbench is blank. The driver passes it.
- The data directory is shared by every worktree, so two first launches at once race on the same download; when nothing has been downloaded yet, bring one server up to `READY` before another worktree's.
- A hand-launched server that is still listening makes a second launch on the same port fail with `EADDRINUSE` while the readiness poll keeps answering from the old process. The driver picks a free port and records the pid, so `down` stops the server it started and nothing else.

---

## Troubleshooting

| Symptom                                                                                     | Cause → fix                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `up` says `out/extension.js is missing`                                                     | The extension is not built in this worktree. §1.                                                                                                                                                                                                       |
| `up` says `node_modules/@vscode/test-web/.../index.js is missing`                            | No install in this worktree. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` at the repo root.                                                                                                                                                        |
| The workbench renders as a plain document: serif headings, bulleted lists, no explorer, no editor chrome | The stylesheet alias is missing under the build (Gotchas). `verify` writes it; for a server launched by hand, copy `workbench.web.main.internal.css` to `workbench.web.main.css` in `<data dir>/vscode-web-*/out/vs/workbench/` and reload. |
| `failed` says `could not open main.sd from the explorer`; the explorer shows the folder greyed with a `!` | The served folder cannot be read: it was deleted (a folder inside the build directory goes with a new download) or never held the file. `status` names the folder; `ls` it; `down`, then `up` again.                                       |
| `settled: false`                                                                            | The diagnostics were still changing at `--settle`. Raise it, and check whether a vitest suite is saturating the machine.                                                                                                                              |
| `diagnostics.problems` is `0 0` and `settledAfterS` is 25 or more, on a file that should have a diagnostic | The language server never started, or the file is not the one you think. Read `consoleErrors` past the pre-existing noise and the server log `status` names; confirm `--file` and the served folder.                                    |
| `failed` says `no hover opened on "<word>"`                                                 | The word is neither an image reference nor under a diagnostic, so the extension has nothing to show; or the language server had not answered yet on a very slow run. Check `diagnostics`; pick a word with a marker or an image reference.            |
| `up` times out after 10 min                                                                 | The download did not complete or the server died. Read the log `status` names (`logs/serve-<port>.log` under the data directory), then `down`.                                                                                                        |
| `Error: Compiled with errors` in the build log                                              | The `spark-web-player` type bundle (`dts-bundle-generator`), which the extension does not use. The build exits 0; check `out/extension.js`'s modification time.                                                                                        |

---

## Improving this skill

If a step here failed, needed a flag or path it does not give, did not apply to your change without saying so, or cost you time on something Gotchas and Troubleshooting do not cover, report it under a "Skill feedback" heading in your final message with the edit you propose, as `CLAUDE.md` describes. Prefer a mechanism to a warning: when the problem is a step a session can forget or get wrong, propose the driver command or the check that makes the mistake impossible rather than a sentence telling the next session to be careful. A new trap goes in Gotchas; a new failure with a known fix goes in the Troubleshooting table. `driver.test.mjs` beside the driver pins the stylesheet alias, the data layout, the port rule, the space normalization, the settle rule and the flag parsing; run it after any change here. When you are certain of the fix and the session has a branch and pull request, make it in this file in its own commit and mention it under the pull request's Notes for reviewers.
