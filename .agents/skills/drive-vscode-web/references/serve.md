# Serve a project and manage shared builds

All commands run from the worktree root unless stated otherwise.

`up` options: `--sd <file.sd>` (serve a one-file project holding the script as `main.sd`) or `--project <folder>` (serve an existing folder, which is what a hover on an image needs, since the image files must be in the workspace; the folder is served as it is, and must not sit under the data directory's `builds`); `--data <dir>` (where the VS Code builds, the served projects and the server logs live; the default is `impower-vscode-test-web` under the system temp directory, shared by every worktree so a build downloads once, and never inside a checkout); `--quality stable|insiders` (each quality has its own directory under `builds`; any other value is refused); `--fresh` (download the newest build of that quality instead of serving the one already unpacked; refused while another worktree's server serves from that quality's directory, since the download deletes it first).

## 2. Serve it

Boot the server once per session, with either a script or a folder:

```bash
node .agents/skills/drive-vscode-web/driver.mjs up --sd repro.sd
```

Expected, on a machine that has the build already:

```
serving C:\...\Temp\impower-vscode-test-web\projects\34223 pid 27048 → http://localhost:34223 (build a44adf7f53, already unpacked)
Waiting for the server...
READY http://localhost:34223
```

The first launch on a machine says `downloading the VS Code build (about 55 MB). Waiting...` instead, downloads and unpacks the build (27 s here) and writes the stylesheet alias under it (`stylesheet alias written in ...`); later launches pin the server to the commit already under `builds/<quality>` and answer in under ten seconds, because the server then serves what it has. The data directory is shared by every worktree and a download empties the quality's build directory before it unpacks, so a launch that will download takes a lock beside `builds` and holds it until the server answers; a second worktree launching into the same download is refused, naming the worktree to wait for, and a lock whose launch has exited is dropped by the next one. A server that exits before its port answers ends `up` at once with the log path, rather than after the ten-minute download budget. The port is derived from the worktree path, so it is stable for this worktree and clear of the other worktrees' servers. While the server is up, `up --sd other.sd` rewrites the served `main.sd` and the next `verify` reads the new script; the folder, the quality, the data directory and the build are fixed at launch, so `up --project` with another folder, `up --quality` with the other quality, `up --data` with another directory (or with any directory, against a record that does not say which one its server uses), or `up --fresh` is refused until `down`.

A minimal `.sd` with a diagnostic (an undefined backdrop) and a dialogue line; copy syntax from a passing fixture rather than from memory when the repro needs more:

```
-> START

scene START

  [[show backdrop missing_backdrop]]

  ALICE:
    Hello from the served workbench.
end
```

A clean file, for a run that should settle at `No Problems`, is a scene holding a line of action and no character: a character line names a character the script does not declare, which is itself a warning, so the repro above minus its backdrop line is not clean.

Stop the server when done:

```bash
node .agents/skills/drive-vscode-web/driver.mjs down
```

---
