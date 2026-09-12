---
name: drive-vscode-web
description: "Verify the built extension in a served VS Code workbench: open a script, inspect diagnostics and hover, and view screenshots. Use for extension and shared language-server changes."
---

# Drive the extension in the web workbench

Commands run inside the worktree:
`node .agents/skills/drive-vscode-web/driver.mjs <command>`.

This driver reaches open-script text, diagnostics and hover. Preview panels, commands, tree views and debugging require a desktop development host; disclose them as unverified if no host is available.

## 1. Build

Before building or addressing a stale-build refusal, read [build instructions](references/build.md). Start with `cd vscode-sparkdown && npm run build`; the reference describes narrower rebuilds and what they omit.

Keep the driver inside the repo for dependency resolution. If installing dependencies, use `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; Playwright uses the local browser cache. For browser launch or shared process-helper failures, read the web driver's [server setup](../drive-web-editor/references/server.md).

## 2. Serve

Before launch, read [serve options](references/serve.md), especially when using a whole project, shared build data or `--fresh`. Run `up --sd repro.sd` or `up --project <folder>`. Shared build downloads must not replace a build another worktree is serving. Use `status` to identify the URL and served folder.

## 3. Verify and look

Before verification, read [verification options and reports](references/reports.md). Run `verify --hover <word> --shot after.png --hover-shot hover.png`; use `--line` to disambiguate a repeated reference and `--hover-image` when the image is the behavior under test.

Require the correct file to open, the extension and server to answer, diagnostics to settle, and no failed steps. Check image load and rendered size when relevant. Open the screenshots and inspect pixels; JSON is not the visual gate.

After a change, rebuild and verify again. The page reload fetches the built extension; the server normally needs no restart. Stop your server with `down` when done. Preserve state and follow a refusal when process ownership is uncertain.

Before writing a custom workbench probe, read [probe caveats](references/custom-probes.md).
