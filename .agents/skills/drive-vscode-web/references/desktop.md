# Desktop development-host scenarios

Run from the worktree root on Windows or Linux with an installed VS Code executable. The driver launches a private profile and extensions directory and installs only its test command harness there. Shutdown validates the recorded parent PID/start identity, requests a tree stop and waits for the parent to exit. On Windows, `stopped: true` records a successful `taskkill /T` request and observed parent exit; it does not independently audit descendant identities or prove that a previously detached child exited. The profile disables automatic saving before debugging so external scenario files are not saved by the probe. It does not attach to a user's editor. Keep each `--out` directory unique. On failure, inspect `report.json`, the recorded logs and screenshots before retrying. An unavailable host, timeout, missing output or failed shutdown is a failure, never a passed surface.

```bash
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <executable> --mode full --out <evidence-directory>
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <executable> --mode f5 --out <different-evidence-directory>
```

`full` requires `cd vscode-sparkdown && npm run build` first and refuses missing or stale runtime artifacts. `f5` opens this checkout and invokes F5's Start Debugging command. The harness adds the scenario folder to the real checked-in launch configuration, so the development host opens that folder directly. Its background task builds and watches the language-server and PDF workers plus all four webviews before starting the extension copier. Readiness requires matching worker copies and nonempty webviews. A compilation error does not print a successful build marker. The optional player declaration bundle is not a runtime prerequisite.

Use full mode for a packaged-runtime baseline and F5 mode for task/build changes. To check missing-output recovery, move an output to a private snapshot, run F5 and verify it is rebuilt; preserve the snapshot until verification completes. For source propagation, change a runtime source in the owned worktree, confirm full mode refuses the stale artifact, then run F5 and compare the loaded script hashes to the rebuilt files. Restore the source through the editor and rebuild before recording final evidence. Do not remove another session's output or stop an unowned watcher.

The default public fixture has a nested entry script, an included script, a backdrop and a JavaScript asset whose name collides with an inherited property. The scenario selects the nested file, requests full and range semantic tokens, executes the real Preview Game command, requires visible story text, clicks RUN, advances dialogue and selects a choice. It compares diagnostics both before and after the interactions. Each step captures a screenshot. Inspect the pixels, including the backdrop; a mounted empty panel or hidden text does not pass.

For an external project, pass `--project <whole-folder> --scenario <local-json>`. `file` is relative to that folder and `line` is one-based. Repository-root and project-subfolder launches are separate scenarios: do not silently substitute one for the other. Keep private project files, diagnostic baselines and screenshots outside the public repository and PR. A scenario has this shape:

```json
{
  "file": "project/main.sd",
  "line": 8,
  "expectedDiagnostics": [],
  "preview": {
    "text": "Desktop preview is ready.",
    "steps": [
      { "selector": "#play-button", "text": "Desktop preview is ready." },
      { "selector": "#game", "text": "Continue the driver story" },
      { "textButton": "Continue the driver story", "text": "Continue the driver story" },
      { "selector": "#game", "text": "The driver choice worked." }
    ]
  },
  "debug": { "expression": "driver_score", "result": "42" }
}
```

Expected diagnostics must list each `file`, exact `message`, `severity` and `source`; an optional `line` narrows a match. Every unexpected diagnostic and every missing expectation fails. Do not accept a baseline solely because a counter settled: inspect and justify each existing diagnostic. Full/range token requests and their language-server trace responses must succeed; a valid range can have no tokens. Server errors, host crashes and unclassified console errors fail even when editor highlighting appears healthy. The report separately names exact bundled Copilot proposal-metadata and JavaScript debugger URL-deprecation messages observed in VS Code 1.140.0; other versions/messages remain failures.

Reports retain VS Code version, workspace root, selected document, build freshness, disk artifact hashes, loaded extension/webview/worker script URLs and hashes, language-server and host logs, diagnostics, interaction outcomes, runtime errors and PID/start-time ownership. Loaded scripts must match this checkout's bytes and location; the extension's exact host-added CommonJS wrapper is accounted for. `--timeout <seconds>` sets each polling deadline (1–600, default 180). A nonempty `failed` or `unavailable` array is not verified. Evidence directories can include project contents in logs: publish only reviewed public-fixture artifacts.

The optional desktop debugger scenario exercises pause, stack, scopes, variables, evaluation, step and continue. Its fixture must leave subsequent stopping locations after the preview interactions: both Step and Continue require a changed stack location, and an acknowledged request or a disappearing adapter does not pass. The driver reveals Game Preview if debugger source navigation covers its tab before a reading. The served workbench retains a separate UI probe: `verify --debug --expression driver_score --result 42 --debug-shot debug.png`. It opens Game Preview, starts playback and the debugger, pauses, expands variables, evaluates in Debug Console, steps and continues. Sparkdown can stop again while awaiting a player interaction; that is a valid continuation when the frame changes. The fresh browser is closed after the probe. Neither probe asserts breakpoint binding. Served source-URI mapping has historically limited breakpoints; changes to it require a dedicated binding scenario, not a claim based on pause/step results.
