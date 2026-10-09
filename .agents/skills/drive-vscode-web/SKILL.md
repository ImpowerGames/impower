---
name: drive-vscode-web
description: "Verify the built extension in a served workbench or isolated desktop development host, including Run and Debug, language requests and Game Preview. Use for extension and shared language-server changes."
---

# Drive the VS Code extension

Commands run inside the worktree:
`node .agents/skills/drive-vscode-web/driver.mjs <command>`.

Choose the surfaces the ticket requires before running. The web `verify` command checks editor/hover rendering and settled counters; counters alone do not verify exact diagnostics, semantic-token health or Game Preview. Web `debug` exercises the inline adapter's pause, Variables, call stack, evaluation, step and continue. It reports breakpoint binding separately; awaiting-interaction pauses are not breakpoint evidence. Commands and webviews are reachable in the served workbench, so test the requested capability before claiming it requires desktop.

For desktop F5, an external whole project/nested script, exact diagnostics, semantic-token health or Game Preview, read [desktop scenarios](references/desktop.md) and run `desktop` with the evidenced automation route. It launches an isolated owned host, captures logs/artifact fingerprints, and requires visible known story content plus an interaction. A required surface that fails or is unavailable is a failed check; an open window or blank panel never establishes preview success.

## 1. Build

Before building or addressing a stale-build refusal, read [build instructions](references/build.md). Fresh desktop F5 precedes any build; the separate full-build scenario uses `cd vscode-sparkdown && npm run build`.

Keep the driver inside the repo for dependency resolution. If installing dependencies, use `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; Playwright uses the local browser cache. For browser launch or shared process-helper failures, read the web driver's [server setup](../drive-web-editor/references/server.md).

## 2. Serve

Before launch, read [serve options](references/serve.md), especially when using a whole project, shared build data or `--fresh`. Run `up --sd repro.sd` or `up --project <folder>`. Shared build downloads must not replace a build another worktree is serving. Use `status` to identify the URL and served folder.

## 3. Verify and look

Before verification, read [verification options and reports](references/reports.md). Run `verify --hover <word> --shot after.png --hover-shot hover.png`; use `--line` to disambiguate a repeated reference and `--hover-image` when the image is the behavior under test.

Require the correct file to open, the extension and server to answer, diagnostics to settle, and no failed steps. Check image load and rendered size when relevant. Open the screenshots and inspect pixels; JSON is not the visual gate.

After a change, rebuild and verify again. The page reload fetches the built extension; the server normally needs no restart. Stop your server with `down` when done. Preserve state and follow a refusal when process ownership is uncertain.

Before writing a custom workbench probe, read [probe caveats](references/custom-probes.md).
