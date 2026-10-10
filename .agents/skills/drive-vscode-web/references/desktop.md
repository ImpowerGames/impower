# Desktop scenarios and web debugging

Run from the issue worktree. Install its own dependencies with the browser-download skip described in the build reference. Supply an explicit desktop executable with `--code`. The default `--automation electron` uses the browser automation library's Electron launch API. The explicit Windows `--automation cdp` route spawns its own host and connects only after verifying the loopback listener's owning PID and OS start identity. Neither route attaches to a user's existing session; neither silently falls back. Keep downloaded hosts, profiles, plans, logs and screenshots outside checkouts.

Portable Windows VS Code 1.140.0 was exercised through CDP. Its Electron F5 control crashed a native extension host with exit 134 before opening the requested project. CDP reached the project and nested script in a separate control. Electron adds a main-process Node inspector; CDP uses renderer automation only, but these observations do not establish the inspector as the crash's cause. Use the explicit CDP commands below for that host. An installed host blocked by its update mutex remains unavailable; do not stop the updater. Other versions need their own control.

## F5 first, full build second

Run F5 in a fresh dedicated checkout with generated scenario outputs absent, before any full build:

```text
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <absolute-Code.exe> --automation cdp --scenario f5 --out <new-private-run-directory>
```

This opens impower, waits for its private helper's task subscription, and presses F5 using the committed launch configuration and its real preLaunchTask. The report records task-start/task-exit events and the initial artifact inventory. If F5 only opens the sidebar, the fallback invokes the committed configuration by name through the public debug API; `namedLaunchFallback` records that different trigger. It cannot establish a keyboard-F5 pass. A pre-existing scenario build is refused: do not delete active outputs or prepare a full build to conceal missing F5 dependencies. The driver reports failures in the product build path; repairing those belongs to the extension ticket.

Then run `npm run build` in `vscode-sparkdown` for the distinct full-build control:

```text
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <absolute-Code.exe> --automation cdp --scenario full-build --out <another-new-private-run-directory>
```

The representative fixture opens its whole `desktop-project` root, `project/main.sd`, an imported script and an SVG asset. The normal expected diagnostic set is empty. An external whole project uses explicit story expectations:

```text
node .agents/skills/drive-vscode-web/driver.mjs desktop --code <absolute-Code.exe> --automation cdp --scenario full-build --project <external-repository-root> --file project/main.sd --first "known initial dialogue" --next "known dialogue after player input" --out <new-private-run-directory>
```

Keep the repository root rather than substituting its script subfolder. `--file` is relative to that root and cannot escape it. External content is never copied into public fixtures. Default request/readiness budget is 90 seconds; `--timeout` accepts 10–300. Intentional diagnostics use `--expect <json>` containing their exact file (relative to project), severity, message, source and one-based `start`/`end` line/column. Invalid expectations are refused before launching. Unexpected, missing or relocated diagnostics fail. The separate `fixtures/desktop-warning-project` demonstrates one intentional unknown-character warning using its `expected-warning.json`; it cannot contaminate the clean representative root.

## Read the evidence

Each exclusive run directory retains `report.json`, `host.json`, the private launch plan, host/renderer logs, native extension-host/LSP logs and screenshots. Atomic `report.json` checkpoints have `complete: false` until final collection; interrupted progress is not a completed verdict. `host.json.progress` preserves root/document identity before language readiness; partial evidence cannot verify language health. The report records host version, exact root/document URI, development extension path, executable hash, on-disk extension fingerprint at activation and hashes/sizes/times for the extension, copied language worker, game webview (including its embedded player/workspace worker), and required fonts. Fingerprints are on-disk evidence from a fresh host, not a claim that every loaded worker byte was independently captured.

An ancillary F5-trigger screenshot failure remains a strict failure but does not abort core host collection. Final window screenshots follow owned task-stop. Valid partial evidence arriving during cleanup is retained with `hostProgressCollectedDuringCleanup`; it establishes only the observed root/document and leaves language health failed. Wrong-run or non-partial progress is refused. A missing development-host screenshot remains a visual verification gap even when a progress file names the root.

CDP evidence includes exact launch arguments, environment differences, parent/start identity, loopback listener ownership and sampled descendant identities. Close acknowledgement is bounded separately from process exit: a disconnected transport cannot establish cleanup. The OS must confirm parent and tracked descendants absent; uncertainty or required forced termination fails. Raw host output remains complete. Pre-shutdown native crashes fail the surface; exits observed only after the owned shutdown request are retained separately under `shutdownNativeExits`.

Full/range semantic-token and document-symbol commands must return usable data. A timeout, absent result, provider exception, crash, unexpected diagnostic identity or unclassified renderer error fails the strict verdict. `parent.workbench` records parent-window readiness separately; the desktop surface requires actual development-host root/document identity and cannot remain verified after a captured native extension-host crash. Surface fields preserve distinct desktop, LSP and preview outcomes: a successful request does not clear a preview error, and successful preview content does not clear an extension error. Captured known host startup noise is counted separately; product failures remain errors.

Game Preview is opened through `sparkdown.previewGame`. Story expectations must be in a descendant webview/player frame with visible frame/element ancestors. Every non-whitespace text node must have visible geometry; the player's glyph containers must finish their opacity reveal. Complete DOM text alone cannot satisfy a still-typing line. The source editor cannot satisfy them. After clicking RUN, the driver waits for visible canvas bounds to settle across the Debug Console layout change, sends physical pointer input there, records its trusted game UI/canvas target, and waits for the requested changed text after each click. One overall input deadline covers geometry, trusted input and observing the goal; a revealing goal continues to be observed without another click. A retry requires the fully visible prior beat. It stops at the first success; at most three clicks allow typing completion without blindly skipping a beat. Every retry samples current bounds. Both screenshots are required. Inspect those PNG pixels yourself; `pixelsInspected: false` records the remaining visual gate. An open/blank panel is a failure. Owned application exit and F5 task-stop evidence must be confirmed.

Windows portable VS Code was exercised. CDP currently refuses other operating systems before spawning because their listener/tree ownership inspection is not implemented. Electron remains available as an explicit separate route but requires its own executable launch, interaction and pixel evidence; other operating systems and distributions are unverified coverage rather than implied passes. Identical-source timestamp exemptions also require that each artifact matches its stamped hash/time. The guard conservatively watches the whole scenario source set for each binary and dates additions/deletions with the nearest surviving directory, so an unrelated rebuild cannot conceal an unchanged player bundle. Copied fonts must still match their sources.

Unavailable desktop launch is never a pass. Preserve its failure report and original cause (such as the installed host's update mutex), and use a separate supported host as a clearly identified control when available. Do not stop an updater or a user's running application.

## Web Run and Debug

Build all preview artifacts, then:

```text
node .agents/skills/drive-vscode-web/driver.mjs up --sd .agents/skills/drive-vscode-web/fixtures/debug.sd
node .agents/skills/drive-vscode-web/driver.mjs debug --breakpoint 15 --shot <private-debug.png>
node .agents/skills/drive-vscode-web/driver.mjs down
```

The probe opens Preview Game and Run & Debug Game, selects source text and supplies real player input to obtain an awaiting-interaction pause. It requires an exact mounted source frame and variable values, steps to a changed source location, evaluates `mood` (expected `0` before the assignment executes), then continues until a changed exact-source frame is explicitly paused on awaiting interaction. Running, terminated, empty or unknown states are recorded but cannot satisfy this fixture's transcript. `--file`, `--first`, `--evaluate` and `--value` customize the script and evaluation. `--breakpoint` additionally clicks that source gutter line and requires a distinct breakpoint stop at that exact numeric line and freshly hovered mounted source path. The current representative fixture bound line 15 and stopped at `main.sd15:1`; breakpoint behavior in other scripts remains subject to its own probe. Without this option, awaiting-interaction pauses leave breakpoint binding unverified. Inspect paused/continued/breakpoint/final screenshots. The inline adapter runs in the served workbench; unclassified console errors still fail the overall verdict even when every debugger action succeeds.

The one-shot helper is installed only in a private extensions directory. It uses public APIs and private result files, exposes no production endpoint, and does not implement the shared editor protocol transport tracked by #536.
