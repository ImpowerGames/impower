# Repository instructions

@AGENTS.md

The canonical skills live in `.agents/skills/`. The `.claude/skills/`, `.codex/skills/` and `.github/skills/` directories are ignored links created by `npm install` (junctions on Windows, symlinks on POSIX). Run `node scripts/link-agent-skills.mjs` from any directory to recreate missing links; the script resolves its checkout from its own location and refuses populated real directories or foreign links.
