---
name: transplant-desktop-sessions
description: Move Claude desktop sessions from one account to another on Windows by merging session folders. Use after switching or adding a Claude desktop account when the old account's sessions are missing from the new one.
---

# Transplant Claude desktop sessions between accounts

Claude desktop stores each account's Code-tab session list in `<accountId>\<orgId>` subfolders of the sessions folder inside `%APPDATA%\Claude` (the one whose name ends in `code-sessions`): one `local_<uuid>.json` per session, `archived-sessions.idx`, `deleted_*` markers and `scheduled-tasks.json`. Transcripts live in `~/.claude/projects` and are shared across accounts, so only the session list needs moving. `scripts/transplant-desktop-sessions.ps1` merges a source folder into a target folder.

## Steps

1. Fully quit Claude desktop, including the tray icon. A running app can overwrite the copied files; the script warns when it sees the app running.
2. Dry run from the repository root. It lists the account/org folders with session counts and modification times, picks the most recently modified folder as the target and the only other folder with sessions as the source, and prints what it would do. It fails and names the candidates when the choice is ambiguous.

```sh
pwsh -File scripts/transplant-desktop-sessions.ps1 -WhatIf
```

   Windows PowerShell works too: `powershell -File scripts/transplant-desktop-sessions.ps1 -WhatIf`.
3. Check the detected source and target and the new/updated/skipped counts. If the detection is wrong or ambiguous, name the folders:

```sh
pwsh -File scripts/transplant-desktop-sessions.ps1 -SourceAccount <id> -SourceOrg <id> -TargetAccount <id> -TargetOrg <id> -WhatIf
```

4. Run again without `-WhatIf`. It backs the target folder up to `%TEMP%` first and prints the backup path with the summary (new, updated, skipped, archived, total).
5. Reopen Claude desktop.

## What the merge does

A source session the target lacks is copied. A target session is replaced only when the source's `lastActivityAt` is greater; identical or newer target sessions stay. `archived-sessions.idx` becomes the sorted union of both lists, keeping only ids that have a session file in the target. `deleted_*` markers and `scheduled-tasks.json` are not copied, and nothing is removed from the target. The script is safe to run twice. To undo a run, quit Claude and copy the backup folder's contents back over the target folder.

`-SessionsRoot <folder>` points the script at a scratch copy of the sessions folder for a trial run; never test against the real folder with the app open.
