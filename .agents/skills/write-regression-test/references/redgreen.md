# Run and recover the red/green cycle

All commands run from the worktree root unless stated otherwise.

## 2. Prove the test is honest

A regression test that passes against the old code pins nothing.

Never use the shared Git stash: its stack belongs to the repository, not to this worktree. Use `redgreen` below for verified snapshots and restoration, regardless of hook availability.

Run the whole cycle through the driver, from the repo root, naming the test invocation (under the caps in Running vitest safely) and every changed source file the test exercises:

```bash
node .agents/skills/drive-web-editor/driver.mjs redgreen --test "cd packages/sparkdown && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run src/tests/compiler/FilterImageLayers.test.ts --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1" --files packages/sparkdown/src/compiler/utils/filterImage.ts
```

`--test` is the test command, run twice from the repo root (it may `cd` into the package itself); `--files` takes every changed source the test exercises, one path or several, and never the test file; `--base` is the revision the pre-fix content comes from, `HEAD` by default and `origin/main` once the fix is committed.

It snapshots the files, reverts them to the base revision, runs the test and requires it to fail, restores the files from the snapshot, proves each restore by content hash, and runs the test again. Verified output shape:

```json
{
  "ok": true,
  "base": "HEAD",
  "baseCommit": "4538f1319…",
  "test": "cd packages/sparkdown && …",
  "snapshotDir": "C:\\...\\Temp\\redgreen-abc123",
  "files": [{ "path": "packages/sparkdown/src/compiler/utils/filterImage.ts", "snapshotPath": "C:\\...\\redgreen-abc123\\01-filterImage.ts", "snapshotSha": "…", "baseSha": "…", "changedDuringRed": false, "restored": true, "matches": true, "restoreError": null }],
  "red": { "exit": 1, "outcome": "failed", "reason": "assertion", "tail": ["…"], "summary": "Test Files  1 failed (1) / Tests  2 failed | 3 passed (5)" },
  "green": { "exit": 0, "outcome": "passed", "tail": ["…"], "summary": "Test Files  1 passed (1) / Tests  5 passed (5)" },
  "problems": []
}
```

`ok: true` means exactly this: every named file differs from the base, the test exited non-zero on the base with output that reads as a test failure, every file came back byte-for-byte, the test exited zero on the fix, and, on a run that names vitest or whose output carries vitest's own run banner, a `Test Files`/`Tests` summary could be parsed from the red output and it reports tests having run: a summary that reads `Tests  no tests` is a problem rather than a proof, because every test file failed to collect and nothing was asserted. It is an exit-code proof. Read `red.failures` to identify the ticket's failing case: an unrelated failure looks identical to the command. This excerpt keeps the first 40 recognized failure lines, strips color codes, caps each line at 2000 characters, and reports additional matches in `failuresOmitted`. `red.tail` keeps the last 40 nonempty lines, which passing output can displace. Each half saves its captured output at `logPath` in the snapshot directory; read that log for unmatched formats, truncated excerpts and assertion context. Output terminated at the 64 MiB capture limit remains partial and proves nothing. Quote the actual assertion and the red/green summaries in the PR body. `ok: false` exits non-zero, and `problems` is never empty when it does:

- The test passed against the base: it pins nothing. Either it does not assert the ticket's behaviour, or `--files` does not name where the fix lives.
- A file is identical to the base. Nothing to revert in it: either the fix is committed (pass `--base origin/main`) or the file is not where the fix lives.
- The red run died on an import or syntax error (`red.reason`) rather than the defect. A whole-file revert broke the test's imports; use the in-place path below.
- The runner found no test: `--files` named the test file itself, so the revert removed it. List only the changed sources.
- The test command could not run (`reason: "shell"`): the shell reported a missing command or script. Fix `--test`.
- The red run's output is unrecognized, mixes assertion and shell diagnostics, or has assertion output with a reserved shell status (`reason: "unknown"`, or no output at all). A test printing its child's shell error and a broken command chain can produce identical output and status, so neither is automatically accepted as proof. Read the full run yourself and explain the ticket's actual failing assertion in the PR; a broken invocation, config error, worker crash or truncated run proves nothing. For the default POSIX shell or an explicitly named sh/bash/dash executable, status 126/127 with no assertion evidence is treated as an execution failure independently of locale; with assertions it is ambiguous, since programs can choose those statuses too. This convention is not applied to cmd, so a failure-count status accepted under cmd can require adjudication under Git Bash or Linux. Other custom interpreters, including zsh/ksh/ash or a custom Windows ComSpec, are unverified. Caller environment values are preserved; fixtures pin their own Windows ComSpec to actual cmd. Other shell wording is recognized in English; unrecognized localized output still requires inspection. The report preserves `launchError`, `signal` and `posixShell` to explain these decisions.
- The command names vitest, or its output shows vitest's own run banner, and the red run failed with what reads as a real assertion but no `Test Files`/`Tests` summary line could be parsed from it. That is either a reporter or a version this parser does not know, or a command that names vitest in a path or a comment without running it; read `red.failures` and, when available, the log at `red.logPath` for the failure and quote it directly in the PR.
- The red run's summary says no test ran (`Tests  no tests`). Every test file failed to collect, so nothing was asserted and the red proves nothing about the defect; usually the revert broke an import the test file needs, which the in-place path below is for.
- The runner crashed on the base (`reason: "crash"`: a killed worker, an out-of-memory, a fatal error). Proves nothing; lower the caps or split the run. An `ENOBUFS` execution error means the 64 MiB output cap terminated the run; reduce output or split the run. Its partial output is not regression evidence.
- A file could not be reverted (read-only, locked). The red run is not attempted; files already reverted come back, the rest were never touched.
- A file changed while it was reverted. A review round, an editor, or a watcher wrote to it. The command does not restore that file, because overwriting it would replace the newer edit with the snapshot, which is exactly the stale-copy failure this command exists to prevent. The file then holds the base content plus that edit, not the fix; the fix is at the `snapshotPath` the report names. Merge the two by hand and run again.
- A restored file does not match its snapshot, or could not be checked (`restoreError` says why, e.g. a read-only file, or a path that became a directory). The fix is at `snapshotPath`; put it back by hand. The other files still come back on their own.
- The test failed against the fix. The restore is verified by hash, so this is the fix itself: the test does not pass on your change.

The snapshot and the restore happen inside one process, so there is no copy to go stale between review rounds; run the command again after each round rather than reusing anything from the last one. Once the snapshot is taken the command does not throw: the restore runs in a `finally`, every later error becomes a `problems` entry, and the report always prints. A Ctrl+C delivered directly to the test child can return through that `finally`, but a tool-driven interruption on Windows can terminate the driver without restoring files. A hard kill or tool timeout can do the same. After any interruption, verify the final report and each restoration hash; if no report was produced, inspect the source against the printed snapshot before resuming work. The snapshot directory is printed before the first revert for this recovery.

`--base` is where the pre-fix content comes from and defaults to `HEAD`. That is right only before you commit. After the commit, `HEAD` is your fix, and a baseline taken from it silently contains the very change it is supposed to lack; the run then "reproduces nothing", which reads as "the bug was never real", and `redgreen` reports the file as identical to the base and the test as pinning nothing. Once you have committed, pass `--base origin/main`. A base that does not resolve (a typo, or a remote branch never fetched in this worktree) is refused before any file is touched, as is a run from anywhere but the repository root.

Where a whole-file revert would break the test's imports (the fix adds an export the test uses), simulate the old behaviour in place instead: keep an aside copy of the file before you touch it, disable the one branch that matters, or restore the old function body under the new name, run the test by hand for the red, then put the fix back. Keep a positive control in the file, an assertion that passes both before and after, so a red run proves the defect, not a broken harness. `redgreen` sends you here itself when the red run fails on an import. After restoring a file from its copy, read it again before editing it; the editor tool refuses a file it has not read since the restore.

Keep each half of that cycle under the command tool's own timeout: the swap, the red run and the restore in one script, the green run in another. The source is then disabled only inside one invocation, so a script that finishes at all puts it back and only a hard kill mid-script can leave it disabled. This in-place path runs no `redgreen` command, so its recovery is the aside copy you kept: compare that copy against the working file byte for byte to tell whether the restore already happened, and copy it back by hand if it did not.

A test added for a line the base commit already has cannot go red by swapping sources, since the base already contains that line; check it by mutation instead: weaken that line alone with a script that patches and restores the file, byte-compared, run the one test, and report it as checked by mutation.

Record both outcomes for the PR body.

`failureLinesTruncated` counts excerpt lines clipped to the character limit. Recognized failure labels are evidence to inspect, not an exhaustive test inventory; the saved raw logs retain the details that the excerpt omits.

The excerpts recognize standalone `FAIL`, TAP `not ok`, Vitest and Node spec failure symbols, and assertion diagnostics. When a log cannot be written, `logPath` is null and `logError` gives the failure; `unverifiedLogPath` identifies the attempted destination, where partial or stale output may remain and must not be treated as a complete log. Exit status, classification and excerpts remain available, restoration still runs, and the report is not successful.

To exercise the cycle in a throwaway repository, import `runRedGreen` directly and pass the scratch repository's root. The driver CLI deliberately accepts only its own worktree. Author a private `.mjs` file with the editor capability, using `pathToFileURL` for the module's absolute native path on Windows and POSIX:

```javascript
import { pathToFileURL } from "node:url";
const { runRedGreen } = await import(pathToFileURL(process.argv[2]).href);
const report = runRedGreen({ repoRoot: process.argv[3], test: "node check.mjs", files: ["lib.mjs"], log: console.log });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
```

Invoke that file with the absolute `.agents/skills/drive-web-editor/redgreen.mjs` path and the scratch repository path as separate quoted arguments. Initialize and commit the scratch baseline, then apply its fix before invoking it; print the scratch repository path in the same command as any destructive experiment. A bare Windows drive path is not an ESM URL. Keep the report, snapshot and logs outside the worktree.

---
