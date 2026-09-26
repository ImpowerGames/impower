# Repository instructions

@AGENTS.md

The canonical skills live in `.agents/skills/`. The `.claude/skills/`, `.codex/skills/` and `.github/skills/` directories are ignored links created by `npm install` (junctions on Windows, symlinks on POSIX). Run `node scripts/link-agent-skills.mjs` from any directory to recreate missing links; the script resolves its checkout from its own location and refuses populated real directories or foreign links.

In the Claude desktop app, a session that opens a pull request turns on Auto-fix for it right away, so the app wakes the session on the pull request's CI failures, merge conflicts and review comments. An Auto-fix event does not lift the review workflow's freeze on the reviewed head: while a reviewer process runs, the fix waits until that process exits.
