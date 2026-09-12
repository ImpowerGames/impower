# Extension verification options and reports

All commands run from the worktree root unless stated otherwise.

`verify` options: `--file <name>` (the file to open from the explorer, `main.sd` by default; a name at the top level of the served folder, matched exactly, so a file of that name in a subfolder is never the one opened), `--hover <word>` (put the cursor on the word and open the hover with Ctrl+K Ctrl+I; a whole word, on the first rendered line that holds it), `--line <text>` (only look for the word on a line containing this text), `--hover-image` (the hover must carry an image, or the run fails; for a change whose point is the image), `--shot <out.png>`, `--hover-shot <out.png>` (the hover widget alone; `--line`, `--hover-image` and `--hover-shot` are refused without `--hover`), `--probe <file.js>` (body of an async function evaluated in the page; its return value lands in the JSON), `--settle <seconds>` (how long to wait for the diagnostics to stop changing, 60 by default and never below 30, since a file the server finds clean needs 25 readings a second apart before the rule can call it settled, plus 5 s for taking them; a run whose diagnostics have not settled by then is a `failed` entry), `--headed`.

## 3. Drive it

```bash
node .agents/skills/drive-vscode-web/driver.mjs verify --hover missing_backdrop --shot after.png --hover-shot hover.png
```

`verify` loads a fresh page, opens the file by clicking its explorer row, waits for the language server's diagnostics to settle, reads them, asks for the hover, screenshots, and prints the report. Verified output shape (`consoleErrors`, `consoleNoise`, `url`, `project` and `build` omitted here; the repro above, with a hover on the image reference `missing_backdrop`):

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
- `consoleErrors` holds console errors and page errors, with known matches (two `404 (Not Found)` resources, the `FileSystemObserver` file watcher, the `Not Found` page error) counted under `consoleNoise`. A zero means no matching error was captured; an error the list does not know stays in `consoleErrors`.

Then open the PNG and look at it. The JSON is a convenience, not the gate.

After a change, rebuild using [build instructions](build.md) and run `verify` again. Each `verify` loads a fresh page, which fetches the extension from disk, so the server does not need restarting. `verify` drives only the server its own record started: a record whose pid is another process by now is refused with `down` then `up`, so a report never describes another worktree's workbench under this worktree's build.

---
