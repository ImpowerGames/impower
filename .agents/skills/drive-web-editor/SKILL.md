---
name: drive-web-editor
description: Verify the web editor and game preview through the committed browser driver. Use for editor, preview, asset or package changes requiring rendered or measured evidence.
---

# Drive the web editor

Commands run inside the worktree under test:
`node .agents/skills/drive-web-editor/driver.mjs <command>`.

## Start and select the operation

Run `preflight`, then `up` to launch both servers on pinned ports. Use `status` to identify the URL and `down` to stop your recorded servers. Servers `up` starts stop themselves after 15 minutes in which no browser held a connection to them, so a browser command after a long gap finds them down and names `up`; `up --keep` disables that for a long hands-on run. Servers and the browser profile belong to the session that launched them; `down` leaves another session's servers running, and a new session seeds its own profile. For installation, stale state or shutdown failures, read [server setup and recovery](references/server.md). For manual dev-server launch or handshake/OPFS troubleshooting, read [launcher wiring](../references/web-launcher.md).

Select only the references needed for this run:

- Before driving game preview, read [preview verification](references/preview.md). Typical command: `verify --sd repro.sd --line 8 --shot before.png`.
- Before driving editor panels, screens, hover, completion, an in-page insert, a scrub without reload or PLAY, read [editor UI](references/ui.md). `verify` alone cannot verify those surfaces; use `ui`.
- Before `--project` or `seed`, read [project seeding](references/projects.md). Asset changes need the whole project. These operations replace OPFS files; inspect the source, retain needed data, and do not blindly clear a failed seed.
- Before checking service-worker code or its shared imports, read [installed-worker verification](references/service-worker.md). Use `--fresh-sw` on both phases and compare installed built-worker hashes. A fresh worker retains caches.
- For performance, memory, count or timing changes, read [measurement](references/performance.md) before choosing a fixture or timing a run.
- Before writing a custom browser probe, read [custom probe caveats](references/custom-probes.md). Keep scripts importing driver helpers inside the worktree for dependency resolution and never stage scratch files.
- For direct requests, notifications or socket clients, read [editor protocol](references/protocol.md).

## Viewport, color scheme and theme

`verify`, `ui` and `screenshot` accept these anywhere on the command line; other commands refuse them:

- `--viewport <preset|WxH>`: `desktop` 1440x900, `tablet` 768x1024, `phone` 360x780, `phone-large` 430x932, or any size such as `1280x720`. `phone` and `phone-large` also turn on touch, `isMobile` and device scale factor 3, so `(pointer: coarse)` and `(hover: none)` match; their screenshots hold three device pixels per page pixel, so a 360x780 page saves as 1080x2340. Without the flag the page stays 1600x1000 with a mouse, so earlier evidence stays comparable.
- `--color-scheme light|dark`: the `prefers-color-scheme` the page reports, for checking the Automatic theme.
- `--theme <name>`: the stored theme preference the page loads with, such as `charcoal`, `chalk` or `automatic`. Without it the stored theme is cleared, so the page starts under Automatic and `--color-scheme` picks Chalk or Charcoal. The report's `display.renderedTheme` is the `data-theme` the editor set; a theme it does not offer fails the run.

The report's `display` field echoes what was applied. Desktop and tablet presets are evidence widths; at phone widths the presets are quick checks only, and the [Android emulator](#android-emulator) route is the bar.

`screenshot <name> [--step <name>]... [--out-dir <dir>]` loads the editor, runs the [named steps](#named-steps) and saves the page as `<name>[-<viewport>][-<theme>][-<scheme>].png`, such as `story-tablet-chalk-light.png`, so an evidence folder holds one file per combination. `--shot <path>` on `verify` and `ui` writes exactly the path given.

## Android emulator

Phone layouts are verified on an emulator, because the on-screen keyboard and native selection never appear under the phone presets. `--device android` on `verify`, `ui` or `screenshot` runs the editor in Chrome on an Android Virtual Device. The route exists on the maintainer's machine only; CI keeps the Chromium presets. Before a device run, read [the Android route](references/android.md): its setup, the tab it owns, the port mappings, the machine-wide device queue and what a device screenshot waits for. Each run drives and closes its own tab and fails when the page it drove measures 0x0 or is not the visible tab.

## Named steps

`ui` and `screenshot` accept `--step <name>`, repeatable, with any viewport or device: `app-menu`, `dialog` (open one and dismiss it), `drawer` (the drawer or rail), `file-menu` (the Scripts page's first non-Main row menu, reported as `row`), `asset-inspector`, `add-menu`, `preview-settings`, `play`, `problems`, `settings=<section>`, `focus-project-name`, `focus-script-name` and `wheel-list`. `play` presses the preview's Play as `--play start` does. A step whose surface sits in the preview pane (`reveals` in `steps.mjs`: `play`, `preview-settings`, `problems`) first shows the pane the way an author does, by the phone title bar's Show the preview button, fails naming the button or the pane when either is missing, and hides the pane again when the run ends. A `--shot` or `--shot-of` after a built step waits for the surface the step names in `steps.mjs` instead of the script editor, so a shot of the phone preview is not refused for covering the editor; a shot after no named step keeps the editor gate. A step not built yet fails with `not built yet`, naming the ticket that builds its surface; that slice gives the step its body in `steps.mjs` and the driver.

## Evidence gate

Check that the intended script/project loaded, the game or editor mounted and the requested action completed. Failed setup is not evidence of the product defect. Read the relevant report fields and failures in the selected reference; a plausible route or geometry does not prove rendered correctness.

Open and inspect the PNG, zooming for small details. Repeat after the fix and inspect that image too. For nonvisual fixes, measure the changed quantity before/after and still look for visual regressions. Disclose anything not seen. Do not present identical screenshots as proof of performance.

The pinned browser origin retains OPFS and cursor state between runs; confirm the report identifies the intended script. Completion typing persists and must be restored before repeating a run requiring original text. Stop the servers you started after verification. Leave uncertain process ownership or failed shutdown state intact for recovery.
