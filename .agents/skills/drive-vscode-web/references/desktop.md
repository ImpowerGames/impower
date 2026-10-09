# Desktop scenarios and web debugging

Run from the issue worktree. Install its own dependencies with the browser-download skip described in the build reference. Supply an explicit desktop executable with `--code`; the driver uses the browser automation library's Electron launch API and never connects to an existing desktop session. Windows ZIP distributions support an isolated host when the system installation is updating. Keep downloaded hosts, profiles, plans, logs and screenshots outside checkouts.

## F5 first, full build second

Run F5 in a fresh dedicated checkout with generated scenario outputs absent, before any full build:

```text
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <absolute-Code.exe> --scenario f5 --out <new-private-run-directory>
```

This opens impower, waits for its private helper's task subscription, and presses F5 using the committed launch configuration and its real preLaunchTask. The report records task-start/task-exit events and the initial artifact inventory. If F5 only opens the sidebar, the fallback invokes the committed configuration by name through the public debug API; `namedLaunchFallback` records that different trigger. It cannot establish a keyboard-F5 pass. A pre-existing scenario build is refused: do not delete active outputs or prepare a full build to conceal missing F5 dependencies. The driver reports failures in the product build path; repairing those belongs to the extension ticket.

Then run `npm run build` in `vscode-sparkdown` for the distinct full-build control:

```text
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <absolute-Code.exe> --scenario full-build --out <another-new-private-run-directory>
```

The representative fixture opens its whole `desktop-project` root, `project/main.sd`, an imported script and an SVG asset. The normal expected diagnostic set is empty. An external whole project uses explicit story expectations:

```text
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <absolute-Code.exe> --scenario full-build --project <external-repository-root> --file project/main.sd --first "known initial dialogue" --next "known dialogue after player input" --out <new-private-run-directory>
```

Keep the repository root rather than substituting its script subfolder. `--file` is relative to that root and cannot escape it. External content is never copied into public fixtures. Default request/readiness budget is 90 seconds; `--timeout` accepts 10–300. Intentional diagnostics use `--expect <json>` containing their exact file (relative to project), severity, message, source and one-based `start`/`end` line/column. Invalid expectations are refused before launching. Unexpected, missing or relocated diagnostics fail. The separate `fixtures/desktop-warning-project` demonstrates one intentional unknown-character warning using its `expected-warning.json`; it cannot contaminate the clean representative root.

## Read the evidence

Each exclusive run directory retains `report.json`, `host.json`, the private launch plan, host/renderer logs, native extension-host/LSP logs and screenshots. The report records host version, exact root/document URI, development extension path, executable hash, on-disk extension fingerprint at activation and hashes/sizes/times for the extension, copied language worker, game webview (including its embedded player/workspace worker), and required fonts. Fingerprints are on-disk evidence from a fresh host, not a claim that every loaded worker byte was independently captured.

Full/range semantic-token and document-symbol commands must return usable data. A timeout, absent result, provider exception, crash, unexpected diagnostic identity or unclassified renderer error fails the strict verdict. Surface fields preserve distinct desktop, LSP and preview outcomes: a successful request does not clear a preview error, and successful preview content does not clear an extension error. Captured known host startup noise is counted separately; product failures remain errors.

Game Preview is opened through `sparkdown.previewGame`. Story expectations must be in a descendant webview/player frame with visible frame/element ancestors. The source editor cannot satisfy them. After clicking RUN, the driver waits for visible canvas bounds to settle across the Debug Console layout change, sends physical pointer input there, records its trusted game UI/canvas target, and requires changed story content with both screenshots. Inspect those PNG pixels yourself; `pixelsInspected: false` records the remaining visual gate. An open/blank panel is a failure. Owned application exit and F5 task-stop evidence must be confirmed.

Windows portable VS Code was exercised. Other operating systems and distributions require their own executable launch, interaction and pixel evidence; they are unverified coverage rather than implied passes. Source-content stamps accept identical touches and refuse changed/deleted source sets without rebuilt artifacts. Copied fonts must still match their sources.

Unavailable desktop launch is never a pass. Preserve its failure report and original cause (such as the installed host's update mutex), and use a separate supported host as a clearly identified control when available. Do not stop an updater or a user's running application.

## Web Run and Debug

Build all preview artifacts, then:

```text
node .agents/skills/drive-vscode-web/driver.mjs up --sd .agents/skills/drive-vscode-web/fixtures/debug.sd
node .agents/skills/drive-vscode-web/driver.mjs debug --breakpoint 15 --shot <private-debug.png>
node .agents/skills/drive-vscode-web/driver.mjs down
```

The probe opens Preview Game and Run & Debug Game, selects source text and supplies real player input to obtain an awaiting-interaction pause. It requires a source frame and variable values, steps to a changed frame, evaluates `mood` (expected `0` before the assignment executes), then continues and requires a changed stack. `--file`, `--first`, `--evaluate` and `--value` customize the script and evaluation. `--breakpoint` additionally clicks that source gutter line and requires a distinct breakpoint stop there. The current representative fixture bound line 15 and stopped at `main.sd15:1`; breakpoint behavior in other scripts remains subject to its own probe. Without this option, awaiting-interaction pauses leave breakpoint binding unverified. Inspect paused/continued/breakpoint/final screenshots. The inline adapter runs in the served workbench; unclassified console errors still fail the overall verdict even when every debugger action succeeds.

The one-shot helper is installed only in a private extensions directory. It uses public APIs and private result files, exposes no production endpoint, and does not implement the shared editor protocol transport tracked by #536.
