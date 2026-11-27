# Frame pacing in the Game Preview

All commands run from the worktree root unless stated otherwise.

`pacing` plays fixed lines in VS Code's Game Preview and reports, for each, the wait from the click to the line firing and whether the screen kept up afterwards (I-2809). What each figure means, the fixture and the repeatability rule are in [the web editor driver's pacing page](../../drive-web-editor/references/pacing.md); both surfaces share one analysis module and one run loop. This page covers what is particular to the desktop host. The main fixture decodes its sounds before any measured line; to measure the player's fallback decoder for the RFC 6716 codec while a narration line plays, run the second fixture through `--project` as `fixtures/pacing-audio/SOURCE.md` describes.

```bash
cd vscode-sparkdown && npm run build
cd ..
node .agents/skills/drive-vscode-web/driver.mjs pacing --code <VS Code executable> --runs 2 --out <evidence-directory>
node .agents/skills/drive-vscode-web/driver.mjs pacing --code <VS Code executable> --project <folder> --line 5649 --beats 16 --out <evidence-directory>
```

Like `desktop --mode full`, it refuses a missing or stale complete-runtime build. Each run launches the executable on the project with a private profile and extensions directory, the driver's command harness, `--extensionDevelopmentPath` for this checkout's extension and a free `--remote-debugging-port`, and stops its own process tree at the end; the profile is removed afterwards, and a profile Windows still holds open is named in the run's `leftBehind`. The harness opens `--file` (default `main.sd`) at the start line and runs Preview Game; the command presses RUN, waits for the first line to play and finish (the first line after RUN can take 10 to 15 seconds), and clicks the preview once per line. The game is the `active-frame` document of the webview target whose URL names the extension; the probe, the layer tree and the line's marks are read there, and the trace is taken on the browser connection, so it holds the webview's renderer and the graphics process.

The profile maximises the window. RUN opens the Debug Console as it does for an author, which shrinks the preview, so the report's `gameView` is read after RUN, once the first line has played; the graphics cost of a picture follows its pixel area, so compare runs only at the same game view size.

With the machine at full CPU load, the preview's three-second hang guard (`WORKER_HANG_AFTER_MS` in `packages/spark-web-player/src/main/workers/WorkerWatchdog.ts`) can fire while the preview replays to a late start line; such a run is marked not quiet in any case.

`--out` holds `report.json`, a screenshot of the preview after each line (`line-NN-<line>.png`), each run's `desktop.log` and `host-report.json`, and with `--keep-trace` each line's trace. Inspect the screenshots: a run whose preview showed the wrong lines or an empty game is not evidence.
