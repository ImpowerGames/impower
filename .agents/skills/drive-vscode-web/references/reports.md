# Extension verification options and reports

All commands run from the worktree root unless stated otherwise.

Build the extension with the served driver opt-in in [build instructions](build.md), then start the workbench with [serve options](serve.md).

## Verify the served workbench

- `--file <name>` opens the exact top-level explorer entry, `main.sd` by default.
- `--settle <seconds>` sets the deadline for opening the protocol document and receiving diagnostics for its version, 60 seconds by default. Hover protocol operations receive a separate deadline of the same length.
- `--hover <word>` locates the first whole word in the complete document and reveals it through the editor protocol. `--line <text>` restricts that search to a line containing the text. `--hover-image` requires the rendered hover to contain an image.
- `--shot <out.png>` captures the workbench. `--hover-shot <out.png>` captures the rendered hover. `--line`, `--hover-image`, and `--hover-shot` require `--hover`.
- `--probe <file.js>` evaluates the body of an async function in the page and records its return value. `--headed` uses a visible browser.
- `--debug` adds the served Game Preview and Run & Debug UI probe and requires a complete runtime build. `--expression <text>` and `--result <text>` set the expected Debug Console evaluation, defaulting to `1 + 1` and `2`. `--debug-shot <png>` captures the paused variables, stack, and evaluation. These three options require `--debug`. See [desktop scenarios](desktop.md) for the independent desktop probe and the breakpoint limitation.

```bash
node .agents/skills/drive-vscode-web/driver.mjs verify --hover missing_backdrop --shot after.png --hover-shot hover.png
```

Each run opens a fresh browser page and subscribes to the development host before clicking the explorer row. `opened` reports the visual tab check. `document` records the protocol URI, version, and selection of the active top-level file. Selection positions are zero-based UTF-16. The driver searches the host's full source text, including lines outside the viewport, and leaves the source's tabs and spaces intact.

`settled` is true after the language server returns full diagnostics and the host sends the corresponding notification for the exact active URI and version. `diagnostics` holds that URI, version, and diagnostic list. A clean script can return an empty list. `extension.activated` means a document reply came from the development extension, and `extension.answered` means the initialized language server supplied the current diagnostic result. `protocol` records connection generations, request IDs, and notification URI/version metadata. The trace omits document text and transport credentials. A missing endpoint, stale or wrong document, timeout, reload, or disconnect fails the affected verification.

`hover.position` and `hover.selection` come from the protocol. `hover.model` is the language server's result and may be null for a diagnostic hover. `hover.diagnostics` contains current diagnostics at the requested position. `hover.visual` records the actual popup after the driver checks the rendered caret geometry and invokes Show Hover with Ctrl+K Ctrl+I. A hidden or missing popup fails even when the model returned content. An image needs a source, nonzero rendered dimensions, a completed load, and nonzero natural dimensions. Use `--hover-image` to catch an image that disappears entirely.

`failed` lists verification failures and makes the command exit 1. The driver still attempts the requested full screenshot. Unknown `consoleErrors` fail verification. Known resource and watcher messages are counted in `consoleNoise`. Inspect the requested PNGs for visible editor text, caret placement, hover content and image rendering.

Rebuild after a change and run `verify` again. The fresh page fetches the updated extension from disk. `verify` drives only the server its own record started. If the record no longer identifies that process, run `down` and then `up`.

---
