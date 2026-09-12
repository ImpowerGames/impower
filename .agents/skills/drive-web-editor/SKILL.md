---
name: drive-web-editor
description: Verify the web editor and game preview through the committed browser driver. Use for editor, preview, asset or package changes requiring rendered or measured evidence.
---

# Drive the web editor

Commands run inside the worktree under test:
`node .agents/skills/drive-web-editor/driver.mjs <command>`.

## Start and select the operation

Run `preflight`, then `up` to launch both servers on pinned ports. Use `status` to identify the URL and `down` to stop your recorded servers. For installation, stale state or shutdown failures, read [server setup and recovery](references/server.md). For manual dev-server launch or handshake/OPFS troubleshooting, read [launcher wiring](../../references/web-launcher.md).

Select only the references needed for this run:

- Before driving game preview, read [preview verification](references/preview.md). Typical command: `verify --sd repro.sd --line 8 --shot before.png`.
- Before driving editor panels, screens, hover or completion, read [editor UI](references/ui.md). `verify` alone cannot verify those surfaces; use `ui`.
- Before `--project` or `seed`, read [project seeding](references/projects.md). Asset changes need the whole project. These operations replace OPFS files; inspect the source, retain needed data, and do not blindly clear a failed seed.
- Before checking service-worker code or its shared imports, read [installed-worker verification](references/service-worker.md). Use `--fresh-sw` on both phases and compare installed built-worker hashes. A fresh worker retains caches.
- For performance, memory, count or timing changes, read [measurement](references/performance.md) before choosing a fixture or timing a run.
- Before writing a custom browser probe, read [custom probe caveats](references/custom-probes.md). Keep scripts importing driver helpers inside the worktree for dependency resolution and never stage scratch files.

## Evidence gate

Check that the intended script/project loaded, the game or editor mounted and the requested action completed. Failed setup is not evidence of the product defect. Read the relevant report fields and failures in the selected reference; a plausible route or geometry does not prove rendered correctness.

Open and inspect the PNG, zooming for small details. Repeat after the fix and inspect that image too. For nonvisual fixes, measure the changed quantity before/after and still look for visual regressions. Disclose anything not seen. Do not present identical screenshots as proof of performance.

The pinned browser origin retains OPFS and cursor state between runs; confirm the report identifies the intended script. Completion typing persists and must be restored before repeating a run requiring original text. Stop the servers you started after verification. Leave uncertain process ownership or failed shutdown state intact for recovery.
